import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 16 a 18 de punta a punta (brief-20.2, AC-7): Chromium, next start, Server Actions,
// sales, orders, numbering, audit y PostgreSQL real, sin mocks. La venta se emite desde el detalle
// de un pedido entregado; el detalle de la venta es su comprobante imprimible. Desde la 20.3, la
// pantalla 19: la venta sin pedido de /ventas/nueva, que descuenta el stock (brief-20.3, AC-7).
// Desde la 20.4, la anulación y la pantalla 20, su comprobante (brief-20.4, AC-7).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const PHONE = "+5491155553333";
const EMAIL = "lucia@example.com";
const LEGEND = "Documento no válido como factura";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Las ventas, las líneas, los precios y la auditoría son de solo inserción, y orders y
// document_counters no se borran: TRUNCATE es la vía documentada para vaciarlas (ADR 0013). El
// contador se vacía para que cada caso empiece en V-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_lines, sales, order_lines, orders, document_counters, audit_logs,
          inventory_movements, inventories, product_images, product_costs, product_prices,
          products, conversation_notes, messages, conversations, client_tag_assignments, clients`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  const seedIds = sql.join(
    SEED_USERS.map((user) => sql`${user.id}`),
    sql`, `,
  );
  await db.execute(sql`delete from users where id not in (${seedIds})`);
  await db.execute(
    sql`delete from organizations where id <> ${SEED_ORGANIZATION_ID}`,
  );
  await seedBasic(db, E2E_PASSWORD);
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

// Cada estado se analiza en claro y en oscuro (brief-4.0, D-6).
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

async function insertClient(name: string) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, email)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${PHONE}, ${EMAIL})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertProduct(sku: string, name: string) {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${sku}, ${name}) returning id`,
  );
  return product.rows[0]!.id;
}

// Un pedido entregado por SQL: nace pendiente, como exige el trigger, y pasa por confirmado. Las
// pantallas de la venta no concilian el stock.
async function insertDeliveredOrder(
  number: number,
  clientId: string,
  productId: string,
) {
  const order = await db.execute<{ id: string }>(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId}, 'ARS', '900000.00',
                ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  await db.execute(
    sql`insert into order_lines (organization_id, order_id, product_id, position, quantity,
                                 unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${orderId}, ${productId}, 1, '2', '450000.00', 'ARS',
                '900000.00')`,
  );
  await db.execute(
    sql`update orders set status = 'confirmed', confirmed_at = now() where id = ${orderId}`,
  );
  await db.execute(
    sql`update orders set status = 'delivered', delivered_at = now() where id = ${orderId}`,
  );
  return orderId;
}

async function counts() {
  const result = await db.execute<{ sales: number; movements: number }>(
    sql`select (select count(*)::int from sales) as sales,
               (select count(*)::int from inventory_movements) as movements`,
  );
  return result.rows[0]!;
}

test("un admin emite la venta de un pedido entregado con el teclado, la encuentra en la lista y vuelve al pedido", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez");
  const tv = await insertProduct("TV-43", 'Smart TV 43"');
  const orderId = await insertDeliveredOrder(3, clientId, tv);
  await login(page, ADMIN);

  await page.goto(`/pedidos/${orderId}`);
  const card = page.getByRole("region", { name: "Venta" });
  await expect(card).toContainText("Este pedido todavía no tiene su venta.");
  await expectAccessible(page, "pedido entregado sin venta");

  await page.getByRole("link", { name: "Emitir venta" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?confirmar=venta$/);
  const question = page.getByText("¿Emitir la venta del pedido P-000003?");
  await expect(question).toBeFocused();
  await expectAccessible(page, "confirmación de la venta");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "No, volver" })).toBeFocused();
  await page.keyboard.press("Tab");
  const yes = page.getByRole("button", { name: "Sí, emitir la venta" });
  await expect(yes).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?aviso=emitida$/);
  await expect(page.getByText("Venta emitida.")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Venta V-000001" }),
  ).toBeVisible();
  const lines = page.getByRole("table", { name: /Líneas de la venta/ });
  await expect(lines).toContainText('Smart TV 43"');
  await expect(lines).toContainText("450.000,00");
  await expect(lines).toContainText("900.000,00");
  await expect(page.getByText(LEGEND).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "P-000003" })).toBeVisible();
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Historia de la venta V-000001" }),
  ).toContainText("Emisión");
  await expectAccessible(page, "detalle de la venta");
  // La venta no mueve el stock (ADR 0021, punto 3).
  expect(await counts()).toEqual({ sales: 1, movements: 0 });

  await page.goto("/ventas");
  const table = page.getByRole("table", { name: "Ventas de la organización" });
  await expect(table).toContainText("V-000001");
  await expect(table).toContainText("Lucía Gómez");
  await expectAccessible(page, "lista de ventas");
  await table
    .getByRole("link", { name: "Ver el pedido de la venta V-000001" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/pedidos/${orderId}$`));
  await expect(
    page.getByRole("region", { name: "Venta" }).getByRole("link", {
      name: "Venta V-000001",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Emitir venta" })).toHaveCount(0);
});

test("una segunda emisión del mismo pedido enlaza la venta que ya existe y no crea otra", async ({
  page,
  context,
}) => {
  const clientId = await insertClient("Lucía Gómez");
  const tv = await insertProduct("TV-43", 'Smart TV 43"');
  const orderId = await insertDeliveredOrder(3, clientId, tv);
  await login(page, ADMIN);

  // Dos pestañas con la confirmación abierta: la primera emite, la segunda llega tarde.
  const other = await context.newPage();
  await other.goto(`/pedidos/${orderId}?confirmar=venta`);
  await page.goto(`/pedidos/${orderId}?confirmar=venta`);
  await page.getByRole("button", { name: "Sí, emitir la venta" }).click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);

  await other.getByRole("button", { name: "Sí, emitir la venta" }).click();
  const alert = other
    .getByRole("alert")
    .filter({ hasText: "Este pedido ya tiene su venta" });
  await expect(alert).toContainText("Este pedido ya tiene su venta, V-000001.");
  await expect(
    alert.getByRole("link", { name: "Ver la venta V-000001" }),
  ).toBeVisible();
  await expectAccessible(other, "venta ya emitida");
  expect((await counts()).sales).toBe(1);
});

test("al imprimir queda solo el comprobante: sin navegación, botones, historia ni contacto", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez");
  const tv = await insertProduct("TV-43", 'Smart TV 43"');
  const orderId = await insertDeliveredOrder(3, clientId, tv);
  await login(page, ADMIN);
  await page.goto(`/pedidos/${orderId}?confirmar=venta`);
  await page.getByRole("button", { name: "Sí, emitir la venta" }).click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ media: "print", colorScheme });
    const receipt = page.locator("[data-comprobante]");
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText("V-000001");
    await expect(receipt).toContainText("Lucía Gómez");
    await expect(receipt).toContainText("P-000003");
    await expect(receipt).toContainText(LEGEND);
    await expect(receipt).not.toContainText(EMAIL);
    await expect(receipt).not.toContainText("3333");
    // El comprobante ocupa el ancho de la página, no la columna del panel lateral oculto, también
    // con un ancho que activa lg (revisión independiente, R-1): el viewport de la prueba es 1280.
    const box = await receipt.boundingBox();
    expect(box!.width).toBeGreaterThan(900);
    // En papel, siempre en claro (globals.css, @media print).
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(255, 255, 255)");
    for (const hidden of [
      page.getByRole("navigation", { name: "Principal" }),
      page.getByRole("button", { name: "Imprimir o guardar PDF" }),
      page.getByRole("button", { name: "Salir" }),
      page.getByRole("table", { name: "Historia de la venta V-000001" }),
      page.getByText(EMAIL),
      page.getByText(PHONE),
      page.getByRole("region", { name: "Cliente" }),
      page.getByText("Venta emitida."),
    ]) {
      await expect(hidden).toBeHidden();
    }
  }
  await page.emulateMedia({ media: null, colorScheme: null });
  await expect(
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
  ).toBeVisible();
});

test("un viewer ve la lista y el detalle sin contacto ni historia, y no puede emitir", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez");
  const tv = await insertProduct("TV-43", 'Smart TV 43"');
  const sold = await insertDeliveredOrder(3, clientId, tv);
  const unsold = await insertDeliveredOrder(4, clientId, tv);

  await login(page, ADMIN);
  await page.goto(`/pedidos/${sold}?confirmar=venta`);
  await page.getByRole("button", { name: "Sí, emitir la venta" }).click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);
  const saleUrl = page.url().replace(/\?.*$/, "");
  await page.getByRole("button", { name: "Salir" }).click();

  await login(page, VIEWER);
  await page.goto("/ventas");
  await expect(
    page.getByRole("table", { name: "Ventas de la organización" }),
  ).toContainText("V-000001");
  await expectAccessible(page, "lista de ventas, viewer");

  await page.goto(saleUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: "Venta V-000001" }),
  ).toBeVisible();
  await expect(page.getByText(EMAIL)).toHaveCount(0);
  // El viewer recibe el teléfono enmascarado, nunca el completo (FR-CLI-06; revisión, R-5).
  await expect(page.getByText(PHONE)).toHaveCount(0);
  await expect(page.getByText("•••• 3333")).toBeVisible();
  await expect(page.getByText(/Historia de la venta/)).toHaveCount(0);
  await expectAccessible(page, "detalle de la venta, viewer");

  await page.goto(`/pedidos/${unsold}?confirmar=venta`);
  await expect(page.getByRole("region", { name: "Venta" })).toContainText(
    "Este pedido todavía no tiene su venta.",
  );
  await expect(page.getByRole("link", { name: "Emitir venta" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sí, emitir la venta" }),
  ).toHaveCount(0);
  expect((await counts()).sales).toBe(1);
});

test("la lista busca por número, filtra por fecha y avisa de un período inválido", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez");
  const tv = await insertProduct("TV-43", 'Smart TV 43"');
  for (const number of [3, 4]) {
    const orderId = await insertDeliveredOrder(number, clientId, tv);
    await db.execute(
      sql`insert into sales (organization_id, number, order_id, client_id, currency, total,
                             created_by)
          values (${SEED_ORGANIZATION_ID}, ${number - 2}, ${orderId}, ${clientId}, 'ARS',
                  '900000.00', ${ADMIN_SEED.id})`,
    );
  }
  await login(page, ADMIN);

  await page.goto("/ventas");
  await page.getByLabel("Número").fill("2");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  const table = page.getByRole("table", { name: "Ventas de la organización" });
  await expect(table).toContainText("V-000002");
  await expect(table).not.toContainText("V-000001");

  await page.goto("/ventas?desde=2999-01-01");
  await expect(
    page.getByText("Ninguna venta coincide con estos filtros."),
  ).toBeVisible();

  await page.goto("/ventas?desde=2026-05-02&hasta=2026-05-01");
  await expect(
    page.getByRole("alert").filter({ hasText: "Revisá las fechas" }),
  ).toBeVisible();
  await expectAccessible(page, "período inválido");
});

// La venta sin pedido (brief-20.3, AC-7). Un producto con precio y saldo por SQL: estas pantallas
// no concilian el saldo con sus movimientos.
async function insertStockedProduct(
  sku: string,
  name: string,
  price: string,
  onHand: string,
) {
  const productId = await insertProduct(sku, name);
  await db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${price}, 'ARS', ${ADMIN_SEED.id})`,
  );
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${onHand})`,
  );
  return productId;
}

async function onHand(productId: string) {
  const result = await db.execute<{ on_hand: string }>(
    sql`select quantity_on_hand as on_hand from inventories where product_id = ${productId}`,
  );
  return result.rows[0]!.on_hand;
}

const line = (page: Page, position: number) =>
  page.getByRole("group", { name: `Línea ${position}`, exact: true });

// Elige la primera opción de un buscador con el teclado, como en orders.spec.ts.
async function pick(scope: Locator | Page, label: string, text: string) {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(text);
  await expect(scope.getByRole("option").first()).toBeVisible();
  await field.press("ArrowDown");
  await field.press("Enter");
}

test("brief-20.3: un admin emite una venta sin cliente con el teclado, la imprime, la encuentra y la ve en el historial del producto", async ({
  page,
}) => {
  const coffee = await insertStockedProduct(
    "CAF-250",
    "Café molido",
    "1234.50",
    "10",
  );
  await login(page, ADMIN);

  await page.goto("/ventas");
  await page.getByRole("link", { name: "+ Nueva venta" }).click();
  await expect(
    page.getByRole("heading", { name: "Nueva venta" }),
  ).toBeVisible();
  await expectAccessible(page, "venta vacía");

  await pick(line(page, 1), "Producto", "Café");
  await expect(line(page, 1).getByLabel("Producto")).toHaveValue(
    "Café molido (CAF-250)",
  );
  await line(page, 1).getByLabel("Cantidad").fill("3");
  await expect(line(page, 1)).toContainText("Subtotal estimado: $ 3.703,50");
  // «Subtotal estimado» también contiene «total estimado»: el párrafo del total es el que empieza así.
  await expect(
    page.locator("p", { hasText: /^Total estimado:/ }),
  ).toContainText("$ 3.703,50");
  await expectAccessible(page, "venta con una línea");
  await page.getByRole("button", { name: "Emitir venta" }).focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]{36}\?aviso=emitida$/);
  await expect(page.getByText("Venta emitida.")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Venta V-000001" }),
  ).toBeVisible();
  const receipt = page.locator("[data-comprobante]");
  await expect(receipt).toContainText("Consumidor final");
  await expect(receipt).not.toContainText("Pedido");
  await expect(receipt).toContainText("3.703,50");
  await expectAccessible(page, "detalle de una venta sin pedido");
  expect(await onHand(coffee)).toBe("7.000");

  await page.emulateMedia({ media: "print" });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("Consumidor final");
  await expect(page.getByRole("button", { name: "Imprimir" })).toBeHidden();
  await page.emulateMedia({ media: null });

  await page.goto("/ventas");
  const table = page.getByRole("table", { name: "Ventas de la organización" });
  await expect(table).toContainText("V-000001");
  await expect(table).toContainText("Consumidor final");
  await expect(table).toContainText("Sin pedido");
  await expectAccessible(page, "lista con una venta sin pedido");

  await page.goto(`/productos/${coffee}/movimientos?tipo=venta`);
  const movements = page.getByRole("main");
  await expect(movements).toContainText("Venta V-000001");
  await expect(page.getByLabel("Tipo")).toHaveValue("venta");
  await expectAccessible(page, "historial con la venta");
});

test("brief-20.3: más que lo disponible se rechaza con lo disponible, conserva lo cargado y no mueve nada", async ({
  page,
}) => {
  await insertClient("Lucía Gómez");
  const coffee = await insertStockedProduct(
    "CAF-250",
    "Café molido",
    "1000",
    "2",
  );
  await login(page, ADMIN);

  await page.goto("/ventas/nueva");
  await pick(page, "Cliente (opcional)", "Luc");
  await pick(line(page, 1), "Producto", "Café");
  await line(page, 1).getByLabel("Cantidad").fill("2,5");
  await page.getByRole("button", { name: "Emitir venta" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "No alcanza el stock" }),
  ).toContainText("No alcanza el stock disponible de las líneas marcadas.");
  await expect(line(page, 1)).toContainText("Disponible: 2. Pediste 2,5.");
  await expect(page.getByLabel("Cliente (opcional)")).toHaveValue(
    "Lucía Gómez",
  );
  await expect(line(page, 1).getByLabel("Producto")).toHaveValue(
    "Café molido (CAF-250)",
  );
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveValue("2,5");
  await expectAccessible(page, "venta rechazada por stock");
  expect(await counts()).toEqual({ sales: 0, movements: 0 });
  expect(await onHand(coffee)).toBe("2.000");

  // Con lo disponible, se emite a nombre del cliente.
  await line(page, 1).getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);
  await expect(page.locator("[data-comprobante]")).toContainText("Lucía Gómez");
  expect(await onHand(coffee)).toBe("0.000");
});

test("brief-20.3: un viewer no ve «Nueva venta» ni puede entrar a la pantalla", async ({
  page,
}) => {
  await login(page, VIEWER);
  await page.goto("/ventas");
  await expect(page.getByRole("heading", { name: "Ventas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Nueva venta" })).toHaveCount(
    0,
  );
  await page.goto("/ventas/nueva");
  await expect(
    page.getByText("No tenés permiso para ver esta página."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Emitir venta" })).toHaveCount(
    0,
  );
});

// La anulación (brief-20.4, AC-7). Una venta sin pedido por SQL, con su línea: la anulación repone
// sobre el saldo que hay, sin conciliar con los movimientos.
async function insertCounterSale(
  productId: string,
  quantity: string,
  unitPrice: string,
  total: string,
) {
  const sale = await db.execute<{ id: string }>(
    sql`insert into sales (organization_id, number, order_id, client_id, currency, total,
                           created_by)
        values (${SEED_ORGANIZATION_ID}, 1, null, null, 'ARS', ${total}, ${ADMIN_SEED.id})
        returning id`,
  );
  const saleId = sale.rows[0]!.id;
  await db.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${saleId}, ${productId}, 1, ${quantity},
                ${unitPrice}, 'ARS', ${total})`,
  );
  return saleId;
}

test("brief-20.4: un admin anula una venta sin pedido con el teclado, repone el stock e imprime la anulación", async ({
  page,
}) => {
  const coffee = await insertStockedProduct(
    "CAF-250",
    "Café molido",
    "1234.50",
    "7",
  );
  const saleId = await insertCounterSale(coffee, "3", "1234.50", "3703.50");
  await login(page, ADMIN);

  await page.goto(`/ventas/${saleId}`);
  await expect(page.getByRole("region", { name: "Anulación" })).toContainText(
    "Esta venta está vigente.",
  );
  await page.getByRole("link", { name: "Anular venta" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?confirmar=anular$/);
  const question = page.getByText("¿Anular la venta V-000001?");
  await expect(question).toBeFocused();
  await expect(
    page.getByText(/Se repone el stock de cada línea/),
  ).toBeVisible();
  await expectAccessible(page, "confirmación de la anulación");
  // El primer motivo recibe el foco; la flecha elige el siguiente.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Error de carga" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: "Operación no concretada" }),
  ).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "No, volver" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Sí, anular la venta" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]{36}\?aviso=anulada$/);
  await expect(page.getByText("Venta anulada.")).toBeVisible();
  await expect(page.getByText(/^Anulada por A-000001 el /)).toBeVisible();
  await expect(page.getByText(/Operación no concretada\.$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Anular venta" })).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: "Historia de la venta V-000001" }),
  ).toContainText("Anulación A-000001: Operación no concretada");
  await expectAccessible(page, "venta anulada");
  expect(await onHand(coffee)).toBe("10.000");

  await page
    .getByRole("link", { name: "Ver el comprobante de la anulación" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Anulación A-000001" }),
  ).toBeVisible();
  const receipt = page.locator("[data-comprobante]");
  await expect(receipt).toContainText("V-000001");
  await expect(receipt).toContainText("Operación no concretada");
  await expect(receipt).toContainText("Consumidor final");
  await expect(receipt).toContainText("3.703,50");
  await expect(receipt).toContainText(LEGEND);
  await expectAccessible(page, "comprobante de la anulación");
  await page.emulateMedia({ media: "print" });
  await expect(receipt).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
  ).toBeHidden();
  await page.emulateMedia({ media: null });
});

// La lista y el historial de una venta anulada desde la pantalla, sin el teclado ni axe de la
// confirmación: separado del recorrido de arriba para que ninguno se acerque al límite de 30 s por
// caso. La venta es un fixture SQL; la anulación y su movimiento, no (revisión independiente, R-3).
test("brief-20.4: la lista filtra las anuladas y la encuentra por el número de la anulación; el historial muestra la reposición", async ({
  page,
}) => {
  const coffee = await insertStockedProduct(
    "CAF-250",
    "Café molido",
    "1234.50",
    "10",
  );
  const saleId = await insertCounterSale(coffee, "3", "1234.50", "3703.50");
  await db.execute(
    sql`update inventories set quantity_on_hand = '7' where product_id = ${coffee}`,
  );
  await login(page, ADMIN);
  await page.goto(`/ventas/${saleId}?confirmar=anular`);
  await page.getByRole("radio", { name: "Operación no concretada" }).check();
  await page.getByRole("button", { name: "Sí, anular la venta" }).click();
  await expect(page).toHaveURL(/\?aviso=anulada$/);

  await page.goto("/ventas");
  await page.getByLabel("Estado").selectOption("anulada");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/estado=anulada/);
  const table = page.getByRole("table", { name: "Ventas de la organización" });
  await expect(table).toContainText("V-000001");
  await expect(table).toContainText("Anulada");
  await expectAccessible(page, "lista de anuladas");
  await page.goto("/ventas?numero=A-000001");
  await expect(table).toContainText("V-000001");

  await page.goto(`/productos/${coffee}/movimientos?tipo=anulacion`);
  // La fila de la reposición: el tipo, el signo de lo que suma (R-1), el saldo y el motivo.
  const row = page
    .getByRole("table", { name: "Movimientos de Café molido" })
    .getByRole("row")
    .filter({ hasText: "Anulación A-000001 de la venta V-000001" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Anulación de venta");
  await expect(row).toContainText("+ 3");
  await expect(row).toContainText("10");
  await expect(page.getByLabel("Tipo")).toHaveValue("anulacion");
  await expectAccessible(page, "historial con la anulación");
});

test("brief-20.4: anular la venta de un pedido no mueve el stock y deja emitir otra, que la reemplaza", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez");
  const tv = await insertProduct("TV-43", 'Smart TV 43"');
  const orderId = await insertDeliveredOrder(3, clientId, tv);
  await login(page, ADMIN);
  await page.goto(`/pedidos/${orderId}?confirmar=venta`);
  await page.getByRole("button", { name: "Sí, emitir la venta" }).click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);
  const firstUrl = page.url().replace(/\?.*$/, "");

  await page.goto(`${firstUrl}?confirmar=anular`);
  await expect(page.getByText(/El stock no cambia/)).toBeVisible();
  await page.getByRole("radio", { name: "Error de carga" }).check();
  await page.getByRole("button", { name: "Sí, anular la venta" }).click();
  await expect(page).toHaveURL(/\?aviso=anulada$/);
  expect(await counts()).toEqual({ sales: 1, movements: 0 });

  await page.goto(`/pedidos/${orderId}`);
  await expect(page.getByRole("region", { name: "Venta" })).toContainText(
    "Este pedido todavía no tiene su venta.",
  );
  await page.getByRole("link", { name: "Emitir venta" }).click();
  await page.getByRole("button", { name: "Sí, emitir la venta" }).click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Venta V-000002" }),
  ).toBeVisible();
  const receipt = page.locator("[data-comprobante]");
  await expect(receipt).toContainText("Reemplaza a");
  await expect(receipt.getByRole("link", { name: "V-000001" })).toBeVisible();
  await expectAccessible(page, "venta que reemplaza a otra");

  await page.goto(firstUrl);
  await expect(page.locator("[data-comprobante]")).toContainText(
    "Reemplazada por",
  );
  expect(await counts()).toEqual({ sales: 2, movements: 0 });
});

test("brief-20.4: un viewer ve la anulación y no puede anular", async ({
  page,
}) => {
  const coffee = await insertStockedProduct(
    "CAF-250",
    "Café molido",
    "1000",
    "5",
  );
  const kept = await insertCounterSale(coffee, "1", "1000", "1000.00");
  await login(page, VIEWER);

  await page.goto(`/ventas/${kept}?confirmar=anular`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Venta V-000001" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Anular venta" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sí, anular la venta" }),
  ).toHaveCount(0);

  await db.execute(
    sql`insert into sale_voids (organization_id, number, sale_id, currency, total, reason,
                                created_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${kept}, 'ARS', '1000.00', 'wrong_client',
                ${ADMIN_SEED.id})`,
  );
  await page.goto(`/ventas/${kept}`);
  await expect(page.getByText(/^Anulada por A-000001 el /)).toBeVisible();
  await expect(page.getByText(/Cliente equivocado\.$/)).toBeVisible();
  await expectAccessible(page, "venta anulada, viewer");
  await page.goto(`/ventas/${kept}/anulacion`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Anulación A-000001" }),
  ).toBeVisible();
});
