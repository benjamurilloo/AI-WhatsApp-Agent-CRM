import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// La cuenta del proveedor de punta a punta (brief-22.7, AC-8): Chromium, next start, cash,
// purchasing y PostgreSQL real, sin mocks. Las recepciones, sus anulaciones y los pagos son fixtures
// SQL: esta subfase solo lee. Un admin va con el teclado de la lista «A pagar» al estado de cuenta, de
// ahí a un comprobante, y de la ficha del proveedor a su estado de cuenta; filtra por moneda y ve la
// vista de impresión. Un viewer ve el aviso en las dos páginas.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const FORBIDDEN = "Solo un administrador puede ver la cuenta de un proveedor.";
const LEGEND = "Documento no válido como factura";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Las tablas de solo inserción y las que no se borran se vacían con TRUNCATE (ADR 0013).
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

async function insertSupplier(
  name: string,
  cuit: string | null = null,
): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name, cuit)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${cuit}) returning id`,
  );
  return result.rows[0]!.id;
}

// Una recepción sin orden de una línea.
async function insertReceipt(
  supplierId: string,
  number: number,
  total: string,
  currency = "ARS",
): Promise<string> {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${`CAF-${number}`}, ${`Café ${number}`})
        returning id`,
  );
  const receipt = await db.execute<{ id: string }>(
    sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                    created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${supplierId}, ${currency}, ${total},
                ${ADMIN_SEED.id})
        returning id`,
  );
  const receiptId = receipt.rows[0]!.id;
  await db.execute(
    sql`insert into goods_receipt_lines (organization_id, goods_receipt_id, product_id, position,
                                         quantity, unit_cost, line_total)
        values (${SEED_ORGANIZATION_ID}, ${receiptId}, ${product.rows[0]!.id}, 1, 1, ${total},
                ${total})`,
  );
  return receiptId;
}

async function insertAccountPayment(
  supplierId: string,
  number: number,
  amount: string,
  currency = "ARS",
): Promise<void> {
  const method = await db.execute<{ id: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, ${`Transferencia ${number}`}, false)
        returning id`,
  );
  await db.execute(
    sql`insert into supplier_payments (organization_id, number, target, supplier_id,
                                       payment_method_id, currency, amount, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, 'account', ${supplierId},
                ${method.rows[0]!.id}, ${currency}, ${amount}, ${ADMIN_SEED.id})`,
  );
}

// Importaciones Sur: dos recepciones en pesos (100.000 y 50.000) y un pago a cuenta de 120.000, que
// cubre la primera y deja 30.000 por pagar de la segunda. Lácteos Oeste: 8.000 en pesos y 40 en
// dólares, sin pagos.
async function scenario() {
  const south = await insertSupplier("Importaciones Sur", "20123456788");
  const first = await insertReceipt(south, 1, "100000");
  await insertReceipt(south, 2, "50000");
  await insertAccountPayment(south, 1, "120000");
  const west = await insertSupplier("Lácteos Oeste");
  await insertReceipt(west, 3, "8000");
  await insertReceipt(west, 4, "40", "USD");
  return { south, first, west };
}

test("un admin va con el teclado de «A pagar» al estado de cuenta y a un comprobante", async ({
  page,
}) => {
  const { south, first } = await scenario();
  await login(page, ADMIN);

  await page.goto("/compras/a-pagar");
  await expect(page.getByRole("heading", { name: "A pagar" })).toBeVisible();
  const rows = page.getByRole("region", { name: "A pagar" }).getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText("Importaciones Sur");
  await expect(rows.nth(1)).toContainText("30.000");
  await expect(rows.nth(2)).toContainText("Lácteos Oeste");
  await expect(rows.nth(3)).toContainText("USD");
  await expectAccessible(page, "la lista a pagar");

  // El filtro por moneda.
  await page.getByLabel("Moneda").selectOption("USD");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/moneda=USD/);
  await expect(
    page.getByRole("region", { name: "A pagar" }).getByRole("row"),
  ).toHaveCount(2);
  await page.getByLabel("Moneda").selectOption("");
  await page.getByRole("button", { name: "Filtrar" }).click();

  // Con el teclado, al estado de cuenta.
  await page.getByRole("link", { name: "Importaciones Sur" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/compras/proveedores/${south}/cuenta`);
  await expect(
    page.getByRole("heading", {
      name: "Estado de cuenta de Importaciones Sur",
    }),
  ).toBeVisible();
  const statement = page.locator("[data-comprobante]");
  await expect(statement).toContainText("CUIT 20-12345678-8");
  await expect(statement).toContainText("Se le debe $ 30.000,00");
  await expect(statement).toContainText(LEGEND);
  const imputation = page.getByRole("region", { name: "Imputación en ARS" });
  await expect(imputation.getByRole("row").nth(1)).toContainText("Pagada");
  await expect(imputation.getByRole("row").nth(2)).toContainText("30.000");
  await expect(
    page.getByRole("region", { name: "Comprobantes del proveedor" }),
  ).toContainText("PP-000001");
  await expectAccessible(page, "el estado de cuenta");
  await expectAccessible(page, "el estado de cuenta impreso", "print");

  // De un comprobante del estado de cuenta, a su página.
  await page
    .getByRole("region", { name: "Imputación en ARS" })
    .getByRole("link", { name: "RC-000001" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/compras/recepciones/${first}`);

  // Del estado de cuenta a la ficha, con el teclado: la lista lleva al estado de cuenta (D-7), y de
  // ahí a la ficha (AC-8; revisión independiente, R4).
  await page.goBack();
  await page.getByRole("link", { name: "Volver al proveedor" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/compras/proveedores/${south}`);
  await expect(page.getByText("Se le debe ARS")).toBeVisible();
});

test("la ficha del proveedor muestra su cuenta y lleva al estado de cuenta", async ({
  page,
}) => {
  const { south, west } = await scenario();
  await login(page, ADMIN);

  await page.goto(`/compras/proveedores/${west}`);
  await expect(page.getByRole("heading", { name: "Cuenta" })).toBeVisible();
  await expect(page.getByText("Se le debe ARS")).toBeVisible();
  await expect(page.getByText("Se le debe USD")).toBeVisible();
  await expectAccessible(page, "la ficha con la cuenta");

  await page.getByRole("link", { name: "Estado de cuenta" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/compras/proveedores/${west}/cuenta`);

  // Un proveedor sin nada que pagar.
  const empty = await insertSupplier("Al día");
  await page.goto(`/compras/proveedores/${empty}`);
  await expect(page.getByText("No se le debe nada.")).toBeVisible();

  // El pago a cuenta lleva al estado de cuenta.
  await page.goto(`/compras/proveedores/${south}/pagar`);
  await expect(
    page.getByRole("link", { name: "Estado de cuenta" }),
  ).toHaveAttribute("href", `/compras/proveedores/${south}/cuenta`);
});

test("un viewer ve el aviso en la lista y en el estado de cuenta", async ({
  page,
}) => {
  const { south } = await scenario();
  await login(page, VIEWER);
  for (const path of [
    "/compras/a-pagar",
    `/compras/proveedores/${south}/cuenta`,
  ]) {
    await page.goto(path);
    await expect(page.getByText(FORBIDDEN)).toBeVisible();
    await expect(page.getByText("Importaciones Sur")).toHaveCount(0);
  }
});
