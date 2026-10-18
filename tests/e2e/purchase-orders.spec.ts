import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Las pantallas de la orden de compra de punta a punta (brief-22.3, AC-8): Chromium, next start,
// Server Actions, purchasing, catalog, numbering, audit y PostgreSQL real, sin mocks. Un admin crea
// una orden de dos líneas con el teclado y ve los rechazos de un costo inválido y de un producto
// repetido; la ve en la lista, la filtra y la busca; ve el detalle imprimible con la leyenda; la
// cancela con la confirmación y ve su historia; la ve en la ficha del proveedor. Sin JavaScript, el
// alta también funciona. Un viewer no ve «Compras» y recibe el aviso. El mensaje nuevo del CUIT lo
// prueba suppliers.spec.ts. Desde la 22.4 (brief-22.4, AC-9): el cierre a mano de una orden con
// recepciones y la cancelación rechazada; la recepción la prueba goods-receipts.spec.ts.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";
const LEGEND = "Documento no válido como factura";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// purchase_order_lines y audit_logs son de solo inserción, y purchase_orders y document_counters no
// se borran: TRUNCATE es la vía documentada para vaciarlas (ADR 0013). El contador se vacía para que
// cada caso empiece en OC-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters,
          audit_logs, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_lines,
          sales, order_lines, orders, inventory_movements, inventories, product_images,
          product_costs, product_prices, attribute_values, products`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  await seedBasic(db, E2E_PASSWORD);
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
}

// Cada estado se analiza en claro y en oscuro (brief-4.0, D-6); la vista de impresión también.
async function expectAccessible(
  page: Page,
  state: string,
  media: "screen" | "print" = "screen",
) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ media, colorScheme });
    await expect(page).toHaveTitle(/.+/);
    expect(
      await axeViolations(page),
      `violaciones de axe en "${state}" (${media}, ${colorScheme})`,
    ).toEqual([]);
  }
  await page.emulateMedia({ media: null, colorScheme: null });
}

async function insertSupplier(
  name: string,
  values: { cuit?: string; email?: string; phone?: string } = {},
): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name, cuit, email, phone_e164)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${values.cuit ?? null},
                ${values.email ?? null}, ${values.phone ?? null})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertProduct(sku: string, name: string): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${sku}, ${name}) returning id`,
  );
  return result.rows[0]!.id;
}

// Una orden abierta por SQL, con una línea, como la deja el alta; cancelled la pasa después, porque
// el trigger exige que nazca abierta.
async function insertOrder(
  number: number,
  supplierId: string,
  productId: string,
  cancelled = false,
): Promise<string> {
  const order = await db.execute<{ id: string }>(
    sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                     created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${supplierId}, 'ARS', '100.00',
                ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  await db.execute(
    sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                          position, quantity, unit_cost, line_total)
        values (${SEED_ORGANIZATION_ID}, ${orderId}, ${productId}, 1, 1, '100.00', '100.00')`,
  );
  if (cancelled) {
    await db.execute(
      sql`update purchase_orders set status = 'cancelled', cancelled_at = now()
          where id = ${orderId}`,
    );
  }
  return orderId;
}

const line = (page: Page, position: number) =>
  page.getByRole("group", { name: `Línea ${position}`, exact: true });

// Elige una opción de un buscador del alta con el teclado: escribe, espera la lista, baja a la
// primera opción y la elige con Enter, como en orders.spec.ts.
async function pick(scope: Locator | Page, label: string, text: string) {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(text);
  await expect(scope.getByRole("option").first()).toBeVisible();
  await field.press("ArrowDown");
  await field.press("Enter");
}

async function orderCount(): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from purchase_orders`,
  );
  return result.rows[0]!.count;
}

test("un admin crea una orden de dos líneas, ve los rechazos, la imprime y la cancela", async ({
  page,
}) => {
  // Recorre el ciclo entero, con axe en claro y en oscuro en cada estado.
  test.slow();
  const supplierId = await insertSupplier("Importaciones Sur", {
    cuit: "20123456786",
    email: "ventas@sur.com",
    phone: "+5491155551234",
  });
  await insertProduct("CAF-250", "Café molido");
  await insertProduct("TE-100", "Té verde");
  await login(page, ADMIN);

  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("link", { name: "Compras" }).click();
  await expect(page).toHaveURL("/compras/ordenes");
  await expect(
    page
      .getByRole("navigation", { name: "Secciones de compras" })
      .getByRole("link", { name: "Órdenes de compra" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByText("Todavía no hay órdenes de compra."),
  ).toBeVisible();
  await expectAccessible(page, "lista vacía");

  await page.getByRole("link", { name: "+ Nueva orden de compra" }).click();
  await expect(page).toHaveURL("/compras/ordenes/nueva");
  // La moneda no viene elegida (D-5).
  await expect(page.getByLabel("Moneda", { exact: true })).toHaveValue("");
  await expectAccessible(page, "alta vacía");

  await pick(page, "Proveedor", "Import");
  await expect(page.getByLabel("Proveedor", { exact: true })).toHaveValue(
    "Importaciones Sur",
  );
  await page.getByLabel("Moneda", { exact: true }).selectOption("ARS");
  await pick(line(page, 1), "Producto", "Café");
  await expect(line(page, 1).getByLabel("Producto")).toHaveValue(
    "Café molido (CAF-250)",
  );
  await line(page, 1).getByLabel("Cantidad").fill("2");
  await line(page, 1).getByLabel("Costo unitario").fill("1500,50");
  await expect(line(page, 1)).toContainText(
    "Total estimado de la línea: $ 3.001,00",
  );
  // Un costo con más decimales de los que tiene la moneda.
  await pick(line(page, 2), "Producto", "Té");
  await line(page, 2).getByLabel("Cantidad").fill("1,5");
  await line(page, 2).getByLabel("Costo unitario").fill("0,999");
  await page.getByRole("button", { name: "Crear orden de compra" }).click();
  // El anunciador de rutas de Next.js también es un alert: el mensaje se busca por su texto.
  await expect(page.getByText("Revisá las líneas marcadas.")).toBeFocused();
  await expect(line(page, 2)).toContainText(
    "Escribí el costo con hasta 2 decimales, en ARS.",
  );
  await expect(line(page, 2).getByLabel("Costo unitario")).toHaveValue("0,999");
  await expectAccessible(page, "alta con el costo rechazado");

  // Un producto repetido.
  await pick(line(page, 2), "Producto", "Café");
  await line(page, 2).getByLabel("Costo unitario").fill("0,99");
  await page.getByRole("button", { name: "Crear orden de compra" }).click();
  await expect(line(page, 2)).toContainText(
    "El producto ya está en otra línea: sumá la cantidad ahí.",
  );
  expect(await orderCount()).toBe(0);

  await pick(line(page, 2), "Producto", "Té");
  await expect(page.getByText("Total estimado: $ 3.002,49")).toBeVisible();
  await expectAccessible(page, "alta con dos líneas");
  await page.getByRole("button", { name: "Crear orden de compra" }).click();
  await expect(page).toHaveURL(
    /\/compras\/ordenes\/[0-9a-f-]{36}\?aviso=creada$/,
  );
  await expect(page.getByText("Orden de compra creada.")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Orden de compra OC-000001" }),
  ).toBeVisible();
  const lines = page.getByRole("table", {
    name: "Líneas de la orden de compra OC-000001",
  });
  await expect(lines).toContainText("Café molido");
  await expect(lines).toContainText("$ 3.001,00");
  await expect(lines).toContainText("$ 1,49");
  await expect(lines).toContainText("$ 3.002,49");
  await expectAccessible(page, "detalle abierta");

  // La vista de impresión: solo la orden, con el proveedor y la leyenda.
  await page.emulateMedia({ media: "print" });
  const document = page.locator("[data-comprobante]");
  await expect(document).toBeVisible();
  for (const text of [
    "OC-000001",
    "Importaciones Sur",
    "20-12345678-6",
    "ventas@sur.com",
    LEGEND,
  ]) {
    await expect(document).toContainText(text);
  }
  for (const hidden of [
    nav,
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
    page.getByRole("link", { name: "Cancelar la orden" }),
    page.getByRole("table", {
      name: "Historia de la orden de compra OC-000001",
    }),
    page.getByText("Orden de compra creada."),
  ]) {
    await expect(hidden).toBeHidden();
  }
  await page.emulateMedia({ media: null });
  await expectAccessible(page, "vista de impresión", "print");

  // La cancelación, con su confirmación.
  await page.getByRole("link", { name: "Cancelar la orden" }).click();
  await expect(page).toHaveURL(/\?confirmar=cancelar$/);
  await expect(
    page.getByText("¿Cancelar la orden de compra OC-000001?"),
  ).toBeFocused();
  await expectAccessible(page, "confirmación de la cancelación");
  await page.getByRole("button", { name: "Sí, cancelar la orden" }).click();
  await expect(page).toHaveURL(/\?aviso=cancelada$/);
  await expect(page.getByText("Orden de compra cancelada.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Cancelar la orden" }),
  ).toHaveCount(0);
  const history = page.getByRole("table", {
    name: "Historia de la orden de compra OC-000001",
  });
  await expect(history).toContainText("Alta");
  await expect(history).toContainText("Orden OC-000001 · 2 líneas");
  await expect(history).toContainText("Cancelación");
  await expect(history).toContainText("Abierta → Cancelada");
  await expectAccessible(page, "detalle cancelada");

  // En la ficha del proveedor.
  await page.goto(`/compras/proveedores/${supplierId}`);
  const card = page.getByRole("region", { name: "Órdenes de compra" });
  await expect(card.getByRole("link", { name: "OC-000001" })).toBeVisible();
  await expect(card).toContainText("Cancelada");
  await expectAccessible(page, "ficha del proveedor con órdenes");
});

test("un admin filtra la lista por estado y por proveedor, busca por número y crea desde la ficha", async ({
  page,
}) => {
  const south = await insertSupplier("Importaciones Sur");
  const north = await insertSupplier("Distribuidora Norte");
  const coffee = await insertProduct("CAF-250", "Café molido");
  await insertOrder(1, south, coffee);
  await insertOrder(2, north, coffee, true);
  await insertOrder(3, south, coffee);
  await login(page, ADMIN);

  await page.goto("/compras/ordenes");
  const table = page.getByRole("table", {
    name: "Órdenes de compra de la organización",
  });
  for (const number of ["OC-000001", "OC-000002", "OC-000003"]) {
    await expect(table.getByRole("link", { name: number })).toBeVisible();
  }
  await expectAccessible(page, "lista");

  await page.getByLabel("Estado").selectOption("canceladas");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL("/compras/ordenes?numero=&estado=canceladas");
  await expect(table.getByRole("link", { name: "OC-000002" })).toBeVisible();
  await expect(table.getByRole("link", { name: "OC-000001" })).toHaveCount(0);

  await page.goto("/compras/ordenes");
  await page.getByLabel("Número").fill("oc3");
  await page.getByLabel("Número").press("Enter");
  await expect(table.getByRole("link", { name: "OC-000003" })).toBeVisible();
  await expect(table.getByRole("link", { name: "OC-000001" })).toHaveCount(0);
  await page.getByLabel("Número").fill("P-000003");
  await page.getByLabel("Número").press("Enter");
  await expect(
    page.getByText("Ninguna orden de compra coincide con estos filtros."),
  ).toBeVisible();

  // El proveedor de una fila filtra la lista por él.
  await page.goto("/compras/ordenes");
  await table
    .getByRole("link", { name: /^Importaciones Sur\s*: ver solo sus órdenes$/ })
    .first()
    .click();
  await expect(page).toHaveURL(`/compras/ordenes?proveedor=${south}`);
  await expect(page.getByText("Órdenes de Importaciones Sur.")).toBeVisible();
  await expect(table.getByRole("link", { name: "OC-000002" })).toHaveCount(0);
  await expect(table.getByRole("link", { name: "OC-000003" })).toBeVisible();
  await expectAccessible(page, "lista filtrada por proveedor");

  // Desde la ficha, el alta llega con el proveedor ya elegido.
  await page.goto(`/compras/proveedores/${south}`);
  const card = page.getByRole("region", { name: "Órdenes de compra" });
  await expect(card.getByRole("link", { name: "OC-000003" })).toBeVisible();
  await card
    .getByRole("link", { name: "Ver las 2 órdenes de este proveedor" })
    .click();
  await expect(page).toHaveURL(`/compras/ordenes?proveedor=${south}`);
  await page.goto(`/compras/proveedores/${south}`);
  await card.getByRole("link", { name: "Nueva orden de compra" }).click();
  await expect(page).toHaveURL(`/compras/ordenes/nueva?proveedor=${south}`);
  await expect(page.getByLabel("Proveedor", { exact: true })).toHaveValue(
    "Importaciones Sur",
  );
});

test("un viewer no ve Compras y las páginas de órdenes muestran el permiso sin datos", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const orderId = await insertOrder(1, supplierId, coffee);
  await login(page, VIEWER);
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Compras" })).toHaveCount(0);

  for (const path of [
    "/compras",
    "/compras/ordenes",
    "/compras/ordenes/nueva",
    `/compras/ordenes/${orderId}`,
  ]) {
    await page.goto(path);
    await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
    await expect(page.getByText("OC-000001")).toHaveCount(0);
    await expect(page.getByText("Importaciones Sur")).toHaveCount(0);
  }
  await expectAccessible(page, "permiso de viewer");
});

// Una recepción por SQL de la primera línea de una orden, como la deja el alta (brief-22.4).
async function insertReceipt(
  number: number,
  orderId: string,
  supplierId: string,
): Promise<void> {
  const receipt = await db.execute<{ id: string }>(
    sql`insert into goods_receipts (organization_id, number, supplier_id, purchase_order_id,
                                    currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${supplierId}, ${orderId}, 'ARS',
                '100.00', ${ADMIN_SEED.id})
        returning id`,
  );
  await db.execute(
    sql`insert into goods_receipt_lines (organization_id, goods_receipt_id,
                                         purchase_order_line_id, product_id, position,
                                         quantity, unit_cost, line_total)
        select ${SEED_ORGANIZATION_ID}, ${receipt.rows[0]!.id}, id, product_id, 1, 1,
               '100.00', '100.00'
        from purchase_order_lines where purchase_order_id = ${orderId} and position = 1`,
  );
}

// brief-22.4, D-9 y D-11: una orden con recepciones y faltante se cierra a mano y no se cancela.
test("un admin cierra con faltante una orden con recepciones, que no se cancela", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const tea = await insertProduct("TE-100", "Té verde");
  const orderId = await insertOrder(1, supplierId, coffee);
  await db.execute(
    sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                          position, quantity, unit_cost, line_total)
        values (${SEED_ORGANIZATION_ID}, ${orderId}, ${tea}, 2, 3, '10.00', '30.00')`,
  );
  await insertReceipt(1, orderId, supplierId);
  await login(page, ADMIN);

  await page.goto(`/compras/ordenes/${orderId}`);
  const lines = page.getByRole("table", {
    name: "Líneas de la orden de compra OC-000001",
  });
  await expect(
    lines.getByRole("columnheader", { name: "Recibido" }),
  ).toBeVisible();
  await expect(
    lines.getByRole("columnheader", { name: "Falta" }),
  ).toBeVisible();
  const receipts = page.getByRole("region", { name: "Recepciones" });
  await expect(receipts.getByRole("link", { name: "RC-000001" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Cancelar la orden" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Registrar recepción" }),
  ).toHaveAttribute("href", `/compras/recepciones/nueva?orden=${orderId}`);
  await expectAccessible(page, "detalle con recepciones");

  await page.getByRole("link", { name: "Cerrar con faltante" }).click();
  await expect(page).toHaveURL(/\?confirmar=cerrar$/);
  await expect(
    page.getByText("¿Cerrar la orden de compra OC-000001 con faltante?"),
  ).toBeFocused();
  await expectAccessible(page, "confirmación del cierre");
  await page.getByRole("button", { name: "Sí, cerrar con faltante" }).click();
  await expect(page).toHaveURL(/\?aviso=cerrada$/);
  await expect(
    page.getByText("Orden de compra cerrada con faltante."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Registrar recepción" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Cerrar con faltante" }),
  ).toHaveCount(0);
  const history = page.getByRole("table", {
    name: "Historia de la orden de compra OC-000001",
  });
  await expect(history).toContainText("Cierre a mano");
  await expect(history).toContainText("Abierta → Cerrada");
  await expectAccessible(page, "detalle cerrada con faltante");
});

// brief-22.4, D-9: la confirmación de la cancelación estaba abierta cuando llegó una recepción.
test("la cancelación de una orden que recibió mercadería mientras se confirmaba se rechaza", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const orderId = await insertOrder(1, supplierId, coffee);
  await login(page, ADMIN);

  await page.goto(`/compras/ordenes/${orderId}?confirmar=cancelar`);
  await expect(
    page.getByText("¿Cancelar la orden de compra OC-000001?"),
  ).toBeFocused();
  await insertReceipt(1, orderId, supplierId);
  await page.getByRole("button", { name: "Sí, cancelar la orden" }).click();
  await expect(
    page.getByText(
      "La orden ya recibió mercadería: no se puede cancelar. Cerrala con faltante.",
    ),
  ).toBeFocused();
  const status = await db.execute<{ status: string }>(
    sql`select status from purchase_orders where id = ${orderId}`,
  );
  expect(status.rows[0]!.status).toBe("open");
  await expectAccessible(page, "cancelación rechazada");
});

// Sin JavaScript (AC-8): el alta es un formulario común; el proveedor se reconoce por su nombre
// exacto y el producto por su SKU, y el servidor devuelve el rechazo con lo escrito.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin crea una orden con el nombre del proveedor y el SKU del producto", async ({
    page,
  }) => {
    await insertSupplier("Importaciones Sur");
    await insertProduct("CAF-250", "Café molido");
    await login(page, ADMIN);
    await page.goto("/compras/ordenes/nueva");

    await page
      .getByLabel("Proveedor", { exact: true })
      .fill("importaciones sur");
    await page.getByLabel("Moneda", { exact: true }).selectOption("ARS");
    await line(page, 1).getByLabel("Producto").fill("caf-250");
    await line(page, 1).getByLabel("Cantidad").fill("2");
    await line(page, 1).getByLabel("Costo unitario").fill("0");
    await page.getByRole("button", { name: "Crear orden de compra" }).click();
    await expect(line(page, 1)).toContainText(
      "Escribí un costo mayor que cero.",
    );
    await expect(line(page, 1).getByLabel("Cantidad")).toHaveValue("2");

    await line(page, 1).getByLabel("Costo unitario").fill("1000");
    await page.getByRole("button", { name: "Crear orden de compra" }).click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Orden de compra OC-000001",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", {
        name: "Líneas de la orden de compra OC-000001",
      }),
    ).toContainText("$ 2.000,00");
  });
});
