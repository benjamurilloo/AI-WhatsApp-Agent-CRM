import { randomUUID } from "node:crypto";
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

// La permuta y la compra de usados de punta a punta (brief-29.7.2, D-6 y D-9): Chromium, next start,
// Server Actions, cash, tradeins y PostgreSQL real. Un cobro con «Permuta» desde la venta; el pago de un
// usado en efectivo con la caja abierta y su anulación; la anulación del usado rechazada mientras un
// cobro lo usa; el filtro «Falta pagar»; el viewer; 375 px y sin JavaScript. La tienda de ejemplo la
// siembra esta spec con serialized_units y trade_ins, «Permuta» como la crea org:capability (U-4), un
// grado, un producto usado llevado por unidad, una clienta, sus usados y una venta en dólares, y la
// borra al terminar, como trade-ins.spec.ts.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
const CLIENT = "Ana Permuta";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

let productId: string;
let gradeId: string;
let clientId: string;

async function returningId(query: ReturnType<typeof sql>): Promise<string> {
  const result = await db.execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

// Vacía lo de la tienda de ejemplo; con keep, la vuelve a sembrar lista para la permuta y la compra.
async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table appointments, trade_in_margins, trade_in_settings, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, trade_in_checklist_items, service_order_lines, service_orders, repair_prices, repair_types, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts, cash_sessions, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
  );
  await db.execute(
    sql`delete from payment_methods where organization_id = ${IPHONE}`,
  );
  await db.execute(sql`delete from clients where organization_id = ${IPHONE}`);
  await db.execute(
    sql`delete from attribute_options where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from attribute_definitions where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from product_models where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${IPHONE}`,
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
      ? sql`delete from organizations where id not in (${SEED_ORGANIZATION_ID}, ${IPHONE})`
      : sql`delete from organizations where id <> ${SEED_ORGANIZATION_ID}`,
  );
  await seedBasic(db, E2E_PASSWORD);
  if (!keep) return;
  await seedIphone(db, E2E_PASSWORD);
  // Lo que deja org:capability --profile iphone para los usados, con «Permuta» (brief-29.7.2, U-4).
  for (const capability of ["serialized_units", "trade_ins"]) {
    await db.execute(
      sql`insert into organization_capabilities (organization_id, capability, activated_by)
          values (${IPHONE}, ${capability}, ${ADMIN_IPHONE.id})`,
    );
  }
  gradeId = await returningId(
    sql`insert into unit_grades (organization_id, name, description, position, is_example)
        values (${IPHONE}, 'A', 'Como nuevo', 0, true) returning id`,
  );
  await db.execute(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${IPHONE}, 'Efectivo', true), (${IPHONE}, 'Transferencia', false)`,
  );
  await db.execute(
    sql`insert into payment_methods (organization_id, name, is_cash, system_role)
        values (${IPHONE}, 'Permuta', false, 'trade_in')`,
  );
  clientId = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164, document_number)
        values (${IPHONE}, ${CLIENT}, '+5491155557777', '30999888') returning id`,
  );
  productId = await returningId(
    sql`insert into products (organization_id, sku, name, condition, tracking)
        values (${IPHONE}, 'IP12-USADO', 'iPhone 12 usado', 'used', 'unit') returning id`,
  );
}

// Un usado recibido, por SQL, con su unidad en revisión, como lo deja la recepción de la 29.7.
async function insertTradeIn(
  number: number,
  destination: "sale_credit" | "purchase",
): Promise<string> {
  const id = randomUUID();
  const serial = `35600000000${number}`;
  const unitId = await returningId(
    sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type,
          origin_id, status, grade_id, battery_health, created_by)
        values (${IPHONE}, ${productId}, ${serial}, 300, 'USD', 'trade_in', ${id}, 'in_review',
          ${gradeId}, 88, ${ADMIN_IPHONE.id}) returning id`,
  );
  await db.execute(
    sql`insert into trade_ins (id, organization_id, number, client_id, product_id, unit_id, serial,
          battery_health, grade_id, value, currency, destination, created_by)
        values (${id}, ${IPHONE}, ${number}, ${clientId}, ${productId}, ${unitId}, ${serial}, 88,
          ${gradeId}, 300, 'USD', ${destination}, ${ADMIN_IPHONE.id})`,
  );
  return id;
}

// Una venta de la clienta, sin pedido y de una línea, por SQL, como en receipts.spec.ts.
async function insertSale(total: string): Promise<string> {
  const product = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${IPHONE}, 'FUNDA-1', 'Funda') returning id`,
  );
  const saleId = await returningId(
    sql`insert into sales (organization_id, number, client_id, currency, total, created_by)
        values (${IPHONE}, 1, ${clientId}, 'USD', ${total}, ${ADMIN_IPHONE.id}) returning id`,
  );
  await db.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${IPHONE}, ${saleId}, ${product}, 1, '1', ${total}, 'USD', ${total})`,
  );
  return saleId;
}

async function openSession(amount: string) {
  const sessionId = await returningId(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${IPHONE}, 1, ${ADMIN_IPHONE.id}) returning id`,
  );
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${IPHONE}, ${sessionId}, 'USD', ${amount})`,
  );
  return sessionId;
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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("un admin descuenta un usado de una venta con «Permuta», y el usado ya no se anula", async ({
  page,
}) => {
  test.slow();
  const tradeInId = await insertTradeIn(1, "sale_credit");
  const saleId = await insertSale("1000");
  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/ventas/${saleId}/cobrar`);
  const permuta = page.getByRole("radio", {
    name: /Permuta con el usado PU-000001/,
  });
  await expect(permuta).toBeVisible();
  await expectAccessible(page, "cobro con la permuta");

  // Lo propuesto es lo que falta de la venta, más que lo que queda del usado.
  await permuta.check();
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(
    page.getByText(/La permuta supera lo que queda del usado/),
  ).toBeVisible();
  // «Proponer lo que queda» elige ese usado y propone el menor entre lo que queda y lo que falta
  // (revisión independiente de la 29.7.2, NB-1).
  await page
    .getByRole("link", { name: "Proponer lo que queda de PU-000001" })
    .click();
  await expect(page).toHaveURL(/\?usado=/);
  await expect(
    page.getByRole("radio", { name: /Permuta con el usado PU-000001/ }),
  ).toBeChecked();
  await expect(page.getByLabel(/^Monto en/)).toHaveValue("300.00");
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
  await expect(
    page.getByRole("link", { name: "PU-000001" }).first(),
  ).toBeVisible();
  const stored = await db.execute<{ trade_in_id: string | null }>(
    sql`select trade_in_id from receipts where sale_id = ${saleId}`,
  );
  expect(stored.rows).toEqual([{ trade_in_id: tradeInId }]);

  // El usado muestra lo descontado, y no se puede anular mientras el cobro lo use.
  await page.goto(`/usados/${tradeInId}`);
  await expect(page.getByRole("heading", { name: "La permuta" })).toBeVisible();
  await expect(page.getByText(/Queda\s+US\$\s0,00/)).toBeVisible();
  await expect(
    page.getByText(/No se puede anular: el cobro R-000001 lo usa/),
  ).toBeVisible();
  await expectAccessible(page, "usado con su permuta");
});

test("un admin paga un usado en efectivo, la caja lo resta, y lo anula", async ({
  page,
}) => {
  test.slow();
  const tradeInId = await insertTradeIn(1, "purchase");
  await openSession("1000");
  await login(page, ADMIN_IPHONE.email);

  // El filtro «Falta pagar» lo muestra.
  await page.goto("/usados?estado=falta-pagar");
  await expect(
    page.getByRole("link", { name: "PU-000001" }).first(),
  ).toBeVisible();

  await page.goto(`/usados/${tradeInId}`);
  await expect(page.getByRole("heading", { name: "Los pagos" })).toBeVisible();
  await page.getByRole("link", { name: "Pagar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pagar el usado PU-000001" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: /Permuta/ })).toHaveCount(0);
  await expectAccessible(page, "formulario del pago");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await page.getByLabel(/^Monto en/).fill("120");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(
    page.getByRole("heading", { name: "Pago PPU-000001" }),
  ).toBeVisible();
  await expect(page.getByText("Pago registrado.")).toBeVisible();
  await expect(page.getByText("30999888")).toBeVisible();
  await expectAccessible(page, "comprobante del pago");
  const paymentUrl = page.url().replace(/\?.*$/, "");

  // La caja lo resta y lo lista.
  await page.goto("/caja");
  await expect(
    page.getByRole("columnheader", { name: "Pagos de usados" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "PPU-000001" })).toBeVisible();

  // La anulación devuelve la plata a la caja abierta.
  await page.goto(paymentUrl);
  await page.getByLabel("Motivo").selectOption({ label: "Monto equivocado" });
  await page.getByRole("button", { name: "Anular el pago" }).click();
  await expect(page.getByText("Pago anulado.")).toBeVisible();
  await page.getByRole("link", { name: "APPU-000001" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Anulación APPU-000001" }),
  ).toBeVisible();
  await expectAccessible(page, "comprobante de la anulación");
  const expected = await db.execute<{ voids: number }>(
    sql`select count(*)::int as voids from trade_in_payment_voids where session_id is not null`,
  );
  expect(expected.rows[0]!.voids).toBe(1);
});

test("un viewer ve la permuta en la venta, pero no los pagos ni el disponible", async ({
  page,
}) => {
  const credit = await insertTradeIn(1, "sale_credit");
  const bought = await insertTradeIn(2, "purchase");
  const saleId = await insertSale("1000");
  await db.execute(
    sql`insert into receipts (organization_id, number, target, sale_id, client_id, payment_method_id,
          currency, amount, trade_in_id, created_by)
        select ${IPHONE}, 1, 'sale', ${saleId}, ${clientId}, m.id, 'USD', 200, ${credit},
          ${ADMIN_IPHONE.id}
        from payment_methods m where m.organization_id = ${IPHONE} and m.system_role = 'trade_in'`,
  );
  await login(page, VIEWER_IPHONE.email);
  await page.goto(`/ventas/${saleId}`);
  await expect(
    page.getByRole("link", { name: "PU-000001" }).first(),
  ).toBeVisible();
  await page.goto(`/usados/${credit}`);
  await expect(
    page.getByRole("heading", { name: "Usado recibido PU-000001" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "La permuta" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "usado para un viewer");
  await page.goto(`/usados/${bought}/pago`);
  await expect(
    page.getByText(/Solo un administrador paga usados/),
  ).toBeVisible();
  await page.goto("/usados");
  await expect(page.getByRole("option", { name: "Falta pagar" })).toHaveCount(
    0,
  );
});

test("la permuta y el pago entran en 375 px sin desplazamiento horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const bought = await insertTradeIn(1, "purchase");
  await insertTradeIn(2, "sale_credit");
  const saleId = await insertSale("1000");
  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/ventas/${saleId}/cobrar`);
  await expect(
    page.getByRole("radio", { name: /Permuta con el usado PU-000002/ }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto(`/usados/${bought}`);
  await expect(page.getByRole("heading", { name: "Los pagos" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto(`/usados/${bought}/pago`);
  await expect(
    page.getByRole("button", { name: "Registrar pago" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin cobra con «Permuta» y paga un usado", async ({ page }) => {
    const credit = await insertTradeIn(1, "sale_credit");
    const bought = await insertTradeIn(2, "purchase");
    const saleId = await insertSale("1000");
    await login(page, ADMIN_IPHONE.email);
    await page.goto(`/ventas/${saleId}/cobrar`);
    await page
      .getByRole("radio", { name: /Permuta con el usado PU-000001/ })
      .check();
    await page.getByLabel(/^Monto en/).fill("250");
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
    const used = await db.execute<{ amount: string }>(
      sql`select amount from receipts where trade_in_id = ${credit}`,
    );
    expect(used.rows).toEqual([{ amount: "250.00" }]);

    await page.goto(`/usados/${bought}/pago`);
    await page.getByRole("radio", { name: /Transferencia/ }).check();
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(
      page.getByRole("heading", { name: "Pago PPU-000001" }),
    ).toBeVisible();
  });
});
