import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { UNITS_PAGE_SIZE } from "@/modules/inventory";
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
  // Cinco corridas de axe en los dos temas sobre pantallas que la 24.5.2 agrandó —la lista de
  // unidades suma los chips y la columna Estado—: pasa de los 30 s por defecto. Ya rozaba el
  // límite en la 24.5.1, donde había timeado y pasado sola en 57 s.
  test.slow();
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
  // Desde la 24.5.2 la pantalla tiene una sola lista y este producto todavía no tiene ninguna
  // unidad, que no es lo mismo que «ninguna coincide con el filtro» (brief-24.5.2, D-11).
  await expect(
    page.getByText("Este producto todavía no tiene unidades."),
  ).toBeVisible();

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

  // brief-24.5.2-b, AC-12 y D-9: el error **lleva hasta** la unidad que lo tiene, en vez de dejar
  // que el usuario la busque a mano. El enlace abre su panel, así que después de seguirlo la
  // unidad tiene que estar ahí.
  const existente = page.getByRole("link", {
    name: "Ver la unidad que lo tiene",
  });
  await expect(existente).toBeVisible();
  await existente.click();
  await expect(
    page.getByRole("region", { name: "Unidad", exact: true }),
  ).toContainText("F2LXK0ABCDEF");
  await page.goBack();

  // Desde el 2026-11-01 las acciones de una fila viven dentro de «···» (MoreActions), para que la
  // tabla entre sin desplazamiento: hay que abrirlo antes de tocarlas.
  await page
    .getByRole("button", { name: `Más acciones de la unidad 356938035643809` })
    .click();
  await page.getByRole("link", { name: "Dar de baja 356938035643809" }).click();
  await page.getByLabel("Motivo *").fill("Pantalla rota en el traslado");
  await expectAccessible(page, "baja de una unidad");
  await page.getByRole("button", { name: "Dar de baja" }).click();
  await expect(
    page.getByText("Unidad dada de baja: el stock bajó en 1."),
  ).toBeVisible();
  // Desde la 24.5.2 no hay una sección «Dadas de baja»: es el chip `?estado=bajas` de la lista
  // única (brief-24.5.2, D-11). La unidad dada de baja aparece ahí, con su insignia.
  await page.goto(`/productos/${productId}/unidades?estado=bajas`);
  const bajas = page.getByRole("region", { name: "Unidades" });
  await expect(
    bajas.getByRole("link", { name: "356938035643809", exact: true }),
  ).toBeVisible();
  // Scope a la tabla y no a la región: **los chips del filtro repiten las mismas palabras que las
  // insignias de estado**, así que `getByText("Dada de baja")` sobre la región entera también casa
  // con el chip y no prueba lo que dice probar.
  await expect(
    bajas.getByRole("table").getByText("Dada de baja"),
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
  units: {
    serial: string;
    price?: string;
    // El costo y su moneda. La columna es NOT NULL con CHECK (cost > 0): acá no hay «sin costo»,
    // y el defecto queda en 800 USD para las pruebas que ya existían (brief-24.5.2-b, D-12).
    cost?: string;
    currency?: string;
  }[],
) {
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${productId}`,
  );
  let count = 0;
  for (const unit of units) {
    const currency = unit.currency ?? "USD";
    const row = await db.execute<{ id: string }>(
      sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
            price, price_currency, origin_type, created_by)
          values (${IPHONE}, ${productId}, ${unit.serial}, ${unit.cost ?? "800"}, ${currency},
            ${unit.price ?? null}, ${unit.price ? currency : null}, 'manual', ${ADMIN_IPHONE.id})
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

// Una transición del pedido. Desde la 24.6.1 (brief-24.6.1, D-5) el disparador del encabezado abre
// un panel por la URL y **el panel es la confirmación**: ya no hay un «Sí, …» en línea. La
// cancelación vive dentro de «Más acciones», que con JavaScript es un botón de revelación.
async function transition(page: Page, trigger: string, submit: string) {
  if (trigger === "Cancelar pedido") {
    await page.getByRole("button", { name: "Más acciones" }).click();
  }
  await page.getByRole("link", { name: trigger }).click();
  await page.getByRole("dialog").getByRole("button", { name: submit }).click();
  // El panel envía una acción de servidor que redirige con su aviso. Hay que esperarla: un
  // `goto` inmediato corre contra esa navegación y deja la pantalla a mitad de camino.
  await expect(page).toHaveURL(/\?aviso=/);
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
  // En un producto por unidad, el campo de cantidad no se edita.
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveCount(0);
  // Desde la 24.6.1-b los equipos se eligen en el panel «Elegir unidades» y quedan como chips
  // (su D-1 y su lámina 02). Hasta entonces, acá había un `textarea` de IMEI con la lista de
  // disponibles en línea, y la cantidad se leía «2 unidades». **Lo que este caso comprueba no
  // cambió**: que elegir dos unidades deja la línea con esas dos y su total.
  await line(page, 1)
    .getByRole("button", { name: "Elegir unidades", exact: true })
    .click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("checkbox", { name: /356938035643809/ }).check();
  await panel.getByRole("checkbox", { name: /356938035643810/ }).check();
  await panel.getByRole("button", { name: "Usar selección" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const chips = line(page, 1).getByRole("list", {
    name: /Equipos seleccionados/,
  });
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(chips).toContainText("356938035643809");
  await expect(chips).toContainText("356938035643810");
  await expect(line(page, 1)).toContainText("2 equipos");
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

  await transition(page, "Confirmar pedido", "Confirmar reserva");
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
  // Desde la 24.5.2 la reserva y su pedido viven en la columna Estado de la lista única, no en una
  // sección «Reservadas y vendidas» (brief-24.5.2, D-11).
  // Scope a la tabla: los chips del filtro repiten las palabras de las insignias (ver arriba), y
  // acá hay dos unidades reservadas, así que además hace falta `first()`.
  await expect(
    page.getByRole("table").getByText("Reservada").first(),
  ).toBeVisible();
  await expect(page.getByText("1 unidad disponible.")).toBeVisible();
  await expectAccessible(page, "unidades reservadas");
  await page.getByRole("link", { name: "Pedido P-000001" }).first().click();

  await transition(page, "Marcar entregado", "Confirmar entrega");
  await expect(page.getByText(/^Pedido entregado/)).toBeVisible();
  expect((await unitRows(productId)).map((row) => row.status)).toEqual([
    "sold",
    "sold",
    "available",
  ]);
  expect(await onHand(productId)).toBe("1.000");

  await page.getByRole("link", { name: "Emitir venta" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Emitir venta" })
    .click();
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
  // Desde la 24.6.2 el alta de mostrador usa el selector de la lámina 02: cada IMEI se escribe
  // en «Escanear o agregar IMEI» y Enter lo agrega como chip (brief-24.6.2).
  const saleImei = line(page, 1).getByLabel("Escanear o agregar IMEI");
  await saleImei.fill("356938035643809");
  await saleImei.press("Enter");
  await saleImei.fill("356938035643810");
  await saleImei.press("Enter");
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(line(page, 1)).toContainText(
    "IMEI 356938035643810 ya no está disponible",
  );
  await expectAccessible(page, "venta con un IMEI no disponible");

  // El rechazo conserva lo cargado: los dos chips siguen ahí y se quita el que no está.
  await expect(
    line(page, 1).getByRole("list", { name: /Equipos seleccionados/ }),
  ).toContainText("356938035643810");
  await line(page, 1)
    .getByRole("button", { name: "Quitar el IMEI 356938035643810" })
    .click();
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
  await expect(
    page.getByRole("table", { name: /Líneas de la venta/ }),
  ).toContainText("IMEI 356938035643809");
  expect((await unitRows(productId)).map((row) => row.status)).toEqual([
    "sold",
    "reserved",
  ]);

  // «Anular» vive en el menú de desbordamiento (brief-24.6.2-b, AC-7): el enlace aparece recién al
  // abrirlo. Igual que en `sales.spec.ts`.
  await page.getByRole("button", { name: "Más acciones de la venta" }).click();
  await page.getByRole("link", { name: "Anular venta" }).click();
  await page.getByRole("radio", { name: "Error de carga" }).check();
  // «Anular venta» desde la 24.6.2-d, como la lámina 04 (AC-10).
  await page.getByRole("button", { name: "Anular venta" }).click();
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
  // Desde la 24.6.1-b lo ancho de esta pantalla ya no es la lista de disponibles en línea sino
  // **el panel abierto y el chip**, así que se miden los dos: antes se medía con la lista a la
  // vista, y medir el formulario pelado comprobaría menos que el caso original.
  await line(page, 1)
    .getByRole("button", { name: "Elegir unidades", exact: true })
    .click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  const desbordeConPanel = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(desbordeConPanel, "con el panel abierto").toBeLessThanOrEqual(0);

  await panel.getByRole("checkbox", { name: /356938035643809/ }).check();
  await panel.getByRole("button", { name: "Usar selección" }).click();
  await expect(
    line(page, 1)
      .getByRole("list", { name: /Equipos seleccionados/ })
      .getByRole("listitem"),
  ).toHaveCount(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "con el chip del equipo elegido").toBeLessThanOrEqual(0);
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
  // Desde la 24.5.2 **cada contador es un enlace** a la lista filtrada por su estado
  // (brief-24.5.2, D-5 y AC-2): cierra la primera diferencia declarada de la 24.5.1, que decía
  // «Ver unidades es la acción principal del encabezado, no un enlace de los contadores» y
  // afirmaba `toHaveCount(0)`. El encabezado conserva «Ver unidades».
  await expect(counters.getByRole("link")).toHaveCount(3);
  await expect(
    counters.getByRole("link", { name: /Disponibles/ }),
  ).toHaveAttribute("href", /\/unidades\?estado=disponibles$/);
  await expect(
    counters.getByRole("link", { name: /Reservadas/ }),
  ).toHaveAttribute("href", /\/unidades\?estado=reservadas$/);
  await expect(
    counters.getByRole("link", { name: /En revisión/ }),
  ).toHaveAttribute("href", /\/unidades\?estado=revision$/);
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

// La lista de unidades de la 24.5.2 (brief-24.5.2, D-5, D-6, D-7, D-8 y D-11; AC-1, AC-3, AC-4,
// AC-6, AC-9 y AC-13). 26 unidades para que haya dos páginas: con 25 el tope no se vería y la
// prueba pasaría sin probar la paginación.
async function insertManyUnits(productId: string, total: number) {
  await insertUnits(
    productId,
    Array.from({ length: total }, (_, index) => ({
      serial: `35693803564${String(index).padStart(4, "0")}`,
    })),
  );
}

test("la lista de unidades se filtra por estado, se busca por sufijo de IMEI y se pagina", async ({
  page,
}) => {
  test.slow();
  const productId = await insertProduct("IP15-512", "iPhone 15 512 GB");
  await insertManyUnits(productId, 26);
  // Una en revisión y otra reservada, para que los chips no sean todos cero y para que
  // «En reparación» y «En revisión» se vean como dos estados distintos (D-6). La de revisión se
  // recorre de verdad: el trigger no admite el salto directo.
  const todas = await unitRows(productId);
  const enRevision = todas[0]!.serial;
  const reservada = todas[1]!.serial;
  await db.execute(
    sql`update stock_units set status = 'in_repair' where serial = ${enRevision}`,
  );
  await db.execute(
    sql`update stock_units set status = 'in_review' where serial = ${enRevision}`,
  );
  await db.execute(
    sql`update stock_units set status = 'reserved' where serial = ${reservada}`,
  );

  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/productos/${productId}/unidades`);
  const lista = page.getByRole("region", { name: "Unidades" });

  // AC-4: la lista está paginada y dice su total real, que es 26 y no 25.
  await expect(
    lista.getByText("Mostrando 1 a 25 de 26 unidades"),
  ).toBeVisible();
  await expect(lista.getByRole("row")).toHaveCount(UNITS_PAGE_SIZE + 1);
  await expectAccessible(page, "lista de unidades");

  // AC-1 y D-6: los seis chips con su cantidad, y «En reparación» aparte de «En revisión».
  const chips = page.getByRole("navigation", { name: "Filtrar por estado" });
  await expect(chips.getByRole("link")).toHaveText([
    "Todas",
    "Disponible24",
    "Reservada1",
    "En reparación0",
    "En revisión1",
    "Vendida0",
    "Dada de baja0",
  ]);
  // Los objetivos táctiles se **miden**, no se infieren de las clases (AC-13): así un fallo
  // informa el número real.
  for (const name of [/^Todas$/, /^En revisión/]) {
    const box = await chips.getByRole("link", { name }).boundingBox();
    expect(box!.height, `alto del chip ${name}`).toBeGreaterThanOrEqual(44);
  }

  // AC-1: el filtro deja una lista efectivamente filtrada.
  await chips.getByRole("link", { name: /^En revisión/ }).click();
  await expect(page).toHaveURL(/\?estado=revision$/);
  await expect(lista.getByRole("row")).toHaveCount(2);
  // Scope a la tabla: el chip del filtro también dice «En revisión».
  await expect(lista.getByRole("table").getByText("En revisión")).toBeVisible();

  // AC-3: la búsqueda por sufijo de cuatro caracteres o más.
  await page.goto(`/productos/${productId}/unidades`);
  await page.getByLabel("Buscar por IMEI o serie").fill("0007");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(lista.getByRole("row")).toHaveCount(2);
  await expect(
    lista.getByRole("link", { name: "356938035640007", exact: true }),
  ).toBeVisible();

  // Con menos de cuatro no busca y **lo dice**, en lugar de devolver todo como si hubiera buscado.
  await page.goto(`/productos/${productId}/unidades?imei=07`);
  await expect(
    page.getByText(
      "Escribí al menos 4 caracteres del final del IMEI para buscar.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    lista.getByText("Mostrando 1 a 25 de 26 unidades"),
  ).toBeVisible();

  // Un sufijo que no casa conserva los filtros y ofrece restablecer (AC-3).
  await page.goto(
    `/productos/${productId}/unidades?estado=disponibles&imei=9999`,
  );
  await expect(
    page.getByText("Ninguna unidad coincide con el filtro o la búsqueda."),
  ).toBeVisible();
  await expect(page.getByLabel("Buscar por IMEI o serie")).toHaveValue("9999");
  await expect(
    chips.getByRole("link", { name: /^Disponible/ }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("link", { name: "Restablecer" })).toBeVisible();

  // AC-13: reflujo a 320 px con desbordamiento cero.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/productos/${productId}/unidades`);
  await expect(
    lista.getByText("Mostrando 1 a 25 de 26 unidades"),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "desbordamiento a 320 px").toBeLessThanOrEqual(0);
});

// El panel y el motivo de la baja (brief-24.5.2, D-2, D-3, D-4 y D-10; AC-5, AC-7, AC-12 y AC-19).
// Es la razón de ser de la subfase: el motivo de una baja **desde en revisión** existía solo en la
// auditoría y ninguna pantalla lo leía.
test("el panel de la unidad muestra su historial y el motivo de las dos bajas", async ({
  page,
}) => {
  test.slow();
  const productId = await insertProduct("IP14-256", "iPhone 14 256 GB");
  await insertUnits(productId, [
    { serial: "356938035641111" },
    { serial: "356938035642222" },
  ]);
  // La segunda, recorrida de verdad hasta «en revisión».
  await db.execute(
    sql`update stock_units set status = 'in_repair' where serial = '356938035642222'`,
  );
  await db.execute(
    sql`update stock_units set status = 'in_review' where serial = '356938035642222'`,
  );

  await login(page, ADMIN_IPHONE.email);

  // La baja de una unidad **disponible**: su motivo queda en el movimiento de stock.
  await page.goto(`/productos/${productId}/unidades`);
  // Desde el 2026-11-01 las acciones de una fila viven dentro de «···» (MoreActions), para que la
  // tabla entre sin desplazamiento: hay que abrirlo antes de tocarlas.
  await page
    .getByRole("button", { name: `Más acciones de la unidad 356938035641111` })
    .click();
  await page.getByRole("link", { name: "Dar de baja 356938035641111" }).click();
  await page.getByLabel("Motivo *").fill("Pantalla rota en el traslado");
  await page.getByRole("button", { name: "Dar de baja" }).click();
  await expect(
    page.getByText("Unidad dada de baja: el stock bajó en 1."),
  ).toBeVisible();

  // La baja de la unidad **en revisión**: no es un movimiento, y su motivo queda solo en la
  // auditoría (U-2 de la 29.6.2).
  // Desde el 2026-11-01 las acciones de una fila viven dentro de «···» (MoreActions), para que la
  // tabla entre sin desplazamiento: hay que abrirlo antes de tocarlas.
  await page
    .getByRole("button", { name: `Más acciones de la unidad 356938035642222` })
    .click();
  await page.getByRole("link", { name: "Dar de baja 356938035642222" }).click();
  await page.getByLabel("Motivo *").fill("No tiene arreglo: se descarta");
  await page.getByRole("button", { name: "Dar de baja" }).click();
  await expect(
    page.getByText(
      "Unidad dada de baja. Estaba en revisión, fuera del stock: el stock no cambió.",
    ),
  ).toBeVisible();

  // AC-5: el panel se abre por la URL, con Detalle e Historial.
  await page.goto(`/productos/${productId}/unidades?estado=bajas`);
  await page
    .getByRole("link", { name: "356938035642222", exact: true })
    .click();
  await expect(page).toHaveURL(/\?estado=bajas&unidad=[0-9a-f-]+/);
  const panel = page.getByRole("region", { name: "Unidad", exact: true });
  await expect(panel.getByRole("link", { name: "Detalle" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(panel.getByText("Dada de baja")).toBeVisible();
  await expectAccessible(page, "panel de la unidad");

  // AC-7 y AC-19: el motivo de la baja desde «en revisión», que vive solo en la auditoría.
  await panel.getByRole("link", { name: "Historial" }).click();
  await expect(panel.getByText("No tiene arreglo: se descarta")).toBeVisible();
  await expect(
    panel.getByText("Cambio de estado", { exact: false }).first(),
  ).toBeVisible();
  await expectAccessible(page, "historial de la unidad");

  // Cerrar vuelve a la lista con el filtro intacto (D-2). La URL se afirma **hasta el final**: con
  // `/\?estado=bajas/` suelto, la aserción pasaba igual con el panel abierto, porque esa URL
  // también contiene `?estado=bajas`. Una aserción que no puede fallar no vigila nada.
  await panel.getByRole("link", { name: /^Cerrar/ }).click();
  await expect(page).toHaveURL(/\?estado=bajas(#.*)?$/);
  await expect(panel).toHaveCount(0);

  // AC-7, la otra mitad: el motivo de la baja de la unidad disponible, que vive en el movimiento.
  await page
    .getByRole("link", { name: "356938035641111", exact: true })
    .click();
  const otro = page.getByRole("region", { name: "Unidad", exact: true });
  // Se espera a que el panel sea **el de esta unidad** antes de tocar sus pestañas: sin esto, el
  // clic siguiente puede caer en el panel anterior, que todavía está en el DOM.
  await expect(otro).toContainText("356938035641111");
  await otro.getByRole("link", { name: "Historial" }).click();
  // **Dos veces, y es correcto**: la baja de una unidad disponible escribe el motivo en los dos
  // lugares —el movimiento de stock y la entrada de auditoría— porque son dos eventos distintos: el
  // efecto sobre el saldo y el cambio de estado (H-3). El historial muestra los dos, cada uno con su
  // tipo. Se afirma la cantidad en vez de usar `first()`: así, si alguna vez pasara a escribirse en
  // un solo lugar, esta prueba lo dice en lugar de seguir pasando.
  await expect(otro.getByText("Pantalla rota en el traslado")).toHaveCount(2);

  // AC-13 **dentro del panel**, que es la mitad que faltaba: el criterio pide reflujo a 320 px y
  // objetivos táctiles medidos «en la lista y en el panel», y el panel tiene sus propios `sr-only`
  // —el de «Cerrar»—, que son exactamente los que desbordaban la tabla (H-15). Medirlo acá, con el
  // panel abierto, es lo único que distingue «no desborda» de «no lo miramos».
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  const estrecho = page.getByRole("region", { name: "Unidad", exact: true });
  await expect(estrecho).toContainText("356938035641111");
  const desbordePanel = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(
    desbordePanel,
    "desbordamiento a 320 px con el panel abierto",
  ).toBeLessThanOrEqual(0);

  // Medidos del navegador, no inferidos de las clases: `min-h-11` es una promesa, `boundingBox` es
  // el hecho.
  for (const pestaña of ["Detalle", "Historial"]) {
    const caja = await estrecho
      .getByRole("link", { name: pestaña, exact: true })
      .boundingBox();
    expect(
      caja!.height,
      `alto de la pestaña ${pestaña} del panel`,
    ).toBeGreaterThanOrEqual(44);
  }
  const cerrar = await estrecho
    .getByRole("link", { name: /^Cerrar/ })
    .boundingBox();
  expect(cerrar!.height, "alto de Cerrar del panel").toBeGreaterThanOrEqual(44);
  expect(cerrar!.width, "ancho de Cerrar del panel").toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1280, height: 720 });

  // N-10: un `?unidad=` que no resuelve **lo dice**. El id es un uuid válido que no existe, así que
  // la lectura llega hasta la base y vuelve vacía; antes de este arreglo la pantalla se dibujaba
  // igual que sin el parámetro y no había forma de distinguir «no está» de «no pasó nada».
  await page.goto(
    `/productos/${productId}/unidades?unidad=00000000-0000-0000-0000-000000000000`,
  );
  await expect(
    page.getByText("No encontramos esa unidad entre las de este producto."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Unidad", exact: true }),
  ).toContainText("Volver a la lista");
  // Y la lista se sigue viendo: el aviso ocupa el lugar del panel, no el de la pantalla.
  await expect(
    page.getByRole("link", { name: "356938035641111", exact: true }),
  ).toBeVisible();

  // AC-12 y AC-19: un viewer ve los movimientos y **no** la auditoría, así que ve el motivo de la
  // baja de la unidad disponible y no el de la que estaba en revisión.
  await page.context().clearCookies();
  await login(page, VIEWER_IPHONE.email);
  await page.goto(`/productos/${productId}/unidades?estado=bajas`);
  await page
    .getByRole("link", { name: "356938035642222", exact: true })
    .click();
  const viewerPanel = page.getByRole("region", { name: "Unidad", exact: true });
  await expect(viewerPanel).toContainText("356938035642222");
  await viewerPanel.getByRole("link", { name: "Historial" }).click();
  await expect(
    viewerPanel.getByText(
      "Los cambios de estado de una unidad los ve un administrador.",
    ),
  ).toBeVisible();
  await expect(viewerPanel).not.toContainText("No tiene arreglo: se descarta");
  // Y nunca dice «sin eventos» cuando lo que pasa es que no ve una de las dos fuentes (I-2).
  await expect(viewerPanel).not.toContainText(
    "Esta unidad todavía no tiene eventos.",
  );
  await expect(viewerPanel).not.toContainText("Costo");
  await expectAccessible(page, "historial de la unidad para un viewer");
});

test.describe("la lista de unidades sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  // AC-1, AC-3 y AC-5 sin scripts: el filtro y el panel son enlaces, y la búsqueda un form GET.
  test("el filtro, la búsqueda y el panel funcionan con enlaces y un formulario GET", async ({
    page,
  }) => {
    const productId = await insertProduct("IP13-64", "iPhone 13 64 GB");
    await insertUnits(productId, [
      { serial: "356938035643333" },
      { serial: "356938035644444" },
    ]);
    await login(page, ADMIN_IPHONE.email);
    await page.goto(`/productos/${productId}/unidades`);

    await page
      .getByRole("navigation", { name: "Filtrar por estado" })
      .getByRole("link", { name: /^Disponible/ })
      .click();
    await expect(page).toHaveURL(/\?estado=disponibles$/);

    await page.getByLabel("Buscar por IMEI o serie").fill("4444");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/estado=disponibles/);
    await expect(page).toHaveURL(/imei=4444/);
    const lista = page.getByRole("region", { name: "Unidades" });
    await expect(
      lista.getByRole("link", { name: "356938035644444", exact: true }),
    ).toBeVisible();
    await expect(
      lista.getByRole("link", { name: "356938035643333", exact: true }),
    ).toHaveCount(0);

    await page
      .getByRole("link", { name: "356938035644444", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "Unidad", exact: true });
    await expect(panel).toContainText("356938035644444");
    await panel.getByRole("link", { name: "Historial" }).click();
    await expect(panel.getByText("Alta manual de una unidad")).toBeVisible();
  });
});

// El costo por unidad y su margen en la pantalla de costos (brief-24.5.2-b, lámina 13; AC-1 a
// AC-8, AC-13 y D-13). Vive acá y no en products.spec.ts porque las unidades con IMEI necesitan
// `serialized_units` y la tienda de ejemplo, que es lo que esta spec ya levanta.
//
// Los cuatro casos de la evidencia `producer-consumer` del brief van en una sola corrida: un
// producto por unidad, uno por cantidad, uno con margen negativo y uno con dos monedas. El cuarto
// reemplaza al «producto con una unidad sin costo» del brief original, que es un estado imposible:
// la columna es NOT NULL con CHECK (cost > 0) (D-12).
test("la pantalla de costos muestra el costo por unidad, su margen y las excluidas", async ({
  page,
}, testInfo) => {
  // Cuatro pantallas con axe en los dos temas, más la medición a 320 px.
  test.slow();

  // El producto por unidad. Precio 1099 USD, que es el que pone insertProduct.
  const porUnidad = await insertProduct("IP15-128", "iPhone 15 128 GB");
  await insertUnits(porUnidad, [
    { serial: "356938035650001", cost: "900" },
    { serial: "356938035650002", cost: "1000" },
    // Cuesta más que el precio: su fila tiene margen negativo (I-5).
    { serial: "356938035650003", cost: "1100" },
    // Con precio propio, que manda sobre el del producto (D-6).
    { serial: "356938035650004", cost: "1000", price: "1200" },
    // Fuera de la base, en «Otras existencias».
    { serial: "356938035650005", cost: "950" },
  ]);
  // El trigger de `stock_units` **no** permite available -> in_review: el camino legal pasa por la
  // reparación, que es como llega una unidad a revisión (brief-29.6.2). El atajo era el error, otra
  // vez: la base lo rechaza y hace bien.
  await db.execute(
    sql`update stock_units set status = 'in_repair' where serial = '356938035650005'`,
  );
  await db.execute(
    sql`update stock_units set status = 'in_review' where serial = '356938035650005'`,
  );
  // En revisión está **fuera** del stock (brief-29.6.2): el saldo que dejó el ayudante contaba las
  // cinco. La pantalla de costos no lee `inventories`, pero un fixture que miente se cree después.
  await db.execute(
    sql`update inventories set quantity_on_hand = 4 where product_id = ${porUnidad}`,
  );

  await login(page, ADMIN_IPHONE.email);
  await page.goto(`/productos/${porUnidad}/costos`);

  // AC-1 y AC-2: los cuatro números sobre las **disponibles**. Base 4 unidades, 4000 USD, promedio
  // 1000; contra el precio de 1099 da 99 USD y 9,0 %. La unidad en revisión no entra: si entrara,
  // el promedio sería 990 y el margen 9,9 %.
  const resumen = page.getByRole("region", {
    name: "Margen estimado sobre las disponibles",
  });
  await expect(resumen).toContainText("Base del cálculo: 4 unidades");
  await expect(resumen).toContainText(/Precio de venta\s*US\$\s1\.099,00/);
  await expect(resumen).toContainText(
    /Costo promedio de las disponibles\s*US\$\s1\.000,00/,
  );
  await expect(resumen).toContainText(/Ganancia bruta estimada\s*US\$\s99,00/);
  await expect(resumen).toContainText(/Margen bruto estimado\s*9,0 %/);
  // La tira de la fórmula, que es lo que vuelve auditable el porcentaje.
  await expect(resumen).toContainText(
    /\(US\$\s1\.099,00 − US\$\s1\.000,00\) ÷ US\$\s1\.099,00 × 100 = 9,0 %/,
  );
  await expect(resumen).toContainText(
    "Estimación antes de gastos e impuestos. No es ganancia neta.",
  );
  // El margen de la base es positivo: el aviso de I-5 **no** está acá.
  await expect(resumen).not.toContainText("El costo supera el precio.");

  // AC-3: la tabla por unidad, con el precio de referencia de cada una y su origen (D-6).
  const tabla = page.getByRole("region", { name: "Costo por unidad" });
  const fila = (serial: string) => tabla.getByRole("row", { name: serial });
  await expect(fila("356938035650001")).toContainText(/US\$\s900,00/);
  await expect(fila("356938035650001")).toContainText(
    /US\$\s1\.099,00 · del producto/,
  );
  await expect(fila("356938035650001")).toContainText(/US\$\s199,00/);
  await expect(fila("356938035650001")).toContainText("18,1 %");
  await expect(fila("356938035650004")).toContainText(
    /US\$\s1\.200,00 · propio/,
  );
  await expect(fila("356938035650004")).toContainText("16,7 %");
  // I-5 en la fila: importe, texto e icono, comprobados sin mirar el color. El texto es un
  // `sr-only`, que es justo lo que un lector de pantalla recibe y el signo menos solo no dice.
  await expect(fila("356938035650003")).toContainText(/−US\$\s1,00/);
  await expect(fila("356938035650003")).toContainText("−0,1 %");
  await expect(fila("356938035650003")).toContainText(
    "El costo supera el precio.",
  );
  await expect(
    fila("356938035650003").locator("svg[aria-hidden='true']"),
  ).not.toHaveCount(0);
  // La unidad en revisión no está en esta tabla.
  await expect(fila("356938035650005")).toHaveCount(0);

  // AC-4 e I-7: el subtotal llega agregado de SQL sobre **todas** las disponibles, y con cinco
  // filas el tope de 25 no recortó nada, así que el aviso de tope no se dibuja.
  await expect(tabla).toContainText(
    /Base: 4 disponibles · Costo total US\$\s4\.000,00/,
  );
  await expect(tabla).not.toContainText("Se muestran");

  // AC-6: las reservadas y en revisión existen, tienen costo y están afuera del cálculo.
  const otras = page.getByRole("region", { name: "Otras existencias" });
  await expect(otras).toContainText("Excluidas del cálculo.");
  await expect(otras).toContainText("356938035650005");
  await expect(otras).toContainText(/En revisión: 1 · US\$\s950,00/);
  await expectAccessible(page, "costos por unidad");

  // La lámina 13 en el ancho de la lámina, para la comparación visual de AC-15. Queda adjunta a la
  // corrida, no versionada: el acuerdo del proyecto es declarar las diferencias, no fijar un PNG.
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.reload();
  await expect(resumen).toContainText("Base del cálculo: 4 unidades");
  const capturaAncha = testInfo.outputPath("costos-por-unidad-1440.png");
  await page.screenshot({
    path: capturaAncha,
    fullPage: true,
  });
  await testInfo.attach("costos-por-unidad-1440.png", {
    path: capturaAncha,
    contentType: "image/png",
  });

  // AC-13: reflujo a 320 px con desbordamiento cero medido contra documentElement, y los objetivos
  // táctiles de la pantalla medidos del navegador. Las secciones nuevas no agregan controles: lo
  // que hay para medir son las pestañas del producto, que es por donde se llega.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  await expect(tabla).toContainText(
    /Base: 4 disponibles · Costo total US\$\s4\.000,00/,
  );
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(desborde, "desbordamiento a 320 px en costos").toBeLessThanOrEqual(0);
  const pestañas = page.getByRole("navigation", {
    name: "Secciones del producto",
  });
  for (const nombre of ["Unidades", "Costos"]) {
    const caja = await pestañas
      .getByRole("link", { name: nombre, exact: true })
      .boundingBox();
    expect(
      caja!.height,
      `alto de la pestaña ${nombre} a 320 px`,
    ).toBeGreaterThanOrEqual(44);
  }
  const capturaAngosta = testInfo.outputPath("costos-por-unidad-320.png");
  await page.screenshot({
    path: capturaAngosta,
    fullPage: true,
  });
  await testInfo.attach("costos-por-unidad-320.png", {
    path: capturaAngosta,
    contentType: "image/png",
  });
  await expectAccessible(page, "costos por unidad a 320 px");
  await page.setViewportSize({ width: 1280, height: 720 });

  // AC-8: un producto **por cantidad** no tiene ninguna de las tres secciones. No es una tabla
  // vacía: una tabla vacía afirmaría que no tiene unidades, y este producto no las lleva.
  const porCantidad = await insertProduct("CARG-20W", "Cargador 20 W");
  await page.goto(`/productos/${porCantidad}/costos`);
  await expect(
    page.getByRole("region", { name: "Costo y margen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Margen estimado sobre las disponibles" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Costo por unidad" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Otras existencias" }),
  ).toHaveCount(0);
  // Y tampoco se cuela el aviso de que no se pudo leer: no hay nada que leer (I-2).
  await expect(page.getByText("No disponible: no pudimos leer")).toHaveCount(0);

  // I-5 sobre la base: el promedio de las disponibles supera al precio.
  const enPerdida = await insertProduct("IP15-512", "iPhone 15 512 GB");
  await insertUnits(enPerdida, [{ serial: "356938035650011", cost: "1500" }]);
  await page.goto(`/productos/${enPerdida}/costos`);
  const perdida = page.getByRole("region", {
    name: "Margen estimado sobre las disponibles",
  });
  await expect(perdida).toContainText("Base del cálculo: 1 unidad disponible");
  await expect(perdida).toContainText(/−US\$\s401,00/);
  await expect(perdida).toContainText("−36,5 %");
  await expect(perdida).toContainText("El costo supera el precio.");
  await expectAccessible(page, "costos con margen negativo");

  // D-13: con el costo en dos monedas no hay promedio ni margen, y el subtotal va por moneda. Un
  // promedio entre dólares y pesos sería un número inventado.
  const dosMonedas = await insertProduct("IP14-128", "iPhone 14 128 GB");
  await insertUnits(dosMonedas, [
    { serial: "356938035650021", cost: "900" },
    { serial: "356938035650022", cost: "500000", currency: "ARS" },
  ]);
  await page.goto(`/productos/${dosMonedas}/costos`);
  const mezcla = page.getByRole("region", {
    name: "Margen estimado sobre las disponibles",
  });
  await expect(mezcla).toContainText(
    "Las unidades disponibles tienen el costo en más de una moneda",
  );
  await expect(mezcla).not.toContainText("Margen bruto estimado");
  const tablaMezcla = page.getByRole("region", { name: "Costo por unidad" });
  await expect(tablaMezcla).toContainText(
    /Base: 1 disponible · Costo total US\$\s900,00/,
  );
  await expect(tablaMezcla).toContainText(
    /Base: 1 disponible · Costo total \$\s500\.000,00/,
  );
  await expectAccessible(page, "costos con dos monedas");

  // AC-9, la otra mitad: lo que importa no es que la pantalla no dibuje el costo, sino que ningún
  // costo por unidad **llegue al documento** que recibe el navegador. La frontera la hace el
  // servicio por su cuenta (`getProductUnitCosts` autoriza antes de leer) y la página corta todavía
  // antes, pero eso se afirma mirando el HTML, no la intención. Hasta acá, la única prueba de un
  // viewer en /costos era la de la 18.2, sobre un producto **por cantidad**: no cubría nada de esto
  // (NB-4 de la revisión independiente).
  await page.context().clearCookies();
  await login(page, VIEWER_IPHONE.email);
  await page.goto(`/productos/${porUnidad}/costos`);
  await expect(
    page.getByText("No tenés permiso para ver esta página."),
  ).toBeVisible();
  const documento = page.locator("body");
  // Los cuatro costos de las disponibles, el promedio, el total y el de la unidad en revisión.
  for (const importe of [
    "900,00",
    "1.000,00",
    "1.100,00",
    "1.200,00",
    "4.000,00",
    "950,00",
  ]) {
    await expect(documento, `el viewer no recibe ${importe}`).not.toContainText(
      importe,
    );
  }
  await expect(documento).not.toContainText("Costo por unidad");
  await expect(documento).not.toContainText("Otras existencias");
});
