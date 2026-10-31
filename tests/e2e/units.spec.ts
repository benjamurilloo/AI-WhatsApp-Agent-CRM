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

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

// Vacía los productos y todo lo de la tienda de ejemplo; con keep, vuelve a sembrarla.
async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products`,
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

// Unidades disponibles de un producto por unidad, como las deja el alta manual: con su saldo y su
// movimiento. price, el precio propio de la unidad (brief-29.5.2, D-2).
async function insertUnits(
  productId: string,
  units: { serial: string; price?: string }[],
) {
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${productId}`,
  );
  let count = 0;
  for (const unit of units) {
    const row = await db.execute<{ id: string }>(
      sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
            price, price_currency, origin_type, created_by)
          values (${IPHONE}, ${productId}, ${unit.serial}, 800, 'USD',
            ${unit.price ?? null}, ${unit.price ? "USD" : null}, 'manual', ${ADMIN_IPHONE.id})
          returning id`,
    );
    count += 1;
    await db.execute(
      sql`insert into inventory_movements (organization_id, product_id, type, quantity,
            balance_after, reason, unit_id, created_by)
          values (${IPHONE}, ${productId}, 'adjustment_positive', 1, ${count},
            'Alta manual de una unidad', ${row.rows[0]!.id}, ${ADMIN_IPHONE.id})`,
    );
  }
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${IPHONE}, ${productId}, ${count})`,
  );
}

async function insertClient(name: string) {
  await db.execute(
    sql`insert into clients (organization_id, display_name) values (${IPHONE}, ${name})`,
  );
}

async function transition(page: Page, button: string, yes: string) {
  await page.getByRole("button", { name: button }).click();
  await page.getByRole("button", { name: yes }).click();
}

// Las unidades en pedidos y ventas (brief-29.5.2, D-5, AC-1 a AC-4).
test("un pedido elige sus unidades, se confirma, se entrega y su venta lleva los IMEI", async ({
  page,
}) => {
  const productId = await insertProduct("IP15-128", "iPhone 15 128 GB");
  await insertUnits(productId, [
    { serial: "356938035643809" },
    { serial: "356938035643810", price: "1050" },
    { serial: "356938035643811" },
  ]);
  await insertClient("Lucía Gómez");
  await login(page, ADMIN_IPHONE.email);

  await page.goto("/pedidos/nuevo");
  await pick(page, "Cliente", "Luc");
  await pick(line(page, 1), "Producto", "IP15-128");
  // En un producto por unidad, el campo de IMEI reemplaza a la cantidad.
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveCount(0);
  const imei = line(page, 1).getByLabel("IMEI de las unidades");
  await expect(imei).toBeVisible();
  await line(page, 1)
    .getByRole("button", { name: "Agregar el IMEI 356938035643809" })
    .click();
  await line(page, 1)
    .getByRole("button", { name: "Agregar el IMEI 356938035643810" })
    .click();
  await expect(imei).toHaveValue("356938035643809\n356938035643810");
  await expect(line(page, 1)).toContainText("2 unidades");
  // Las dos unidades: la del precio del producto y la de su precio propio (D-2).
  await expect(
    page.getByText("Total estimado: US$ 2.149,00", { exact: true }),
  ).toBeVisible();
  await expectAccessible(page, "pedido con unidades");
  await page.getByRole("button", { name: "Crear pedido" }).click();

  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}\?aviso=creado$/);
  await expect(page.getByText("IMEI 356938035643809")).toBeVisible();
  await expect(page.getByText("IMEI 356938035643810")).toBeVisible();
  await expect(page.getByText("Por unidad", { exact: true })).toBeVisible();
  await expectAccessible(page, "pedido pendiente con unidades");
  // Pendiente, no toca el stock.
  expect(await unitRows(productId)).toEqual([
    { serial: "356938035643809", status: "available" },
    { serial: "356938035643810", status: "available" },
    { serial: "356938035643811", status: "available" },
  ]);

  await transition(page, "Confirmar pedido", "Sí, confirmar el pedido");
  await expect(
    page.getByText("Pedido confirmado: el stock quedó reservado."),
  ).toBeVisible();
  expect((await unitRows(productId)).map((row) => row.status)).toEqual([
    "reserved",
    "reserved",
    "available",
  ]);

  // La ficha de unidades muestra las reservadas con su pedido.
  await page.goto(`/productos/${productId}/unidades`);
  await expect(
    page.getByRole("heading", { name: "Reservadas y vendidas" }),
  ).toBeVisible();
  await expect(page.getByText("1 unidad disponible.")).toBeVisible();
  await expectAccessible(page, "unidades reservadas");
  await page.getByRole("link", { name: "Pedido P-000001" }).first().click();

  await transition(page, "Marcar entregado", "Sí, marcar entregado");
  await expect(page.getByText(/^Pedido entregado/)).toBeVisible();
  expect((await unitRows(productId)).map((row) => row.status)).toEqual([
    "sold",
    "sold",
    "available",
  ]);
  expect(await onHand(productId)).toBe("1.000");

  await page.getByRole("link", { name: "Emitir venta" }).click();
  await page.getByRole("button", { name: "Sí, emitir la venta" }).click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
  const sale = page.getByRole("table", { name: /Líneas de la venta/ });
  await expect(sale).toContainText("IMEI 356938035643809");
  await expect(sale).toContainText("IMEI 356938035643810");
  await expectAccessible(page, "comprobante de la venta con IMEI");
});

test("una venta sin pedido vende sus unidades, rechaza una reservada y su anulación las devuelve", async ({
  page,
}) => {
  const productId = await insertProduct("IP15-128", "iPhone 15 128 GB");
  await insertUnits(productId, [
    { serial: "356938035643809" },
    { serial: "356938035643810" },
  ]);
  // Una reservada, como la deja un pedido confirmado.
  await db.execute(
    sql`update stock_units set status = 'reserved' where serial = '356938035643810'`,
  );
  await db.execute(
    sql`update inventories set quantity_reserved = 1 where product_id = ${productId}`,
  );
  await login(page, ADMIN_IPHONE.email);

  await page.goto("/ventas/nueva");
  await pick(line(page, 1), "Producto", "IP15-128");
  await line(page, 1)
    .getByLabel("IMEI de las unidades")
    .fill("356938035643809\n356938035643810");
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(line(page, 1)).toContainText(
    "IMEI 356938035643810 ya no está disponible",
  );
  await expectAccessible(page, "venta con un IMEI no disponible");

  await line(page, 1)
    .getByLabel("IMEI de las unidades")
    .fill("356938035643809");
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
  await expect(
    page.getByRole("table", { name: /Líneas de la venta/ }),
  ).toContainText("IMEI 356938035643809");
  expect((await unitRows(productId)).map((row) => row.status)).toEqual([
    "sold",
    "reserved",
  ]);

  await page.getByRole("link", { name: "Anular venta" }).click();
  await page.getByRole("radio", { name: "Error de carga" }).check();
  await page.getByRole("button", { name: "Sí, anular la venta" }).click();
  await expect(page.getByText("Venta anulada.")).toBeVisible();
  expect((await unitRows(productId)).map((row) => row.status)).toEqual([
    "available",
    "reserved",
  ]);
  await page
    .getByRole("link", { name: "Ver el comprobante de la anulación" })
    .click();
  await expect(page.getByText("IMEI 356938035643809")).toBeVisible();
  await expectAccessible(page, "comprobante de la anulación con IMEI");
});

test("el pedido con IMEI entra en 375 px sin desplazamiento horizontal", async ({
  page,
}) => {
  const productId = await insertProduct("IP15-128", "iPhone 15 128 GB");
  await insertUnits(productId, [{ serial: "356938035643809", price: "1050" }]);
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/pedidos/nuevo");
  await pick(line(page, 1), "Producto", "IP15-128");
  await expect(
    line(page, 1).getByRole("button", {
      name: "Agregar el IMEI 356938035643809",
    }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
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

  test("un admin vende una unidad por su IMEI, con el producto por SKU", async ({
    page,
  }) => {
    const productId = await insertProduct("IP15-128", "iPhone 15 128 GB");
    await insertUnits(productId, [{ serial: "356938035643809" }]);
    await login(page, ADMIN_IPHONE.email);
    await page.goto("/ventas/nueva");
    await line(page, 1).getByLabel("Producto").fill("IP15-128");
    await line(page, 1)
      .getByLabel("IMEI de las unidades")
      .fill("356938035643809");
    await page.getByRole("button", { name: "Emitir venta" }).click();
    await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
    await expect(page.getByText("IMEI 356938035643809")).toBeVisible();
    expect(await unitRows(productId)).toEqual([
      { serial: "356938035643809", status: "sold" },
    ]);
  });

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

test("el Resumen muestra los tres contadores de unidades y la barra de pestañas de la v2", async ({
  page,
}) => {
  // AC-5, AC-6, AC-9 y la mitad del Resumen de AC-12 del brief-24.5.1, con el ejemplo del README de
  // la lámina 09: cinco unidades físicas, tres disponibles, una reservada y una en revisión.
  // Un producto que la tienda de ejemplo no siembra: sus cuatro variantes ya ocupan sus SKU.
  const unit = await insertProduct("IP15P-256", "iPhone 15 Pro 256 GB");
  await insertUnits(unit, [
    { serial: "356938035643809" },
    { serial: "356938035643810" },
    { serial: "356938035643811" },
    { serial: "356938035643812" },
    { serial: "356938035643813" },
  ]);
  await db.execute(
    sql`update stock_units set status = 'reserved' where serial = '356938035643812'`,
  );
  // A revisión se llega desde reparación, no desde disponible: es el único camino que acepta el
  // trigger de la 0059.
  await db.execute(
    sql`update stock_units set status = 'in_repair' where serial = '356938035643813'`,
  );
  await db.execute(
    sql`update stock_units set status = 'in_review' where serial = '356938035643813'`,
  );
  const quantity = await insertProduct("CAB-USBC-1M", "Cable USB-C de 1 metro");
  const service = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, is_service)
        values (${IPHONE}, 'SERV-REP', 'Servicio de reparación', true)
        returning id`,
  );

  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/productos/${unit}`);

  // AC-5: tres contadores y ninguno más, porque un total que los sume no es ningún número del
  // sistema. El número y la etiqueta de cada tarjeta son dos `block` dentro del mismo párrafo, así
  // que el texto del párrafo es el número pegado al nombre.
  const counters = page.getByRole("region", { name: "Unidades del producto" });
  const tiles = counters.locator("p").filter({ hasNotText: "unidades" });
  await expect(tiles).toHaveText([
    "3Disponibles",
    "1Reservadas",
    "1En revisión",
  ]);
  await expect(counters.locator("p")).toHaveCount(4);
  await expect(counters).not.toContainText("Total");
  // La línea que explica por qué las cinco físicas no son el saldo.
  await expect(counters).toContainText("5 unidades físicas en el local.");
  await expect(counters).toContainText(
    "El saldo cuenta las disponibles y las reservadas: lo que está en reparación o en revisión queda fuera.",
  );
  await expect(counters).toContainText("Hoy hay una fuera del saldo.");
  // «Ver unidades» es la acción principal del encabezado, no un enlace de los contadores (D-6).
  await expect(counters.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver unidades" })).toBeVisible();
  await expectAccessible(page, "resumen con los contadores de unidades");

  // AC-9: los cinco nombres cortos de la v2, la actual con aria-current, y las cinco rutas
  // respondiendo donde siempre.
  const tabs = page.getByRole("navigation", { name: "Secciones del producto" });
  await expect(tabs.getByRole("link")).toHaveText([
    "Resumen",
    "Unidades",
    "Movimientos",
    "Precios",
    "Costos",
  ]);
  await expect(tabs.getByRole("link", { name: "Resumen" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const [label, path] of [
    ["Unidades", "/unidades"],
    ["Movimientos", "/movimientos"],
    ["Precios", "/precios"],
    ["Costos", "/costos"],
  ] as const) {
    await tabs.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(`/productos/${unit}${path}`);
    await expect(tabs.getByRole("link", { name: label })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  // Se recorre con el teclado porque son enlaces de verdad, no pestañas de JavaScript.
  await page.goto(`/productos/${unit}`);
  await tabs.getByRole("link", { name: "Resumen" }).focus();
  await page.keyboard.press("Tab");
  await expect(tabs.getByRole("link", { name: "Unidades" })).toBeFocused();

  // AC-5 pide la explicación sin condición: en un producto con todo disponible, donde no hay nada
  // fuera del saldo, la regla se dice igual y no aparece el recuento de lo que está fuera (N-5 de
  // la revisión independiente).
  const todoDisponible = await insertProduct("IP14-128", "iPhone 14 128 GB");
  await insertUnits(todoDisponible, [
    { serial: "356938035643820" },
    { serial: "356938035643821" },
  ]);
  await page.goto(`/productos/${todoDisponible}`);
  const sinNadaFuera = page.getByRole("region", {
    name: "Unidades del producto",
  });
  await expect(sinNadaFuera).toContainText("2 unidades físicas en el local.");
  await expect(sinNadaFuera).toContainText(
    "El saldo cuenta las disponibles y las reservadas: lo que está en reparación o en revisión queda fuera.",
  );
  await expect(sinNadaFuera).not.toContainText("fuera del saldo.");
  await page.goto(`/productos/${unit}`);

  // AC-12: en el teléfono las cinco pestañas se tocan con el dedo, y la barra se desplaza en vez de
  // apilarse. Medidas, no deducidas de las clases.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/productos/${unit}`);
  for (const label of [
    "Resumen",
    "Unidades",
    "Movimientos",
    "Precios",
    "Costos",
  ]) {
    const box = await tabs.getByRole("link", { name: label }).boundingBox();
    expect(box, `caja de la pestaña ${label}`).not.toBeNull();
    expect(box!.height, `alto de la pestaña ${label}`).toBeGreaterThanOrEqual(
      44,
    );
  }
  // El menú de más acciones del encabezado es el otro objetivo que la 24.5.1 agregó.
  const more = await page
    .getByRole("button", { name: "Más acciones del producto" })
    .boundingBox();
  expect(more!.height, "alto del menú de más acciones").toBeGreaterThanOrEqual(
    44,
  );
  expect(more!.width, "ancho del menú de más acciones").toBeGreaterThanOrEqual(
    44,
  );
  await page.setViewportSize({ width: 1280, height: 800 });

  // AC-6: un producto por cantidad no tiene contadores, y «En revisión» no aparece ni en cero.
  await page.goto(`/productos/${quantity}`);
  await expect(
    page.getByRole("region", { name: "Unidades del producto" }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("En revisión");

  // Y el producto de servicio sigue diciendo que no tiene stock (brief-29.6, D-5).
  await page.goto(`/productos/${service.rows[0]!.id}`);
  await expect(
    page.getByText(
      "Es el producto de las reparaciones: no tiene stock, y se vende solo al entregar una orden de servicio.",
    ),
  ).toBeVisible();
});
