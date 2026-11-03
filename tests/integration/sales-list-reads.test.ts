import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createInitialPaymentMethods,
  createSaleReceipt,
  getSaleReceipts,
  getSalesStanding,
  listPaymentMethods,
  type SaleForStanding,
} from "@/modules/cash";
import { adjustStock } from "@/modules/inventory";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { issueSale, listSales, voidSale } from "@/modules/sales";
import { getSaleOrigins } from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Las dos lecturas nuevas del listado de ventas contra PostgreSQL real (brief-24.6.2-b, AC-10, AC-11
// y AC-18): la situación de cobro por lote de `cash` y el origen por lote de `service`.
//
// Lo que mide, y es la razón de que este archivo exista: **el número de sentencias no crece con la
// cantidad de filas**. Es la condición de detención de la subfase. La forma obvia —llamar
// `getSaleReceipts` por fila— cuesta unas 6 consultas por venta, o sea unas 150 en una página de 25
// (H-1), y eso es exactamente lo que se compara acá.
//
// Cómo se cuenta: se envuelve `query` del pool de `getDb()` **y** el de cada cliente que devuelve
// `connect()`, porque una transacción no pasa por el pool. Es el singleton del proceso, así que
// alcanza con envolverlo una vez por medición.
//
// Los helpers son los de client-accounts.test.ts: un producto de precio 1000 por unidad, así que una
// venta de n unidades suma n × 1000.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 60000;
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  name: string,
  role: "admin" | "viewer",
) {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${name}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${userId}, ${role})`,
  );
  return userId;
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function capability(
  organizationId: string,
  name: string,
  userId: string,
) {
  await getDb().execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${organizationId}, ${name}, ${userId})`,
  );
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name) values ('Negocio A') returning id`,
  );
  const adminAId = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  const clientA = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgA}, 'Lucía Gómez', '+5491155550000') returning id`,
  );
  const productId = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${orgA}, 'P-1', 'Producto P-1') returning id`,
  );
  const priceId = await returningId(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${orgA}, ${productId}, '1000.00', 'ARS', ${adminAId})
        returning id`,
  );
  const adminA = await contextFor("admin-a@example.com");
  const adjusted = await adjustStock(adminA, productId, {
    type: "adjustment_positive",
    quantity: "1000",
    expectedQuantityOnHand: "0",
    reason: "Carga inicial",
  });
  if (!adjusted.ok) throw new Error(`ajuste rechazado: ${adjusted.code}`);
  const created = await createInitialPaymentMethods(adminA);
  if (!created.ok) throw new Error("lista inicial rechazada");
  const listed = await listPaymentMethods(adminA);
  if (!listed.ok) throw new Error("lista rechazada");
  return {
    orgA,
    adminAId,
    clientA,
    productId,
    priceId,
    adminA,
    // Transferencia, no Efectivo: el cobro en efectivo exige una sesión de caja abierta, y acá no se
    // mide la caja.
    transfer: listed.paymentMethods.find(
      (method) => method.name === "Transferencia",
    )!.id,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

// Una venta sin pedido de n unidades, del cliente o, con "", sin cliente.
async function sell(s: Seed, units: number, clientId: string) {
  const result = await issueSale(s.adminA, {
    clientId,
    lines: [
      {
        productId: s.productId,
        quantity: String(units),
        expectedPriceId: s.priceId,
      },
    ],
  });
  if (!result.ok) throw new Error(`venta rechazada: ${JSON.stringify(result)}`);
  return result.sale;
}

async function received(s: Seed, saleId: string, amount: string) {
  const result = await createSaleReceipt(s.adminA, {
    saleId,
    paymentMethodId: s.transfer,
    amount,
  });
  if (!result.ok) throw new Error(`cobro rechazado: ${JSON.stringify(result)}`);
}

// Las filas como las entrega listSales, que es lo que la página le pasa a la lectura por lote.
async function rowsOf(s: Seed): Promise<SaleForStanding[]> {
  const page = await listSales(s.adminA, {
    clientId: null,
    number: "",
    status: "all",
    from: "",
    to: "",
    page: 1,
  });
  if (!("sales" in page)) throw new Error("listado rechazado");
  return page.sales.map((sale) => ({
    id: sale.id,
    clientId: sale.clientId,
    orderId: sale.orderId,
    currency: sale.currency,
    total: sale.total,
    voided: sale.voidDisplayNumber !== null,
  }));
}

// Cuenta las sentencias que la aplicación manda mientras corre `work`, sobre el singleton de
// `getDb()`: las del pool y las de cada cliente de una transacción. Devuelve el texto de cada una,
// para poder separar las que tocan una tabla puntual.
async function statementsOf<T>(
  work: () => Promise<T>,
): Promise<{ result: T; statements: string[] }> {
  const pool = getDb().$client as unknown as {
    query: (...args: unknown[]) => unknown;
    connect: (...args: unknown[]) => Promise<{
      query: (...args: unknown[]) => unknown;
    }>;
  };
  const statements: string[] = [];
  const record = (first: unknown) => {
    const text =
      typeof first === "string"
        ? first
        : typeof (first as { text?: unknown })?.text === "string"
          ? (first as { text: string }).text
          : "";
    statements.push(text);
  };
  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);
  // El pool **reusa** sus clientes entre mediciones, así que hay que envolver cada uno una sola vez
  // y **desenvolverlo al terminar**. Sin lo segundo, el envoltorio de una medición sobrevive a la
  // siguiente y le suma sus sentencias a un recuento ya leído: el primer intento de este archivo
  // contó 3 donde había 1, y el número crecía con cada medición posterior.
  type Client = { query: (...args: unknown[]) => unknown };
  const wrapped = new Map<Client, Client["query"]>();
  const wrap = (client: Client) => {
    if (wrapped.has(client)) return;
    const clientQuery = client.query.bind(client);
    wrapped.set(client, client.query);
    client.query = (...inner: unknown[]) => {
      record(inner[0]);
      return clientQuery(...inner);
    };
  };
  // **Se cuenta solo en el cliente, nunca en el pool.** `Pool.query` de pg no habla con la base: saca
  // un cliente con `connect` y le pasa la consulta, así que contar en los dos lados cuenta dos veces
  // la misma sentencia. Con el recuento en el pool, este archivo medía 2 consultas a `service_orders`
  // donde había 1, y las de una transacción —que no pasan por `Pool.query`— seguían midiendo 1: dos
  // varas distintas en la misma medición. El pool se envuelve igual, pero solo para alcanzar a sus
  // clientes.
  pool.query = (...args: unknown[]) => originalQuery(...args);
  // `connect` tiene dos formas en pg: con callback y con promesa. Las dos se usan acá —drizzle abre
  // la transacción con la promesa, y el pool internamente con el callback—, así que hay que cubrir
  // las dos o la medición se cae.
  pool.connect = ((...args: unknown[]) => {
    if (typeof args[0] === "function") {
      const callback = args[0] as (...inner: unknown[]) => void;
      return originalConnect((...inner: unknown[]) => {
        const client = inner[1] as
          { query: (...args: unknown[]) => unknown } | undefined;
        if (client) wrap(client);
        callback(...inner);
      });
    }
    return (
      originalConnect(...args) as Promise<{
        query: (...args: unknown[]) => unknown;
      }>
    ).then((client) => {
      wrap(client);
      return client;
    });
  }) as typeof pool.connect;
  try {
    return { result: await work(), statements };
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    for (const [client, query] of wrapped) client.query = query;
  }
}

// Las sentencias que no son del control de la transacción: begin, commit y los set del aislamiento
// no son lecturas, y contarlas confundiría la medición.
function reads(statements: string[]): string[] {
  return statements.filter(
    (text) =>
      !/^\s*(begin|commit|rollback|set\b|start transaction)/i.test(text),
  );
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("la situación de cobro por lote (AC-10)", () => {
  it(
    "emite el mismo número de sentencias con 1 y con 25 ventas, y la forma obvia no",
    async () => {
      const s = await seed();
      // **La página se compara contra sí misma con más filas, no contra otra forma de página.** El
      // primer intento de esta medición comparó una página de 1 venta con cliente contra una de 25
      // mezcladas, dio 3 contra 5 y pareció un defecto: no lo era. Las dos lecturas de las ventas
      // **sin cliente** no se ejecutan si la página no tiene ninguna, así que el número depende de
      // qué formas de venta hay en la página, no de cuántas filas. Lo que AC-10 pide es lo segundo.
      const first = await sell(s, 1, s.clientA);
      await received(s, first.id, "500.00");
      const oneWithClient = await rowsOf(s);
      expect(oneWithClient).toHaveLength(1);
      const batchOne = await statementsOf(() =>
        getSalesStanding(s.adminA, oneWithClient),
      );

      for (let i = 0; i < 24; i += 1) await sell(s, 1, s.clientA);
      const manyWithClient = await rowsOf(s);
      expect(manyWithClient).toHaveLength(25);
      const batchMany = await statementsOf(() =>
        getSalesStanding(s.adminA, manyWithClient),
      );

      const countOne = reads(batchOne.statements).length;
      const countMany = reads(batchMany.statements).length;
      // Veinticinco veces más filas, **el mismo número de sentencias**: es la condición de detención
      // de la subfase, y la pasa.
      expect(countMany).toBe(countOne);
      // Y el número es **el exacto que el brief declara**, no un techo holgado: son tres lecturas
      // agrupadas, no una por venta. Si este número cambia, cambió la lectura, y es una decisión
      // que se mide y se escribe, no un desvío que un `<= 8` deja pasar. *Fijado el 2026-11-03*,
      // cuando la mutación M-4 de AC-18 no se puso roja contra el techo.
      expect(countMany).toBe(3);

      // La forma obvia, para que el número tenga con qué compararse: una llamada por fila.
      const obvious = await statementsOf(async () => {
        for (const row of manyWithClient)
          await getSaleReceipts(s.adminA, row.id);
      });
      const countObvious = reads(obvious.statements).length;
      // Más de cien contra menos de diez. Es H-1, medido.
      expect(countObvious).toBeGreaterThan(100);
      expect(countObvious / countMany).toBeGreaterThan(10);

      if (!batchMany.result.ok) throw new Error("lectura por lote rechazada");
      expect(batchMany.result.standing.size).toBe(25);
    },
    TEST_TIMEOUT,
  );

  it(
    "una página de ventas sin cliente consulta menos todavía, y tampoco crece con las filas",
    async () => {
      const s = await seed();
      // Sin ninguna venta con cliente, las cuentas **no se leen**: son dos lecturas agrupadas y nada
      // más. Es el camino más barato de los tres, y acá se mide aparte porque el número de sentencias
      // depende de **qué formas de venta** tiene la página; lo que no depende es de cuántas filas.
      const only = await sell(s, 1, "");
      await received(s, only.id, "1000.00");
      const oneStandalone = await rowsOf(s);
      expect(oneStandalone).toHaveLength(1);
      const batchOne = await statementsOf(() =>
        getSalesStanding(s.adminA, oneStandalone),
      );
      for (let i = 0; i < 23; i += 1) await sell(s, 1, "");
      const gone = await sell(s, 1, "");
      await received(s, gone.id, "1000.00");
      await voidSale(s.adminA, gone.id, "data_entry_error");
      const many = await rowsOf(s);
      expect(many).toHaveLength(25);
      const batchMany = await statementsOf(() =>
        getSalesStanding(s.adminA, many),
      );
      expect(reads(batchMany.statements).length).toBe(
        reads(batchOne.statements).length,
      );
      // **Dos, una menos que las tres de una página con clientes**: es lo que el título afirma, y
      // hasta que se fijó el número no lo afirmaba nada. Con las cuentas leídas siempre serían
      // tres, que es la mutación M-4 de AC-18: contra un techo de 8 pasaba en verde.
      expect(reads(batchMany.statements).length).toBe(2);
      if (!batchMany.result.ok) throw new Error("lectura por lote rechazada");
      expect(batchMany.result.standing.size).toBe(25);
    },
    TEST_TIMEOUT,
  );

  it(
    "la página mezclada, que es el peor caso, también queda acotada",
    async () => {
      const s = await seed();
      // Los tres caminos de la regla en una sola página: con cliente, sin cliente y anulada. Es el
      // número que el listado paga de verdad, y el que se declara en el cierre.
      for (let i = 0; i < 12; i += 1) await sell(s, 1, s.clientA);
      for (let i = 0; i < 11; i += 1) await sell(s, 1, "");
      const owed = await sell(s, 2, s.clientA);
      await received(s, owed.id, "500.00");
      const gone = await sell(s, 1, "");
      await received(s, gone.id, "1000.00");
      await voidSale(s.adminA, gone.id, "data_entry_error");
      const many = await rowsOf(s);
      expect(many).toHaveLength(25);
      const batch = await statementsOf(() => getSalesStanding(s.adminA, many));
      const count = reads(batch.statements).length;
      // El peor caso medido: las tres formas de venta en la misma página, **cinco** sentencias, y
      // ninguna por fila.
      expect(count).toBe(5);
      if (!batch.result.ok) throw new Error("lectura por lote rechazada");
      expect(batch.result.standing.size).toBe(25);
      // Y la misma página con la forma obvia, para dejar el contraste medido.
      const obvious = await statementsOf(async () => {
        for (const row of many) await getSaleReceipts(s.adminA, row.id);
      });
      expect(reads(obvious.statements).length).toBeGreaterThan(100);
    },
    TEST_TIMEOUT,
  );

  it(
    "coincide con lo que la ficha muestra de la misma venta (AC-2, AC-18)",
    async () => {
      const s = await seed();
      // Con cliente y cobrada en parte: la que pasa por la regla de imputación.
      const withClient = await sell(s, 3, s.clientA);
      await received(s, withClient.id, "1200.00");
      // Sin cliente y cobrada entera: el otro camino.
      const standalone = await sell(s, 1, "");
      await received(s, standalone.id, "1000.00");
      // Anulada con cliente, **cobrada en parte antes de anularse**: no debe nada, pero sí tiene
      // cobrado, y es lo que pasó a la cuenta del cliente. Es el tercer camino de la regla, y el que
      // la primera versión de `standingOf` informaba en cero.
      const gone = await sell(s, 2, s.clientA);
      await received(s, gone.id, "700.00");
      await voidSale(s.adminA, gone.id, "data_entry_error");

      const batch = await getSalesStanding(s.adminA, await rowsOf(s));
      if (!batch.ok) throw new Error("lectura por lote rechazada");

      for (const id of [withClient.id, standalone.id, gone.id]) {
        const detail = await getSaleReceipts(s.adminA, id);
        if (!detail.ok) throw new Error("ficha rechazada");
        const row = batch.standing.get(id)!;
        // Lo que la ficha muestra como cobrado más lo imputado es lo cobrado del listado.
        expect(row.collected).toBe(
          (Number(detail.sale.collected) + Number(detail.sale.imputed)).toFixed(
            2,
          ),
        );
        expect(row.outstanding).toBe(detail.sale.outstanding);
        expect(row.status).toBe(detail.sale.status);
        expect(row.currency).toBe(detail.sale.currency);
        expect(row.total).toBe(detail.sale.total);
      }

      // Los números concretos, recalculados a mano al agregar la anulada. La venta con cliente
      // tiene 3000 de total y 1200 cobrados directo, **más los 700 de la anulada**: al anularse,
      // ese cobro pasó a la cuenta del cliente, y la regla de imputación lo aplica a la venta
      // abierta que queda. Son 1900 cobrados y 1100 que faltan.
      //
      // Los 700 se cuentan en dos filas del listado, y las dos dicen la verdad: en la anulada son
      // lo que se cobró antes de anularla, y en la abierta son lo imputado desde la cuenta. No es
      // un doble conteo: el bucle de arriba ya comprobó que la ficha de cada una dice lo mismo.
      expect(batch.standing.get(withClient.id)).toMatchObject({
        total: "3000.00",
        collected: "1900.00",
        outstanding: "1100.00",
        status: "pending",
      });
      expect(batch.standing.get(standalone.id)).toMatchObject({
        total: "1000.00",
        collected: "1000.00",
        outstanding: "0.00",
        status: "collected",
      });
      expect(batch.standing.get(gone.id)).toMatchObject({
        total: "2000.00",
        // Lo cobrado antes de anularla, que es lo que pasó a la cuenta del cliente.
        collected: "700.00",
        outstanding: "0.00",
        status: "voided",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "sin ventas no consulta nada",
    async () => {
      const s = await seed();
      const measured = await statementsOf(() => getSalesStanding(s.adminA, []));
      expect(reads(measured.statements)).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );
});

describe("el origen por lote (AC-11)", () => {
  it(
    "sin la capacidad repairs no toca service_orders, y con ella consulta una sola vez",
    async () => {
      const s = await seed();
      for (let i = 0; i < 25; i += 1) await sell(s, 1, s.clientA);
      const ids = (await rowsOf(s)).map((row) => row.id);
      expect(ids).toHaveLength(25);

      const off = await statementsOf(() => getSaleOrigins(s.adminA, ids));
      expect(
        reads(off.statements).filter((text) => /service_orders/.test(text)),
      ).toHaveLength(0);
      expect(off.result.size).toBe(0);

      await capability(s.orgA, "repairs", s.adminAId);
      const onOne = await statementsOf(() =>
        getSaleOrigins(s.adminA, [ids[0]!]),
      );
      const onMany = await statementsOf(() => getSaleOrigins(s.adminA, ids));
      const toOrders = (list: string[]) =>
        reads(list).filter((text) => /service_orders/.test(text)).length;
      // Una sola consulta a service_orders, con 1 y con 25 ventas.
      expect(toOrders(onOne.statements)).toBe(1);
      expect(toOrders(onMany.statements)).toBe(1);
      // Y el total tampoco crece con las filas.
      expect(reads(onMany.statements).length).toBe(
        reads(onOne.statements).length,
      );
      // Ninguna de estas ventas salió de una reparación, así que el mapa viene vacío. **Esta
      // aserción no protege el resultado**: pasaría igual con `getSaleOrigins` devolviendo
      // siempre un mapa vacío. Lo que este archivo protege es el **recuento de sentencias** de
      // arriba, que es exacto. La conducta positiva —que el mapa traiga `OS-000123` para la
      // venta que salió de esa orden— la afirma el caso de extremo a extremo de `sales.spec.ts`,
      // que la ejercita por el flujo real en vez de armar la orden a mano acá.
      // *Anotado el 2026-11-03*, por la revisión independiente (MENOR-5).
      expect(onMany.result.size).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "sin ventas no consulta nada, con la capacidad encendida",
    async () => {
      const s = await seed();
      await capability(s.orgA, "repairs", s.adminAId);
      const measured = await statementsOf(() => getSaleOrigins(s.adminA, []));
      expect(reads(measured.statements)).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );
});
