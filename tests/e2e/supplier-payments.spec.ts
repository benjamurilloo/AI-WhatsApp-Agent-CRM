import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Las pantallas de los pagos a proveedores de punta a punta (brief-22.6, AC-9): Chromium, next start,
// Server Actions, cash, purchasing, numbering, audit y PostgreSQL real, sin mocks. Las recepciones,
// los medios de pago y la sesión de caja son fixtures SQL; los pagos y sus anulaciones, no. Un admin
// paga en parte una recepción con el teclado y ve lo que falta; la paga en efectivo y ve el arqueo;
// ve los rechazos; paga a cuenta y ve lo imputado; anula un pago y ve los dos comprobantes; filtra y
// busca en la lista. Un viewer ve en la caja el total sin la lista, y el aviso en las páginas de
// pagos. Sin JavaScript, el pago también funciona.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const FORBIDDEN =
  "Solo un administrador puede ver y registrar pagos a proveedores.";
const LEGEND = "Documento no válido como factura";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Las tablas de solo inserción y las que no se borran se vacían con TRUNCATE (ADR 0013). El contador
// se vacía para que cada caso empiece en PP-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids,
          goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers,
          refund_voids, refunds, receipt_voids, receipts, cash_movements,
          cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts,
          cash_sessions, payment_methods, document_counters, audit_logs, sale_voids, sale_line_units, sale_lines,
          sales, order_line_units, order_lines, orders, inventory_movements, inventories, product_images,
          product_costs, product_prices, attribute_values, stock_units, products`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  await seedBasic(db, E2E_PASSWORD);
  await db.execute(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Efectivo', true),
               (${SEED_ORGANIZATION_ID}, 'Transferencia', false)`,
  );
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
}

// Cada estado se analiza en claro y en oscuro (brief-4.0, D-6); la vista de impresión también.
async function expectAccessible(
  page: Page,
  state: string,
  media: "screen" | "print" = "screen",
) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ media, colorScheme });
    await expect(page).toHaveTitle(/.+/);
    expect(
      await axeViolations(page),
      `violaciones de axe en "${state}" (${media}, ${colorScheme})`,
    ).toEqual([]);
  }
  await page.emulateMedia({ media: null, colorScheme: null });
}

async function insertSupplier(name: string): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name)
        values (${SEED_ORGANIZATION_ID}, ${name}) returning id`,
  );
  return result.rows[0]!.id;
}

// Una recepción sin orden de una línea, con el stock que sumó.
async function insertReceipt(
  supplierId: string,
  number: number,
  total: string,
): Promise<string> {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${`CAF-${number}`}, ${`Café ${number}`})
        returning id`,
  );
  const productId = product.rows[0]!.id;
  const receipt = await db.execute<{ id: string }>(
    sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                    created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${supplierId}, 'ARS', ${total},
                ${ADMIN_SEED.id})
        returning id`,
  );
  const receiptId = receipt.rows[0]!.id;
  await db.execute(
    sql`insert into goods_receipt_lines (organization_id, goods_receipt_id, product_id, position,
                                         quantity, unit_cost, line_total)
        values (${SEED_ORGANIZATION_ID}, ${receiptId}, ${productId}, 1, 1, ${total}, ${total})`,
  );
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${SEED_ORGANIZATION_ID}, ${productId}, 1)`,
  );
  return receiptId;
}

async function openSession(initial: string): Promise<string> {
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${ADMIN_SEED.id}) returning id`,
  );
  const sessionId = session.rows[0]!.id;
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${SEED_ORGANIZATION_ID}, ${sessionId}, 'ARS', ${initial})`,
  );
  return sessionId;
}

async function payFromReceipt(
  page: Page,
  receiptId: string,
  method: RegExp,
  amount: string,
) {
  await page.goto(`/compras/recepciones/${receiptId}/pagar`);
  await page.getByRole("radio", { name: method }).check();
  await page.getByLabel(/^Monto/).fill(amount);
  await page.getByRole("button", { name: "Registrar pago" }).click();
}

test("un admin paga en parte una recepción con el teclado y ve el comprobante y lo que falta", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const receiptId = await insertReceipt(supplierId, 1, "3600.00");
  await login(page, ADMIN);

  await page.goto(`/compras/recepciones/${receiptId}`);
  const payments = page.getByRole("region", { name: "Pagos", exact: true });
  await expect(payments).toContainText("Falta pagar");
  await expect(payments).toContainText("$ 3.600,00");
  await expect(payments).toContainText("Sin pagos contra esta recepción.");
  await expectAccessible(page, "recepción sin pagos");
  await page.getByRole("link", { name: "Registrar un pago" }).focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/pagar$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Pagar la recepción RC-000001",
    }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Monto/)).toHaveValue("3600.00");
  await expectAccessible(page, "formulario del pago de una recepción");
  await page.getByRole("radio", { name: "Transferencia" }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("radio", { name: "Transferencia" }),
  ).toBeChecked();
  await page.getByLabel(/^Monto/).fill("1000");
  await page.getByLabel(/^Monto/).press("Enter");

  await expect(page).toHaveURL(
    /\/compras\/pagos\/[0-9a-f-]{36}\?aviso=creado$/,
  );
  await expect(page.getByText("Pago registrado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Pago PP-000001" }),
  ).toBeVisible();
  const document = page.locator("[data-comprobante]");
  for (const text of [
    "Importaciones Sur",
    "RC-000001",
    "Transferencia",
    "$ 1.000,00",
    LEGEND,
  ]) {
    await expect(document).toContainText(text);
  }
  await expectAccessible(page, "comprobante del pago");
  await page.emulateMedia({ media: "print" });
  await expect(document).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
  ).toBeHidden();
  await page.emulateMedia({ media: null });
  await expectAccessible(page, "vista de impresión del pago", "print");

  await page.goto(`/compras/recepciones/${receiptId}`);
  await expect(payments).toContainText("$ 2.600,00");
  await expect(payments.getByRole("link", { name: "PP-000001" })).toBeVisible();

  // La confirmación de anular la recepción dice qué pasa con lo pagado (ADR 0023, punto 6).
  await page.goto(`/compras/recepciones/${receiptId}?confirmar=anular`);
  await expect(
    page.getByText(
      "Lo pagado contra esta recepción, $ 1.000,00, pasa a la cuenta del proveedor: se imputa a sus otras recepciones o queda a favor del negocio.",
    ),
  ).toBeVisible();
});

test("el pago en efectivo baja lo esperado; los rechazos por lo que falta y por la caja", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const receiptId = await insertReceipt(supplierId, 1, "500.00");
  const sessionId = await openSession("300.00");
  await login(page, ADMIN);

  await payFromReceipt(page, receiptId, /Transferencia/, "600");
  await expect(
    page.getByText("El pago supera lo que falta: $ 500,00."),
  ).toBeFocused();
  await expect(page.getByLabel(/^Monto/)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expectAccessible(page, "rechazo por lo que falta");

  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await page.getByLabel(/^Monto/).fill("400");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(
    page.getByText(
      "No hay tanto efectivo en la caja: lo esperado en ARS es $ 300,00.",
    ),
  ).toBeVisible();

  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await page.getByLabel(/^Monto/).fill("250");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page).toHaveURL(/\?aviso=creado$/);
  await expect(page.locator("[data-comprobante]")).toContainText("C-000001");

  await page.goto(`/caja/sesiones/${sessionId}`);
  const totals = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000001",
  });
  // **Desde la 24.7.1 la tabla por moneda está transpuesta** (brief-24.7.1): una fila por
  // concepto y una columna por moneda, así que la fila ya no es «la moneda» sino «el concepto».
  // Nombrar el concepto, en vez de contar filas, dice además qué se está midiendo.
  const fila = (concepto: string) =>
    totals.getByRole("row").filter({ hasText: concepto });
  await expect(totals).toContainText("Pagos a proveedores");
  await expect(fila("Pagos a proveedores")).toContainText("$ 250,00");
  await expect(fila("Esperado")).toContainText("$ 50,00");
  const list = page.getByRole("region", {
    name: "Pagos a proveedores en efectivo de la sesión C-000001",
  });
  await expect(list).toContainText("PP-000001");
  await expect(list).toContainText("Importaciones Sur");
  await expectAccessible(page, "sesión con un pago a proveedor");
});

test("un pago a cuenta mayor que la deuda: se imputa a la recepción más vieja y el resto queda a favor", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const older = await insertReceipt(supplierId, 1, "100.00");
  await login(page, ADMIN);

  await page.goto(`/compras/proveedores/${supplierId}`);
  // El enlace vive en el encabezado, como acción primaria, y se llama «Registrar pago a cuenta»
  // desde la 24.8.2-b (V-20 de la lámina 14). Hasta entonces estaba dentro de la tarjeta «Cuenta».
  await page.getByRole("link", { name: "Registrar pago a cuenta" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Pago a cuenta · Importaciones Sur",
    }),
  ).toBeVisible();
  // La situación por moneda, en tarjetas (lámina 12).
  const account = page
    .getByRole("listitem")
    .filter({ hasText: "Saldo pendiente en ARS" });
  await expect(account).toContainText("$ 100,00");
  await expect(account).toContainText("1 comprobante con saldo");
  await expect(page.getByRole("combobox", { name: /^Moneda/ })).toHaveValue(
    "ARS",
  );
  // La lista del sistema, con el nombre de cada moneda, no las sugerencias del navegador (22.7).
  await expect(
    page.getByRole("combobox", { name: /^Moneda/ }).getByRole("option", {
      name: "USD — dólar estadounidense",
    }),
  ).toHaveCount(1);
  await expect(page.getByLabel(/^Monto/)).toHaveValue("100.00");
  // La vista previa de lo propuesto (D-4): los 100 van a la recepción y no sobra nada.
  const preview = page.getByRole("region", {
    name: "Aplicación del pago propuesto",
  });
  await expect(preview.getByRole("row")).toHaveCount(2);
  await expect(preview.getByRole("row").nth(1)).toContainText(
    "Recepción de compra",
  );
  await expect(preview.getByRole("row").nth(1)).toContainText("RC-000001");
  await expect(
    page.getByText(
      "Es la aplicación de lo propuesto sobre la cuenta de hoy: al confirmar se vuelve a calcular.",
    ),
  ).toBeVisible();
  await expectAccessible(page, "formulario del pago a cuenta");
  await page.getByRole("radio", { name: "Transferencia" }).check();
  await page.getByLabel(/^Monto/).fill("150");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page).toHaveURL(/\?aviso=creado$/);
  await expect(page.locator("[data-comprobante]")).toContainText("A cuenta");

  await page.goto(`/compras/recepciones/${older}`);
  const payments = page.getByRole("region", { name: "Pagos", exact: true });
  await expect(payments).toContainText("Imputado desde la cuenta");
  await expect(payments).toContainText("$ 100,00");
  await expect(
    payments.getByRole("link", { name: "Registrar un pago" }),
  ).toHaveCount(0);

  await page.goto(`/compras/proveedores/${supplierId}/pagar`);
  await expect(
    page.getByRole("listitem").filter({ hasText: "A favor del negocio" }),
  ).toContainText("$ 50,00");
});

test("un admin anula un pago en efectivo con la caja abierta y ve los dos comprobantes", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const receiptId = await insertReceipt(supplierId, 1, "500.00");
  await openSession("1000.00");
  await login(page, ADMIN);
  await payFromReceipt(page, receiptId, /Efectivo/, "200");
  await expect(page).toHaveURL(/\?aviso=creado$/);
  const paymentUrl = page.url().replace(/\?.*$/, "");

  await page.getByRole("link", { name: "Anular el pago" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?confirmar=anular$/);
  await expect(page.getByText("Anular pago PP-000001")).toBeFocused();
  await expect(
    page.getByText(/vuelve a lo esperado de la sesión abierta C-000001/),
  ).toBeVisible();
  await expectAccessible(page, "confirmación de la anulación del pago");
  await page.getByRole("radio", { name: "El pago no se hizo" }).check();
  await page.getByRole("button", { name: "Anular pago", exact: true }).click();

  await expect(page).toHaveURL(/\?aviso=anulado$/);
  await expect(page.getByText(/^Anulado por APP-000001 el /)).toBeVisible();
  await expect(page.locator("[data-comprobante]")).toContainText(
    "Anulado por APP-000001",
  );
  await page
    .getByRole("link", { name: "Ver el comprobante de la anulación" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Anulación APP-000001" }),
  ).toBeVisible();
  const document = page.locator("[data-comprobante]");
  for (const text of [
    "PP-000001",
    "El pago no se hizo",
    "Volvió a la sesión",
    "$ 200,00",
    LEGEND,
  ]) {
    await expect(document).toContainText(text);
  }
  await expectAccessible(page, "comprobante de la anulación del pago");

  await page.goto(`/compras/recepciones/${receiptId}`);
  await expect(
    page.getByRole("region", { name: "Pagos", exact: true }),
  ).toContainText("Anulado");
  await page.goto("/caja");
  await expect(
    page.getByRole("region", {
      name: "Totales por moneda de la sesión C-000001",
    }),
  ).toContainText("$ 1.000,00");
  expect(paymentUrl).toMatch(/\/compras\/pagos\/[0-9a-f-]{36}$/);
});

test("la lista filtra por estado y por proveedor, y busca por PP y APP", async ({
  page,
}) => {
  const south = await insertSupplier("Importaciones Sur");
  const north = await insertSupplier("Distribuidora Norte");
  const first = await insertReceipt(south, 1, "100.00");
  const second = await insertReceipt(north, 2, "100.00");
  await login(page, ADMIN);
  await payFromReceipt(page, first, /Transferencia/, "10");
  await expect(page).toHaveURL(/\?aviso=creado$/);
  await payFromReceipt(page, second, /Transferencia/, "20");
  await expect(page).toHaveURL(/\?aviso=creado$/);
  await page.goto(`${page.url().replace(/\?.*$/, "")}?confirmar=anular`);
  await page.getByRole("radio", { name: "Otro" }).check();
  await page.getByRole("button", { name: "Anular pago", exact: true }).click();
  await expect(page).toHaveURL(/\?aviso=anulado$/);

  await page.goto("/compras/pagos");
  const table = page.getByRole("table", {
    name: "Pagos a proveedores de la organización",
  });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table).toContainText("Distribuidora Norte");
  await expectAccessible(page, "lista de pagos");
  await page.getByLabel("Estado").selectOption("anulado");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/estado=anulado/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("PP-000002");

  await page.goto("/compras/pagos?numero=APP-000001");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("PP-000002");
  await page.goto("/compras/pagos?numero=pp-000001");
  await expect(table).toContainText("PP-000001");

  // Desde la 24.8.2 el proveedor es un control y no un campo oculto (D-5): el enlace que viene de
  // su ficha es el mismo parámetro, y el `<select>` queda puesto en él.
  await page.goto(`/compras/pagos?proveedor=${south}`);
  await expect(page.getByLabel("Proveedor", { exact: true })).toHaveValue(
    south,
  );
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("PP-000001");
  await page.getByLabel("Proveedor", { exact: true }).selectOption(north);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`proveedor=${north}`));
  await expect(table).toContainText("PP-000002");
  await expect(table).not.toContainText("PP-000001");
});

// El detalle del pago en un panel que abre y cierra por la URL (brief-24.8.2, D-2 y lámina 08).
test("el panel del pago abre y cierra por la URL, conserva los filtros y lleva al comprobante", async ({
  page,
}) => {
  const south = await insertSupplier("Importaciones Sur");
  const north = await insertSupplier("Distribuidora Norte");
  const first = await insertReceipt(south, 1, "100.00");
  const second = await insertReceipt(north, 2, "100.00");
  await login(page, ADMIN);
  await payFromReceipt(page, first, /Transferencia/, "40");
  await payFromReceipt(page, second, /Transferencia/, "20");

  await page.goto(`/compras/pagos?proveedor=${south}`);
  const table = page.getByRole("table", {
    name: "Pagos a proveedores de la organización",
  });
  await expect(table.getByRole("row")).toHaveCount(2);
  // Ningún panel abierto: la lista sola.
  await expect(page.getByRole("heading", { name: /^Pago PP-/ })).toHaveCount(0);
  await table.getByRole("link", { name: "PP-000001" }).click();

  const panel = page.getByRole("complementary", { name: /Pago PP-000001/ });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`proveedor=${south}.*pago=`));
  // El filtro sigue puesto con el panel abierto.
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(panel).toContainText("Importaciones Sur");
  await expect(panel).toContainText("Transferencia");
  await expect(panel).toContainText("Vigente");
  // «Estado de la recepción» (D-3), con la misma cuenta que limita el pago: 100 de total, 40
  // pagados y 60 que faltan.
  await expect(panel).toContainText("Estado de la recepción");
  await expect(panel).toContainText("$ 100,00");
  await expect(panel).toContainText("$ 40,00");
  await expect(panel).toContainText("$ 60,00");
  await expect(panel).toContainText("No afecta el efectivo de caja.");
  // AC-4: sin conversión no hay qué mostrar de la salida ni de la cotización (V-8).
  await expect(panel).not.toContainText("Salida registrada");
  await expect(panel).not.toContainText("Cotización guardada");
  await expectAccessible(page, "lista de pagos con el panel abierto");

  // Cerrar devuelve a la lista con el filtro donde estaba.
  await page.getByRole("link", { name: "Cerrar el pago" }).click();
  await expect(page).toHaveURL(new RegExp(`proveedor=${south}$`));
  await expect(page.getByRole("complementary")).toHaveCount(0);

  // «Imprimir» lleva al comprobante, que sigue siendo una pantalla propia, y de ahí se vuelve a la
  // lista **con el panel abierto**.
  await table.getByRole("link", { name: "PP-000001" }).click();
  await page
    .getByRole("complementary")
    .getByRole("link", { name: /Imprimir/ })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Pago PP-000001" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Volver a pagos" }).click();
  await expect(
    page.getByRole("complementary", { name: /Pago PP-000001/ }),
  ).toBeVisible();

  // Un pago que no existe no dibuja nada, y la lista sigue estando.
  await page.goto("/compras/pagos?pago=00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(table.getByRole("row")).toHaveCount(3);

  // Y desde el panel se anula, con el paso de la URL de siempre (H-10).
  await page.goto("/compras/pagos");
  await table.getByRole("link", { name: "PP-000002" }).click();
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Anular pago" })
    .click();
  await expect(page).toHaveURL(/confirmar=anular/);
  await page.getByRole("radio", { name: "Otro" }).check();
  await page.getByRole("button", { name: "Anular pago", exact: true }).click();
  await expect(page).toHaveURL(/\?aviso=anulado$/);
});

test("un viewer ve el total de los pagos en la caja, sin la lista, y el aviso en las páginas de pagos", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const receiptId = await insertReceipt(supplierId, 1, "500.00");
  const sessionId = await openSession("1000.00");
  await login(page, ADMIN);
  await payFromReceipt(page, receiptId, /Efectivo/, "200");
  await expect(page).toHaveURL(/\?aviso=creado$/);
  const paymentUrl = page.url().replace(/\?.*$/, "");
  await page.context().clearCookies();

  await login(page, VIEWER);
  await page.goto(`/caja/sesiones/${sessionId}`);
  const totals = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000001",
  });
  await expect(totals).toContainText("Pagos a proveedores");
  await expect(totals).toContainText("$ 800,00");
  await expect(page.getByText("Pagos a proveedores en efectivo")).toHaveCount(
    0,
  );
  await expect(page.getByText("PP-000001")).toHaveCount(0);
  await expect(page.getByText("Importaciones Sur")).toHaveCount(0);
  await expectAccessible(page, "sesión vista por un viewer");

  // **El escenario de D-1, en la pantalla 21** (brief-24.7.1): este `viewer` sí tiene un pago a
  // proveedor en la sesión. Su total lo incluye —1.000 − 200— y la lista unificada **no lo
  // muestra**, porque `cash` no le da el detalle (brief-22.6, D-9). Esa diferencia es la que la
  // línea tiene que explicar, y este es el único estado del sistema donde existe: hasta la
  // revisión independiente de la 24.7.1 no se probaba en ninguna parte.
  await page.goto("/caja");
  const totalesHoy = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000001",
  });
  await expect(totalesHoy).toContainText("Pagos a proveedores");
  await expect(totalesHoy).toContainText("$ 800,00");
  // La lista unificada de este `viewer` **sale vacía**: lo único que movió efectivo en la sesión
  // es el pago a proveedor, y no lo recibe. Por eso no hay tabla que mirar, y por eso el aviso de
  // abajo es la única cosa que explica por qué el total no cuadra con lo que se ve.
  await expect(page.getByText("PP-000001")).toHaveCount(0);
  await expect(page.getByText("Todavía no hubo movimientos.")).toBeVisible();
  await expect(
    page.getByText(/su detalle es solo para un administrador/),
  ).toBeVisible();
  await expectAccessible(page, "caja de un viewer con un pago oculto");

  for (const url of [
    "/compras/pagos",
    paymentUrl,
    `${paymentUrl}/anulacion`,
    `/compras/recepciones/${receiptId}/pagar`,
    `/compras/proveedores/${supplierId}/pagar`,
  ]) {
    await page.goto(url);
    await expect(page.getByText(FORBIDDEN)).toBeVisible();
  }
});

// Sin JavaScript (AC-9): el pago es un formulario común.
// El reflujo **dentro de las tarjetas** (brief-24.8.2, AC-14 y medición 3). Existe porque medir el
// `scrollWidth` del documento no alcanza: en la 24.8.1-b la CI estaba verde, M-3 medía 320 y 375 px,
// y el recorrido del usuario encontró cuatro desbordamientos **adentro** de una tarjeta a anchos de
// escritorio. Acá se mide con `getBoundingClientRect` en el navegador, no razonando sobre una
// captura, y se comparan los hijos contra la caja de su tarjeta.
const REFLOW_WIDTHS = [320, 375, 1280, 1440, 1536, 1680] as const;

async function overflowProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.querySelector("main") ?? document.body;
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      problems.push(
        `el documento pide ${document.documentElement.scrollWidth} px en ${window.innerWidth}`,
      );
    }
    // Lo que desplaza a propósito —una tabla ancha en su contenedor— no es un desbordamiento.
    const scrolls = (el: Element) => {
      const style = getComputedStyle(el);
      return style.overflowX === "auto" || style.overflowX === "scroll";
    };
    const cards = [...root.querySelectorAll(".rounded-xl")].filter(
      (card) => !scrolls(card) && getComputedStyle(card).position === "static",
    );
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (box.width === 0) continue;
      for (const el of card.querySelectorAll(
        "input, select, button, a, dd, dt, td, th, h1, h2, h3, p, li",
      )) {
        let node = el.parentElement;
        let skip = false;
        while (node && node !== card) {
          if (scrolls(node)) skip = true;
          node = node.parentElement;
        }
        const style = getComputedStyle(el);
        if (
          skip ||
          style.position === "absolute" ||
          style.position === "fixed"
        ) {
          continue;
        }
        const inner = el.getBoundingClientRect();
        if (inner.width === 0) continue;
        if (inner.right > box.right + 1 || inner.left < box.left - 1) {
          const name = (el.textContent ?? el.tagName).trim().slice(0, 28);
          problems.push(`«${name}» se sale de su tarjeta`);
        }
      }
    }
    return [...new Set(problems)];
  });
}

test("las seis pantallas entran en su tarjeta a los seis anchos", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones del Sur y Asociados");
  const receiptId = await insertReceipt(supplierId, 1, "123456.78");
  const other = await insertReceipt(supplierId, 2, "99.00");
  await login(page, ADMIN);
  await payFromReceipt(page, receiptId, /Transferencia/, "23456.78");
  const paymentId = new URL(page.url()).pathname.split("/").at(-1)!;

  const screens: [string, string][] = [
    ["la lista con el panel abierto", `/compras/pagos?pago=${paymentId}`],
    ["el comprobante del pago", `/compras/pagos/${paymentId}`],
    ["la anulación", `/compras/pagos/${paymentId}?confirmar=anular`],
    ["pagar la recepción", `/compras/recepciones/${other}/pagar`],
    ["el pago a cuenta", `/compras/proveedores/${supplierId}/pagar`],
    ["a pagar", "/compras/a-pagar"],
  ];
  for (const width of REFLOW_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, href] of screens) {
      await page.goto(href);
      expect(await overflowProblems(page), `${name} a ${width} px`).toEqual([]);
    }
  }
});

// Los otros dos rechazos que AC-6 nombra: la caja cerrada y el medio desactivado. Los dos llegan
// del servidor, y el segundo se provoca desactivando el medio **con el formulario ya dibujado**.
test("los rechazos por la caja cerrada y por el medio desactivado", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const receiptId = await insertReceipt(supplierId, 1, "500.00");
  await login(page, ADMIN);

  await payFromReceipt(page, receiptId, /Efectivo/, "100");
  await expect(
    page.getByText(
      "La caja está cerrada: un pago en efectivo necesita una sesión abierta.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir caja" })).toBeVisible();

  await page.goto(`/compras/recepciones/${receiptId}/pagar`);
  await page.getByRole("radio", { name: /Transferencia/ }).check();
  await page.getByLabel(/^Monto/).fill("100");
  await db.execute(
    sql`update payment_methods set is_active = false
        where organization_id = ${SEED_ORGANIZATION_ID} and name = 'Transferencia'`,
  );
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(
    page.getByText(
      "Ese medio de pago está desactivado. Elegí otro de la lista.",
    ),
  ).toBeVisible();
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("el panel del pago abre y cierra con un enlace", async ({ page }) => {
    const supplierId = await insertSupplier("Importaciones Sur");
    const receiptId = await insertReceipt(supplierId, 2, "80.00");
    await login(page, ADMIN);
    await payFromReceipt(page, receiptId, /Transferencia/, "80");
    await page.goto("/compras/pagos");
    await page
      .getByRole("table", { name: "Pagos a proveedores de la organización" })
      .getByRole("link", { name: "PP-000001" })
      .click();
    await expect(
      page.getByRole("complementary", { name: /Pago PP-000001/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Cerrar el pago" }).click();
    await expect(page.getByRole("complementary")).toHaveCount(0);
  });

  test("los filtros buscan y la anulación confirma", async ({ page }) => {
    const south = await insertSupplier("Importaciones Sur");
    const north = await insertSupplier("Distribuidora Norte");
    const first = await insertReceipt(south, 1, "100.00");
    const second = await insertReceipt(north, 2, "100.00");
    await login(page, ADMIN);
    await payFromReceipt(page, first, /Transferencia/, "40");
    await payFromReceipt(page, second, /Transferencia/, "20");

    // El filtro es un formulario GET: elegir y enviar deja el parámetro en la URL.
    await page.goto("/compras/pagos");
    await page.getByLabel("Proveedor", { exact: true }).selectOption(south);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`proveedor=${south}`));
    const table = page.getByRole("table", {
      name: "Pagos a proveedores de la organización",
    });
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("PP-000001");

    // Y la anulación: el paso de la URL y el formulario de la acción de servidor.
    await table.getByRole("link", { name: "PP-000001" }).click();
    await page
      .getByRole("complementary")
      .getByRole("link", { name: "Anular pago" })
      .click();
    await expect(page).toHaveURL(/confirmar=anular/);
    await page.getByRole("radio", { name: "Otro" }).check();
    await page
      .getByRole("button", { name: "Anular pago", exact: true })
      .click();
    await expect(page).toHaveURL(/\?aviso=anulado$/);
  });

  test("un admin paga una recepción", async ({ page }) => {
    const supplierId = await insertSupplier("Importaciones Sur");
    const receiptId = await insertReceipt(supplierId, 1, "500.00");
    await login(page, ADMIN);
    await payFromReceipt(page, receiptId, /Transferencia/, "500");
    await expect(
      page.getByRole("heading", { level: 1, name: "Pago PP-000001" }),
    ).toBeVisible();
    await page.goto(`/compras/recepciones/${receiptId}`);
    await expect(
      page.getByRole("region", { name: "Pagos", exact: true }),
    ).toContainText("$ 0,00");
  });
});
