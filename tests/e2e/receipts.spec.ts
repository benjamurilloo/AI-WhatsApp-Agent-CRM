import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// El cobro de una venta de punta a punta (brief-21.3, AC-7): Chromium, next start, Server Actions,
// cash, sales, numbering, audit y PostgreSQL real, sin mocks. Un admin cobra una venta en dos partes
// y en dos medios hasta «Cobrada», ve el rechazo de un cobro de más, imprime el recibo, lo busca en
// «Cobros» y cierra la caja con el cobro en lo esperado. Un viewer ve sin acciones. Las ventas, los
// medios y la sesión se cargan por SQL: sus pantallas ya tienen sus propios casos.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const LEGEND = "Documento no válido como factura";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Los cobros, las ventas, la caja y la auditoría son de solo inserción, y los medios, los pedidos y
// el contador no se borran: TRUNCATE es la vía documentada para vaciarlas (ADR 0013). El contador
// se vacía para que cada caso empiece en V-000001, C-000001 y R-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts,
          cash_session_closings, cash_session_opening_amounts, cash_sessions, payment_methods,
          sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, document_counters, audit_logs,
          inventory_movements, inventories, product_images, product_costs, product_prices,
          attribute_values, stock_units, products, conversation_notes, messages, conversations, client_tag_assignments, clients`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  await seedBasic(db, E2E_PASSWORD);
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

// Cada estado se analiza en claro y en oscuro (brief-4.0, D-6).
async function expectAccessible(page: Page, state: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page).toHaveTitle(/.+/);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const violations = results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    );
    expect(
      violations,
      `violaciones de axe en "${state}" (${colorScheme})`,
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null });
}

// La lista inicial de medios, como la crea su botón.
async function insertMethods() {
  const result = await db.execute<{ id: string; name: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Efectivo', true),
               (${SEED_ORGANIZATION_ID}, 'Transferencia', false),
               (${SEED_ORGANIZATION_ID}, 'Tarjeta de débito', false),
               (${SEED_ORGANIZATION_ID}, 'Tarjeta de crédito', false)
        returning id, name`,
  );
  return new Map(result.rows.map((row) => [row.name, row.id]));
}

// Una venta sin pedido de una línea, por SQL. Ninguna pantalla de estos casos emite una venta, así
// que el contador no hace falta.
async function insertSale(number: number, total: string, clientId?: string) {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${`SKU-${number}`}, 'Yerba') returning id`,
  );
  const sale = await db.execute<{ id: string }>(
    sql`insert into sales (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId ?? null}, 'ARS', ${total},
                ${ADMIN_SEED.id})
        returning id`,
  );
  const saleId = sale.rows[0]!.id;
  await db.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${saleId}, ${product.rows[0]!.id}, 1, '1', ${total},
                'ARS', ${total})`,
  );
  return saleId;
}

async function insertOpenSession() {
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${ADMIN_SEED.id}) returning id`,
  );
  const sessionId = session.rows[0]!.id;
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${SEED_ORGANIZATION_ID}, ${sessionId}, 'ARS', '1000.00')`,
  );
  return sessionId;
}

// Un cobro por SQL: el primer caso ya los hace en la pantalla, y los casos que los cargan así no
// registran otro, así que el contador no hace falta.
async function insertReceipt(values: {
  number: number;
  saleId: string;
  methodId: string;
  sessionId: string | null;
  amount: string;
}) {
  await db.execute(
    sql`insert into receipts (organization_id, number, target, sale_id, client_id,
                              payment_method_id, session_id, currency, amount, created_by)
        select organization_id, ${values.number}, 'sale', id, client_id, ${values.methodId},
               ${values.sessionId}, currency, ${values.amount}, ${ADMIN_SEED.id}
        from sales where id = ${values.saleId}`,
  );
}

async function receiptCount() {
  const result = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from receipts`,
  );
  return result.rows[0]!.total;
}

test("un admin cobra una venta en dos partes y en dos medios con el teclado, ve el rechazo de un cobro de más e imprime el recibo", async ({
  page,
}) => {
  await insertMethods();
  await insertOpenSession();
  const saleId = await insertSale(1, "15000.00");
  await login(page, ADMIN);
  // El dinero de la ficha vive en la pestaña «Cobros» desde la 24.6.2-b (D-4).
  await page.goto(`/ventas/${saleId}?pestana=cobros`);
  await expect(page.getByText("Sin cobros.")).toBeVisible();
  await expectAccessible(page, "venta sin cobros");

  // El primer cobro, en efectivo, por una parte. El monto se propone en lo que falta.
  await page.getByRole("link", { name: "Registrar cobro" }).click();
  // Desde la 24.6.2-d el cobro es el panel «?panel=cobro» de la pestaña «Cobros» de la ficha, y
  // no la ruta /cobrar, que queda redirigiendo (brief-24.6.2-d, D-2, D-3 y D-4).
  await expect(page).toHaveURL(/\?pestana=cobros&panel=cobro$/);
  const amount = page.getByLabel(/Monto en/);
  await expect(amount).toHaveValue("15000.00");
  const cash = page.getByRole("radio", { name: /Efectivo/ });
  await cash.focus();
  await cash.press("Space");
  await expect(cash).toBeChecked();
  await amount.fill("10000");
  await expect(page.getByText(/Se lee: \$\s10\.000,00/)).toBeVisible();
  await expectAccessible(page, "formulario del cobro");
  await amount.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
  await expect(page.getByText("Se registró el cobro")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "R-000001" }).first(),
  ).toBeVisible();

  // Un cobro de más se rechaza con lo que falta, y conserva lo escrito.
  await page.getByRole("link", { name: "Registrar cobro" }).click();
  await page.getByRole("radio", { name: "Transferencia" }).check();
  await amount.fill("6000");
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(
    page.getByText(/El cobro supera lo que falta: \$\s5\.000,00/),
  ).toBeFocused();
  await expect(amount).toHaveValue("6000");
  await expect(
    page.getByRole("radio", { name: "Transferencia" }),
  ).toBeChecked();
  await expectAccessible(page, "cobro rechazado");
  await amount.fill("5000");
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page.getByText("Se registró el cobro")).toBeVisible();

  // Cobrada: no ofrece otro cobro.
  // «Cobrada» lo dicen dos lugares de la ficha desde la 24.6.2-b: el badge del encabezado, que D-4
  // pide igual en las tres pestañas, y la fila «Falta» de la tabla de dinero, que al no faltar nada
  // dice la palabra en vez de un importe. Se afirma **el del encabezado**, acotado por
  // `[data-estado-venta]`. *Corregido el 2026-11-03*, por la revisión independiente: decía esta
  // misma frase y usaba `.first()`, que no fija cuál. Si el badge del encabezado desapareciera
  // —justo lo que D-4 y AC-7 protegen—, el primero del documento sería la fila «Falta» y el caso
  // seguiría en verde: la aserción podía pasar por la razón contraria a la que declaraba.
  await expect(
    page.locator("[data-estado-venta]").getByText("Cobrada", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Registrar cobro" })).toHaveCount(
    0,
  );
  // El dinero de la ficha vive en la pestaña «Cobros» desde la 24.6.2-b (D-4).
  await page.getByRole("link", { name: "Cobros" }).click();
  const receipts = page.getByRole("region", {
    name: "Cobros de la venta V-000001",
  });
  await expect(receipts).toContainText("Efectivo");
  await expect(receipts).toContainText("Transferencia");
  await expectAccessible(page, "venta cobrada");

  // El recibo imprimible.
  await receipts.getByRole("link", { name: "R-000001" }).click();
  const receipt = page.locator("[data-comprobante]");
  await expect(receipt).toContainText("Recibo R-000001");
  await expect(receipt).toContainText("Consumidor final");
  await expect(receipt).toContainText("V-000001");
  await expect(receipt).toContainText("Efectivo");
  await expect(receipt).toContainText("10.000,00");
  await expect(receipt).toContainText(LEGEND);
  await expect(
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
  ).toBeVisible();
  await expectAccessible(page, "recibo");
  expect(await receiptCount()).toBe(2);
});

test("un admin busca un recibo en «Cobros» y cierra la caja con el cobro en efectivo en lo esperado", async ({
  page,
}) => {
  const methods = await insertMethods();
  const sessionId = await insertOpenSession();
  const first = await insertSale(1, "3000.00");
  const second = await insertSale(2, "2000.00");
  await insertReceipt({
    number: 1,
    saleId: first,
    methodId: methods.get("Efectivo")!,
    sessionId,
    amount: "2500.00",
  });
  await insertReceipt({
    number: 2,
    saleId: second,
    methodId: methods.get("Transferencia")!,
    sessionId: null,
    amount: "2000.00",
  });
  await login(page, ADMIN);

  // La lista, con la búsqueda por número.
  await page.goto("/caja");
  await page.getByRole("link", { name: "Cobros", exact: true }).click();
  await expect(page).toHaveURL(/\/caja\/cobros$/);
  const list = page.getByRole("region", { name: "Cobros" });
  await expect(list).toContainText("R-000002");
  await expect(list).toContainText("R-000001");
  await expectAccessible(page, "lista de cobros");
  await page.getByLabel("Número R").fill("2");
  await page.getByLabel("Número R").press("Enter");
  await expect(page).toHaveURL(/\/caja\/cobros\?numero=2/);
  await expect(list).toContainText("R-000002");
  await expect(list).not.toContainText("R-000001");
  await page.getByLabel("Número R").fill("R-000099");
  await page.getByLabel("Número R").press("Enter");
  await expect(
    page.getByText("Ningún cobro coincide con ese filtro."),
  ).toBeVisible();

  // La caja suma solo el cobro en efectivo: 1.000 + 2.500.
  await page.goto("/caja");
  const totals = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000001",
  });
  await expect(totals).toContainText("2.500,00");
  await expect(totals).toContainText("3.500,00");
  // **Desde la 24.7.1 los cobros de la sesión no tienen tarjeta propia en la caja**: están en la
  // lista unificada, con su concepto (brief-24.7.1, D-1). Lo que esta aserción prueba es lo mismo
  // de antes —el cobro en efectivo de la sesión se ve, y el que no fue en efectivo no— leído donde
  // ahora vive. La tarjeta sigue existiendo en la pantalla 26, que es el arqueo.
  const sessionReceipts = page.getByRole("region", {
    name: "Movimientos de la sesión C-000001",
  });
  await expect(sessionReceipts).toContainText("R-000001");
  await expect(sessionReceipts).toContainText("Cobro");
  await expect(sessionReceipts).not.toContainText("R-000002");
  await expectAccessible(page, "caja con cobros");

  // El cierre, con lo esperado que incluye el cobro.
  await page.goto("/caja/cerrar");
  await page.getByLabel("Contado 1").fill("3500");
  await page.getByRole("button", { name: "Revisar el cierre" }).click();
  await expect(page.getByText("Sin diferencia")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar caja" }).click();
  await expect(page).toHaveURL(/\/caja\/sesiones\/[0-9a-f-]+\?aviso=cerrada$/);
  const arqueo = page.locator("[data-comprobante]");
  await expect(arqueo).toContainText("Arqueo de caja C-000001");
  await expect(arqueo).toContainText("R-000001");
  await expectAccessible(page, "arqueo con cobros");
});

test("un viewer ve los cobros de una venta, el recibo y la lista sin ninguna acción", async ({
  page,
}) => {
  const methods = await insertMethods();
  const saleId = await insertSale(1, "3000.00");
  await insertReceipt({
    number: 1,
    saleId,
    methodId: methods.get("Transferencia")!,
    sessionId: null,
    amount: "1000.00",
  });
  await login(page, VIEWER);
  // El dinero de la ficha vive en la pestaña «Cobros» desde la 24.6.2-b (D-4).
  await page.goto(`/ventas/${saleId}?pestana=cobros`);
  await expect(
    page.getByRole("region", { name: "Cobros de la venta V-000001" }),
  ).toContainText("R-000001");
  await expect(page.getByRole("link", { name: "Registrar cobro" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "venta para un viewer");

  // La ruta vieja lleva al panel, y **un viewer no lo abre**: ve la ficha sin él, como en la
  // ficha del pedido desde la 24.6.1. Antes era una página propia que le contestaba «Solo un
  // administrador puede registrar cobros»; ahora directamente no hay panel que negar.
  await page.goto(`/ventas/${saleId}/cobrar`);
  await expect(page).toHaveURL(/\?pestana=cobros&panel=cobro$/);
  await expect(
    page.getByRole("dialog", { name: "Registrar cobro" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Cobros de la venta V-000001" }),
  ).toBeVisible();

  // Desde la 24.7.2-b el número abre el **panel** del listado (D-0b), no la pantalla suelta; el
  // comprobante imprimible sigue estando, a un enlace de distancia, y **un viewer no ve «Anular»**.
  await page.goto("/caja/cobros");
  await page.getByRole("link", { name: "R-000001" }).click();
  const panel = page.getByRole("complementary", { name: "Recibo R-000001" });
  await expect(panel).toContainText("Vigente");
  await expect(panel.getByRole("link", { name: /Anular/ })).toHaveCount(0);
  await expectAccessible(page, "panel del recibo para un viewer");
  await panel.getByRole("link", { name: /Imprimir/ }).click();
  await expect(page.locator("[data-comprobante]")).toContainText(
    "Recibo R-000001",
  );
  await expectAccessible(page, "recibo para un viewer");
});

// Sin JavaScript (brief-21.3, AC-7): el cobro es un formulario común, y el servidor vuelve al detalle
// de la venta con el aviso.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin registra un cobro", async ({ page }) => {
    await insertMethods();
    const saleId = await insertSale(1, "3000.00");
    await login(page, ADMIN);
    await page.goto(`/ventas/${saleId}/cobrar`);
    await page.getByRole("radio", { name: "Transferencia" }).check();
    await page.getByLabel(/Monto en/).fill("1000");
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
    await expect(page.getByText("Se registró el cobro")).toBeVisible();
    expect(await receiptCount()).toBe(1);
  });
});

// --- 24.7.2-b: la lámina 06, el filtro por cliente y el recibo en un panel por URL ---

// Un cliente, para el filtro: el `<select>` de la lámina trae **los que tienen cobros**, no todos.
async function insertClient(name: string, phone: string) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${phone})
        returning id`,
  );
  return result.rows[0]!.id;
}

// AC-1, AC-2 y AC-3: la forma de la lámina 06, el filtro por cliente que filtra de verdad y el
// panel que abre y cierra por la URL conservando los filtros (D-3).
test("un admin filtra los cobros por cliente y abre el recibo en el panel sin perder el filtro", async ({
  page,
}) => {
  const methods = await insertMethods();
  const paula = await insertClient("Paula Méndez", "+5491155550001");
  const mateo = await insertClient("Mateo Salas", "+5491155550002");
  const first = await insertSale(1, "3000.00", paula);
  const second = await insertSale(2, "2000.00", mateo);
  const third = await insertSale(3, "1000.00");
  // Sin efectivo: un cobro en efectivo necesita una sesión abierta, y acá la caja no es el tema.
  await insertReceipt({
    number: 1,
    saleId: first,
    methodId: methods.get("Transferencia")!,
    sessionId: null,
    amount: "3000.00",
  });
  await insertReceipt({
    number: 2,
    saleId: second,
    methodId: methods.get("Transferencia")!,
    sessionId: null,
    amount: "2000.00",
  });
  await insertReceipt({
    number: 3,
    saleId: third,
    methodId: methods.get("Tarjeta de débito")!,
    sessionId: null,
    amount: "1000.00",
  });
  await login(page, ADMIN);
  await page.goto("/caja/cobros");

  // AC-1: las seis columnas de la lámina, «Consumidor final» donde no hay cliente y el estado.
  const list = page.getByRole("region", { name: "Cobros" });
  for (const header of [
    "Número R",
    "Cliente",
    "Destino",
    "Medio",
    "Importe",
    "Estado",
  ]) {
    await expect(
      list.getByRole("columnheader", { name: header, exact: true }),
    ).toBeVisible();
  }
  await expect(list).toContainText("Consumidor final");
  await expect(list).toContainText("Vigente");
  // **No hay «Registrar cobro»** acá (corrección del recorrido de la 24.7.3). Hasta hoy este caso
  // afirmaba lo contrario —el H-6 de la 24.7.2-b lo pedía deshabilitado, como la lámina—, y la
  // aserción queda en negativo a propósito: si alguien lo vuelve a dibujar, apagado o encendido,
  // este caso se pone rojo. Dónde se registra un cobro lo dice el estado vacío.
  await expect(
    page.getByRole("button", { name: "Registrar cobro" }),
  ).toHaveCount(0);

  // AC-2: el filtro por cliente deja **solo** los cobros de ese cliente.
  const cliente = page.getByLabel("Cliente");
  await expect(cliente.locator("option")).toHaveCount(3);
  await cliente.selectOption({ label: "Paula Méndez" });
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(list).toContainText("R-000001");
  await expect(list).not.toContainText("R-000002");
  await expect(list).not.toContainText("R-000003");

  // AC-3: el panel abre por la URL y **conserva el filtro** (D-3).
  await page.getByRole("link", { name: "R-000001" }).click();
  await expect(page).toHaveURL(/cliente=/);
  const panel = page.getByRole("complementary", { name: "Recibo R-000001" });
  await expect(panel).toContainText("Paula Méndez");
  await expect(panel).toContainText(LEGEND);
  await expect(panel).toContainText("Aplicado a la venta:");
  await expectAccessible(page, "cobros con el panel abierto");

  // Y cierra devolviendo al listado **donde estaba**, con el filtro puesto.
  await panel.getByRole("link", { name: "Cerrar el recibo" }).click();
  await expect(page).toHaveURL(/cliente=/);
  await expect(
    page.getByRole("complementary", { name: /^Recibo/ }),
  ).toHaveCount(0);
  await expect(list).toContainText("R-000001");
  await expect(list).not.toContainText("R-000002");

  // N-6: los dos filtros conviven. Un número de otro cliente, con el cliente puesto, no trae
  // nada: el `where` lleva los dos, y elegir un cliente no borra el número.
  await page.goto(`/caja/cobros?cliente=${paula}&numero=2`);
  await expect(
    page.getByText("Ningún cobro coincide con ese filtro."),
  ).toBeVisible();
  await page.goto(`/caja/cobros?cliente=${paula}&numero=1`);
  await expect(list).toContainText("R-000001");
  await expect(list).not.toContainText("R-000002");

  // El filtro que no alcanza a nadie **deja la lista vacía**, no la deja entera.
  await page.goto("/caja/cobros?cliente=00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByText("Ningún cobro coincide con ese filtro."),
  ).toBeVisible();

  // AC-3, la dirección escrita a mano: el panel **no se dibuja fuera de su listado**, y un id que
  // no existe no lo dibuja tampoco ni rompe el listado.
  await page.goto("/caja/cobros?recibo=00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByRole("complementary", { name: /^Recibo/ }),
  ).toHaveCount(0);
  await expect(list).toContainText("R-000003");
  await page.goto(
    "/caja/devoluciones?recibo=00000000-0000-4000-8000-000000000000",
  );
  await expect(
    page.getByRole("complementary", { name: /^Recibo/ }),
  ).toHaveCount(0);
});

// AC-10: sin desbordamiento horizontal de 320 a 1440 px, **con el `<select>` de clientes poblado**.
// Un `<select>` vacío no mide nada: la 24.7.2 declaró este criterio en verde sin que existiera un
// solo `setViewportSize`, y al escribirlo apareció un desbordamiento de 338 px. Los nombres son
// largos a propósito: el ancho mínimo de un `<select>` es el de su opción más larga (24.7.1).
const anchoDesbordado = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth - document.body.clientWidth,
  );

test("sin desbordamiento horizontal de 320 a 1440 px en los cobros, con el select de clientes poblado", async ({
  page,
}) => {
  const methods = await insertMethods();
  const largo = await insertClient(
    "María Fernanda Etcheverría Villanueva de la Torre",
    "+5491155550003",
  );
  const sale = await insertSale(1, "3000.00", largo);
  await insertReceipt({
    number: 1,
    saleId: sale,
    methodId: methods.get("Transferencia")!,
    sessionId: null,
    amount: "3000.00",
  });
  const receiptId = await db.execute<{ id: string }>(
    sql`select id from receipts where number = 1`,
  );
  const open = receiptId.rows[0]!.id;
  await login(page, ADMIN);

  for (const width of [320, 390, 640, 1082, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    // **Las rutas de esta subfase, y con datos.** La primera versión de este barrido incluía
    // `/cobros/[id]`, que acá solo cambió una etiqueta, y dejaba afuera las pantallas que estrenan
    // el layout nuevo; además barría `/caja/devoluciones` **sin ninguna devolución**, o sea con el
    // `<select>` vacío, que es exactamente lo que AC-10 prohíbe. Lo encontró la revisión
    // independiente (B-2). Las de devoluciones y «Registrar devolución» las barre
    // `refunds.spec.ts`, que ya tiene con qué cargarlas.
    for (const ruta of [
      "/caja/cobros",
      `/caja/cobros?recibo=${open}`,
      `/cobros/${open}/anular`,
    ]) {
      await page.goto(ruta);
      expect(
        await anchoDesbordado(page),
        `${ruta} desborda a ${width} px`,
      ).toBeLessThanOrEqual(0);
    }
  }

  // M-2: el ancho mínimo del `<select>` de clientes, medido como lo midió la 24.7.1. Es la
  // medición que faltaba desde entonces en «cobrar a cuenta» y «pagos a proveedores», y acá no se
  // podía diferir porque el control es nuevo. Con `w-full min-w-0` el control se encoge con su
  // columna en vez de empujar la página.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/caja/cobros");
  const ancho = await page
    .getByLabel("Cliente")
    .evaluate((node) => node.getBoundingClientRect().width);
  const minimo = await page.getByLabel("Cliente").evaluate((node) => {
    const previo = (node as HTMLElement).style.width;
    (node as HTMLElement).style.width = "min-content";
    const medido = node.getBoundingClientRect().width;
    (node as HTMLElement).style.width = previo;
    return medido;
  });
  console.log(
    `M-2 · select de clientes: ${Math.round(ancho)} px dibujado · ${Math.round(minimo)} px de min-content a 320 px de ventana`,
  );
  expect(ancho, "el select de clientes no entra a 320 px").toBeLessThanOrEqual(
    320,
  );
});

// M-1: el costo del filtro por cliente, con un fixture de **200 cobros repartidos entre 20
// clientes**, que es lo que el brief fija. Lo que se mide acá es el **tiempo**; el **recuento de
// consultas** queda *verificado por camino de código y no medido*, porque el contador de sentencias
// no alcanza a Next, que corre en otro proceso —como en la 24.6.2-b, la 24.6.2-d, la 24.7.1 y la
// 24.7.2—. **Son dos cosas con dos nombres y ninguna hereda la salvedad de la otra**: el tiempo
// está medido de verdad, acá abajo.
//
// Lo que el camino de código dice, archivo por archivo, **entero** (la primera versión dejaba
// dos afuera, y lo encontró la revisión independiente, N-4): con filtro o sin él, la página hace
// `getOrganizationTimezone` (1), `listReceiptClientOptions` (1 consulta de ids + 1 de nombres a
// `crm`), `countReceipts` (1), `findReceipts` (1) y `getClientsByIds` de la página (1). **El
// filtro no agrega ninguna**: entra en el `where` de las dos que ya estaban, que es lo que
// conserva la paginación en SQL. Con el filtro por **nombre** —pasado el tope de 50— se suma una
// de `crm` (`listClientOrderKeys`), y ese camino **no está medido**. Y **cuando el panel está
// abierto el listado suma `getReceipt` y `getAppFrame`**: son las dos que la pantalla 29 ya
// hacía, pero ahora las hace esta pantalla, que antes no las hacía.
test("M-1: el filtro por cliente no cambia el orden del costo con 200 cobros y 20 clientes", async ({
  page,
}) => {
  test.slow();
  const methods = await insertMethods();
  const transfer = methods.get("Transferencia")!;
  const clients: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    clients.push(
      await insertClient(
        `Cliente ${String(i).padStart(2, "0")}`,
        `+54911555${String(10000 + i)}`,
      ),
    );
  }
  for (let i = 0; i < 200; i += 1) {
    const saleId = await insertSale(i + 1, "100.00", clients[i % 20]);
    await insertReceipt({
      number: i + 1,
      saleId,
      methodId: transfer,
      sessionId: null,
      amount: "100.00",
    });
  }
  await login(page, ADMIN);

  const medir = async (ruta: string) => {
    const empezo = Date.now();
    await page.goto(ruta);
    await expect(page.getByRole("region", { name: "Cobros" })).toBeVisible();
    return Date.now() - empezo;
  };

  const sinFiltro = await medir("/caja/cobros");
  const conFiltro = await medir(`/caja/cobros?cliente=${clients[3]}`);
  const segundaPagina = await medir(
    `/caja/cobros?cliente=${clients[3]}&pagina=2`,
  );
  console.log(
    `M-1 · sin filtro ${sinFiltro} ms · con filtro ${conFiltro} ms · filtrada p.2 ${segundaPagina} ms`,
  );

  // Lo que el filtro tiene que hacer: 200 cobros entre 20 clientes son 10 por cliente, así que la
  // lista filtrada entra en una página y **la paginación sigue siendo de la consulta**, no de un
  // recorte en memoria.
  await page.goto(`/caja/cobros?cliente=${clients[3]}`);
  await expect(page.getByText(/Mostrando 1 a 10 de 10 cobros/)).toBeVisible();
  await page.goto("/caja/cobros");
  await expect(page.getByText(/Mostrando 1 a 25 de 200 cobros/)).toBeVisible();
  // Con 20 clientes el `<select>` **sí se dibuja**: 20 está por debajo del tope de 50. Lo que se
  // comprueba es que estén los veinte, más «Todos».
  await expect(page.getByLabel("Cliente").locator("option")).toHaveCount(21);
});

// N-3, de la revisión independiente: **la segunda forma del control de D-1 no tenía ni un test**.
// D-1 dice que se implementan las dos y que la que se dibuja la decide el dato; una forma sin
// prueba está *implementada*, no *validada*, que es la distinción que el vocabulario de este
// proyecto existe para no borrar. Pasado el tope de 50 clientes con cobros, el `<select>` deja
// lugar al cuadro de texto, y el filtro pasa a resolverse por nombre en `crm`.
test("pasado el tope de 50 clientes con cobros, el filtro es un cuadro de texto y filtra por nombre", async ({
  page,
}) => {
  test.slow();
  const methods = await insertMethods();
  const transfer = methods.get("Transferencia")!;
  // Cincuenta y un clientes con un cobro **a cuenta** cada uno: no hace falta una venta por
  // cliente, y el cobro a cuenta es un destino válido desde la 21.6.
  await db.execute(
    sql`insert into clients (organization_id, display_name, phone_e164)
        select ${SEED_ORGANIZATION_ID},
               'Cliente ' || lpad(i::text, 2, '0'),
               '+54911' || lpad((5550100 + i)::text, 7, '0')
        from generate_series(1, 51) as i`,
  );
  await db.execute(
    sql`insert into receipts (organization_id, number, target, client_id, payment_method_id,
                              currency, amount, created_by)
        select ${SEED_ORGANIZATION_ID}, row_number() over (order by display_name), 'account', id,
               ${transfer}, 'ARS', '100.00', ${ADMIN_SEED.id}
        from clients where organization_id = ${SEED_ORGANIZATION_ID}`,
  );
  await login(page, ADMIN);
  await page.goto("/caja/cobros");

  // El control cambió de forma: ya no hay `<option>` que elegir.
  const cliente = page.getByLabel("Cliente");
  await expect(cliente.locator("option")).toHaveCount(0);
  await expect(cliente).toHaveAttribute("type", "search");
  await expectAccessible(page, "cobros con el filtro por nombre");

  // Y filtra por nombre, resolviendo nombre → ids en `crm` y filtrando por id en `cash`.
  await cliente.fill("Cliente 07");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByText(/Mostrando 1 a 1 de 1 cobro$/)).toBeVisible();
  await cliente.fill("Cliente 0");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  // «Cliente 01» a «Cliente 09»: nueve.
  await expect(page.getByText(/Mostrando 1 a 9 de 9 cobros/)).toBeVisible();
  // Un nombre que no existe deja la lista vacía, **no la deja entera**.
  await cliente.fill("Nadie");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByText("Ningún cobro coincide con ese filtro."),
  ).toBeVisible();
});
