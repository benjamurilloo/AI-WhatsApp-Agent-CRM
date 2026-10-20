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

// Las unidades con IMEI de punta a punta (brief-29.5, D-10): Chromium, next start, Server Actions,
// inventory, purchasing, catalog y PostgreSQL real. La tienda de ejemplo la siembra esta spec, le
// activa serialized_units con dos grados y la borra al terminar, como variants.spec.ts.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
const UNIT_TRACKED =
  "Este producto se vende por unidad: todavía no se puede agregar a un pedido ni a una venta.";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

// Vacía los productos y todo lo de la tienda de ejemplo; con keep, vuelve a sembrarla.
async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_lines, sales, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
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
  // La capacidad y dos grados, como los deja el script de capacidades.
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${IPHONE}, 'serialized_units', ${ADMIN_IPHONE.id})`,
  );
  await db.execute(
    sql`insert into unit_grades (organization_id, name, description, position, is_example)
        values (${IPHONE}, 'A', 'Como nuevo', 0, true), (${IPHONE}, 'B', 'Marcas leves', 1, true)`,
  );
}

// Un producto nuevo de la tienda, sin movimientos, con precio en dólares.
async function insertProduct(sku: string, name: string): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${IPHONE}, ${sku}, ${name}) returning id`,
  );
  const productId = result.rows[0]!.id;
  await db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${IPHONE}, ${productId}, '1099.00', 'USD', ${ADMIN_IPHONE.id})`,
  );
  return productId;
}

async function unitRows(productId: string) {
  const result = await db.execute<{ serial: string; status: string }>(
    sql`select serial, status from stock_units where product_id = ${productId} order by serial`,
  );
  return result.rows;
}

async function onHand(productId: string) {
  const result = await db.execute<{ on_hand: string }>(
    sql`select quantity_on_hand as on_hand from inventories where product_id = ${productId}`,
  );
  return result.rows[0]?.on_hand ?? null;
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

test("un admin pasa un producto a «por unidad», recibe con IMEI, carga y da de baja", async ({
  page,
}) => {
  const productId = await insertProduct("IP15P-256", "iPhone 15 Pro 256 GB");
  await db.execute(
    sql`insert into suppliers (organization_id, name) values (${IPHONE}, 'Importadora Norte')`,
  );
  await login(page, ADMIN_IPHONE.email);

  // El seguimiento (D-3).
  await page.goto(`/productos/${productId}`);
  await page
    .getByRole("navigation", { name: "Secciones del producto" })
    .getByRole("link", { name: "Unidades" })
    .click();
  // El estado actual: el texto de la tarjeta y la opción marcada repiten «Por cantidad».
  await expect(page.getByLabel("Por cantidad")).toBeChecked();
  await expectAccessible(page, "seguimiento por cantidad");
  await page.getByLabel("Por unidad, con IMEI").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(
    page.getByText("Listo: cambió cómo se lleva el stock del producto."),
  ).toBeVisible();
  await expect(page.getByText("No hay unidades disponibles.")).toBeVisible();

  // La recepción pide un IMEI por unidad (D-6).
  await page.goto("/compras/recepciones/nueva");
  await pick(page, "Proveedor", "Norte");
  await page.getByLabel("Moneda", { exact: true }).selectOption("USD");
  // El SKU se encuentra solo completo; un prefijo no está en el nombre.
  await pick(line(page, 1), "Producto", "IP15P-256");
  await line(page, 1).getByLabel("Cantidad").fill("2");
  await line(page, 1).getByLabel("Costo unitario").fill("900");
  const imei = line(page, 1).getByLabel(
    "IMEI o número de serie, uno por renglón",
  );
  await expect(imei).toBeVisible();
  await imei.fill("356938035643809");
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(line(page, 1)).toContainText(
    "escribí un IMEI por cada unidad recibida",
  );
  await line(page, 1)
    .getByLabel("IMEI o número de serie, uno por renglón")
    .fill("356938035643809\n356938035643810");
  await expectAccessible(page, "recepción con IMEI");
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page).toHaveURL(
    /\/compras\/recepciones\/[0-9a-f-]{36}\?aviso=creada$/,
  );
  await expect(
    page.getByText("356938035643809, 356938035643810"),
  ).toBeVisible();
  expect(await onHand(productId)).toBe("2.000");

  // Las unidades, la carga manual y la baja.
  await page.goto(`/productos/${productId}/unidades`);
  await expect(page.getByText("2 unidades disponibles.")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "356938035643809", exact: true }),
  ).toBeVisible();
  await page.getByLabel("IMEI o número de serie *").fill("F2LXK0ABCDEF");
  await page.getByLabel("Costo *").fill("700");
  await page.getByLabel("Moneda", { exact: true }).selectOption("USD");
  await page.getByLabel("Grado").selectOption({ label: "A" });
  await page.getByLabel("Batería (%)").fill("88");
  await page.getByRole("button", { name: "Cargar unidad" }).click();
  await expect(
    page.getByText("Unidad cargada: el stock subió en 1."),
  ).toBeVisible();
  await expect(page.getByText("3 unidades disponibles.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "88 %" })).toBeVisible();
  await expectAccessible(page, "unidades disponibles");

  // Un IMEI repetido se rechaza en el campo.
  await page.getByLabel("IMEI o número de serie *").fill("f2lxk0abcdef");
  await page.getByLabel("Costo *").fill("700");
  await page.getByRole("button", { name: "Cargar unidad" }).click();
  await expect(
    page.getByText("Ya hay una unidad vigente con ese IMEI."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Dar de baja 356938035643809" }).click();
  await page.getByLabel("Motivo *").fill("Pantalla rota en el traslado");
  await expectAccessible(page, "baja de una unidad");
  await page.getByRole("button", { name: "Dar de baja" }).click();
  await expect(
    page.getByText("Unidad dada de baja: el stock bajó en 1."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dadas de baja" }),
  ).toBeVisible();
  expect(await unitRows(productId)).toEqual([
    { serial: "356938035643809", status: "written_off" },
    { serial: "356938035643810", status: "available" },
    { serial: "F2LXK0ABCDEF", status: "available" },
  ]);
  expect(await onHand(productId)).toBe("2.000");

  // El historial muestra el IMEI de cada movimiento y no ofrece el ajuste.
  await page.goto(`/productos/${productId}/movimientos`);
  await expect(
    page.getByText("Este producto se lleva por unidad", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registrar ajuste" }),
  ).toHaveCount(0);
  await expect(page.getByText("IMEI 356938035643809").first()).toBeVisible();
});

test("el pedido de un producto por unidad se rechaza con su motivo", async ({
  page,
}) => {
  const productId = await insertProduct("IP15-128", "iPhone 15 128 GB");
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${productId}`,
  );
  await db.execute(
    sql`insert into clients (organization_id, display_name) values (${IPHONE}, 'Lucía Gómez')`,
  );
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/pedidos/nuevo");
  await pick(page, "Cliente", "Luc");
  await pick(line(page, 1), "Producto", "IP15-128");
  await line(page, 1).getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(line(page, 1)).toContainText(UNIT_TRACKED);
  const orders = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from orders`,
  );
  expect(orders.rows[0]!.count).toBe(0);
});

test("un viewer ve las unidades sin el costo ni los formularios", async ({
  page,
}) => {
  const productId = await insertProduct("IP15P-256", "iPhone 15 Pro 256 GB");
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${productId}`,
  );
  await db.execute(
    sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
          origin_type, created_by)
        values (${IPHONE}, ${productId}, '356938035643809', 900, 'USD', 'manual', ${ADMIN_IPHONE.id})`,
  );
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${IPHONE}, ${productId}, 1)`,
  );
  await login(page, VIEWER_IPHONE.email);
  await page.goto(`/productos/${productId}/unidades`);
  await expect(
    page.getByRole("cell", { name: "356938035643809", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Costo" })).toHaveCount(
    0,
  );
  await expect(page.getByText("US$")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cargar unidad" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /Dar de baja/ })).toHaveCount(0);
  await expectAccessible(page, "unidades para un viewer");
});

test("la pantalla de unidades entra en 375 px sin desplazamiento horizontal", async ({
  page,
}) => {
  const productId = await insertProduct("IP15P-256", "iPhone 15 Pro 256 GB");
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/productos/${productId}/unidades`);
  await page.getByLabel("Por unidad, con IMEI").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(
    page.getByRole("button", { name: "Cargar unidad" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin carga una unidad y la ve en la lista", async ({ page }) => {
    const productId = await insertProduct("IP15P-256", "iPhone 15 Pro 256 GB");
    await db.execute(
      sql`update products set tracking = 'unit' where id = ${productId}`,
    );
    await login(page, ADMIN_IPHONE.email);
    await page.goto(`/productos/${productId}/unidades`);
    await page.getByLabel("IMEI o número de serie *").fill("356938035643809");
    await page.getByLabel("Costo *").fill("900");
    await page.getByLabel("Moneda", { exact: true }).selectOption("USD");
    await page.getByRole("button", { name: "Cargar unidad" }).click();
    await expect(
      page.getByText("Unidad cargada: el stock subió en 1."),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "356938035643809", exact: true }),
    ).toBeVisible();
    expect(await onHand(productId)).toBe("1.000");
  });
});

test("sin la capacidad, la pantalla de unidades no existe", async ({
  page,
}) => {
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${IPHONE}
          and capability = 'serialized_units'`,
  );
  const productId = await insertProduct("IP15P-256", "iPhone 15 Pro 256 GB");
  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/productos/${productId}`);
  await expect(
    page
      .getByRole("navigation", { name: "Secciones del producto" })
      .getByRole("link", { name: "Unidades" }),
  ).toHaveCount(0);
  await page.goto(`/productos/${productId}/unidades`);
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});
