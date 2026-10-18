import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// La cuenta corriente de punta a punta (brief-21.6, AC-8): Chromium, next start, Server Actions, cash,
// sales, orders, crm, numbering, audit y PostgreSQL real, sin mocks. Un admin abre el estado de
// cuenta desde la ficha, cobra a cuenta con la vista previa de la regla, ve la imputación y lo que
// queda a favor, y lo devuelve; ve la lista de deudores con el filtro por moneda y los textos nuevos
// de lo que pasó a la cuenta (D-8). Un viewer ve la cuenta y los deudores sin acciones. Las ventas,
// los pedidos, los cobros y los medios se cargan por SQL: sus pantallas ya tienen sus propios casos.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Como en refunds.spec.ts: TRUNCATE vacía lo que es de solo inserción (ADR 0013), y el contador se
// vacía para que cada caso empiece en R-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, cash_movements,
          cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts,
          cash_sessions, payment_methods, sale_voids, sale_lines, sales, order_lines, orders,
          document_counters, audit_logs, inventory_movements, inventories, product_images,
          product_costs, product_prices, attribute_values, products, conversation_notes, messages, conversations,
          client_tag_assignments, clients`,
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

async function insertMethods(): Promise<{ cash: string; transfer: string }> {
  const result = await db.execute<{ id: string; name: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Efectivo', true),
               (${SEED_ORGANIZATION_ID}, 'Transferencia', false)
        returning id, name`,
  );
  const idOf = (name: string) =>
    result.rows.find((row) => row.name === name)!.id;
  return { cash: idOf("Efectivo"), transfer: idOf("Transferencia") };
}

async function insertClient(name: string, phone: string) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${phone})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertProduct(sku: string) {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${sku}, 'Yerba') returning id`,
  );
  return product.rows[0]!.id;
}

// Una venta de una línea, por SQL; la más vieja primero por su fecha.
async function insertSale(
  number: number,
  total: string,
  clientId: string,
  { currency = "ARS", daysAgo = 0 } = {},
) {
  const productId = await insertProduct(`SKU-${number}`);
  const sale = await db.execute<{ id: string }>(
    sql`insert into sales (organization_id, number, client_id, currency, total, created_by,
                           created_at)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId}, ${currency}, ${total},
                ${ADMIN_SEED.id}, now() - make_interval(days => ${daysAgo}))
        returning id`,
  );
  const saleId = sale.rows[0]!.id;
  await db.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${saleId}, ${productId}, 1, '1', ${total},
                ${currency}, ${total})`,
  );
  return saleId;
}

async function insertSaleReceipt(
  number: number,
  saleId: string,
  methodId: string,
  amount: string,
) {
  await db.execute(
    sql`insert into receipts (organization_id, number, target, sale_id, client_id,
                              payment_method_id, currency, amount, created_by)
        select organization_id, ${number}, 'sale', id, client_id, ${methodId},
               currency, ${amount}, ${ADMIN_SEED.id}
        from sales where id = ${saleId}`,
  );
}

async function voidSale(number: number, saleId: string) {
  await db.execute(
    sql`insert into sale_voids (organization_id, number, sale_id, currency, total, reason,
                                created_by)
        select organization_id, ${number}, id, currency, total, 'data_entry_error',
               ${ADMIN_SEED.id}
        from sales where id = ${saleId}`,
  );
}

// Un pedido de una línea con una seña, cancelado por SQL: lo señado pasó a la cuenta.
async function insertCancelledOrderWithDeposit(
  number: number,
  receiptNumber: number,
  clientId: string,
  methodId: string,
  deposit: string,
) {
  const productId = await insertProduct(`SKU-P${number}`);
  const order = await db.execute<{ id: string }>(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId}, 'ARS', '2000.00',
                ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  await db.execute(
    sql`insert into order_lines (organization_id, order_id, product_id, position, quantity,
                                 unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${orderId}, ${productId}, 1, '1', '2000.00', 'ARS',
                '2000.00')`,
  );
  await db.execute(
    sql`insert into receipts (organization_id, number, target, order_id, client_id,
                              payment_method_id, currency, amount, created_by)
        values (${SEED_ORGANIZATION_ID}, ${receiptNumber}, 'order', ${orderId}, ${clientId},
                ${methodId}, 'ARS', ${deposit}, ${ADMIN_SEED.id})`,
  );
  await db.execute(
    sql`update orders set status = 'cancelled', cancelled_at = now() where id = ${orderId}`,
  );
  return orderId;
}

async function accountReceipts() {
  const result = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from receipts where target = 'account'`,
  );
  return result.rows[0]!.total;
}

test("un admin abre el estado de cuenta desde la ficha, cobra a cuenta con la vista previa, ve la imputación y devuelve lo que queda a favor", async ({
  page,
}) => {
  test.slow();
  await insertMethods();
  const clientId = await insertClient("Lucía Gómez", "+5491155550000");
  await insertSale(1, "3000.00", clientId, { daysAgo: 2 });
  await insertSale(2, "2000.00", clientId, { daysAgo: 1 });
  await login(page, ADMIN);

  // La tarjeta de la ficha.
  await page.goto(`/clientes/${clientId}`);
  const card = page.getByRole("region", { name: "Cuenta corriente" });
  await expect(card).toContainText(/Debe ARS\s*\$\s5\.000,00/);
  await card.getByRole("link", { name: "Estado de cuenta" }).click();
  await expect(page).toHaveURL(new RegExp(`/clientes/${clientId}/cuenta$`));
  const statement = page.locator("[data-comprobante]");
  await expect(statement).toContainText("Documento no válido como factura");
  await expect(statement).toContainText(/Debe \$\s5\.000,00/);
  await expectAccessible(page, "estado de cuenta");

  // El cobro a cuenta, con el teclado: la moneda y el monto propuestos, y la vista previa.
  await page.getByRole("link", { name: "Cobrar a cuenta" }).click();
  await expect(page).toHaveURL(new RegExp(`/clientes/${clientId}/cobrar$`));
  await expect(page.getByLabel("Moneda *")).toHaveValue("ARS");
  // La lista del sistema, con el nombre de cada moneda, no las sugerencias del navegador (22.7).
  await expect(
    page.getByRole("combobox", { name: /^Moneda/ }).getByRole("option", {
      name: "USD — dólar estadounidense",
    }),
  ).toHaveCount(1);
  const amount = page.getByLabel("Monto *");
  await expect(amount).toHaveValue("5000.00");
  await expectAccessible(page, "formulario del cobro a cuenta");
  const transfer = page.getByRole("radio", { name: "Transferencia" });
  await transfer.focus();
  await transfer.press("Space");
  await amount.fill("6000");
  await amount.press("Enter");
  const preview = page.getByRole("heading", { name: /Cómo se aplica/ });
  await expect(preview).toBeFocused();
  await expect(
    page.getByText(/A la venta V-000001: \$\s3\.000,00/),
  ).toBeVisible();
  await expect(
    page.getByText(/A la venta V-000002: \$\s2\.000,00/),
  ).toBeVisible();
  await expect(
    page.getByText(/Queda a favor del cliente: \$\s1\.000,00/),
  ).toBeVisible();
  await expectAccessible(page, "vista previa del cobro a cuenta");
  expect(await accountReceipts()).toBe(0);
  await page.getByRole("button", { name: "Registrar cobro" }).click();

  // El estado de cuenta con el aviso y la imputación de hoy.
  await expect(page).toHaveURL(
    new RegExp(`/clientes/${clientId}/cuenta\\?cobro=`),
  );
  await expect(page.getByText("Cobro a cuenta registrado.")).toBeVisible();
  await expect(statement).toContainText(/A favor \$\s1\.000,00/);
  await expect(statement).toContainText(
    /Quedan \$\s1\.000,00 a favor del cliente/,
  );
  await expect(statement).toContainText("A cuenta");
  await expectAccessible(page, "estado de cuenta con el cobro");
  // La vista de impresión del estado de cuenta.
  await page.emulateMedia({ media: "print" });
  await expectAccessible(page, "estado de cuenta impreso");
  await page.emulateMedia({ media: null });

  // El recibo dice el destino y no a qué venta se aplicó.
  await page.getByRole("link", { name: "R-000001" }).first().click();
  await expect(page.locator("[data-comprobante]")).toContainText(
    "Cuenta del cliente",
  );

  // Lo que queda a favor se devuelve desde la ficha.
  await page.goto(`/clientes/${clientId}`);
  await expect(card).toContainText(/A favor ARS\s*\$\s1\.000,00/);
  await card.getByRole("link", { name: "Devolver saldo a favor" }).click();
  await page.getByRole("radio", { name: "Transferencia" }).check();
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(page.getByText("Devolución registrada.")).toBeVisible();
  await page.goto(`/clientes/${clientId}`);
  await expect(card).toContainText("No debe nada ni tiene saldo a favor.");
  // El estado de cuenta de un cliente al día: el saldo en cero.
  await card.getByRole("link", { name: "Estado de cuenta" }).click();
  await expect(statement).toContainText(/Saldo\s*\$\s0,00/);
  await expectAccessible(page, "estado de cuenta al día");
});

test("la lista de deudores, con el filtro por moneda, y los textos de lo que pasó a la cuenta", async ({
  page,
}) => {
  test.slow();
  const methods = await insertMethods();
  const lucia = await insertClient("Lucía Gómez", "+5491155550000");
  const mario = await insertClient("Mario Paz", "+5491155551111");
  await insertSale(1, "3000.00", lucia, { daysAgo: 3 });
  await insertSale(2, "500.00", mario, { daysAgo: 2 });
  await insertSale(3, "80.00", mario, { currency: "USD", daysAgo: 1 });
  // Una venta anulada de Lucía, cobrada: lo cobrado pasó a su cuenta y paga parte de la otra.
  const gone = await insertSale(4, "1000.00", lucia);
  await insertSaleReceipt(1, gone, methods.transfer, "1000.00");
  await voidSale(1, gone);
  // Un pedido cancelado de Ana con una seña de 500: sin ventas, queda a favor y no es deudora.
  const ana = await insertClient("Ana Ruiz", "+5491155552222");
  const cancelled = await insertCancelledOrderWithDeposit(
    1,
    2,
    ana,
    methods.transfer,
    "500.00",
  );
  await login(page, ADMIN);

  await page.goto("/caja/deudores");
  const list = page.getByRole("region", { name: "Deudores" });
  await expect(list.getByRole("row")).toHaveCount(4);
  await expect(list.getByRole("row").nth(1)).toContainText("Lucía Gómez");
  await expect(list.getByRole("row").nth(1)).toContainText(/\$\s2\.000,00/);
  await expect(list.getByRole("row").nth(2)).toContainText("Mario Paz");
  await expect(list.getByRole("row").nth(3)).toContainText("USD");
  await expectAccessible(page, "lista de deudores");
  await page.getByLabel("Moneda").selectOption("USD");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/\/caja\/deudores\?moneda=USD$/);
  await expect(list.getByRole("row")).toHaveCount(2);
  await expect(list).toContainText("Mario Paz");
  await list.getByRole("link", { name: "Mario Paz" }).click();
  await expect(page).toHaveURL(new RegExp(`/clientes/${mario}/cuenta$`));

  // D-8: la venta anulada no afirma un saldo a favor que se fue a otra venta.
  await page.goto(`/ventas/${gone}`);
  await expect(
    page.getByText(
      /pasó a la cuenta del cliente\. Se aplica primero a sus ventas con saldo/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Cuenta del cliente: debe \$\s2\.000,00/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Devolver saldo a favor" }),
  ).toHaveCount(0);

  // D-8: el pedido cancelado dice la regla y lo que tiene a favor hoy.
  await page.goto(`/pedidos/${cancelled}`);
  await expect(
    page.getByText(
      /El pedido se canceló: lo señado pasó a la cuenta del cliente\. Se aplica primero a sus ventas con saldo, y lo que sobra queda a favor\. Hoy tiene \$\s500,00 a favor\./,
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ver estado de cuenta" }).click();
  await expect(page).toHaveURL(new RegExp(`/clientes/${ana}/cuenta$`));
});

test("un viewer ve la cuenta y los deudores sin ninguna acción", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez", "+5491155550000");
  await insertSale(1, "3000.00", clientId);
  await login(page, VIEWER);

  await page.goto(`/clientes/${clientId}`);
  const card = page.getByRole("region", { name: "Cuenta corriente" });
  await expect(card).toContainText(/Debe ARS/);
  await expect(card.getByRole("link", { name: "Cobrar a cuenta" })).toHaveCount(
    0,
  );
  await page.goto(`/clientes/${clientId}/cuenta`);
  await expect(page.locator("[data-comprobante]")).toContainText("V-000001");
  await expect(page.locator("[data-comprobante]")).not.toContainText(
    "+5491155550000",
  );
  await expect(page.getByRole("link", { name: "Cobrar a cuenta" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "estado de cuenta para un viewer");
  await page.goto(`/clientes/${clientId}/cobrar`);
  await expect(
    page.getByText("Solo un administrador puede registrar cobros."),
  ).toBeVisible();
  await page.goto("/caja/deudores");
  await expect(page.getByRole("region", { name: "Deudores" })).toContainText(
    "Lucía Gómez",
  );
  expect(await accountReceipts()).toBe(0);
});

// Sin JavaScript (brief-21.6, AC-8): los dos pasos del cobro a cuenta son formularios comunes.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin cobra a cuenta", async ({ page }) => {
    await insertMethods();
    const clientId = await insertClient("Lucía Gómez", "+5491155550000");
    await insertSale(1, "3000.00", clientId);
    await login(page, ADMIN);

    await page.goto(`/clientes/${clientId}/cobrar`);
    await page.getByRole("radio", { name: "Transferencia" }).check();
    await page.getByLabel("Monto *").fill("1000");
    await page.getByRole("button", { name: "Ver cómo se aplica" }).click();
    await expect(
      page.getByText(/A la venta V-000001: \$\s1\.000,00/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/clientes/${clientId}/cuenta\\?cobro=`),
    );
    await expect(page.getByText("Cobro a cuenta registrado.")).toBeVisible();
    await expect(page.locator("[data-comprobante]")).toContainText(
      /Debe \$\s2\.000,00/,
    );
    expect(await accountReceipts()).toBe(1);
  });
});
