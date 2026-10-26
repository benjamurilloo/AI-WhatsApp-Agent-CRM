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

// La recepción de usados de punta a punta (brief-29.7, D-7 y D-10): Chromium, next start, Server
// Actions, tradeins, cash, inventory y PostgreSQL real. Recibir un usado con su checklist, verlo en las
// unidades en revisión, liberarlo y venderlo; un punto obligatorio que no pasa; la anulación con su
// comprobante; el checklist; el viewer; 375 px y sin JavaScript. La tienda de ejemplo la siembra esta
// spec con serialized_units y trade_ins, un grado, dos puntos del checklist, un producto usado llevado
// por unidad y una clienta con DNI, y la borra al terminar, como repairs-own-units.spec.ts.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
const SERIAL = "356938035643809";
const CLIENT = "Ana Usados";
const PRODUCT = "iPhone 13 usado";
const SKU = "IP13-USADO";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

let productId: string;

async function returningId(query: ReturnType<typeof sql>): Promise<string> {
  const result = await db.execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

// Vacía lo de la tienda de ejemplo; con keep, la vuelve a sembrar lista para recibir usados.
async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table appointments, trade_in_margins, trade_in_settings, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, trade_in_checklist_items, service_order_lines, service_orders, repair_prices, repair_types, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
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
  // Lo que deja org:capability --profile iphone para los usados (brief-29.7, D-1 y D-3).
  for (const capability of ["serialized_units", "trade_ins"]) {
    await db.execute(
      sql`insert into organization_capabilities (organization_id, capability, activated_by)
          values (${IPHONE}, ${capability}, ${ADMIN_IPHONE.id})`,
    );
  }
  await db.execute(
    sql`insert into unit_grades (organization_id, name, description, position, is_example)
        values (${IPHONE}, 'A', 'Como nuevo', 0, true)`,
  );
  await db.execute(
    sql`insert into trade_in_checklist_items (organization_id, name, is_mandatory, position, is_example)
        values (${IPHONE}, 'Cámara trasera', false, 0, true),
               (${IPHONE}, 'iCloud desvinculado', true, 1, true)`,
  );
  await db.execute(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${IPHONE}, 'Transferencia', false)`,
  );
  await db.execute(
    sql`insert into clients (organization_id, display_name, phone_e164, document_number)
        values (${IPHONE}, ${CLIENT}, '+5491155559876', '30123456')`,
  );
  productId = await returningId(
    sql`insert into products (organization_id, sku, name, condition, tracking)
        values (${IPHONE}, ${SKU}, ${PRODUCT}, 'used', 'unit') returning id`,
  );
  await db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${IPHONE}, ${productId}, 500, 'USD', ${ADMIN_IPHONE.id})`,
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

async function unitStatus(): Promise<string | null> {
  const result = await db.execute<{ status: string }>(
    sql`select status::text as status from stock_units where serial = ${SERIAL}`,
  );
  return result.rows[0]?.status ?? null;
}

// Completa el formulario de la recepción. El cliente va por su nombre exacto: sin JavaScript es el
// único camino, y con JavaScript el servidor lo resuelve igual.
async function fillTradeIn(page: Page, { icloud = true } = {}) {
  await page.getByLabel(/^Cliente/).fill(CLIENT);
  await page
    .getByLabel(/^Producto usado/)
    .selectOption({ label: `${PRODUCT} (${SKU})` });
  await page.getByLabel(/^IMEI o número de serie/).fill(SERIAL);
  await page.getByLabel(/^Salud de la batería/).fill("87");
  await page
    .getByLabel(/^Grado propuesto/)
    .selectOption({ label: "A — Como nuevo" });
  await page.getByRole("checkbox", { name: "Cámara trasera" }).check();
  if (icloud) {
    await page
      .getByRole("checkbox", { name: "iCloud desvinculado (obligatorio)" })
      .check();
  }
  await page.getByLabel(/^Valor reconocido/).fill("300");
  await page.getByLabel(/^Moneda/).selectOption("USD");
  await page.getByRole("radio", { name: "Compra del equipo" }).check();
}

async function receive(page: Page) {
  await page.goto("/usados/nuevo");
  await fillTradeIn(page);
  await page.getByRole("button", { name: "Recibir el usado" }).click();
  await expect(
    page.getByRole("heading", { name: "Usado recibido PU-000001" }),
  ).toBeVisible();
}

test("un admin recibe un usado, lo ve en revisión, lo libera y lo vende", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/usados");
  await expect(
    page.getByRole("heading", { name: "Usados recibidos" }),
  ).toBeVisible();
  await expectAccessible(page, "lista vacía");
  await page.getByRole("link", { name: "+ Recibir un usado" }).click();
  await expect(
    page.getByRole("heading", { name: "Recibir un usado" }),
  ).toBeVisible();
  await expectAccessible(page, "formulario de la recepción");
  await fillTradeIn(page);
  await page.getByRole("button", { name: "Recibir el usado" }).click();

  await expect(
    page.getByRole("heading", { name: "Usado recibido PU-000001" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Usado recibido\. El equipo entró/),
  ).toBeVisible();
  await expect(page.getByText("Cámara trasera:")).toBeVisible();
  expect(await unitStatus()).toBe("in_review");
  await expectAccessible(page, "detalle de la recepción");

  // El comprobante muestra el DNI de la ficha (U-5).
  await page.getByRole("link", { name: "Comprobante", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recepción de usado PU-000001" }),
  ).toBeVisible();
  await expect(page.getByText("30123456")).toBeVisible();
  await expect(
    page.getByText("Documento no válido como factura.").first(),
  ).toBeVisible();
  await expectAccessible(page, "comprobante PU");

  // En las unidades, en revisión y con su origen.
  await page.goto(`/productos/${productId}/unidades`);
  await expect(page.getByText("· En revisión", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Usado recibido PU-000001" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Liberar a la venta ${SERIAL}` })
    .click();
  await expect(page.getByText(/Unidad liberada a la venta/)).toBeVisible();
  expect(await unitStatus()).toBe("available");

  await page.goto("/ventas/nueva");
  const saleLine = page.getByRole("group", { name: "Línea 1", exact: true });
  const productField = saleLine.getByLabel("Producto", { exact: true });
  await productField.fill(SKU);
  await expect(saleLine.getByRole("option").first()).toBeVisible();
  await productField.press("ArrowDown");
  await productField.press("Enter");
  await saleLine.getByLabel("IMEI de las unidades").fill(SERIAL);
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
  expect(await unitStatus()).toBe("sold");

  // La ficha de la clienta muestra el DNI y su usado.
  const clientId = (
    await db.execute<{ id: string }>(
      sql`select id from clients where display_name = ${CLIENT}`,
    )
  ).rows[0]!.id;
  await page.goto(`/clientes/${clientId}`);
  await expect(
    page.getByRole("heading", { name: "Usados entregados" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "PU-000001" })).toBeVisible();
  await expect(page.getByText("30123456")).toBeVisible();
});

test("un punto obligatorio que no pasa rechaza la recepción y no escribe nada", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/usados/nuevo");
  await fillTradeIn(page, { icloud: false });
  await page.getByRole("button", { name: "Recibir el usado" }).click();
  await expect(
    page.getByText(/no pasó «iCloud desvinculado», que es obligatorio/),
  ).toBeVisible();
  // Conserva lo escrito.
  await expect(page.getByLabel(/^IMEI o número de serie/)).toHaveValue(SERIAL);
  await expect(
    page.getByRole("checkbox", { name: "Cámara trasera" }),
  ).toBeChecked();
  await expectAccessible(page, "recepción rechazada");
  expect(await unitStatus()).toBeNull();
});

test("la anulación da de baja la unidad y emite el APU", async ({ page }) => {
  await login(page, ADMIN_IPHONE.email);
  await receive(page);
  await page.getByLabel("Motivo").selectOption({ label: "Error de carga" });
  await page.getByRole("button", { name: "Anular la recepción" }).click();
  await expect(page.getByText(/Recepción anulada/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Anulada por APU-000001" }),
  ).toBeVisible();
  expect(await unitStatus()).toBe("written_off");
  await expectAccessible(page, "recepción anulada");
  await page.getByRole("link", { name: "Comprobante de la anulación" }).click();
  await expect(
    page.getByRole("heading", { name: "Anulación APU-000001" }),
  ).toBeVisible();
  await expectAccessible(page, "comprobante APU");
  await page.goto("/usados?estado=anuladas");
  await expect(
    page.getByRole("link", { name: "PU-000001" }).first(),
  ).toBeVisible();
});

test("un admin ajusta el checklist", async ({ page }) => {
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/usados/checklist");
  await expectAccessible(page, "checklist");
  await page.getByLabel(/^Nombre/).fill("Botones");
  await page
    .getByRole("checkbox", { name: /Obligatorio para aceptar/ })
    .check();
  await page.getByRole("button", { name: "Agregar el punto" }).click();
  await expect(page.getByText("Punto agregado al checklist.")).toBeVisible();
  await page
    .getByRole("button", { name: "Desactivar el punto Cámara trasera" })
    .click();
  await expect(page.getByText(/Punto desactivado/)).toBeVisible();
  await page.goto("/usados/nuevo");
  await expect(
    page.getByRole("checkbox", { name: "Botones (obligatorio)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Cámara trasera" }),
  ).toHaveCount(0);
});

test("un viewer ve los usados sin el valor, el DNI ni las acciones", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await receive(page);
  const url = page.url().replace(/\?.*$/, "");
  await page.context().clearCookies();

  await login(page, VIEWER_IPHONE.email);
  await page.goto("/usados");
  await expect(
    page.getByRole("link", { name: "PU-000001" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+ Recibir un usado" }),
  ).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Valor" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Checklist" })).toHaveCount(0);
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Usado recibido PU-000001" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Anular la recepción" }),
  ).toHaveCount(0);
  await expect(page.getByText(/US\$\s300,00/)).toHaveCount(0);
  await expectAccessible(page, "detalle para un viewer");
  await page.goto(`${url}/comprobante`);
  await expect(page.getByText("30123456")).toHaveCount(0);
  await expect(page.getByText(/US\$\s300,00/)).toHaveCount(0);
  await page.goto("/usados/nuevo");
  await expect(page.getByText(/Solo un administrador/)).toBeVisible();
});

test("los usados entran en 375 px sin desplazamiento horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/usados/nuevo");
  await expect(
    page.getByRole("button", { name: "Recibir el usado" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await fillTradeIn(page);
  await page.getByRole("button", { name: "Recibir el usado" }).click();
  await expect(
    page.getByRole("heading", { name: "Usado recibido PU-000001" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto("/usados");
  await expect(
    page.getByRole("link", { name: "PU-000001" }).first(),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto("/usados/checklist");
  await expectNoHorizontalScroll(page);
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin recibe un usado y lo anula", async ({ page }) => {
    await login(page, ADMIN_IPHONE.email);
    await receive(page);
    expect(await unitStatus()).toBe("in_review");
    await page
      .getByLabel("Motivo")
      .selectOption({ label: "El cliente se arrepintió" });
    await page.getByRole("button", { name: "Anular la recepción" }).click();
    await expect(page.getByText(/Recepción anulada/)).toBeVisible();
    expect(await unitStatus()).toBe("written_off");
  });
});
