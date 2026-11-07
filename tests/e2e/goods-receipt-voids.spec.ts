import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Las pantallas de la anulación de la recepción de punta a punta (brief-22.5, AC-8): Chromium, next
// start, Server Actions, purchasing, inventory, numbering, audit y PostgreSQL real, sin mocks. La
// recepción es un fixture SQL, con su stock; la anulación, su movimiento y su comprobante, no. Un
// admin anula con el teclado una recepción sin orden y ve el comprobante, la marca, la vista de
// impresión, el movimiento y el costo sin cambio; anula una con orden y ve lo recibido, la
// cancelación permitida y el cierre a mano ausente; ve el rechazo por falta de stock; filtra la lista
// por estado y busca por ARC. Un viewer ve el movimiento sin costo ni proveedor y el aviso en la
// anulación. Sin JavaScript, la anulación también funciona.

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
// se vacía para que cada caso empiece en ARC-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts,
          purchase_order_lines, purchase_orders, suppliers, document_counters, audit_logs,
          refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales,
          order_line_units, order_lines, orders, inventory_movements, inventories, product_images, product_costs,
          product_prices, attribute_values, stock_units, products`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  await seedBasic(db, E2E_PASSWORD);
});

// La capacidad que enciende el caso de la unidad bloqueada se apaga **al terminar** y no al
// empezar: entre archivos de la misma base se filtra, y el truncate de este archivo no la toca.
test.afterEach(async () => {
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${SEED_ORGANIZATION_ID}
          and capability = 'serialized_units'`,
  );
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

async function insertSupplier(name: string): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name)
        values (${SEED_ORGANIZATION_ID}, ${name}) returning id`,
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

async function insertCost(productId: string, amount: string) {
  await db.execute(
    sql`insert into product_costs (organization_id, product_id, amount, currency, created_by)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${amount}, 'ARS', ${ADMIN_SEED.id})`,
  );
}

// Una orden abierta en ARS: café × 10 a 100 y té × 4 a 50. Devuelve la orden y sus líneas.
async function insertOrder(supplierId: string, coffee: string, tea: string) {
  const order = await db.execute<{ id: string }>(
    sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                     created_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${supplierId}, 'ARS', '1200.00', ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  const lines = await db.execute<{ id: string }>(
    sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                          position, quantity, unit_cost, line_total)
        values (${SEED_ORGANIZATION_ID}, ${orderId}, ${coffee}, 1, 10, '100.00', '1000.00'),
               (${SEED_ORGANIZATION_ID}, ${orderId}, ${tea}, 2, 4, '50.00', '200.00')
        returning id`,
  );
  return { orderId, coffeeLine: lines.rows[0]!.id };
}

// Una recepción de una línea, con el stock que sumó, como la deja el alta (brief-22.4).
async function insertReceipt(values: {
  number: number;
  supplierId: string;
  productId: string;
  quantity: string;
  unitCost: string;
  orderId?: string;
  orderLineId?: string;
}): Promise<string> {
  const total = (Number(values.quantity) * Number(values.unitCost)).toFixed(2);
  const receipt = await db.execute<{ id: string }>(
    sql`insert into goods_receipts (organization_id, number, supplier_id, purchase_order_id,
                                    currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, ${values.number}, ${values.supplierId},
                ${values.orderId ?? null}, 'ARS', ${total}, ${ADMIN_SEED.id})
        returning id`,
  );
  const receiptId = receipt.rows[0]!.id;
  await db.execute(
    sql`insert into goods_receipt_lines (organization_id, goods_receipt_id,
                                         purchase_order_line_id, product_id, position, quantity,
                                         unit_cost, line_total)
        values (${SEED_ORGANIZATION_ID}, ${receiptId}, ${values.orderLineId ?? null},
                ${values.productId}, 1, ${values.quantity}, ${values.unitCost}, ${total})`,
  );
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${SEED_ORGANIZATION_ID}, ${values.productId}, ${values.quantity})
        on conflict (product_id)
        do update set quantity_on_hand = inventories.quantity_on_hand + excluded.quantity_on_hand`,
  );
  return receiptId;
}

async function onHand(productId: string): Promise<string> {
  const result = await db.execute<{ on_hand: string }>(
    sql`select quantity_on_hand as on_hand from inventories where product_id = ${productId}`,
  );
  return result.rows[0]!.on_hand;
}

async function voidCount(): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from goods_receipt_voids`,
  );
  return result.rows[0]!.count;
}

test("un admin anula con el teclado una recepción sin orden y ve la marca y el aviso del costo", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  await insertCost(coffee, "1200.00");
  const receiptId = await insertReceipt({
    number: 1,
    supplierId,
    productId: coffee,
    quantity: "3",
    unitCost: "1200.00",
  });
  await login(page, ADMIN);

  await page.goto(`/compras/recepciones/${receiptId}`);
  await expect(page.getByRole("region", { name: "Anulación" })).toContainText(
    "Esta recepción está vigente.",
  );
  await page.getByRole("link", { name: "Anular la recepción" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?confirmar=anular$/);
  // Desde la 24.8.1-b el título va en afirmación, como lo titula la lámina 04 (brief-24.8.1-b,
  // V-32). Antes era «¿Anular la recepción RC-000001?». **Lo que este caso comprueba no cambió**:
  // que el foco cae en el título al abrirse el paso.
  await expect(page.getByText("Anular recepción RC-000001")).toBeFocused();
  await expect(
    page.getByText(
      "Anular no restaura el costo: si hace falta, corregilo en la ficha del producto.",
    ),
  ).toBeVisible();
  const leaving = page.getByRole("table", { name: "Lo que sale del stock" });
  await expect(leaving).toContainText("Café molido");
  await expect(leaving.getByRole("row").nth(1)).toContainText("3");
  await expectAccessible(page, "confirmación de la anulación");
  // Desde la 24.8.1-b el motivo es un `<select>` y no arranca elegido (brief-24.8.1-b, D-6 y
  // V-32): dos flechas bajan hasta el segundo motivo. Antes eran radios, y el primero venía
  // con el foco. **Lo que este caso comprueba no cambió**: que se anula sin tocar el mouse.
  const reason = page.getByLabel("Motivo de anulación");
  await reason.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(reason).toHaveValue("duplicate");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Volver", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Anular recepción" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(
    /\/compras\/recepciones\/[0-9a-f-]{36}\?aviso=anulada$/,
  );
  await expect(
    page.getByText(
      "Recepción anulada: el stock ya bajó. El costo de los productos no cambió.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/^Anulada por ARC-000001 el /)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Anular la recepción" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: "Historia de la recepción RC-000001" }),
  ).toContainText("Anulación ARC-000001: Cargada dos veces");
  const document = page.locator("[data-comprobante]");
  await expect(document).toContainText("Anulada por ARC-000001");
  await expectAccessible(page, "recepción anulada");
  await page.emulateMedia({ media: "print" });
  await expect(document).toContainText("Anulada por ARC-000001");
  await page.emulateMedia({ media: null });
  expect(await onHand(coffee)).toBe("0.000");
  const costs = await db.execute<{ amount: string }>(
    sql`select amount from product_costs where product_id = ${coffee}`,
  );
  expect(costs.rows).toEqual([{ amount: "1200.00" }]);
});

test("el comprobante de la anulación, su vista de impresión y el movimiento en el producto", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const receiptId = await insertReceipt({
    number: 1,
    supplierId,
    productId: coffee,
    quantity: "3",
    unitCost: "1200.00",
  });
  await login(page, ADMIN);
  await page.goto(`/compras/recepciones/${receiptId}/anulacion`);
  await expect(page.getByText("Esta recepción no está anulada.")).toBeVisible();

  await page.goto(`/compras/recepciones/${receiptId}?confirmar=anular`);
  await page
    .getByLabel("Motivo de anulación")
    .selectOption({ label: "Mercadería devuelta al proveedor" });
  await page.getByRole("button", { name: "Anular recepción" }).click();
  await expect(page).toHaveURL(/\?aviso=anulada$/);
  await page
    .getByRole("link", { name: "Ver el comprobante de la anulación" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Anulación ARC-000001" }),
  ).toBeVisible();
  const document = page.locator("[data-comprobante]");
  for (const text of [
    "RC-000001",
    "Mercadería devuelta al proveedor",
    "Importaciones Sur",
    "Sin orden",
    "$ 3.600,00",
    LEGEND,
  ]) {
    await expect(document).toContainText(text);
  }
  await expectAccessible(page, "comprobante de la anulación");
  await page.emulateMedia({ media: "print" });
  await expect(document).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
  ).toBeHidden();
  await page.emulateMedia({ media: null });
  await expectAccessible(page, "vista de impresión de la anulación", "print");

  await page.goto(`/productos/${coffee}/movimientos?tipo=anulacion-recepcion`);
  const movement = page
    .getByRole("table", { name: "Movimientos de Café molido" })
    .getByRole("row")
    .filter({ hasText: "Anulación ARC-000001 de la recepción RC-000001" });
  await expect(movement).toHaveCount(1);
  await expect(movement).toContainText("Anulación de recepción");
  await expect(movement).toContainText("− 3");
  await expect(movement).not.toContainText("Importaciones Sur");
  await expect(page.getByLabel("Tipo")).toHaveValue("anulacion-recepcion");
  await expectAccessible(page, "historial con la anulación");
});

test("anular la recepción de una orden: lo recibido vuelve a cero, la orden se cancela y el cierre a mano desaparece", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const tea = await insertProduct("TE-100", "Té verde");
  const { orderId, coffeeLine } = await insertOrder(supplierId, coffee, tea);
  const receiptId = await insertReceipt({
    number: 1,
    supplierId,
    productId: coffee,
    quantity: "4",
    unitCost: "100.00",
    orderId,
    orderLineId: coffeeLine,
  });
  await login(page, ADMIN);

  await page.goto(`/compras/ordenes/${orderId}`);
  // Las dos viven en «Más acciones» y nunca conviven (brief-24.8.1, D-4): con una recepción
  // vigente se cierra con faltante y no se cancela.
  await page
    .getByRole("button", { name: "Más acciones de la orden de compra" })
    .click();
  await expect(
    page.getByRole("link", { name: "Cerrar con faltante" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Cancelar la orden" }),
  ).toHaveCount(0);

  await page.goto(`/compras/recepciones/${receiptId}?confirmar=anular`);
  await expect(
    page.getByText(/La orden deja de contar esta recepción como recibida/),
  ).toBeVisible();
  await page
    .getByLabel("Motivo de anulación")
    .selectOption({ label: "Error de carga" });
  await page.getByRole("button", { name: "Anular recepción" }).click();
  await expect(page).toHaveURL(/\?aviso=anulada$/);

  await page.goto(`/compras/ordenes/${orderId}`);
  const coffeeRow = page
    .getByRole("table", { name: "Líneas de la orden de compra OC-000001" })
    .getByRole("row")
    .filter({ hasText: "Café molido" });
  // Recibidas y Pendientes, tercera y cuarta columna desde la 24.8.1: la lámina 03 las pone
  // entre «Pedidas» y el costo, y son las dos que no se imprimen.
  await expect(coffeeRow.getByRole("cell").nth(2)).toHaveText(/^0\b/);
  await expect(coffeeRow.getByRole("cell").nth(3)).toHaveText(/^10\b/);
  await expect(page.getByText(/Abierta$/).first()).toBeVisible();
  // Sin recepciones vigentes se invierte: se cancela y ya no se cierra a mano.
  await page
    .getByRole("button", { name: "Más acciones de la orden de compra" })
    .click();
  await expect(
    page.getByRole("link", { name: "Cerrar con faltante" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Cancelar la orden" }),
  ).toBeVisible();
  const receipts = page.getByRole("region", {
    name: "Recepciones",
    exact: true,
  });
  await expect(
    receipts.getByRole("link", { name: "RC-000001", exact: true }),
  ).toBeVisible();
  await expect(receipts).toContainText("Anulada");
  await expectAccessible(page, "orden con su recepción anulada");
  expect(await onHand(coffee)).toBe("0.000");
});

test("el rechazo por falta de stock dice qué producto no alcanza y no escribe", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const receiptId = await insertReceipt({
    number: 1,
    supplierId,
    productId: coffee,
    quantity: "3",
    unitCost: "1200.00",
  });
  // Se vendió parte: quedan 2 de los 3 que entraron.
  await db.execute(
    sql`update inventories set quantity_on_hand = 2 where product_id = ${coffee}`,
  );
  await login(page, ADMIN);

  await page.goto(`/compras/recepciones/${receiptId}?confirmar=anular`);
  await page.getByLabel("Motivo de anulación").selectOption({ label: "Otro" });
  await page.getByRole("button", { name: "Anular recepción" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "No alcanza" });
  await expect(alert).toContainText("Corregilo con un ajuste");
  await expect(alert).toContainText(
    "Café molido: Hay que sacar 3 y hay disponible 2.",
  );
  await expectAccessible(page, "anulación rechazada por el stock");
  expect(await voidCount()).toBe(0);
  expect(await onHand(coffee)).toBe("2.000");
});

test("la lista marca las anuladas, filtra por estado y busca por el número de la anulación", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const tea = await insertProduct("TE-100", "Té verde");
  await insertReceipt({
    number: 1,
    supplierId,
    productId: coffee,
    quantity: "1",
    unitCost: "10.00",
  });
  const voided = await insertReceipt({
    number: 2,
    supplierId,
    productId: tea,
    quantity: "1",
    unitCost: "10.00",
  });
  await login(page, ADMIN);
  await page.goto(`/compras/recepciones/${voided}?confirmar=anular`);
  await page
    .getByLabel("Motivo de anulación")
    .selectOption({ label: "Cargada dos veces" });
  await page.getByRole("button", { name: "Anular recepción" }).click();
  await expect(page).toHaveURL(/\?aviso=anulada$/);

  await page.goto("/compras/recepciones");
  const table = page.getByRole("table", {
    name: "Recepciones de la organización",
  });
  await expect(
    table.getByRole("row").filter({ hasText: "RC-000002" }),
  ).toContainText("Anulada");
  await expect(
    table.getByRole("row").filter({ hasText: "RC-000001" }),
  ).not.toContainText("Anulada");
  await page.getByLabel("Estado").selectOption("anulada");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/estado=anulada/);
  await expect(
    table.getByRole("link", { name: "RC-000002", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("link", { name: "RC-000001", exact: true }),
  ).toHaveCount(0);
  await expectAccessible(page, "lista de anuladas");

  await page.goto("/compras/recepciones");
  await page.getByLabel("Número").fill("ARC-000001");
  await page.getByLabel("Número").press("Enter");
  await expect(
    table.getByRole("link", { name: "RC-000002", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("link", { name: "RC-000001", exact: true }),
  ).toHaveCount(0);

  await page.goto(`/compras/proveedores/${supplierId}`);
  await expect(
    page.getByRole("region", { name: "Recepciones", exact: true }),
  ).toContainText("Anulada");
});

test("un viewer ve el movimiento de la anulación sin costo ni proveedor, y el aviso en la anulación", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const coffee = await insertProduct("CAF-250", "Café molido");
  const receiptId = await insertReceipt({
    number: 1,
    supplierId,
    productId: coffee,
    quantity: "3",
    unitCost: "1200.00",
  });
  await login(page, ADMIN);
  await page.goto(`/compras/recepciones/${receiptId}?confirmar=anular`);
  await page
    .getByLabel("Motivo de anulación")
    .selectOption({ label: "Error de carga" });
  await page.getByRole("button", { name: "Anular recepción" }).click();
  await expect(page).toHaveURL(/\?aviso=anulada$/);
  await page.context().clearCookies();

  await login(page, VIEWER);
  for (const path of [
    `/compras/recepciones/${receiptId}/anulacion`,
    `/compras/recepciones/${receiptId}?confirmar=anular`,
  ]) {
    await page.goto(path);
    await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
    await expect(page.getByText("ARC-000001")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Anular recepción" }),
    ).toHaveCount(0);
  }
  await expectAccessible(page, "permiso de viewer");

  await page.goto(`/productos/${coffee}/movimientos`);
  const movement = page
    .getByRole("table", { name: "Movimientos de Café molido" })
    .getByRole("row")
    .filter({ hasText: "Anulación ARC-000001 de la recepción RC-000001" });
  await expect(movement).toHaveCount(1);
  await expect(movement).toContainText("Anulación de recepción");
  await expect(page.getByText("Importaciones Sur")).toHaveCount(0);
  await expect(page.getByText("$ 1.200,00")).toHaveCount(0);
  await expectAccessible(page, "historial del viewer");
});

// Sin JavaScript (AC-8): la confirmación es un formulario común.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin anula una recepción", async ({ page }) => {
    const supplierId = await insertSupplier("Importaciones Sur");
    const coffee = await insertProduct("CAF-250", "Café molido");
    const receiptId = await insertReceipt({
      number: 1,
      supplierId,
      productId: coffee,
      quantity: "3",
      unitCost: "1200.00",
    });
    await login(page, ADMIN);
    await page.goto(`/compras/recepciones/${receiptId}`);
    await page.getByRole("link", { name: "Anular la recepción" }).click();
    await page
      .getByLabel("Motivo de anulación")
      .selectOption({ label: "Error de carga" });
    await page.getByRole("button", { name: "Anular recepción" }).click();
    await expect(page.getByText(/^Anulada por ARC-000001 el /)).toBeVisible();
    expect(await onHand(coffee)).toBe("0.000");
  });
});

// Una unidad de una recepción, con su IMEI y su estado, como la deja el alta de un producto que se
// lleva por unidad. Por SQL, como el resto de los fixtures de este archivo.
async function insertUnit(values: {
  receiptId: string;
  productId: string;
  serial: string;
  status: "available" | "reserved" | "sold" | "written_off";
}) {
  const line = await db.execute<{ id: string }>(
    sql`select id from goods_receipt_lines
        where goods_receipt_id = ${values.receiptId} and position = 1`,
  );
  // La unidad solo existe con la capacidad encendida y el producto llevado por unidad: sin eso,
  // la salida de stock de la anulación no sabe qué hacer con los ids y rompe.
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${SEED_ORGANIZATION_ID}, 'serialized_units', ${ADMIN_SEED.id})
        on conflict do nothing`,
  );
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${values.productId}`,
  );
  const unit = await db.execute<{ id: string }>(
    sql`insert into stock_units (organization_id, product_id, serial, status, cost, cost_currency,
                                 origin_type, origin_id, created_by)
        values (${SEED_ORGANIZATION_ID}, ${values.productId}, ${values.serial}, 'available',
                '1200.00', 'ARS', 'goods_receipt', ${values.receiptId}, ${ADMIN_SEED.id})
        returning id`,
  );
  // Un disparador exige que una unidad **nazca disponible**, así que el estado se fija
  // después, como lo hace el sistema cuando se reserva.
  if (values.status !== "available") {
    await db.execute(
      sql`update stock_units set status = ${values.status} where id = ${unit.rows[0]!.id}`,
    );
  }
  await db.execute(
    sql`insert into goods_receipt_line_units (organization_id, goods_receipt_line_id, unit_id)
        values (${SEED_ORGANIZATION_ID}, ${line.rows[0]!.id}, ${unit.rows[0]!.id})`,
  );
  return unit.rows[0]!.id;
}

// AC-7 y M-4 del brief-24.8.1-b: el bloqueo **nombra la unidad y su estado real**, en vez de
// enumerar las seis causas posibles. El estado sale de las unidades que la ficha ya leyó (H-3):
// la unidad figuraba como reservada cuando se dibujó la pantalla, y por eso el texto dice
// «figura como» y no afirma el estado de ahora.
test("el bloqueo de la anulación nombra la unidad reservada y su estado, y no escribe", async ({
  page,
}) => {
  const supplierId = await insertSupplier("Importaciones Sur");
  const phone = await insertProduct("IP15-128", "iPhone 15 128 GB");
  await insertCost(phone, "1200.00");
  const receiptId = await insertReceipt({
    number: 1,
    supplierId,
    productId: phone,
    quantity: "1",
    unitCost: "1200.00",
  });
  await insertUnit({
    receiptId,
    productId: phone,
    serial: "350000000005103",
    status: "reserved",
  });
  await login(page, ADMIN);
  await page.goto(`/compras/recepciones/${receiptId}?confirmar=anular`);
  // La ficha ya muestra la unidad con su estado antes de confirmar (AC-6).
  await expect(page.getByText("350000000005103").first()).toBeVisible();
  await page
    .getByLabel("Motivo de anulación")
    .selectOption({ label: "Error de carga" });
  await page.getByRole("button", { name: "Anular recepción" }).click();
  await expect(
    page.getByText("No se puede anular RC-000001 · 350000000005103"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "La unidad figura como reservada y no se puede anular la recepción.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("No se cambia ninguna reserva desde esta anulación."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver unidad" })).toHaveAttribute(
    "href",
    `/productos/${phone}/unidades`,
  );
  // No se enumeran las causas posibles, que es lo que V-38 vino a sacar.
  await expect(page.getByText(/reparación|revisión/)).toHaveCount(0);
  await expectAccessible(page, "anulación bloqueada por una unidad reservada");
  expect(await voidCount()).toBe(0);
  expect(await onHand(phone)).toBe("1.000");
});
