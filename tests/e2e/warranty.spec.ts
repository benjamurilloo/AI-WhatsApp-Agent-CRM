import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
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

// La garantía de punta a punta (brief-29.9, D-7): Chromium, next start, Server Actions, inventory,
// service, sales, orders y PostgreSQL real. Un admin vende una unidad, ve su garantía en la unidad, la
// búsqueda por IMEI y la ficha del cliente, cambia los días de la unidad y los de la organización; un
// viewer la ve y no la edita. La tienda de ejemplo la siembra esta spec con lo que deja org:capability
// --profile iphone: serialized_units y repairs, con los 30 días de ejemplo. La borra al terminar.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
const SERIAL = "356938035643809";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table unit_settings, service_settings, trade_in_margins, trade_in_settings, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, trade_in_checklist_items, service_order_lines, service_orders, repair_prices, repair_types, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts, cash_sessions, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
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
  for (const capability of ["serialized_units", "repairs"]) {
    await db.execute(
      sql`insert into organization_capabilities (organization_id, capability, activated_by)
          values (${IPHONE}, ${capability}, ${ADMIN_IPHONE.id})`,
    );
  }
  for (const table of ["unit_settings", "service_settings"]) {
    await db.execute(
      sql`insert into ${sql.identifier(table)} (organization_id, warranty_days, is_example)
          values (${IPHONE}, 30, true)`,
    );
  }
}

// Un producto por unidad, con precio, una unidad disponible y una clienta.
async function seedSale(): Promise<string> {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, tracking)
        values (${IPHONE}, 'IP15-128', 'iPhone 15 128 GB', 'unit') returning id`,
  );
  const productId = product.rows[0]!.id;
  await db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${IPHONE}, ${productId}, '1099.00', 'USD', ${ADMIN_IPHONE.id})`,
  );
  const unit = await db.execute<{ id: string }>(
    sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type, created_by)
        values (${IPHONE}, ${productId}, ${SERIAL}, 800, 'USD', 'manual', ${ADMIN_IPHONE.id})
        returning id`,
  );
  await db.execute(
    sql`insert into inventory_movements (organization_id, product_id, type, quantity,
          balance_after, reason, unit_id, created_by)
        values (${IPHONE}, ${productId}, 'adjustment_positive', 1, 1,
          'Alta manual de una unidad', ${unit.rows[0]!.id}, ${ADMIN_IPHONE.id})`,
  );
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${IPHONE}, ${productId}, 1)`,
  );
  await db.execute(
    sql`insert into clients (organization_id, display_name) values (${IPHONE}, 'Lucía Gómez')`,
  );
  return productId;
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

const line = (page: Page, position: number) =>
  page.getByRole("group", { name: `Línea ${position}`, exact: true });

async function pick(scope: Locator | Page, label: string, text: string) {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(text);
  await expect(scope.getByRole("option").first()).toBeVisible();
  await field.press("ArrowDown");
  await field.press("Enter");
}

async function sell(page: Page) {
  await page.goto("/ventas/nueva");
  await pick(page, "Cliente (opcional)", "Luc");
  await pick(line(page, 1), "Producto", "IP15-128");
  await line(page, 1).getByLabel("IMEI de las unidades").fill(SERIAL);
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
}

const committed = (page: Page) =>
  page.getByRole("region", { name: "Reservadas y vendidas" });

test("un admin ve la garantía de una unidad vendida, cambia sus días y la busca por IMEI", async ({
  page,
}) => {
  // La venta, la unidad, la búsqueda y la ficha, con axe en los dos temas en cada una: en una máquina
  // lenta pasa de los 30 s.
  test.slow();
  const productId = await seedSale();
  await login(page, ADMIN_IPHONE.email);
  await sell(page);

  await page.goto(`/productos/${productId}/unidades`);
  await expect(committed(page)).toContainText(
    /En garantía hasta el \d{2}\/\d{2}\/\d{4} \(30 días desde el \d{2}\/\d{2}\/\d{4}, los de la organización\)/,
  );
  await committed(page)
    .getByRole("link", { name: `Días de garantía ${SERIAL}` })
    .click();
  const form = page.getByRole("region", { name: "Días de garantía" });
  await form.getByLabel("Días de garantía").fill("diez");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(form).toContainText("un número entero de 0 a 3650");
  await expectAccessible(page, "días de garantía rechazados");
  await form.getByLabel("Días de garantía").fill("90");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(
    page.getByText("Días de garantía de la unidad guardados."),
  ).toBeVisible();
  await expect(committed(page)).toContainText(
    /\(90 días desde el \d{2}\/\d{2}\/\d{4}, propios de la unidad\)/,
  );
  await expectAccessible(page, "unidad vendida con su garantía");

  // La búsqueda por IMEI (U-3).
  await page.goto(`/buscar?q=${SERIAL}`);
  const devices = page.getByRole("region", { name: "Equipos" });
  await expect(devices).toContainText(SERIAL);
  await expect(devices).toContainText(/iPhone 15 128 GB · En garantía hasta/);
  await expectAccessible(page, "búsqueda por IMEI");

  // La ficha de la clienta (D-3).
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Lucía Gómez" }).click();
  const bought = page.getByRole("region", { name: "Equipos comprados" });
  await expect(bought).toContainText(SERIAL);
  await expect(bought).toContainText(/Venta V-\d+/);
  await expect(bought).toContainText(/En garantía hasta el/);
  await expectAccessible(page, "ficha con equipos comprados");
});

test("un admin cambia los días de la organización para unidades y reparaciones", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/grados");
  const units = page.getByRole("region", {
    name: "Garantía de las unidades vendidas",
  });
  await expect(units).toContainText("30 días de garantía");
  await expect(units).toContainText("Es el valor de ejemplo del perfil");
  await units.getByLabel("Días de garantía").fill("3651");
  await units.getByRole("button", { name: "Guardar" }).click();
  await expect(units).toContainText("un número entero de 0 a 3650");
  await units.getByLabel("Días de garantía").fill("15");
  await units.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Días de garantía guardados.")).toBeVisible();
  await expect(units).toContainText("15 días de garantía");
  await expect(units).not.toContainText("ejemplo");
  await expectAccessible(page, "grados con la garantía");

  await page.goto("/reparaciones/lista");
  const repairs = page.getByRole("region", {
    name: "Garantía de las reparaciones",
  });
  await expect(repairs).toContainText("30 días de garantía");
  await repairs.getByLabel("Días de garantía").fill("45");
  await repairs.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Días de garantía guardados.")).toBeVisible();
  await expect(repairs).toContainText("45 días de garantía");

  const saved = await db.execute<{
    table: string;
    days: number;
    example: boolean;
  }>(
    sql`select 'unit' as table, warranty_days as days, is_example as example from unit_settings
        union all
        select 'service', warranty_days, is_example from service_settings
        order by 1`,
  );
  expect(saved.rows).toEqual([
    { table: "service", days: 45, example: false },
    { table: "unit", days: 15, example: false },
  ]);
});

test("un viewer ve la garantía y no edita los días", async ({ page }) => {
  const productId = await seedSale();
  // La vende un admin.
  await login(page, ADMIN_IPHONE.email);
  await sell(page);
  await page.context().clearCookies();

  await login(page, VIEWER_IPHONE.email);
  await page.goto(`/productos/${productId}/unidades`);
  await expect(committed(page)).toContainText(/En garantía hasta el/);
  await expect(
    committed(page).getByRole("link", { name: /Días de garantía/ }),
  ).toHaveCount(0);
  await page.goto(`/productos/${productId}/unidades?garantia=x`);
  await expect(
    page.getByRole("region", { name: "Días de garantía" }),
  ).toHaveCount(0);
  await page.goto("/grados");
  await expect(
    page.getByRole("region", { name: "Garantía de las unidades vendidas" }),
  ).toHaveCount(0);
  await expectAccessible(page, "unidades para un viewer");
});
