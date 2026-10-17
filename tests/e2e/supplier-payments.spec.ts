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
    sql`truncate table supplier_payment_voids, supplier_payments, goods_receipt_voids,
          goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers,
          refund_voids, refunds, receipt_voids, receipts, cash_movements,
          cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts,
          cash_sessions, payment_methods, document_counters, audit_logs, sale_voids, sale_lines,
          sales, order_lines, orders, inventory_movements, inventories, product_images,
          product_costs, product_prices, products`,
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
  await expect(totals).toContainText("Pagos a proveedores");
  await expect(totals.getByRole("row").nth(1)).toContainText("$ 250,00");
  await expect(totals.getByRole("row").nth(1)).toContainText("$ 50,00");
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
  await page
    .getByRole("region", { name: "Cuenta", exact: true })
    .getByRole("link", { name: "Pago a cuenta" })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Pago a cuenta de Importaciones Sur",
    }),
  ).toBeVisible();
  const account = page.getByRole("table", {
    name: "Cuenta de Importaciones Sur por moneda",
  });
  await expect(account).toContainText("$ 100,00");
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
    page.getByRole("table", { name: "Cuenta de Importaciones Sur por moneda" }),
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
  await expect(page.getByText("¿Anular el pago PP-000001?")).toBeFocused();
  await expect(
    page.getByText(/vuelve a lo esperado de la sesión abierta C-000001/),
  ).toBeVisible();
  await expectAccessible(page, "confirmación de la anulación del pago");
  await page.getByRole("radio", { name: "El pago no se hizo" }).check();
  await page.getByRole("button", { name: "Sí, anular el pago" }).click();

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
  await page.getByRole("button", { name: "Sí, anular el pago" }).click();
  await expect(page).toHaveURL(/\?aviso=anulado$/);

  await page.goto("/compras/pagos");
  const table = page.getByRole("table", {
    name: "Pagos a proveedores de la organización",
  });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table).toContainText("Distribuidora Norte");
  await expectAccessible(page, "lista de pagos");
  await page.getByLabel("Estado").selectOption("anulado");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/estado=anulado/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("PP-000002");

  await page.goto("/compras/pagos?numero=APP-000001");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("PP-000002");
  await page.goto("/compras/pagos?numero=pp-000001");
  await expect(table).toContainText("PP-000001");

  await page.goto(`/compras/pagos?proveedor=${south}`);
  await expect(page.getByText(/^Pagos a Importaciones Sur\./)).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("PP-000001");
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
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

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
