import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  getCurrentPrices,
  listProductAudit,
  listProductPrices,
  PRICES_PAGE_SIZE,
  setProductPrice,
  type PriceInput,
} from "@/modules/catalog";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Precio de venta contra PostgreSQL real (brief-11.1, etapa 11.1.2): la tabla de solo inserción
// (FR-PROD-13, AC-7), fijar el precio con auditoría y concurrencia (FR-PROD-12, AC-9) y las
// lecturas del vigente y del historial.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 20000;
let storedHash: string;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  name: string,
  role: "admin" | "viewer",
  mustChangePassword = false,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${name}, ${mustChangePassword}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
  return user.rows[0]!.id;
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function insertProduct(
  organizationId: string,
  sku = "CAF-250",
  isActive = true,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, is_active)
        values (${organizationId}, ${sku}, 'Café molido 250 g', ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

// Organización A con admin, viewer y un admin con contraseña pendiente; B con su admin.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const adminAId = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  await addUser(orgA, "pendiente-a@example.com", "Pía", "admin", true);
  const adminBId = await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  return {
    orgA,
    orgB,
    adminAId,
    adminBId,
    productA: await insertProduct(orgA),
    productB: await insertProduct(orgB),
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    pendingA: await contextFor("pendiente-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

const price = (
  amount: string,
  currency: string,
  expectedPriceId = "",
): PriceInput => ({ amount, currency, expectedPriceId });

async function count(table: "product_prices" | "audit_logs") {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

async function priceRows(productId: string) {
  const result = await getDb().execute<{ amount: string; currency: string }>(
    sql`select amount, currency from product_prices
        where product_id = ${productId} order by created_at, id`,
  );
  return result.rows;
}

async function auditRows() {
  const result = await getDb().execute<{
    entity_type: string;
    entity_id: string;
    action: string;
    diff: unknown;
  }>(
    sql`select entity_type, entity_id, action, diff from audit_logs order by created_at`,
  );
  return result.rows;
}

// Fila de precio por SQL, sin servicio ni auditoría: prepara historiales.
function insertPriceRow(
  executor: { execute: (query: SQL) => Promise<unknown> },
  values: {
    organizationId: string;
    productId: string;
    createdBy: string;
    amount?: string;
    currency?: string;
    createdAt?: string;
  },
) {
  return executor.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by, created_at)
        values (${values.organizationId}, ${values.productId}, ${values.amount ?? "100"},
                ${values.currency ?? "ARS"}, ${values.createdBy},
                coalesce(${values.createdAt ?? null}::timestamptz, clock_timestamp()))`,
  );
}

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; message: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      message?: string;
      cause?: { code?: string; message?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      message: e.cause?.message ?? e.message ?? "",
    };
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

// Bloqueos retenidos del test en curso, como en inventory-concurrency (brief-4.3.2).
const heldLocks: (() => Promise<void>)[] = [];

async function hold(query: SQL): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await tx.execute(query);
    taken();
    await released;
  });
  await lockTaken;
  const releaseLock = async () => {
    release();
    await holder;
  };
  heldLocks.push(releaseLock);
  return releaseLock;
}

async function waitForLockWaiters(expected: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let waiting = -1;
  while (Date.now() < deadline) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    waiting = result.rows[0]!.waiting;
    if (waiting === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${expected} conexiones en un bloqueo y hay ${waiting}`,
  );
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterEach(async () => {
  await Promise.all(heldLocks.splice(0).map((releaseLock) => releaseLock()));
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("product_prices: esquema", () => {
  it("aplica los defaults y guarda el monto con dos decimales", async () => {
    const s = await seed();
    const result = await getDb().execute<{
      id: string;
      amount: string;
      after_start: boolean;
    }>(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${s.orgA}, ${s.productA}, 300000, 'CLP', ${s.adminAId})
          returning id, amount, created_at >= now() as after_start`,
    );
    expect(result.rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.rows[0]!.amount).toBe("300000.00");
    // clock_timestamp(): la hora del INSERT, no la del inicio de la transacción.
    expect(result.rows[0]!.after_start).toBe(true);
  });

  it("rechaza un monto que no es positivo o que no entra, y una moneda mal escrita", async () => {
    const s = await seed();
    const insert = (amount: string, currency: string) =>
      pgError(
        insertPriceRow(getDb(), {
          organizationId: s.orgA,
          productId: s.productA,
          createdBy: s.adminAId,
          amount,
          currency,
        }),
      );
    expect((await insert("0", "ARS")).code).toBe("23514");
    expect((await insert("-1", "ARS")).code).toBe("23514");
    expect((await insert("1000000000000", "ARS")).code).toBe("22003");
    for (const currency of ["usd", "US", "USDX", ""]) {
      expect((await insert("1", currency)).code, currency).toBe("23514");
    }
    expect(await count("product_prices")).toBe(0);
  });

  it("un precio no puede apuntar al producto de otra organización (clave compuesta)", async () => {
    const s = await seed();
    const error = await pgError(
      insertPriceRow(getDb(), {
        organizationId: s.orgA,
        productId: s.productB,
        createdBy: s.adminAId,
      }),
    );
    expect(error.code).toBe("23503");
    expect(error.message).toContain("product_prices_product_fk");
  });
});

describe("product_prices: solo inserción (FR-PROD-13, AC-7)", () => {
  it("crm_app tiene exactamente SELECT e INSERT", async () => {
    const result = await getDb().execute<{ privilege: string }>(
      sql`select privilege_type as privilege from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'product_prices'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege)).toEqual([
      "INSERT",
      "SELECT",
    ]);
  });

  it("crm_app inserta y lee, y no puede actualizar ni borrar: 42501", async () => {
    const s = await seed();
    await asAppRole((tx) =>
      insertPriceRow(tx, {
        organizationId: s.orgA,
        productId: s.productA,
        createdBy: s.adminAId,
      }),
    );
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(sql`update product_prices set amount = 1`),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await pgError(
          asAppRole((tx) => tx.execute(sql`delete from product_prices`)),
        )
      ).code,
    ).toBe("42501");
    expect(await priceRows(s.productA)).toEqual([
      { amount: "100.00", currency: "ARS" },
    ]);
  });

  it("el rol dueño tampoco puede: el trigger rechaza UPDATE y DELETE con P0001", async () => {
    const s = await seed();
    await insertPriceRow(getDb(), {
      organizationId: s.orgA,
      productId: s.productA,
      createdBy: s.adminAId,
    });
    const update = await pgError(
      getDb().execute(sql`update product_prices set amount = 1`),
    );
    expect(update.code).toBe("P0001");
    expect(update.message).toContain("solo inserción: UPDATE");
    const remove = await pgError(
      getDb().execute(sql`delete from product_prices`),
    );
    expect(remove.code).toBe("P0001");
    expect(remove.message).toContain("solo inserción: DELETE");
    expect(await priceRows(s.productA)).toEqual([
      { amount: "100.00", currency: "ARS" },
    ]);
  });
});

describe("setProductPrice (FR-PROD-12, AC-9)", () => {
  it("FR-PROD-12: el admin fija el primer precio, con auditoría en la misma transacción", async () => {
    const s = await seed();
    const result = await setProductPrice(
      s.adminA,
      s.productA,
      price("300000", "CLP"),
    );
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      price: { amount: "300000.00", currency: "CLP" },
    });
    expect(await priceRows(s.productA)).toEqual([
      { amount: "300000.00", currency: "CLP" },
    ]);
    // El primer precio no tiene anterior: sus campos van en null (brief-11.1, §Resultados).
    expect(await auditRows()).toEqual([
      {
        entity_type: "product",
        entity_id: s.productA,
        action: "price_change",
        diff: {
          before: { amount: null, currency: null },
          after: { amount: "300000.00", currency: "CLP" },
        },
      },
    ]);
  });

  it("FR-PROD-12: un precio nuevo se agrega, el vigente es el último y el anterior queda", async () => {
    const s = await seed();
    const first = await setProductPrice(
      s.adminA,
      s.productA,
      price("1.234,5", "USD"),
    );
    if (!first.ok) throw new Error(first.code);
    const second = await setProductPrice(
      s.adminA,
      s.productA,
      price("1300", "USD", first.price.id),
    );
    expect(second).toMatchObject({
      ok: true,
      changed: true,
      price: { amount: "1300.00", currency: "USD" },
    });
    expect(await priceRows(s.productA)).toEqual([
      { amount: "1234.50", currency: "USD" },
      { amount: "1300.00", currency: "USD" },
    ]);
    const current = await getCurrentPrices(s.adminA, [s.productA]);
    expect(current.ok && current.prices.get(s.productA)).toMatchObject({
      amount: "1300.00",
      currency: "USD",
    });
    expect((await auditRows())[1]!.diff).toEqual({
      before: { amount: "1234.50", currency: "USD" },
      after: { amount: "1300.00", currency: "USD" },
    });
  });

  it("FR-PROD-12: el mismo monto y la misma moneda no escriben ni auditan", async () => {
    const s = await seed();
    const first = await setProductPrice(
      s.adminA,
      s.productA,
      price("15", "USD"),
    );
    if (!first.ok) throw new Error(first.code);
    expect(
      await setProductPrice(
        s.adminA,
        s.productA,
        price("15,00", "USD", first.price.id),
      ),
    ).toEqual({ ok: true, changed: false, price: first.price });
    expect(await count("product_prices")).toBe(1);
    expect(await count("audit_logs")).toBe(1);

    // El mismo monto en otra moneda es otro precio.
    expect(
      await setProductPrice(
        s.adminA,
        s.productA,
        price("15", "EUR", first.price.id),
      ),
    ).toMatchObject({ ok: true, changed: true });
    expect(await count("product_prices")).toBe(2);
  });

  it("FR-PROD-12: un producto desactivado no admite precio nuevo", async () => {
    const s = await seed();
    const inactive = await insertProduct(s.orgA, "OLD-1", false);
    expect(
      await setProductPrice(s.adminA, inactive, price("10", "ARS")),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "inactive_product",
    });
    expect(await count("product_prices")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });

  it("FR-PROD-12: CONFLICT si el precio vigente no es el que vio quien lo fija", async () => {
    const s = await seed();
    const first = await setProductPrice(
      s.adminA,
      s.productA,
      price("10", "ARS"),
    );
    if (!first.ok) throw new Error(first.code);

    // Vio el producto sin precio, y ya tiene uno.
    expect(
      await setProductPrice(s.adminA, s.productA, price("12", "ARS")),
    ).toEqual({
      ok: false,
      code: "CONFLICT",
      currentPrice: first.price,
    });
    // Vio un precio que ya no es el vigente.
    const second = await setProductPrice(
      s.adminA,
      s.productA,
      price("11", "ARS", first.price.id),
    );
    if (!second.ok) throw new Error(second.code);
    expect(
      await setProductPrice(
        s.adminA,
        s.productA,
        price("12", "ARS", first.price.id),
      ),
    ).toEqual({ ok: false, code: "CONFLICT", currentPrice: second.price });
    expect(await count("product_prices")).toBe(2);
  });

  // Revisión independiente de la 11.1, M-3: z.uuid() acepta mayúsculas y PostgreSQL compara uuid
  // sin distinguirlas, pero el precio vigente se busca con el id que devuelve la base.
  it("FR-PROD-12: un id del producto en mayúsculas no saltea el CONFLICT", async () => {
    const s = await seed();
    const first = await setProductPrice(
      s.adminA,
      s.productA,
      price("10", "ARS"),
    );
    if (!first.ok) throw new Error(first.code);
    const upper = s.productA.toUpperCase();
    expect(await setProductPrice(s.adminA, upper, price("12", "ARS"))).toEqual({
      ok: false,
      code: "CONFLICT",
      currentPrice: first.price,
    });
    expect(
      await setProductPrice(
        s.adminA,
        upper,
        price("10", "ARS", first.price.id),
      ),
    ).toEqual({ ok: true, changed: false, price: first.price });
    expect(await count("product_prices")).toBe(1);
  });

  it("FR-PROD-12: solo un admin de la organización fija precios", async () => {
    const s = await seed();
    for (const context of [s.viewerA, s.pendingA]) {
      expect(
        await setProductPrice(context, s.productA, price("10", "ARS")),
      ).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    // El producto de otra organización no existe para B.
    expect(
      await setProductPrice(s.adminB, s.productA, price("10", "ARS")),
    ).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await count("product_prices")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });

  it("rechaza el monto y la moneda con su motivo, y los ids inválidos sin campo", async () => {
    const s = await seed();
    expect(
      await setProductPrice(s.adminA, s.productA, price("300.000", "CLP")),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amountReason: "separator",
      currencyReason: null,
    });
    expect(
      await setProductPrice(s.adminA, s.productA, price("10", "KWD")),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["currency"],
      amountReason: null,
      currencyReason: "too_many_decimals",
    });
    expect(
      await setProductPrice(s.adminA, s.productA, price("10", "")),
    ).toMatchObject({
      fields: ["currency"],
      currencyReason: "unknown",
    });
    expect(
      await setProductPrice(s.adminA, "no-es-un-id", price("10", "ARS")),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(
      await setProductPrice(s.adminA, s.productA, price("10", "ARS", "otro")),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    expect(await count("product_prices")).toBe(0);
  });

  it("el cambio de precio aparece en el historial de auditoría del producto", async () => {
    const s = await seed();
    await setProductPrice(s.adminA, s.productA, price("10", "ARS"));
    const audit = await listProductAudit(s.adminA, s.productA, 1);
    expect(audit.ok && audit.entries.map((entry) => entry.action)).toEqual([
      "price_change",
    ]);
  });
});

describe("setProductPrice con conexiones simultáneas (AC-9)", () => {
  it(
    "dos admins fijan el precio a la vez: uno se escribe y el otro recibe CONFLICT",
    async () => {
      const s = await seed();
      // Una tercera conexión retiene el producto: las dos llamadas esperan en el mismo bloqueo.
      const release = await hold(
        sql`select id from products where id = ${s.productA} for update`,
      );
      const calls = [
        setProductPrice(s.adminA, s.productA, price("10", "ARS")),
        setProductPrice(s.adminA, s.productA, price("20", "ARS")),
      ];
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all(calls);

      const written = results.filter((result) => result.ok);
      const rejected = results.filter((result) => !result.ok);
      expect(written).toHaveLength(1);
      expect(rejected).toEqual([
        {
          ok: false,
          code: "CONFLICT",
          currentPrice: written[0]!.ok ? written[0]!.price : null,
        },
      ]);
      expect(await count("product_prices")).toBe(1);
      expect(await count("audit_logs")).toBe(1);
    },
    TEST_TIMEOUT,
  );
});

describe("lecturas de precio", () => {
  it("getCurrentPrices: el último de cada producto, sin los que no tienen y sin otra organización", async () => {
    const s = await seed();
    const tea = await insertProduct(s.orgA, "TE-20");
    const bare = await insertProduct(s.orgA, "SIN-1");
    const base = { organizationId: s.orgA, createdBy: s.adminAId };
    await insertPriceRow(getDb(), {
      ...base,
      productId: s.productA,
      amount: "100",
      createdAt: "2026-01-01T10:00:00Z",
    });
    await insertPriceRow(getDb(), {
      ...base,
      productId: s.productA,
      amount: "150",
      createdAt: "2026-02-01T10:00:00Z",
    });
    await insertPriceRow(getDb(), { ...base, productId: tea, amount: "80" });
    await insertPriceRow(getDb(), {
      organizationId: s.orgB,
      productId: s.productB,
      createdBy: s.adminBId,
      amount: "999",
    });

    // El viewer también lee precios.
    const result = await getCurrentPrices(s.viewerA, [
      s.productA,
      tea,
      bare,
      s.productB,
      "no-es-un-id",
    ]);
    if (!result.ok) throw new Error(result.code);
    expect(
      Object.fromEntries(
        [...result.prices].map(([id, value]) => [id, value.amount]),
      ),
    ).toEqual({ [s.productA]: "150.00", [tea]: "80.00" });
  });

  it("getCurrentPrices: con la misma hora, desempata por id", async () => {
    const s = await seed();
    const at = "2026-03-01T10:00:00Z";
    for (const amount of ["1", "2", "3"]) {
      await insertPriceRow(getDb(), {
        organizationId: s.orgA,
        productId: s.productA,
        createdBy: s.adminAId,
        amount,
        createdAt: at,
      });
    }
    const last = await getDb().execute<{ amount: string }>(
      sql`select amount from product_prices order by id desc limit 1`,
    );
    const result = await getCurrentPrices(s.adminA, [s.productA]);
    expect(result.ok && result.prices.get(s.productA)?.amount).toBe(
      last.rows[0]!.amount,
    );
  });

  it("FR-PROD-12: cualquier usuario ve el historial completo, paginado y con autor", async () => {
    const s = await seed();
    for (let day = 1; day <= PRICES_PAGE_SIZE + 1; day++) {
      await insertPriceRow(getDb(), {
        organizationId: s.orgA,
        productId: s.productA,
        createdBy: s.adminAId,
        amount: String(day),
        createdAt: `2026-01-${String(day).padStart(2, "0")}T10:00:00Z`,
      });
    }

    const first = await listProductPrices(s.viewerA, s.productA, 1);
    if (!first.ok) throw new Error(first.code);
    expect(first.total).toBe(PRICES_PAGE_SIZE + 1);
    expect(first.pageCount).toBe(2);
    expect(first.current?.amount).toBe("26.00");
    expect(first.entries).toHaveLength(PRICES_PAGE_SIZE);
    expect(first.entries[0]).toMatchObject({
      amount: "26.00",
      author: { id: s.adminAId, name: "Ana" },
    });

    // La última página, y una fuera de rango que se lleva a la última.
    for (const page of [2, 99]) {
      const last = await listProductPrices(s.viewerA, s.productA, page);
      expect(last.ok && last.page).toBe(2);
      expect(last.ok && last.entries.map((entry) => entry.amount)).toEqual([
        "1.00",
      ]);
      expect(last.ok && last.current?.amount).toBe("26.00");
    }
  });

  it("listProductPrices: sin precios, y el producto de otra organización no existe", async () => {
    const s = await seed();
    expect(await listProductPrices(s.adminA, s.productA, 1)).toEqual({
      ok: true,
      current: null,
      entries: [],
      total: 0,
      page: 1,
      pageCount: 1,
    });
    expect(await listProductPrices(s.adminB, s.productA, 1)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});
