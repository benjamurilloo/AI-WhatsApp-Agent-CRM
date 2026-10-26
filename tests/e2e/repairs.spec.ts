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

// Las reparaciones de equipos de clientes de punta a punta (brief-29.6, D-10 y D-13): Chromium, next
// start, Server Actions, service, sales, cash, purchasing y PostgreSQL real. La lista de precios, una
// orden de la recepción a la venta y el cobro, el rechazo, la cancelación, la cuenta del técnico y el
// viewer. La tienda de ejemplo la siembra esta spec con repairs, dos tipos, un técnico, un cliente y el
// producto de servicio, como lo deja org:capability, y la borra al terminar, como units.spec.ts.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

type Ids = {
  battery: string;
  screen: string;
  technician: string;
  client: string;
  model: string;
};
let ids: Ids;

async function returningId(query: ReturnType<typeof sql>): Promise<string> {
  const result = await db.execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

// Vacía lo de la tienda de ejemplo; con keep, la vuelve a sembrar con las reparaciones.
async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table appointments, trade_in_settings, trade_in_checklist_results, trade_in_checklist_items, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, repair_prices, repair_types, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
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
  // Lo que deja org:capability --profile iphone al activar repairs (brief-29.6, D-1).
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${IPHONE}, 'repairs', ${ADMIN_IPHONE.id})`,
  );
  await db.execute(
    sql`insert into products (organization_id, sku, name, is_service)
        values (${IPHONE}, 'REPARACION', 'Reparación', true)`,
  );
  const battery = await returningId(
    sql`insert into repair_types (organization_id, name, position, is_example)
        values (${IPHONE}, 'Cambio de batería', 0, true) returning id`,
  );
  const screen = await returningId(
    sql`insert into repair_types (organization_id, name, position, is_example)
        values (${IPHONE}, 'Cambio de pantalla', 1, true) returning id`,
  );
  const technician = await returningId(
    sql`insert into suppliers (organization_id, name, is_technician)
        values (${IPHONE}, 'Técnico Uno', true) returning id`,
  );
  const client = await returningId(
    sql`insert into clients (organization_id, display_name)
        values (${IPHONE}, 'Ana Reparación') returning id`,
  );
  await db.execute(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${IPHONE}, 'Transferencia', false)`,
  );
  const model = await returningId(
    sql`select id from product_models where organization_id = ${IPHONE} and name = 'iPhone 13'`,
  );
  ids = { battery, screen, technician, client, model };
}

// Una orden hasta presupuestada, por SQL, con un número que el contador no usa.
async function quotedOrder(number: number): Promise<string> {
  const id = await returningId(
    sql`insert into service_orders (organization_id, number, client_id, model_id, device_serial,
          reported_issue, created_by)
        values (${IPHONE}, ${number}, ${ids.client}, ${ids.model}, '356938035643809',
          'No carga', ${ADMIN_IPHONE.id}) returning id`,
  );
  await db.execute(
    sql`update service_orders set status = 'sent', technician_id = ${ids.technician},
          sent_at = now() where id = ${id}`,
  );
  await db.execute(
    sql`update service_orders set status = 'quoted', quoted_at = now(),
          customer_currency = 'USD', customer_total = 80, technician_currency = 'USD',
          technician_total = 35 where id = ${id}`,
  );
  await db.execute(
    sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id,
          position, price, cost)
        values (${IPHONE}, ${id}, ${ids.battery}, 1, 80, 35)`,
  );
  return id;
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

test("un admin carga la lista de reparaciones de un modelo, y un viewer la ve sin el costo", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await page.getByRole("link", { name: "Reparaciones" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Órdenes de servicio" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Secciones de reparaciones" })
    .getByRole("link", { name: "Lista de reparaciones" })
    .click();
  await page
    .getByLabel("Modelo", { exact: true })
    .selectOption({ label: "iPhone 13 (0 precios)" });
  await page.getByRole("button", { name: "Ver sus precios" }).click();
  await expect(page).toHaveURL(/modelo=/);

  const row = page.getByRole("form", { name: "Precio de Cambio de batería" });
  await row
    .getByLabel("Precio al cliente de Cambio de batería", { exact: true })
    .fill("80");
  await row
    .getByLabel("Costo del técnico de Cambio de batería", { exact: true })
    .fill("35");
  await row.getByRole("button", { name: /Guardar/ }).click();
  await expect(page.getByText("Precio guardado.")).toBeVisible();
  await expect(
    page.getByLabel("Precio al cliente de Cambio de batería", { exact: true }),
  ).toHaveValue("80");
  await expectAccessible(page, "lista de reparaciones");

  // Un tipo nuevo va al final.
  await page.getByLabel("Nombre").fill("Parlante");
  await page.getByRole("button", { name: "Crear tipo" }).click();
  await expect(page.getByText("Tipo de reparación creado.")).toBeVisible();
  await expect(
    page.getByLabel("Precio al cliente de Parlante", { exact: true }),
  ).toBeVisible();

  const audit = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from audit_logs where entity_type in ('repair_price', 'repair_type')`,
  );
  expect(audit.rows[0]!.count).toBe(2);

  // El viewer: el precio, sin el costo ni los formularios.
  await page.context().clearCookies();
  await login(page, VIEWER_IPHONE.email);
  await page.goto(`/reparaciones/lista?modelo=${ids.model}`);
  await expect(page.getByRole("cell", { name: /US\$\s80,00/ })).toBeVisible();
  await expect(page.getByText(/US\$\s35,00/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crear tipo" })).toHaveCount(0);
  await expectAccessible(page, "lista de reparaciones para un viewer");
});

test("una orden recorre la recepción, el técnico, el presupuesto, la reparación, la entrega con su venta y el cobro", async ({
  page,
}) => {
  await db.execute(
    sql`insert into repair_prices (organization_id, repair_type_id, model_id, price,
          price_currency, cost, cost_currency)
        values (${IPHONE}, ${ids.battery}, ${ids.model}, 80, 'USD', 35, 'USD')`,
  );
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/reparaciones/nueva");
  await expectAccessible(page, "alta de la orden");
  const client = page.getByLabel(/^Cliente/);
  await client.fill("Ana Rep");
  await expect(page.getByRole("option").first()).toBeVisible();
  await client.press("ArrowDown");
  await client.press("Enter");
  await page
    .getByLabel(/^Modelo del equipo/)
    .selectOption({ label: "iPhone 13" });
  await page.getByLabel("IMEI o número de serie").fill("356938035643809");
  await page
    .getByLabel(/^Lo que reporta el cliente/)
    .fill("La batería dura poco.");
  await page.getByRole("button", { name: "Crear la orden" }).click();

  await expect(
    page.getByRole("heading", { name: "Orden de servicio OS-000001" }),
  ).toBeVisible();
  await expect(page.getByText("Orden de servicio creada.")).toBeVisible();
  const orderUrl = page.url();
  await expectAccessible(page, "orden recibida");

  // El comprobante de recepción: sin el técnico ni el costo.
  await page.getByRole("link", { name: "Comprobante de recepción" }).click();
  const receipt = page.getByRole("article");
  await expect(receipt).toContainText("OS-000001");
  await expect(receipt).toContainText("Ana Reparación");
  await expect(receipt).toContainText("356938035643809");
  await expect(receipt).toContainText("La batería dura poco.");
  await expect(receipt).not.toContainText("Técnico");
  await expectAccessible(page, "comprobante de recepción");
  await page.goto(orderUrl);

  await page.getByLabel("Técnico").selectOption({ label: "Técnico Uno" });
  await page.getByRole("button", { name: "Mandar al técnico" }).click();
  await expect(page.getByText("Orden mandada al técnico.")).toBeVisible();

  // El presupuesto con la lista del modelo, editable antes de guardarlo.
  await expect(
    page.getByLabel("Precio al cliente de Cambio de batería", { exact: true }),
  ).toHaveValue("80");
  await expectAccessible(page, "presupuesto");
  await page.getByRole("checkbox", { name: "Cambio de batería" }).check();
  await page.getByRole("button", { name: "Guardar el presupuesto" }).click();
  await expect(page.getByText("Presupuesto guardado.")).toBeVisible();

  await page.getByRole("button", { name: "El cliente aprobó" }).click();
  await expect(page.getByText("Presupuesto aprobado.")).toBeVisible();
  await page
    .getByRole("button", { name: "El técnico la devolvió reparada" })
    .click();
  await expect(page.getByText(/Orden reparada/)).toBeVisible();
  await page
    .getByRole("button", { name: "Entregar y emitir la venta" })
    .click();
  await expect(
    page.getByText(
      "Equipo entregado: se emitió la venta. Cobrala desde su detalle.",
    ),
  ).toBeVisible();
  await expectAccessible(page, "orden entregada");

  // La venta, sin tocar el stock, se cobra como cualquier venta (AC-5).
  const stock = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from inventories i join products p on p.id = i.product_id where p.is_service`,
  );
  expect(stock.rows[0]!.count).toBe(0);
  await page.getByRole("link", { name: "V-000001" }).click();
  await page.getByRole("link", { name: "Registrar cobro" }).click();
  await expect(page.getByLabel(/Monto en/)).toHaveValue("80.00");
  await page.getByRole("radio", { name: "Transferencia" }).check();
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page.getByText("Se registró el cobro")).toBeVisible();
  await expect(page.getByText("Cobrada")).toBeVisible();

  // La cuenta del técnico: la orden reparada, al debe (AC-7).
  await page.goto(`/compras/proveedores/${ids.technician}/cuenta`);
  await expect(
    page.getByRole("link", { name: "OS-000001" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/US\$\s35,00/).first()).toBeVisible();
  await expectAccessible(page, "cuenta del técnico");
});

test("una orden rechazada se entrega sin venta, y otra se cancela con su motivo", async ({
  page,
}) => {
  const rejected = await quotedOrder(101);
  const cancelled = await quotedOrder(102);
  await login(page, ADMIN_IPHONE.email);

  await page.goto(`/reparaciones/${rejected}`);
  await page.getByRole("button", { name: "El cliente rechazó" }).click();
  await expect(page.getByText(/Presupuesto rechazado/)).toBeVisible();
  await page.getByRole("button", { name: "Entregar sin reparar" }).click();
  await expect(page.getByText("Equipo entregado.")).toBeVisible();
  const sales = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from sales`,
  );
  expect(sales.rows[0]!.count).toBe(0);

  await page.goto(`/reparaciones/${cancelled}`);
  await page.getByLabel("Motivo").selectOption({ label: "No tiene arreglo" });
  await page.getByRole("button", { name: "Cancelar la orden" }).click();
  await expect(page.getByText("Orden cancelada.")).toBeVisible();
  await expect(
    page.getByText("No tiene arreglo", { exact: true }),
  ).toBeVisible();
  await expectAccessible(page, "orden cancelada");

  // La lista: por defecto, las que están en curso; con «Todas», también estas dos.
  await page.goto("/reparaciones");
  await expect(
    page.getByText("No hay órdenes de servicio en curso."),
  ).toBeVisible();
  await page.goto("/reparaciones?estado=todas");
  await expect(
    page.getByRole("link", { name: "OS-000101" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "OS-000102" }).first(),
  ).toBeVisible();
  await expectAccessible(page, "lista de órdenes");
});

test("un viewer ve la orden sin el técnico, el costo ni las acciones", async ({
  page,
}) => {
  const order = await quotedOrder(103);
  await login(page, VIEWER_IPHONE.email);
  await page.goto(`/reparaciones/${order}`);
  await expect(
    page.getByRole("heading", { name: "Orden de servicio OS-000103" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Siguiente paso" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Costo del técnico" }),
  ).toHaveCount(0);
  await expect(page.getByText("Técnico Uno")).toHaveCount(0);
  await expect(page.getByText(/US\$\s35,00/)).toHaveCount(0);
  await expect(page.getByText(/US\$\s80,00/).first()).toBeVisible();
  await expectAccessible(page, "orden para un viewer");
});

test("la orden y la lista entran en 375 px sin desplazamiento horizontal", async ({
  page,
}) => {
  const order = await quotedOrder(104);
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/reparaciones/${order}`);
  await expect(
    page.getByRole("button", { name: "El cliente aprobó" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "orden en 375 px");
  await page.goto("/reparaciones?estado=todas");
  await expect(
    page.getByRole("link", { name: "OS-000104" }).first(),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin carga una orden con el nombre exacto del cliente, la manda y la presupuesta", async ({
    page,
  }) => {
    await db.execute(
      sql`insert into repair_prices (organization_id, repair_type_id, model_id, price,
            price_currency, cost, cost_currency)
          values (${IPHONE}, ${ids.battery}, ${ids.model}, 80, 'USD', 35, 'USD')`,
    );
    await login(page, ADMIN_IPHONE.email);
    await page.goto("/reparaciones/nueva");
    await page.getByLabel(/^Cliente/).fill("Ana Reparación");
    await page
      .getByLabel(/^Modelo del equipo/)
      .selectOption({ label: "iPhone 13" });
    await page.getByLabel(/^Lo que reporta el cliente/).fill("No enciende.");
    await page.getByRole("button", { name: "Crear la orden" }).click();
    await expect(
      page.getByRole("heading", { name: "Orden de servicio OS-000001" }),
    ).toBeVisible();

    await page.getByLabel("Técnico").selectOption({ label: "Técnico Uno" });
    await page.getByRole("button", { name: "Mandar al técnico" }).click();
    await expect(page.getByText("Orden mandada al técnico.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Cambio de batería" }).check();
    await page.getByRole("button", { name: "Guardar el presupuesto" }).click();
    await expect(page.getByText("Presupuesto guardado.")).toBeVisible();
    await expect(page.getByText(/US\$\s80,00/).first()).toBeVisible();
  });
});
