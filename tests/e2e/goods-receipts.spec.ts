import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Las pantallas de la recepción de punta a punta (brief-22.4, AC-9): Chromium, next start, Server
// Actions, purchasing, inventory, catalog, numbering, audit y PostgreSQL real, sin mocks. Un admin
// recibe parte de una orden con la advertencia de moneda, ve lo que falta, ve el rechazo de recibir
// de más, recibe el resto y ve la orden cerrada; registra una recepción sin orden con la referencia
// del proveedor; ve el detalle con la leyenda y la vista de impresión, el movimiento en el producto
// y el origen del costo en su historia. Un viewer ve el movimiento sin costo y recibe el aviso en
// Compras. Sin JavaScript, el alta también funciona. El cierre a mano y la cancelación rechazada los
// prueba purchase-orders.spec.ts.

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

// Las tablas de solo inserción y las que no se borran se vacían con TRUNCATE (ADR 0013). El contador
// se vacía para que cada caso empiece en OC-000001 y RC-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table goods_receipt_voids, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders,
          suppliers, document_counters, audit_logs, refund_voids, refunds, receipt_voids, receipts,
          sale_voids, sale_lines, sales, order_lines, orders, inventory_movements, inventories,
          product_images, product_costs, product_prices, products`,
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
  values: { cuit?: string } = {},
): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name, cuit)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${values.cuit ?? null})
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

async function insertPrice(
  productId: string,
  amount: string,
  currency: string,
) {
  await db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${amount}, ${currency}, ${ADMIN_SEED.id})`,
  );
}

async function insertCost(productId: string, amount: string) {
  await db.execute(
    sql`insert into product_costs (organization_id, product_id, amount, currency, created_by)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${amount}, 'ARS', ${ADMIN_SEED.id})`,
  );
}

// Una orden abierta en ARS por SQL, como la deja el alta: café × 10 a 100 y té × 4 a 50.
async function insertOrder(
  supplierId: string,
  coffee: string,
  tea: string,
): Promise<string> {
  const order = await db.execute<{ id: string }>(
    sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                     created_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${supplierId}, 'ARS', '1200.00', ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  await db.execute(
    sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                          position, quantity, unit_cost, line_total)
        values (${SEED_ORGANIZATION_ID}, ${orderId}, ${coffee}, 1, 10, '100.00', '1000.00'),
               (${SEED_ORGANIZATION_ID}, ${orderId}, ${tea}, 2, 4, '50.00', '200.00')`,
  );
  return orderId;
}

const line = (page: Page, position: number) =>
  page.getByRole("group", { name: `Línea ${position}`, exact: true });

// Elige una opción de un buscador con el teclado, como en purchase-orders.spec.ts.
async function pick(scope: Locator | Page, label: string, text: string) {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(text);
  await expect(scope.getByRole("option").first()).toBeVisible();
  await field.press("ArrowDown");
  await field.press("Enter");
}

async function receiptCount(): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from goods_receipts`,
  );
  return result.rows[0]!.count;
}

test("un admin recibe una orden en dos recepciones, ve el rechazo de recibir de más y la orden se cierra sola", async ({
  page,
}) => {
  // Recorre el ciclo entero, con axe en claro y en oscuro en cada estado.
  test.slow();
  const supplierId = await insertSupplier("Importaciones Sur", {
    cuit: "20123456786",
  });
  const coffee = await insertProduct("CAF-250", "Café molido");
  const tea = await insertProduct("TE-100", "Té verde");
  // El café se vende en USD: la recepción en ARS lo advierte (D-7).
  await insertPrice(coffee, "15.00", "USD");
  await insertCost(coffee, "90.00");
  const orderId = await insertOrder(supplierId, coffee, tea);
  await login(page, ADMIN);

  await page.goto(`/compras/ordenes/${orderId}`);
  await page.getByRole("link", { name: "Registrar recepción" }).click();
  await expect(page).toHaveURL(`/compras/recepciones/nueva?orden=${orderId}`);
  // Las filas arrancan en lo que falta y en el costo esperado.
  await expect(line(page, 1)).toContainText("Café molido (CAF-250)");
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveValue("10");
  await expect(line(page, 1).getByLabel("Costo unitario")).toHaveValue(
    "100,00",
  );
  await expect(line(page, 1)).toContainText(
    "Este producto se vende en USD: con este costo queda sin margen.",
  );
  await expect(line(page, 2)).not.toContainText("Este producto se vende");
  await expectAccessible(page, "alta con orden");

  await line(page, 1).getByLabel("Cantidad").fill("6");
  await line(page, 1).getByLabel("Costo unitario").fill("110");
  await line(page, 2).getByLabel("Cantidad").fill("0");
  await page
    .getByLabel("Remito o factura del proveedor")
    .fill("R 0001-00012345");
  await expect(page.getByText("Total estimado: $ 660,00")).toBeVisible();
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page).toHaveURL(
    /\/compras\/recepciones\/[0-9a-f-]{36}\?aviso=creada$/,
  );
  await expect(
    page.getByText(
      "Recepción registrada: el stock y el costo ya están actualizados.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Recepción RC-000001" }),
  ).toBeVisible();
  const document = page.locator("[data-comprobante]");
  for (const text of [
    "Importaciones Sur",
    "20-12345678-6",
    "OC-000001",
    "R 0001-00012345",
    "$ 660,00",
    LEGEND,
  ]) {
    await expect(document).toContainText(text);
  }
  await expect(
    page.getByRole("table", { name: "Historia de la recepción RC-000001" }),
  ).toContainText("Recepción RC-000001 · de la orden OC-000001 · 1 línea");
  await expectAccessible(page, "detalle de la recepción");

  // La vista de impresión: solo el comprobante.
  await page.emulateMedia({ media: "print" });
  await expect(document).toBeVisible();
  for (const hidden of [
    page.getByRole("navigation", { name: "Principal" }),
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
    page.getByRole("table", { name: "Historia de la recepción RC-000001" }),
  ]) {
    await expect(hidden).toBeHidden();
  }
  await page.emulateMedia({ media: null });
  await expectAccessible(page, "vista de impresión", "print");

  // En la orden: lo recibido, lo que falta y la recepción.
  await page.goto(`/compras/ordenes/${orderId}`);
  const coffeeRow = page
    .getByRole("table", { name: "Líneas de la orden de compra OC-000001" })
    .getByRole("row")
    .filter({ hasText: "Café molido" });
  await expect(coffeeRow).toContainText("6");
  await expect(coffeeRow).toContainText("4");
  await expect(
    page
      .getByRole("region", { name: "Recepciones" })
      .getByRole("link", { name: "RC-000001" }),
  ).toBeVisible();

  // Recibir de más se rechaza en la línea, sin escribir.
  await page.getByRole("link", { name: "Registrar recepción" }).click();
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveValue("4");
  await line(page, 1).getByLabel("Cantidad").fill("5");
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page.getByText("Revisá las líneas marcadas.")).toBeFocused();
  await expect(line(page, 1)).toContainText(
    "Falta recibir 4: no se puede recibir más que eso con esta orden.",
  );
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveValue("5");
  await expectAccessible(page, "alta con el faltante superado");
  expect(await receiptCount()).toBe(1);

  // El resto: la orden queda completa y se cierra sola.
  await line(page, 1).getByLabel("Cantidad").fill("4");
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page).toHaveURL(/\?aviso=orden-cerrada$/);
  await expect(
    page.getByText(/Con ella la orden quedó completa y se cerró\.$/),
  ).toBeVisible();
  await page.goto(`/compras/ordenes/${orderId}`);
  await expect(
    page.getByText("Cerrada", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Registrar recepción" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("table", {
      name: "Historia de la orden de compra OC-000001",
    }),
  ).toContainText("Cierre por la recepción RC-000002");
  await expectAccessible(page, "orden cerrada por la recepción");

  // En el producto: el movimiento y el costo con su origen.
  await page.goto(`/productos/${coffee}/movimientos?tipo=recepcion`);
  const movement = page
    .getByRole("table", { name: "Movimientos de Café molido" })
    .getByRole("row")
    .filter({ hasText: "Recepción RC-000001" });
  await expect(movement).toHaveCount(1);
  await expect(movement).toContainText("+ 6");
  await expect(movement).not.toContainText("Importaciones Sur");
  await expect(page.getByLabel("Tipo")).toHaveValue("recepcion");
  await expectAccessible(page, "historial con la recepción");
  await page.goto(`/productos/${coffee}`);
  await expect(
    page.getByRole("table", { name: "Auditoría de Café molido" }),
  ).toContainText("Costo: $ 90,00 → $ 110,00 · por la recepción RC-000001");

  // La lista y la ficha del proveedor.
  await page.goto("/compras/recepciones");
  const table = page.getByRole("table", {
    name: "Recepciones de la organización",
  });
  await expect(table.getByRole("link", { name: "RC-000001" })).toBeVisible();
  await expect(table.getByRole("link", { name: "RC-000002" })).toBeVisible();
  await expectAccessible(page, "lista de recepciones");
  await page.goto(`/compras/proveedores/${supplierId}`);
  const card = page.getByRole("region", { name: "Recepciones" });
  await expect(card.getByRole("link", { name: "RC-000002" })).toBeVisible();
  await card
    .getByRole("link", { name: "Ver las 2 recepciones de este proveedor" })
    .click();
  await expect(page).toHaveURL(`/compras/recepciones?proveedor=${supplierId}`);
});

test("un admin registra una recepción sin orden con la referencia del remito y la busca", async ({
  page,
}) => {
  await insertSupplier("Distribuidora Norte");
  await insertProduct("CAF-250", "Café molido");
  await login(page, ADMIN);

  await page.goto("/compras/recepciones");
  await expect(
    page
      .getByRole("navigation", { name: "Secciones de compras" })
      .getByRole("link", { name: "Recepciones" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Todavía no hay recepciones.")).toBeVisible();
  await expectAccessible(page, "lista vacía");

  await page.getByRole("link", { name: "+ Nueva recepción" }).click();
  await expect(page).toHaveURL("/compras/recepciones/nueva");
  await expectAccessible(page, "alta sin orden vacía");
  await pick(page, "Proveedor", "Norte");
  await page.getByLabel("Moneda", { exact: true }).selectOption("ARS");
  await page.getByLabel("Remito o factura del proveedor").fill("R#1");
  await pick(line(page, 1), "Producto", "Café");
  await line(page, 1).getByLabel("Cantidad").fill("3");
  await line(page, 1).getByLabel("Costo unitario").fill("1200");
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(
    page.getByText(
      "Escribí hasta 40 letras, números, espacios, guiones o barras.",
    ),
  ).toBeVisible();
  await expectAccessible(page, "alta con la referencia rechazada");
  expect(await receiptCount()).toBe(0);

  await page.getByLabel("Remito o factura del proveedor").fill("R-0001/77");
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Recepción RC-000001" }),
  ).toBeVisible();
  const document = page.locator("[data-comprobante]");
  await expect(document).toContainText("Sin orden");
  await expect(document).toContainText("R-0001/77");
  await expect(document).toContainText("$ 3.600,00");

  await page.goto("/compras/recepciones");
  await page.getByLabel("Número").fill("rc1");
  await page.getByLabel("Número").press("Enter");
  const table = page.getByRole("table", {
    name: "Recepciones de la organización",
  });
  await expect(table.getByRole("link", { name: "RC-000001" })).toBeVisible();
  await expect(table).toContainText("Sin orden");
  await page.getByLabel("Número").fill("OC-000001");
  await page.getByLabel("Número").press("Enter");
  await expect(
    page.getByText("Ninguna recepción coincide con estos filtros."),
  ).toBeVisible();
});

test("un viewer ve el movimiento de la recepción sin costo y las páginas de recepciones muestran el permiso", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const tea = await insertProduct("TE-100", "Té verde");
  const orderId = await insertOrder(supplierId, coffee, tea);
  // La recepción la registra un admin; el viewer solo la ve en el producto.
  await login(page, ADMIN);
  await page.goto(`/compras/recepciones/nueva?orden=${orderId}`);
  await line(page, 2).getByLabel("Cantidad").fill("0");
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page).toHaveURL(/\?aviso=creada$/);
  const receiptPath = new URL(page.url()).pathname;
  await page.context().clearCookies();

  await login(page, VIEWER);
  await expect(
    page.getByRole("navigation", { name: "Principal" }).getByRole("link", {
      name: "Compras",
    }),
  ).toHaveCount(0);
  for (const path of [
    "/compras/recepciones",
    "/compras/recepciones/nueva",
    `/compras/recepciones/nueva?orden=${orderId}`,
    receiptPath,
  ]) {
    await page.goto(path);
    await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
    await expect(page.getByText("RC-000001")).toHaveCount(0);
    await expect(page.getByText("Importaciones Sur")).toHaveCount(0);
  }
  await expectAccessible(page, "permiso de viewer");

  await page.goto(`/productos/${coffee}/movimientos`);
  const movement = page
    .getByRole("table", { name: "Movimientos de Café molido" })
    .getByRole("row")
    .filter({ hasText: "Recepción RC-000001" });
  await expect(movement).toHaveCount(1);
  await expect(movement).toContainText("+ 10");
  await expect(page.getByText("Importaciones Sur")).toHaveCount(0);
  await expect(page.getByText("$ 100,00")).toHaveCount(0);
  await expectAccessible(page, "historial del viewer");
});

// Sin JavaScript (AC-9): el alta es un formulario común; el proveedor se reconoce por su nombre
// exacto y el producto por su SKU, y con orden las filas ya vienen armadas.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin registra una recepción sin orden y otra con orden", async ({
    page,
  }) => {
    const supplierId = await insertSupplier("Importaciones Sur");
    const coffee = await insertProduct("CAF-250", "Café molido");
    const tea = await insertProduct("TE-100", "Té verde");
    const orderId = await insertOrder(supplierId, coffee, tea);
    await login(page, ADMIN);

    await page.goto("/compras/recepciones/nueva");
    await page
      .getByLabel("Proveedor", { exact: true })
      .fill("importaciones sur");
    await page.getByLabel("Moneda", { exact: true }).selectOption("ARS");
    await line(page, 1).getByLabel("Producto").fill("caf-250");
    await line(page, 1).getByLabel("Cantidad").fill("2");
    await line(page, 1).getByLabel("Costo unitario").fill("0");
    await page.getByRole("button", { name: "Registrar recepción" }).click();
    await expect(line(page, 1)).toContainText(
      "Escribí un costo mayor que cero.",
    );
    await expect(line(page, 1).getByLabel("Cantidad")).toHaveValue("2");
    await line(page, 1).getByLabel("Costo unitario").fill("1000");
    await page.getByRole("button", { name: "Registrar recepción" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Recepción RC-000001" }),
    ).toBeVisible();

    await page.goto(`/compras/recepciones/nueva?orden=${orderId}`);
    await line(page, 1).getByLabel("Cantidad").fill("0");
    await page.getByRole("button", { name: "Registrar recepción" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Recepción RC-000002" }),
    ).toBeVisible();
    await expect(page.locator("[data-comprobante]")).toContainText("Té verde");
    await expect(page.locator("[data-comprobante]")).not.toContainText(
      "Café molido",
    );
  });
});
