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

// La cotización de un usado de punta a punta (brief-29.7.3, D-5 y D-8): Chromium, next start, Server
// Actions, tradeins, service, catalog y PostgreSQL real. Un modelo sin margen que no se cotiza; cargar el
// margen y cotizar con una reparación y la batería baja; los valores sueltos; la reparación de un punto
// del checklist; el viewer sin acceso; 375 px y sin JavaScript. La tienda de ejemplo la siembra esta
// spec con lo que deja org:capability --profile iphone (U-4): las capacidades, dos tipos de reparación
// con su costo, el checklist y los valores de ejemplo; y un modelo con su producto usado con precio. La
// borra al terminar, como trade-ins.spec.ts.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
const MODEL = "iPhone XR";
const PRODUCT = "iPhone XR usado";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

async function returningId(query: ReturnType<typeof sql>): Promise<string> {
  const result = await db.execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

// Vacía lo de la tienda de ejemplo; con keep, la vuelve a sembrar lista para cotizar.
async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table trade_in_margins, trade_in_settings, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, trade_in_checklist_items, service_order_lines, service_orders, repair_prices, repair_types, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts, cash_sessions, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
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
  for (const capability of ["serialized_units", "repairs", "trade_ins"]) {
    await db.execute(
      sql`insert into organization_capabilities (organization_id, capability, activated_by)
          values (${IPHONE}, ${capability}, ${ADMIN_IPHONE.id})`,
    );
  }
  const battery = await returningId(
    sql`insert into repair_types (organization_id, name, position, is_example)
        values (${IPHONE}, 'Cambio de batería', 0, true) returning id`,
  );
  const camera = await returningId(
    sql`insert into repair_types (organization_id, name, position, is_example)
        values (${IPHONE}, 'Cámara trasera', 1, true) returning id`,
  );
  const modelId = await returningId(
    sql`insert into product_models (organization_id, name, brand, position)
        values (${IPHONE}, ${MODEL}, 'Apple', 99) returning id`,
  );
  const productId = await returningId(
    sql`insert into products (organization_id, sku, name, condition, tracking, model_id)
        values (${IPHONE}, 'XR-USADO', ${PRODUCT}, 'used', 'unit', ${modelId}) returning id`,
  );
  await db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${IPHONE}, ${productId}, 500, 'USD', ${ADMIN_IPHONE.id})`,
  );
  await db.execute(
    sql`insert into repair_prices (organization_id, repair_type_id, model_id, price, price_currency, cost, cost_currency)
        values (${IPHONE}, ${battery}, ${modelId}, 80, 'USD', 40, 'USD'),
               (${IPHONE}, ${camera}, ${modelId}, 120, 'USD', 60, 'USD')`,
  );
  await db.execute(
    sql`insert into trade_in_checklist_items (organization_id, name, is_mandatory, position, is_example, repair_type_id)
        values (${IPHONE}, 'Cámara trasera', false, 0, true, ${camera}),
               (${IPHONE}, 'Toma señal', true, 1, true, null)`,
  );
  await db.execute(
    sql`insert into trade_in_settings (organization_id, battery_threshold, range_percent, rounding_step,
          rounding_currency, battery_repair_type_id, is_example)
        values (${IPHONE}, 80, 10, 10, 'USD', ${battery}, true)`,
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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function quote(page: Page, battery: string, failing: string[]) {
  await page.goto("/usados/cotizar");
  await page
    .getByLabel("Producto *")
    .selectOption({ label: `${PRODUCT} (XR-USADO)` });
  await page.getByLabel("Salud de la batería (%) *").fill(battery);
  for (const name of failing) {
    await page.getByRole("checkbox", { name }).uncheck();
  }
  await page.getByRole("button", { name: "Cotizar" }).click();
  await expect(page).toHaveURL(/cotizar=1/);
}

test("un modelo sin margen no se cotiza; con el margen, la cotización resta la reparación y la batería", async ({
  page,
}) => {
  test.slow();
  await login(page, ADMIN_IPHONE.email);
  await quote(page, "90", []);
  await expect(
    page.getByText(
      "No hay cotización: el modelo no tiene margen. Cargalo en Configuración.",
    ),
  ).toBeVisible();
  await expectAccessible(page, "cotización sin margen");

  await page.getByRole("link", { name: "Ir a la configuración" }).click();
  await page.getByLabel(`Margen de ${MODEL}`, { exact: true }).fill("50");
  await page
    .getByRole("button", { name: `Guardar el margen de ${MODEL}` })
    .click();
  await expect(page.getByText("Margen guardado.")).toBeVisible();
  await expect(page.getByText(/Margen: US\$\s50,00/)).toBeVisible();
  await expectAccessible(page, "configuración con un margen");

  // 500 − 60 (cámara) − 40 (batería) − 50 = 350; el piso, 315, baja a 310.
  await quote(page, "70", ["Cámara trasera"]);
  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result.getByText(/US\$\s310,00 a US\$\s350,00/)).toBeVisible();
  await expect(
    result.getByText("No se guarda.", { exact: false }),
  ).toBeVisible();
  await expect(result.getByText("De ejemplo", { exact: true })).toBeVisible();
  await expect(result.getByText("(no pasó «Cámara trasera»)")).toBeVisible();
  await expect(result.getByText("(batería bajo el umbral)")).toBeVisible();
  // El checklist conserva lo enviado.
  await expect(
    page.getByRole("checkbox", { name: "Cámara trasera" }),
  ).not.toBeChecked();
  await expectAccessible(page, "cotización con su desglose");

  // Un punto obligatorio que no pasa: el equipo no se recibe.
  await quote(page, "90", ["Toma señal (obligatorio)"]);
  await expect(
    page.getByText(/El equipo no se recibe: no pasó «Toma señal»/),
  ).toBeVisible();

  // Nada de lo cotizado quedó guardado.
  const audits = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from audit_logs
        where organization_id = ${IPHONE} and entity_type <> 'trade_in_margin'`,
  );
  expect(audits.rows[0]!.count).toBe("0");
});

test("un admin cambia los valores de la cotización y la reparación de un punto", async ({
  page,
}) => {
  test.slow();
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/usados/configuracion");
  await expect(page.getByText("De ejemplo", { exact: true })).toBeVisible();
  // Un porcentaje fuera de rango se rechaza en su campo, con lo escrito.
  await page.getByLabel("Porcentaje del rango (%) *").fill("51");
  await page.getByRole("button", { name: "Guardar los valores" }).click();
  await expect(
    page.getByText("Ingresá un porcentaje de 0 a 50, con hasta dos decimales."),
  ).toBeVisible();
  await expect(page.getByLabel("Porcentaje del rango (%) *")).toBeFocused();
  await expectAccessible(page, "valores con un error");
  await page.getByLabel("Porcentaje del rango (%) *").fill("7,5");
  await page.getByLabel("Umbral de batería (%) *").fill("60");
  await page.getByRole("button", { name: "Guardar los valores" }).click();
  await expect(
    page.getByText("Valores de la cotización guardados."),
  ).toBeVisible();
  await expect(page.getByText("De ejemplo", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Porcentaje del rango (%) *")).toHaveValue(
    "7,5",
  );
  const stored = await db.execute<{
    battery_threshold: number;
    range_percent: string;
    is_example: boolean;
  }>(
    sql`select battery_threshold, range_percent, is_example from trade_in_settings
        where organization_id = ${IPHONE}`,
  );
  expect(stored.rows).toEqual([
    { battery_threshold: 60, range_percent: "7.50", is_example: false },
  ]);

  // La reparación de un punto, en el checklist.
  await page.goto("/usados/checklist");
  const select = page.getByLabel("Si no pasa, necesita (punto Cámara trasera)");
  await expect(select).toHaveValue(/.+/);
  await select.selectOption({ label: "Ninguna reparación" });
  await page
    .getByRole("button", {
      name: "Guardar la reparación del punto Cámara trasera",
    })
    .click();
  await expect(page.getByText("Reparación del punto guardada.")).toBeVisible();
  await expect(
    page.getByLabel("Si no pasa, necesita (punto Cámara trasera)"),
  ).toHaveValue("");
  await expectAccessible(page, "checklist con sus reparaciones");
});

test("un viewer no cotiza ni configura", async ({ page }) => {
  await login(page, VIEWER_IPHONE.email);
  await page.goto("/usados");
  const nav = page.getByRole("navigation", { name: "Secciones de usados" });
  await expect(nav.getByRole("link", { name: "Recepciones" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Cotizar" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Configuración" })).toHaveCount(0);
  for (const path of ["/usados/cotizar", "/usados/configuracion"]) {
    await page.goto(path);
    await expect(
      page.getByText(
        "Solo un administrador puede cotizar usados y configurar la cotización.",
      ),
    ).toBeVisible();
  }
});

test.describe("sin JavaScript, a 375 px", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });

  test("la cotización funciona y no desborda", async ({ page }) => {
    await db.execute(
      sql`insert into trade_in_margins (organization_id, model_id, amount, currency)
          select ${IPHONE}, id, 50, 'USD' from product_models
          where organization_id = ${IPHONE} and name = ${MODEL}`,
    );
    await login(page, ADMIN_IPHONE.email);
    await quote(page, "90", []);
    // 500 − 50 = 450; el piso, 405, baja a 400.
    await expect(
      page
        .getByRole("region", { name: "Resultado" })
        .getByText(/US\$\s400,00 a US\$\s450,00/),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto("/usados/configuracion");
    await expectNoHorizontalScroll(page);
  });
});
