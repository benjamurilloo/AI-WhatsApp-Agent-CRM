import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import {
  SEED_IPHONE_ORGANIZATION_ID,
  SEED_IPHONE_USERS,
  seedIphone,
} from "../../seeds/demo-iphone";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// El tipo de cambio de punta a punta (brief-29.4, D-13): Chromium, next start, Server Actions, fx,
// cash y PostgreSQL real. La tienda de ejemplo, con USD como moneda principal y ARS como la otra, la
// siembra esta spec por SQL y la borra al terminar, como variants.spec.ts: las demás borran toda
// organización que no sea la del seed básico. Las cotizaciones son de solo inserción, así que se
// vacían con TRUNCATE (ADR 0013).

const [ADMIN, VIEWER] = SEED_IPHONE_USERS;
const ADMIN_BASIC = SEED_USERS[0].email;
const ORG = SEED_IPHONE_ORGANIZATION_ID;
const NOT_FOUND_TITLE = "No encontramos esta página";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids,
          goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers,
          refund_voids,
          refunds, receipt_voids, receipts, exchange_rates, exchange_rate_settings, cash_movements,
          cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts,
          cash_sessions, payment_methods, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders,
          document_counters, audit_logs, inventory_movements, inventories, product_images,
          product_costs, product_prices, attribute_values, stock_units, products, conversation_notes, messages,
          conversations, client_tag_assignments, clients`,
  );
  await db.execute(
    sql`delete from attribute_options where organization_id = ${ORG}`,
  );
  await db.execute(
    sql`delete from attribute_definitions where organization_id = ${ORG}`,
  );
  await db.execute(
    sql`delete from product_models where organization_id = ${ORG}`,
  );
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${ORG}`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  const keepIds = sql.join(
    (keep ? SEEDED_USER_IDS : SEED_USERS.map((user) => user.id)).map(
      (id) => sql`${id}`,
    ),
    sql`, `,
  );
  await db.execute(
    sql`delete from organization_members where user_id not in (${keepIds})`,
  );
  await db.execute(sql`delete from users where id not in (${keepIds})`);
  await db.execute(
    keep
      ? sql`delete from organizations where id not in (${SEED_ORGANIZATION_ID}, ${ORG})`
      : sql`delete from organizations where id <> ${SEED_ORGANIZATION_ID}`,
  );
  await seedBasic(db, E2E_PASSWORD);
  if (!keep) return;
  await seedIphone(db, E2E_PASSWORD);
  // La moneda principal y la configuración, como las deja org:currency.
  await db.execute(
    sql`update organizations set main_currency = 'USD' where id = ${ORG}`,
  );
  await db.execute(
    sql`insert into exchange_rate_settings (organization_id, quote_currency)
        values (${ORG}, 'ARS')`,
  );
}

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.beforeEach(async () => {
  await reset(true);
});

test.afterAll(async () => {
  await reset(false);
  await db.$client.end();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

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

async function insertRate(value: string) {
  await db.execute(
    sql`insert into exchange_rates (organization_id, base_currency, quote_currency, rate, source,
                                    recorded_by)
        values (${ORG}, 'USD', 'ARS', ${value}, 'manual', ${ADMIN.id})`,
  );
}

async function insertMethods() {
  const result = await db.execute<{ id: string; name: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${ORG}, 'Efectivo', true), (${ORG}, 'Transferencia', false)
        returning id, name`,
  );
  return new Map(result.rows.map((row) => [row.name, row.id]));
}

async function insertClient() {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name)
        values (${ORG}, 'Lucía Gómez') returning id`,
  );
  return result.rows[0]!.id;
}

// Una venta de una línea, por SQL, como en receipts.spec.ts.
async function insertSale(
  number: number,
  total: string,
  currency: string,
  clientId: string,
) {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${ORG}, ${`SKU-${number}`}, 'iPhone 13') returning id`,
  );
  const sale = await db.execute<{ id: string }>(
    sql`insert into sales (organization_id, number, client_id, currency, total, created_by)
        values (${ORG}, ${number}, ${clientId}, ${currency}, ${total}, ${ADMIN.id})
        returning id`,
  );
  const saleId = sale.rows[0]!.id;
  await db.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${ORG}, ${saleId}, ${product.rows[0]!.id}, 1, '1', ${total}, ${currency},
                ${total})`,
  );
  return saleId;
}

async function insertOpenSession(pesos = "0.00") {
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${ORG}, 1, ${ADMIN.id}) returning id`,
  );
  const sessionId = session.rows[0]!.id;
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${ORG}, ${sessionId}, 'ARS', ${pesos}), (${ORG}, ${sessionId}, 'USD', '0.00')`,
  );
  return sessionId;
}

test("un admin carga la cotización y un viewer la ve sin el formulario", async ({
  page,
}) => {
  await login(page, ADMIN.email);
  await page.goto("/caja");
  // Con moneda principal, el menú lleva a la cotización (brief-24.1, D-1).
  await expect(
    page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Tipo de cambio" }),
  ).toHaveAttribute("href", "/caja/cotizacion");
  await page.getByRole("link", { name: "Cotización" }).click();
  await expect(page).toHaveURL(/\/caja\/cotizacion$/);
  await expect(
    page.getByText("Todavía no hay una cotización cargada."),
  ).toBeVisible();
  await expectAccessible(page, "cotización vacía");

  await page.getByLabel("1 USD = ARS *").fill("1.565");
  await expect(page.getByText("Se lee: 1 USD = ARS 1.565,00")).toBeVisible();
  await page.getByRole("button", { name: "Cargar cotización" }).click();
  await expect(
    page.getByText("Cotización cargada: es la vigente."),
  ).toBeVisible();
  await expect(
    page.getByText("1 USD = ARS 1.565,00", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Cargada por Admin de la tienda/)).toBeVisible();

  // Más de un 10 %: pide confirmarla, sin bloquear.
  await page.getByLabel("1 USD = ARS *").fill("1800");
  await page.getByRole("button", { name: "Cargar cotización" }).click();
  await expect(page.getByText(/se mueve más de un 10 %/)).toBeVisible();
  await page.getByLabel("Confirmo la cotización nueva").check();
  await page.getByRole("button", { name: "Cargar cotización" }).click();
  await expect(
    page.getByText("Cotización cargada: es la vigente."),
  ).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(3);
  await expectAccessible(page, "cotización con historial");

  await page.context().clearCookies();
  await login(page, VIEWER.email);
  await page.goto("/caja/cotizacion");
  await expect(
    page.getByText("1 USD = ARS 1.800,00", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cargar una cotización" }),
  ).toHaveCount(0);
});

// La fuente automática (brief-29.4.2, D-9 y D-13): el admin la elige con su ajuste, una lectura del
// lector se ve con su fuente y su atribución, y un viewer ve la fuente sin el formulario. La lectura la
// hace la función de la base que llama crm-fx-reader, con el valor que daría DolarAPI: el host real
// no se llama.
test("un admin elige la fuente automática con su ajuste y la lectura se ve con su fuente", async ({
  page,
}) => {
  await login(page, ADMIN.email);
  await page.goto("/caja/cotizacion");
  await expect(
    page.getByText("Fuente de la organización: Carga manual."),
  ).toBeVisible();

  // Un ajuste con tres decimales se rechaza y conserva lo escrito.
  await page
    .getByRole("radio", { name: "DolarAPI, dólar blue, venta, más el ajuste" })
    .check();
  await expect(
    page.getByText(/la próxima lectura reemplaza a la vigente/),
  ).toBeVisible();
  await page.getByLabel("Ajuste en ARS *").fill("10,555");
  await page.getByRole("button", { name: "Guardar fuente y ajuste" }).click();
  await expect(
    page.getByText("Ajuste: a lo sumo dos decimales."),
  ).toBeVisible();
  await expect(page.getByLabel("Ajuste en ARS *")).toHaveValue("10,555");

  await page.getByLabel("Ajuste en ARS *").fill("10");
  await page.getByRole("button", { name: "Guardar fuente y ajuste" }).click();
  await expect(
    page.getByText(/Fuente automática guardada: la próxima lectura reemplaza/),
  ).toBeVisible();
  await expect(
    page.getByText(
      /con un ajuste de ARS 10,00\. Se lee a las 9, 12, 15, 18 y 21/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Fuente: DolarApi (dolarapi.com) + ajuste de la organización.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      /la próxima lectura que cambie de valor reemplaza a esta carga/,
    ),
  ).toBeVisible();

  // Una lectura, como la guardaría el lector.
  const reading = await db.execute<{ result: string }>(
    sql`select fx_record_reading(${ORG}, '1555', now()) as result`,
  );
  expect(reading.rows[0]?.result).toBe("inserted");
  await page.reload();
  await expect(
    page.getByText("1 USD = ARS 1.565,00", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Fuente: DolarAPI 1\.555,00 \+ ajuste 10,00\. Dato de DolarAPI del/,
    ),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Automática" })).toBeVisible();
  await expectAccessible(page, "cotización automática");

  await page.context().clearCookies();
  await login(page, VIEWER.email);
  await page.goto("/caja/cotizacion");
  await expect(
    page.getByText(/Fuente de la organización: DolarAPI, dólar blue, venta/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fuente y ajuste" }),
  ).toHaveCount(0);
});

test("un admin cobra en pesos una venta en dólares, la caja suma pesos y la anulación los devuelve", async ({
  page,
}) => {
  await insertRate("1565");
  const methods = await insertMethods();
  const clientId = await insertClient();
  const saleId = await insertSale(1, "100.00", "USD", clientId);
  await insertOpenSession();
  expect(methods.size).toBe(2);

  await login(page, ADMIN.email);
  await page.goto(`/ventas/${saleId}/cobrar`);
  const choice = page.getByRole("navigation", { name: "Moneda que entra" });
  await expect(choice.getByRole("link", { name: "USD" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await choice.getByRole("link", { name: "ARS" }).click();
  await expect(page).toHaveURL(/\?moneda=ARS$/);
  await expect(
    page.getByText(/Faltan US\$\s100,00 = \$\s156\.500,00/),
  ).toBeVisible();
  await expect(page.getByLabel("Monto en ARS *")).toHaveValue("156500.00");
  await expect(page.getByText(/Se aplican: US\$\s100,00/)).toBeVisible();
  await expectAccessible(page, "cobro en pesos");

  await page.getByLabel(/Efectivo/).check();
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
  await expect(
    page.getByText(/Entraron \$\s156\.500,00 a 1\.565,00/).first(),
  ).toBeVisible();

  await page.goto("/caja");
  await expect(
    page.getByText(/Lo esperado, en total:\s*US\$\s100,00\s*de referencia/),
  ).toBeVisible();
  await expectAccessible(page, "caja con un cobro en pesos");

  await page.goto("/caja/cobros");
  await page.getByRole("link", { name: "R-000001" }).click();
  await expect(page.getByText(/Entraron \$\s156\.500,00/)).toBeVisible();
  await page.getByRole("link", { name: "Anular cobro" }).click();
  await page.getByRole("radio", { name: "Otro monto" }).check();
  await page.getByRole("button", { name: "Sí, anular el cobro" }).click();
  await expect(page).not.toHaveURL(/\/anular/);
  await page.goto("/caja");
  await expect(page.getByText(/Lo esperado, en total/)).toHaveCount(0);
});

// Revisión independiente de la 29.4, R1-3: si la vigente cambia mientras se carga el cobro, el
// rechazo vuelve a leer la página, y el segundo intento va con la nueva.
test("si la cotización cambia mientras se carga el cobro, se rechaza y muestra la nueva", async ({
  page,
}) => {
  await insertRate("1565");
  await insertMethods();
  const clientId = await insertClient();
  const saleId = await insertSale(1, "100.00", "USD", clientId);

  await login(page, ADMIN.email);
  await page.goto(`/ventas/${saleId}/cobrar?moneda=ARS`);
  await expect(
    page.getByText(/Faltan US\$\s100,00 = \$\s156\.500,00/),
  ).toBeVisible();

  await insertRate("1600");
  await page.getByLabel(/Transferencia/).check();
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page.getByText(/volvé a registrarlo/)).toBeVisible();
  await expect(
    page.getByText(/Faltan US\$\s100,00 = \$\s160\.000,00/),
  ).toBeVisible();

  await page.getByLabel("Monto en ARS *").fill("160000");
  await page.getByLabel(/Transferencia/).check();
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
  await expect(
    page.getByText(/Entraron \$\s160\.000,00 a 1\.600,00/).first(),
  ).toBeVisible();
});

test("la ficha del cliente suma lo que debe en la moneda principal", async ({
  page,
}) => {
  await insertRate("1000");
  const clientId = await insertClient();
  await insertSale(1, "100.00", "USD", clientId);
  await insertSale(2, "50000.00", "ARS", clientId);
  await login(page, VIEWER.email);
  await page.goto(`/clientes/${clientId}`);
  await expect(
    page.getByText(/Debe en total:\s*US\$\s150,00\s*de referencia/),
  ).toBeVisible();
  await page.goto(`/clientes/${clientId}/cuenta`);
  await expect(
    page.getByText(/Debe en total:\s*US\$\s150,00\s*de referencia/),
  ).toBeVisible();
  await page.goto("/caja/deudores");
  await expect(
    page.getByText(/Deben en total:\s*US\$\s150,00\s*de referencia/),
  ).toBeVisible();
  await expectAccessible(page, "deudores con total de referencia");
});

test("sin moneda principal no hay cotización: ni pestaña ni página", async ({
  page,
}) => {
  await login(page, ADMIN_BASIC);
  await page.goto("/caja");
  await expect(page.getByRole("link", { name: "Cotización" })).toHaveCount(0);
  // Tampoco en el menú (brief-24.1, D-1).
  await expect(
    page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Tipo de cambio" }),
  ).toHaveCount(0);
  await page.goto("/caja/cotizacion");
  await expect(
    page.getByRole("heading", { name: NOT_FOUND_TITLE }),
  ).toBeVisible();
});

test("a 375 px la cotización y el cobro en pesos no desbordan", async ({
  page,
}) => {
  await insertRate("1565");
  await insertMethods();
  const clientId = await insertClient();
  const saleId = await insertSale(1, "100.00", "USD", clientId);
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN.email);
  for (const path of [
    "/caja/cotizacion",
    `/ventas/${saleId}/cobrar?moneda=ARS`,
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await expectAccessible(page, "cobro en pesos a 375 px");
});

// Desde la 29.4.3 (brief-29.4.3, D-10): las salidas en la otra moneda. Lo que está a favor de un
// cliente, una recepción en dólares y su proveedor, por SQL, como el resto de la spec.

// USD 100 a favor: un cobro a cuenta por transferencia, sin ventas.
async function insertCredit(clientId: string, transferId: string) {
  await db.execute(
    sql`insert into receipts (organization_id, number, target, client_id, payment_method_id,
                              currency, amount, created_by)
        values (${ORG}, 1, 'account', ${clientId}, ${transferId}, 'USD', '100.00', ${ADMIN.id})`,
  );
}

async function insertSupplierReceipt() {
  const supplier = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name)
        values (${ORG}, 'Importadora Norte') returning id`,
  );
  const supplierId = supplier.rows[0]!.id;
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${ORG}, 'FUNDA-1', 'Funda') returning id`,
  );
  const receipt = await db.execute<{ id: string }>(
    sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                    created_by)
        values (${ORG}, 1, ${supplierId}, 'USD', '100.00', ${ADMIN.id}) returning id`,
  );
  const receiptId = receipt.rows[0]!.id;
  await db.execute(
    sql`insert into goods_receipt_lines (organization_id, goods_receipt_id, product_id, position,
                                         quantity, unit_cost, line_total)
        values (${ORG}, ${receiptId}, ${product.rows[0]!.id}, 1, 1, '100.00', '100.00')`,
  );
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${ORG}, ${product.rows[0]!.id}, 1)`,
  );
  return { supplierId, receiptId };
}

test("un admin devuelve en pesos lo que está a favor en dólares, la caja resta pesos y un viewer lo ve", async ({
  page,
}) => {
  await insertRate("1570");
  const methods = await insertMethods();
  const clientId = await insertClient();
  await insertCredit(clientId, methods.get("Transferencia")!);
  await insertOpenSession("200000.00");

  await login(page, ADMIN.email);
  await page.goto(`/clientes/${clientId}/devolver`);
  const choice = page.getByRole("navigation", { name: "Moneda que sale" });
  await choice.getByRole("link", { name: "ARS" }).click();
  await expect(page).toHaveURL(/\?moneda=ARS$/);
  await expect(
    page.getByText(/A favor US\$\s100,00 = \$\s157\.000,00/),
  ).toBeVisible();
  await expect(page.getByLabel("Monto que sale en ARS *")).toHaveValue(
    "157000.00",
  );
  await expect(page.getByText(/Se aplican: US\$\s100,00/)).toBeVisible();
  await expect(
    page.getByText("Cotización acordada para esta devolución"),
  ).toBeVisible();
  await expectAccessible(page, "devolución en pesos");

  // En efectivo, de la caja: quedan ARS 43.000, US$ 27,39 a 1.570 (revisión R1-5).
  await page.getByLabel(/Efectivo/).check();
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(page).toHaveURL(/\/devoluciones\/.+\?registrada=1$/);
  await expect(
    page.getByText(/Salieron \$\s157\.000,00 a 1\.570,00/),
  ).toBeVisible();
  await page.goto("/caja");
  await expect(
    page.getByText(/Lo esperado, en total:\s*US\$\s27,39\s*de referencia/),
  ).toBeVisible();

  await page.context().clearCookies();
  await login(page, VIEWER.email);
  await page.goto("/caja/devoluciones");
  await expect(
    page.getByText(/Salieron \$\s157\.000,00 a 1\.570,00/),
  ).toBeVisible();
});

test("un admin paga en pesos una recepción en dólares, la caja resta pesos y la anulación los devuelve", async ({
  page,
}) => {
  await insertRate("1570");
  await insertMethods();
  const { supplierId, receiptId } = await insertSupplierReceipt();
  await insertOpenSession("200000.00");
  // Otra recepción, en pesos: sin algo que convertir no hay total de referencia (brief-29.4, P-8).
  await db.execute(
    sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                    created_by)
        values (${ORG}, 2, ${supplierId}, 'ARS', '15700.00', ${ADMIN.id})`,
  );

  await login(page, ADMIN.email);
  // La ficha del proveedor y «A pagar» suman lo que se le debe en la principal: USD 100 más ARS
  // 15.700 a 1.570.
  await page.goto(`/compras/proveedores/${supplierId}`);
  await expect(
    page.getByText(/Se le debe en total:\s*US\$\s110,00\s*de referencia/),
  ).toBeVisible();
  await page.goto("/compras/a-pagar");
  await expect(
    page.getByText(/Se les debe en total:\s*US\$\s110,00\s*de referencia/),
  ).toBeVisible();

  await page.goto(`/compras/recepciones/${receiptId}/pagar`);
  await page
    .getByRole("navigation", { name: "Moneda que sale" })
    .getByRole("link", { name: "ARS" })
    .click();
  await expect(page).toHaveURL(/\?moneda=ARS$/);
  await expect(
    page.getByText(/Faltan US\$\s100,00 = \$\s157\.000,00/),
  ).toBeVisible();
  await expect(page.getByLabel("Monto que sale en ARS *")).toHaveValue(
    "157000.00",
  );
  await expectAccessible(page, "pago en pesos");
  await page.getByLabel(/Efectivo/).check();
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page).toHaveURL(/\?aviso=creado$/);
  await expect(
    page.getByText(/Salieron \$\s157\.000,00 a 1\.570,00/),
  ).toBeVisible();

  await page.goto("/caja");
  await expect(
    page.getByText(/Lo esperado, en total:\s*US\$\s27,39\s*de referencia/),
  ).toBeVisible();

  await page.goto("/compras/pagos");
  await page.getByRole("link", { name: "PP-000001" }).click();
  await page.getByRole("link", { name: "Anular el pago" }).click();
  await page.getByRole("radio", { name: "El pago no se hizo" }).check();
  await page.getByRole("button", { name: "Sí, anular el pago" }).click();
  await expect(page).toHaveURL(/\?aviso=anulado$/);
  await page.goto("/caja");
  await expect(
    page.getByText(/Lo esperado, en total:\s*US\$\s127,39\s*de referencia/),
  ).toBeVisible();
});

test("a 375 px la devolución y el pago en pesos no desbordan", async ({
  page,
}) => {
  await insertRate("1570");
  const methods = await insertMethods();
  const clientId = await insertClient();
  await insertCredit(clientId, methods.get("Transferencia")!);
  const { receiptId } = await insertSupplierReceipt();
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN.email);
  for (const path of [
    `/clientes/${clientId}/devolver?moneda=ARS`,
    `/compras/recepciones/${receiptId}/pagar?moneda=ARS`,
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await expectAccessible(page, "pago en pesos a 375 px");
});
