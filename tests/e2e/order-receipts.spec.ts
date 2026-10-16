import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// La seña de punta a punta (brief-21.4, AC-7): Chromium, next start, Server Actions, cash, orders,
// sales, numbering, audit y PostgreSQL real, sin mocks. Un admin seña un pedido en dos medios, ve el
// rechazo de una seña de más, lo confirma, lo entrega, emite su venta y ve la seña aplicada; después
// cancela otro pedido señado y ve que lo señado pasó a la cuenta del cliente. Un viewer ve sin
// acciones. Los pedidos, el stock, los medios y la sesión se cargan por SQL: sus pantallas ya
// tienen sus propios casos.

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

// Como en receipts.spec.ts: TRUNCATE es la vía documentada para vaciar lo que es de solo inserción
// (ADR 0013), y el contador se vacía para que cada caso empiece en V-000001, C-000001 y R-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts,
          cash_session_closings, cash_session_opening_amounts, cash_sessions, payment_methods,
          sale_voids, sale_lines, sales, order_lines, orders, document_counters, audit_logs,
          inventory_movements, inventories, product_images, product_costs, product_prices,
          products, conversation_notes, messages, conversations, client_tag_assignments, clients`,
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

async function insertMethods() {
  await db.execute(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Efectivo', true),
               (${SEED_ORGANIZATION_ID}, 'Transferencia', false)`,
  );
}

async function insertOpenSession() {
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${ADMIN_SEED.id}) returning id`,
  );
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${SEED_ORGANIZATION_ID}, ${session.rows[0]!.id}, 'ARS', '1000.00')`,
  );
}

async function insertClient() {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, 'Lucía Gómez', '+5491155550000')
        returning id`,
  );
  return result.rows[0]!.id;
}

// Un producto con stock, para que el pedido se pueda confirmar y entregar.
async function insertStockedProduct(sku: string) {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${sku}, 'Yerba') returning id`,
  );
  const productId = product.rows[0]!.id;
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${SEED_ORGANIZATION_ID}, ${productId}, '10')`,
  );
  return productId;
}

// Un pedido pendiente de dos unidades, por SQL: nace pendiente, como exige el trigger.
async function insertPendingOrder(
  number: number,
  clientId: string,
  productId: string,
  unitPrice: string,
) {
  const total = (Number(unitPrice) * 2).toFixed(2);
  const order = await db.execute<{ id: string }>(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId}, 'ARS', ${total},
                ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  await db.execute(
    sql`insert into order_lines (organization_id, order_id, product_id, position, quantity,
                                 unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${orderId}, ${productId}, 1, '2', ${unitPrice}, 'ARS',
                ${total})`,
  );
  return orderId;
}

async function receiptCount() {
  const result = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from receipts`,
  );
  return result.rows[0]!.total;
}

async function deposit(page: Page, method: string, amount: string) {
  await page.getByRole("link", { name: "Registrar seña" }).click();
  await page.getByRole("radio", { name: new RegExp(method) }).check();
  await page.getByLabel(/Monto en/).fill(amount);
  await page.getByRole("button", { name: "Registrar seña" }).click();
}

async function transition(page: Page, button: string, yes: string) {
  await page.getByRole("button", { name: button }).click();
  await page.getByRole("button", { name: yes }).click();
}

test("un admin seña un pedido en dos medios con el teclado, ve el rechazo de una seña de más, lo entrega y emite la venta con la seña aplicada", async ({
  page,
}) => {
  // El recorrido entero, con cinco estados analizados en claro y en oscuro: pasa del tope por
  // defecto en un runner lento.
  test.slow();
  await insertMethods();
  await insertOpenSession();
  const clientId = await insertClient();
  const productId = await insertStockedProduct("YER-1");
  const orderId = await insertPendingOrder(1, clientId, productId, "5000.00");
  await login(page, ADMIN);
  await page.goto(`/pedidos/${orderId}`);
  const senas = page.getByRole("region", { name: "Señas del pedido P-000001" });
  await expect(page.getByText("Sin señas.")).toBeVisible();
  await expectAccessible(page, "pedido sin señas");

  // La primera seña, en efectivo, con el teclado. El monto se propone en lo que falta.
  await page.getByRole("link", { name: "Registrar seña" }).click();
  await expect(page).toHaveURL(new RegExp(`/pedidos/${orderId}/senar$`));
  const amount = page.getByLabel(/Monto en/);
  await expect(amount).toHaveValue("10000.00");
  const cash = page.getByRole("radio", { name: /Efectivo/ });
  await cash.focus();
  await cash.press("Space");
  await expect(cash).toBeChecked();
  await amount.fill("3000");
  await expect(page.getByText(/Se lee: \$\s3\.000,00/)).toBeVisible();
  await expectAccessible(page, "formulario de la seña");
  await amount.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/pedidos/${orderId}\\?sena=`));
  await expect(page.getByText("Se registró la seña")).toBeVisible();

  // Una seña de más se rechaza con lo que le falta, y conserva lo escrito.
  await deposit(page, "Transferencia", "8000");
  await expect(
    page.getByText(/La seña supera lo que le falta al pedido: \$\s7\.000,00/),
  ).toBeFocused();
  await expect(amount).toHaveValue("8000");
  await expectAccessible(page, "seña rechazada");
  await amount.fill("2000");
  await page.getByRole("button", { name: "Registrar seña" }).click();
  await expect(page.getByText("Se registró la seña")).toBeVisible();
  await expect(senas).toContainText("Efectivo");
  await expect(senas).toContainText("Transferencia");
  await expect(page.getByText("queda retenida para este pedido")).toBeVisible();
  await expectAccessible(page, "pedido señado");

  // El recibo de la seña dice su pedido.
  await senas.getByRole("link", { name: "R-000001" }).click();
  const receipt = page.locator("[data-comprobante]");
  await expect(receipt).toContainText("Seña del pedido");
  await expect(receipt).toContainText("P-000001");
  await page.getByRole("link", { name: "Volver al pedido" }).click();

  // La caja dice el destino de la seña en efectivo: el pedido, no una venta.
  await page.goto("/caja");
  await expect(
    page.getByRole("region", { name: /Cobros en efectivo de la sesión/ }),
  ).toContainText("Pedido P-000001");
  await page.goto(`/pedidos/${orderId}`);

  // Confirmar, entregar y emitir la venta.
  await transition(page, "Confirmar pedido", "Sí, confirmar el pedido");
  await expect(
    page.getByRole("button", { name: "Marcar entregado" }),
  ).toBeVisible();
  await transition(page, "Marcar entregado", "Sí, marcar entregado");
  await expect(page.getByRole("link", { name: "Registrar seña" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Emitir venta" }).click();
  await page.getByRole("button", { name: "Sí, emitir la venta" }).click();

  // La venta: lo cobrado incluye la seña del pedido, y falta el resto.
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
  const saleReceipts = page.getByRole("region", {
    name: "Cobros de la venta V-000001",
  });
  await expect(
    page.getByText("Incluye la seña del pedido P-000001"),
  ).toBeVisible();
  await expect(saleReceipts).toContainText("R-000001");
  await expect(saleReceipts).toContainText("R-000002");
  await expect(saleReceipts).toContainText("Seña del pedido");
  await expect(
    page.getByRole("link", { name: "Registrar cobro" }),
  ).toBeVisible();
  await expectAccessible(page, "venta con la seña aplicada");
  await page.goto(`/pedidos/${orderId}`);
  await expect(page.getByText("La seña cuenta para la venta")).toBeVisible();
  expect(await receiptCount()).toBe(2);
});

// Una venta sin pedido del cliente, por SQL, para ver que lo señado de un pedido cancelado le llega
// desde la cuenta.
async function insertSale(clientId: string, total: string) {
  const sale = await db.execute<{ id: string }>(
    sql`insert into sales (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${clientId}, 'ARS', ${total}, ${ADMIN_SEED.id})
        returning id`,
  );
  return sale.rows[0]!.id;
}

test("un admin cancela un pedido señado: lo señado pasa a la cuenta, la venta del cliente lo recibe, y la lista dice el destino", async ({
  page,
}) => {
  await insertMethods();
  const clientId = await insertClient();
  const productId = await insertStockedProduct("YER-1");
  const saleId = await insertSale(clientId, "4000.00");
  const orderId = await insertPendingOrder(1, clientId, productId, "2000.00");
  await login(page, ADMIN);
  await page.goto(`/pedidos/${orderId}`);
  await deposit(page, "Transferencia", "1000");
  await expect(page.getByText("Se registró la seña")).toBeVisible();
  await transition(page, "Cancelar pedido", "Sí, cancelar el pedido");
  await expect(
    page.getByText("lo señado pasó a la cuenta del cliente"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Registrar seña" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "pedido cancelado con seña");

  // Y la venta del cliente lo recibe de su cuenta.
  await page.goto(`/ventas/${saleId}`);
  await expect(
    page.getByText("Imputado desde la cuenta del cliente"),
  ).toBeVisible();

  // La lista de cobros dice el destino de cada uno.
  await page.goto("/caja/cobros");
  const list = page.getByRole("region", { name: "Cobros" });
  await expect(
    list.getByRole("columnheader", { name: "Destino" }),
  ).toBeVisible();
  await expect(list).toContainText("Pedido P-000001");
  await expectAccessible(page, "lista de cobros con señas");
  expect(await receiptCount()).toBe(1);
});

test("un viewer ve las señas de un pedido sin ninguna acción", async ({
  page,
}) => {
  await insertMethods();
  const clientId = await insertClient();
  const productId = await insertStockedProduct("YER-1");
  const orderId = await insertPendingOrder(1, clientId, productId, "5000.00");
  await db.execute(
    sql`insert into receipts (organization_id, number, target, order_id, client_id,
                              payment_method_id, currency, amount, created_by)
        select o.organization_id, 1, 'order', o.id, o.client_id, m.id, o.currency, '1500.00',
               ${ADMIN_SEED.id}
        from orders o
        join payment_methods m on m.organization_id = o.organization_id and m.name = 'Transferencia'
        where o.id = ${orderId}`,
  );
  await login(page, VIEWER);
  await page.goto(`/pedidos/${orderId}`);
  await expect(
    page.getByRole("region", { name: "Señas del pedido P-000001" }),
  ).toContainText("R-000001");
  await expect(page.getByRole("link", { name: "Registrar seña" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "pedido señado para un viewer");

  await page.goto(`/pedidos/${orderId}/senar`);
  await expect(
    page.getByText("Solo un administrador puede registrar señas."),
  ).toBeVisible();
});

// Sin JavaScript (brief-21.4, AC-7): la seña es un formulario común, y el servidor vuelve al detalle
// del pedido con el aviso.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin registra una seña", async ({ page }) => {
    await insertMethods();
    const clientId = await insertClient();
    const productId = await insertStockedProduct("YER-1");
    const orderId = await insertPendingOrder(1, clientId, productId, "5000.00");
    await login(page, ADMIN);
    await page.goto(`/pedidos/${orderId}/senar`);
    await page.getByRole("radio", { name: "Transferencia" }).check();
    await page.getByLabel(/Monto en/).fill("1000");
    await page.getByRole("button", { name: "Registrar seña" }).click();
    await expect(page).toHaveURL(new RegExp(`/pedidos/${orderId}\\?sena=`));
    await expect(page.getByText("Se registró la seña")).toBeVisible();
    expect(await receiptCount()).toBe(1);
  });
});
