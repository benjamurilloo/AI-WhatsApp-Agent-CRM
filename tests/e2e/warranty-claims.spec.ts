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

// El reclamo de garantía de punta a punta (brief-29.9.2, D-7): Chromium, next start, Server Actions,
// service, inventory, sales y PostgreSQL real. Un admin vende una unidad, abre un reclamo desde
// «Equipos comprados» de la ficha de la clienta, lo manda al técnico, lo marca reparado sin cargo y lo
// entrega sin venta, y lo ve en la ficha y en /buscar; un viewer lo ve y no lo opera. La tienda de
// ejemplo la siembra esta spec con lo que deja org:capability --profile iphone: serialized_units y
// repairs, con los 30 días de ejemplo. La borra al terminar.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
const SERIAL = "356938035643810";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table appointments, unit_settings, service_settings, trade_in_margins, trade_in_settings, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, trade_in_checklist_items, service_order_lines, service_orders, repair_prices, repair_types, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts, cash_sessions, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
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

// Un producto por unidad con su modelo y precio, una unidad disponible, una clienta, un tipo de
// reparación y un técnico.
async function seedSale(): Promise<void> {
  // El modelo lo deja la semilla de la tienda de ejemplo.
  const model = await db.execute<{ id: string }>(
    sql`select id from product_models
        where organization_id = ${IPHONE} and name = 'iPhone 15'`,
  );
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, tracking, model_id)
        values (${IPHONE}, 'IP15-128', 'iPhone 15 128 GB', 'unit', ${model.rows[0]!.id})
        returning id`,
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
  await db.execute(
    sql`insert into repair_types (organization_id, name) values (${IPHONE}, 'Cambio de batería')`,
  );
  await db.execute(
    sql`insert into suppliers (organization_id, name, is_technician)
        values (${IPHONE}, 'Técnico Pérez', true)`,
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

// Los equipos y las reparaciones están en la pestaña Operaciones de la ficha (brief-24.4.1, D-5).
async function openClient(page: Page) {
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Lucía Gómez" }).click();
  await page
    .getByRole("navigation", { name: /^Secciones de / })
    .getByRole("link", { name: "Operaciones" })
    .click();
}

const bought = (page: Page) =>
  page.getByRole("region", { name: "Equipos comprados" });

const nextStep = (page: Page) =>
  page.getByRole("region", { name: "Siguiente paso" });

// Abre el reclamo de la unidad desde la ficha, y devuelve la URL de su detalle.
async function openClaim(page: Page): Promise<string> {
  await openClient(page);
  await bought(page)
    .getByRole("link", { name: "Abrir un reclamo de garantía" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nuevo reclamo de garantía" }),
  ).toBeVisible();
  await expect(page.getByText(`iPhone 15 128 GB ${SERIAL}`)).toBeVisible();
  await page
    .getByLabel("Lo que reporta el cliente *")
    .fill("No carga desde ayer.");
  await page.getByRole("button", { name: "Crear el reclamo" }).click();
  await expect(page).toHaveURL(
    /\/reparaciones\/[0-9a-f-]+\?aviso=reclamo-creado$/,
  );
  return page.url().split("?")[0]!;
}

test("un admin abre un reclamo desde la ficha, lo repara sin cargo y lo entrega sin venta", async ({
  page,
}) => {
  // La venta, el alta, tres pasos y la búsqueda, con axe en los dos temas en varias pantallas.
  test.slow();
  await seedSale();
  await login(page, ADMIN_IPHONE.email);
  await sell(page);
  const sales = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from sales`,
  );

  await openClient(page);
  await expect(bought(page)).toContainText(/En garantía hasta el/);
  await expectAccessible(page, "ficha con el reclamo para abrir");
  const href = await openClaim(page);
  await expect(page.getByText("Reclamo de garantía creado.")).toBeVisible();
  await expect(page.getByText(`Unidad ${SERIAL}`)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Comprobante de recepción" }),
  ).toHaveCount(0);
  await expectAccessible(page, "reclamo recibido");

  await nextStep(page).getByLabel("Técnico").selectOption("Técnico Pérez");
  await nextStep(page)
    .getByRole("button", { name: "Mandar al técnico" })
    .click();
  await expect(page.getByText("Orden mandada al técnico.")).toBeVisible();
  // Los motivos de un reclamo incluyen «no lo cubre la garantía».
  await expect(
    page.getByRole("option", { name: "No lo cubre la garantía" }),
  ).toHaveCount(1);
  await expectAccessible(page, "reclamo en el técnico");
  await nextStep(page)
    .getByRole("button", { name: "Reparado sin cargo" })
    .click();
  await expect(
    page.getByText(
      "Reclamo reparado sin cargo: no queda deuda con el técnico.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/El técnico lo reparó sin cargo/)).toBeVisible();
  await nextStep(page)
    .getByRole("button", { name: "Entregar sin cobrar" })
    .click();
  await expect(
    page.getByText("Equipo entregado, sin cobrarle al cliente."),
  ).toBeVisible();
  await expect(nextStep(page)).toHaveCount(0);
  await expect(page.getByText("Venta de la entrega")).toHaveCount(0);
  const after = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from sales`,
  );
  expect(after.rows[0]!.n).toBe(sales.rows[0]!.n);

  // La ficha de la clienta y la búsqueda por IMEI.
  await openClient(page);
  await expect(bought(page)).toContainText(/Reclamo OS-\d+ · Entregada/);
  await expect(
    page.getByRole("region", { name: /^Operaciones de / }),
  ).toContainText("Reclamo de garantía · iPhone 15");
  await page.goto(`/buscar?q=${SERIAL}`);
  await expect(page.getByRole("region", { name: "Equipos" })).toContainText(
    /Reclamo de garantía · iPhone 15 · Entregada/,
  );
  await expectAccessible(page, "búsqueda con el reclamo");
  expect(href).toMatch(/\/reparaciones\/[0-9a-f-]+$/);
});

test("un viewer ve el reclamo y no lo abre ni lo mueve", async ({ page }) => {
  await seedSale();
  await login(page, ADMIN_IPHONE.email);
  await sell(page);
  const href = await openClaim(page);
  await page.context().clearCookies();

  await login(page, VIEWER_IPHONE.email);
  await page.goto(href);
  await expect(
    page.getByRole("heading", { name: /Orden de servicio OS-\d+/ }),
  ).toBeVisible();
  await expect(page.getByText(`Unidad ${SERIAL}`)).toBeVisible();
  await expect(nextStep(page)).toHaveCount(0);
  await openClient(page);
  await expect(
    bought(page).getByRole("link", { name: "Abrir un reclamo de garantía" }),
  ).toHaveCount(0);
  await expect(bought(page)).toContainText(/Reclamo OS-\d+ · Recibida/);
  await page.goto("/reparaciones/reclamo?orden=x");
  await expect(
    page.getByText(
      "Solo un administrador puede cargar y operar las órdenes de servicio.",
    ),
  ).toBeVisible();
  await expectAccessible(page, "reclamo para un viewer");
});
