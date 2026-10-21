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

// Las reparaciones de unidades propias de punta a punta (brief-29.6.2, D-7 y D-10): Chromium, next
// start, Server Actions, service, inventory, cash y PostgreSQL real. Mandar una unidad a reparar desde
// sus unidades, marcarla reparada con lo que cobró el técnico, liberarla y venderla; la cancelación; la
// cuenta del técnico; el viewer; 375 px y sin JavaScript. La tienda de ejemplo la siembra esta spec con
// repairs y serialized_units, un tipo con su costo, un técnico y una unidad disponible de un producto
// del catálogo de ejemplo, y la borra al terminar, como repairs.spec.ts.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
const SERIAL = "356938035643801";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

type Ids = {
  battery: string;
  technician: string;
  product: string;
  unit: string;
};
let ids: Ids;

async function returningId(query: ReturnType<typeof sql>): Promise<string> {
  const result = await db.execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

// Vacía lo de la tienda de ejemplo; con keep, la vuelve a sembrar con una unidad lista para reparar.
async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, repair_prices, repair_types, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
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
  // Lo que deja org:capability --profile iphone (brief-29.6, D-1): repairs, serialized_units y el
  // producto de servicio.
  for (const capability of ["repairs", "serialized_units"]) {
    await db.execute(
      sql`insert into organization_capabilities (organization_id, capability, activated_by)
          values (${IPHONE}, ${capability}, ${ADMIN_IPHONE.id})`,
    );
  }
  await db.execute(
    sql`insert into products (organization_id, sku, name, is_service)
        values (${IPHONE}, 'REPARACION', 'Reparación', true)`,
  );
  const battery = await returningId(
    sql`insert into repair_types (organization_id, name, position, is_example)
        values (${IPHONE}, 'Cambio de batería', 0, true) returning id`,
  );
  const technician = await returningId(
    sql`insert into suppliers (organization_id, name, is_technician)
        values (${IPHONE}, 'Técnico Uno', true) returning id`,
  );
  await db.execute(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${IPHONE}, 'Transferencia', false)`,
  );
  // Un producto del catálogo de ejemplo, con su modelo, llevado por unidad, con una unidad disponible
  // como la deja el alta manual.
  const product = await returningId(
    sql`select p.id from products p join product_models m on m.id = p.model_id
        where p.organization_id = ${IPHONE} and m.name = 'iPhone 13'
        order by p.sku limit 1`,
  );
  await db.execute(
    sql`insert into repair_prices (organization_id, repair_type_id, model_id, price,
          price_currency, cost, cost_currency)
        select ${IPHONE}, ${battery}, model_id, 80, 'USD', 35, 'USD'
        from products where id = ${product}`,
  );
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${product}`,
  );
  const unit = await returningId(
    sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
          origin_type, created_by)
        values (${IPHONE}, ${product}, ${SERIAL}, 800, 'USD', 'manual', ${ADMIN_IPHONE.id})
        returning id`,
  );
  await db.execute(
    sql`insert into inventory_movements (organization_id, product_id, type, quantity,
          balance_after, reason, unit_id, created_by)
        values (${IPHONE}, ${product}, 'adjustment_positive', 1, 1,
          'Alta manual de una unidad', ${unit}, ${ADMIN_IPHONE.id})`,
  );
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${IPHONE}, ${product}, 1)`,
  );
  ids = { battery, technician, product, unit };
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

async function unitStatus(): Promise<{ status: string; cost: string }> {
  const result = await db.execute<{ status: string; cost: string }>(
    sql`select status::text as status, cost from stock_units where id = ${ids.unit}`,
  );
  return result.rows[0]!;
}

// Mandar la unidad a reparar desde sus unidades; deja la página en la orden.
async function sendToRepair(page: Page) {
  await page.goto(`/productos/${ids.product}/unidades`);
  await page
    .getByRole("link", { name: `Mandar a reparar ${SERIAL}` })
    .first()
    .click();
  await page.getByLabel(/^Técnico/).selectOption({ label: "Técnico Uno" });
  await page.getByLabel(/^Qué hay que reparar/).fill("La batería no carga.");
  await page.getByRole("button", { name: "Mandar a reparar" }).click();
  await expect(
    page.getByRole("heading", { name: "Orden de servicio OS-000001" }),
  ).toBeVisible();
}

test("una unidad va a reparar, vuelve con el costo sumado, se libera y la cuenta del técnico la debe", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/productos/${ids.product}/unidades`);
  await expectAccessible(page, "unidades con una disponible");
  await page.getByRole("link", { name: `Mandar a reparar ${SERIAL}` }).click();
  await expect(
    page.getByRole("heading", { name: "Mandar a reparar" }),
  ).toBeVisible();
  await expectAccessible(page, "mandar a reparar");
  await page.getByLabel(/^Técnico/).selectOption({ label: "Técnico Uno" });
  await page.getByLabel(/^Qué hay que reparar/).fill("La batería no carga.");
  await page.getByRole("button", { name: "Mandar a reparar" }).click();

  await expect(
    page.getByRole("heading", { name: "Orden de servicio OS-000001" }),
  ).toBeVisible();
  await expect(page.getByText(/Unidad mandada a reparar/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Comprobante de recepción" }),
  ).toHaveCount(0);
  expect(await unitStatus()).toMatchObject({ status: "in_repair" });
  await expectAccessible(page, "orden propia en el técnico");

  // Lo que cobró el técnico, propuesto de la lista y editable.
  await expect(
    page.getByLabel("Lo que cobró el técnico por Cambio de batería"),
  ).toHaveValue("35");
  await page.getByRole("checkbox", { name: "Cambio de batería" }).check();
  await page
    .getByLabel("Lo que cobró el técnico por Cambio de batería")
    .fill("40");
  await page.getByRole("button", { name: "Marcar reparada" }).click();
  await expect(page.getByText(/Unidad reparada/)).toBeVisible();
  expect(await unitStatus()).toEqual({ status: "in_review", cost: "840.00" });
  await expect(
    page.getByRole("heading", { name: "Siguiente paso" }),
  ).toHaveCount(0);
  await expectAccessible(page, "orden propia reparada");

  // Liberarla desde sus unidades: vuelve al stock.
  await page.getByRole("link", { name: SERIAL }).click();
  await expect(
    page.getByRole("heading", { name: "En reparación y en revisión" }),
  ).toBeVisible();
  await expect(page.getByText("· En revisión", { exact: true })).toBeVisible();
  await expectAccessible(page, "unidad en revisión");
  await page
    .getByRole("button", { name: `Liberar a la venta ${SERIAL}` })
    .click();
  await expect(page.getByText(/Unidad liberada a la venta/)).toBeVisible();
  expect(await unitStatus()).toMatchObject({ status: "available" });

  // El movimiento de la liberación suma.
  await page.goto(`/productos/${ids.product}/movimientos`);
  await expect(
    // La celda del tipo y la del motivo dicen lo mismo.
    page
      .getByRole("cell", { name: "Liberada a la venta", exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "A reparación", exact: true }),
  ).toBeVisible();

  // Liberada, se vende como cualquier otra (D-10), y la unidad recuerda su orden.
  const sku = (
    await db.execute<{ sku: string }>(
      sql`select sku from products where id = ${ids.product}`,
    )
  ).rows[0]!.sku;
  await page.goto("/ventas/nueva");
  const saleLine = page.getByRole("group", { name: "Línea 1", exact: true });
  const productField = saleLine.getByLabel("Producto", { exact: true });
  await productField.fill(sku);
  await expect(saleLine.getByRole("option").first()).toBeVisible();
  await productField.press("ArrowDown");
  await productField.press("Enter");
  await saleLine.getByLabel("IMEI de las unidades").fill(SERIAL);
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
  expect(await unitStatus()).toMatchObject({ status: "sold" });
  await page.goto(`/productos/${ids.product}/unidades`);
  await expect(
    page.getByRole("heading", { name: "Reparaciones anteriores" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Orden OS-000001" }),
  ).toBeVisible();

  // La cuenta del técnico: la orden propia, al debe.
  await page.goto(`/compras/proveedores/${ids.technician}/cuenta`);
  await expect(
    page.getByRole("link", { name: "OS-000001" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/US\$\s40,00/).first()).toBeVisible();
});

test("cancelar la orden propia devuelve la unidad en revisión, y ahí se da de baja sin tocar el stock", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await sendToRepair(page);
  await page.getByLabel("Motivo").selectOption({ label: "No tiene arreglo" });
  await page.getByRole("button", { name: "Cancelar la orden" }).click();
  await expect(page.getByText(/la unidad volvió en revisión/)).toBeVisible();
  expect(await unitStatus()).toEqual({ status: "in_review", cost: "800.00" });

  await page.goto(`/productos/${ids.product}/unidades`);
  await page.getByRole("link", { name: `Dar de baja ${SERIAL}` }).click();
  await page.getByLabel(/^Motivo/).fill("Sin arreglo.");
  await page.getByRole("button", { name: "Dar de baja" }).click();
  await expect(
    page.getByText(/Estaba en revisión, fuera del stock/),
  ).toBeVisible();
  expect(await unitStatus()).toMatchObject({ status: "written_off" });
});

test("un viewer ve la orden propia sin el técnico, el costo ni las acciones", async ({
  page,
}) => {
  const admin = page;
  await login(admin, ADMIN_IPHONE.email);
  await sendToRepair(admin);
  await admin.getByRole("checkbox", { name: "Cambio de batería" }).check();
  await admin.getByRole("button", { name: "Marcar reparada" }).click();
  await expect(admin.getByText(/Unidad reparada/)).toBeVisible();
  const orderUrl = admin.url().replace(/\?.*$/, "");
  await admin.context().clearCookies();

  await login(page, VIEWER_IPHONE.email);
  await page.goto(orderUrl);
  await expect(
    page.getByRole("heading", { name: "Orden de servicio OS-000001" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Siguiente paso" }),
  ).toHaveCount(0);
  await expect(page.getByText("Técnico Uno")).toHaveCount(0);
  await expect(page.getByText(/US\$\s35,00/)).toHaveCount(0);
  await expectAccessible(page, "orden propia para un viewer");
  await page.goto(`/productos/${ids.product}/unidades`);
  await expect(page.getByText("· En revisión", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Liberar a la venta/ }),
  ).toHaveCount(0);
  await expect(page.getByText(/US\$\s835,00/)).toHaveCount(0);
});

test("las unidades y la orden propia entran en 375 px sin desplazamiento horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN_IPHONE.email);
  await sendToRepair(page);
  await expect(
    page.getByRole("button", { name: "Marcar reparada" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto(`/productos/${ids.product}/unidades`);
  await expect(
    page.getByRole("heading", { name: "En reparación y en revisión" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto("/reparaciones?tipo=unidades-propias");
  await expect(
    page.getByRole("link", { name: "OS-000001" }).first(),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin manda una unidad a reparar, la marca reparada y la libera", async ({
    page,
  }) => {
    await login(page, ADMIN_IPHONE.email);
    await sendToRepair(page);
    await page.getByRole("checkbox", { name: "Cambio de batería" }).check();
    await page.getByRole("button", { name: "Marcar reparada" }).click();
    await expect(page.getByText(/Unidad reparada/)).toBeVisible();
    await page.goto(`/productos/${ids.product}/unidades`);
    await page
      .getByRole("button", { name: `Liberar a la venta ${SERIAL}` })
      .click();
    await expect(page.getByText(/Unidad liberada a la venta/)).toBeVisible();
    expect(await unitStatus()).toEqual({ status: "available", cost: "835.00" });
  });
});
