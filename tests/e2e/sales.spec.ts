import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { outlineButtonClass } from "@/app/_components/form-styles";
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
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, document_counters, audit_logs,
          inventory_movements, inventories, product_images, product_costs, product_prices,
          attribute_values, stock_units, products, conversation_notes, messages, conversations, client_tag_assignments, clients`,
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

// La capacidad `serialized_units` la enciende un solo caso, el del alta por equipos de la
// 24.6.1-b. **Se apaga después de cada caso, no antes**: limpiarla solo al empezar deja la
// organización semilla con la capacidad puesta cuando termina el último, y **se filtra a la spec
// que corra después** en la misma base. Pasó de verdad: con la 24.6.1-b recién empujada,
// `search.spec.ts` falló en la CI porque el diálogo de búsqueda anunciaba «equipos por IMEI» en
// su alcance —correcto cuando la capacidad está— y esa spec no la enciende. Es la convención que
// ya usa `clients.spec.ts` con `repairs`, acá con un `afterEach` para que valga aunque el caso
// falle.
test.afterEach(async () => {
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${SEED_ORGANIZATION_ID}`,
  );
  // La 24.6.2-b agrega un modelo y un técnico para la orden de servicio del caso del origen, y por
  // el mismo motivo que la capacidad, se borran acá: ni product_models ni suppliers están en el
  // TRUNCATE de esta spec. Las órdenes de servicio **no se borran** —un trigger lo impide, porque
  // la tabla es de solo inserción (ADR 0013)—, así que se vacían con TRUNCATE, como el beforeEach.
  await db.execute(sql`truncate table service_order_lines, service_orders`);
  await db.execute(
    sql`delete from product_models where organization_id = ${SEED_ORGANIZATION_ID}`,
  );
  await db.execute(
    sql`delete from suppliers where organization_id = ${SEED_ORGANIZATION_ID}`,
  );
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

  // Desde la 24.6.1 (brief-24.6.1, D-5) el botón abre un **panel por la URL**: `?panel=emitir`.
  // El recorrido con el teclado que la 20.2 exigía se conserva —el foco va al título del panel y
  // «Volver» lo cierra—; lo que cambió son la dirección y las etiquetas.
  await page.getByRole("link", { name: "Emitir venta" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?panel=emitir$/);
  const panel = page.getByRole("dialog");
  const question = panel.getByRole("heading", {
    name: "Emitir la venta del pedido P-000003",
  });
  await expect(question).toBeFocused();
  await expectAccessible(page, "confirmación de la venta");
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("link", { name: "Volver" })).toBeFocused();
  await page.keyboard.press("Tab");
  const yes = panel.getByRole("button", { name: "Emitir venta" });
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
  await expectAccessible(page, "detalle de la venta");
  // La historia vive en la pestaña «Actividad» desde la 24.6.2-b, y se llega por su enlace: las
  // pestañas son enlaces, no botones, así que andan sin JavaScript.
  await page.getByRole("link", { name: "Actividad" }).click();
  await expect(page).toHaveURL(/\?pestana=actividad$/);
  await expect(
    page.getByRole("table", { name: "Historia de la venta V-000001" }),
  ).toContainText("Emisión");
  await expectAccessible(page, "actividad de la venta");
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Emitir venta" })
    .click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);

  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Emitir venta" })
    .click();
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Emitir venta" })
    .click();
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
  const printButton = page.getByRole("button", {
    name: "Imprimir o guardar PDF",
  });
  await expect(printButton).toBeVisible();

  // **El botón solo en «Resumen»**, que es donde vive el comprobante. *Agregado el 2026-11-03*,
  // por la revisión independiente (MAYOR-2): se dibujaba en las tres pestañas, y como los cuerpos
  // de «Cobros» y «Actividad» son `print:hidden`, imprimir desde ellas sacaba una hoja en blanco.
  // Se afirman las dos mitades: que el botón no está, y que en papel no queda nada que imprimir
  // —esa segunda es la que haría fallar el caso si alguien devolviera el botón sin devolver el
  // comprobante.
  for (const tab of ["Cobros", "Actividad"] as const) {
    await page.getByRole("link", { name: tab }).click();
    await expect(page).toHaveURL(new RegExp(`pestana=${tab.toLowerCase()}`));
    await expect(printButton).toHaveCount(0);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("[data-comprobante]")).toHaveCount(0);
    await page.emulateMedia({ media: null });
  }
  await page.getByRole("link", { name: "Resumen" }).click();
  await expect(printButton).toBeVisible();
  await expect(page.locator("[data-comprobante]")).toBeVisible();
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Emitir venta" })
    .click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);
  const saleUrl = page.url().replace(/\?.*$/, "");
  // «Salir» está en el menú del usuario (brief-23.1, D-5).
  await page.getByRole("button", { name: "Menú del usuario" }).click();
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
    page.getByRole("dialog").getByRole("button", { name: "Emitir venta" }),
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
// Desde la 24.6.2-c acepta la moneda: el mostrador vende en dos monedas en una sola pasada.
async function insertStockedProduct(
  sku: string,
  name: string,
  price: string,
  onHand: string,
  currency = "ARS",
) {
  const productId = await insertProduct(sku, name);
  await db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${price}, ${currency}, ${ADMIN_SEED.id})`,
  );
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${onHand})`,
  );
  return productId;
}

async function saleCount() {
  const result = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from sales`,
  );
  return result.rows[0]!.n;
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
  // La columna «Origen» de la lámina 01 (brief-24.6.2-b): una venta sin pedido es de mostrador.
  await expect(table).toContainText("Mostrador");
  // Y la columna «Estado», con la situación de la venta: todavía sin cobrar. *Corregido el
  // 2026-11-03*, por la 24.6.2-e: el importe por cobrar de una pendiente es el mismo número que la
  // columna TOTAL, así que ya no se repite (su D-3). El total sigue estando, una vez.
  await expect(table).toContainText("Pendiente");
  await expect(table).toContainText("$ 3.703,50");
  await expect(table).not.toContainText("por cobrar");
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
  // Con un cobro, para que el diálogo tenga un efecto en dinero que calcular (24.6.2-d, AC-8).
  await insertSaleReceipt(saleId, 1, await insertTransferMethod(), "3703.50");
  await login(page, ADMIN);

  await page.goto(`/ventas/${saleId}`);
  await expect(page.getByRole("region", { name: "Anulación" })).toContainText(
    "Esta venta está vigente.",
  );
  // «Anular» quedó en «Más» (brief-24.6.2-b, AC-7). Es un <details>, así que se abre con el
  // teclado y sin JavaScript, y recién entonces aparece el enlace.
  await page.getByRole("group").filter({ hasText: "Más" }).first().click();
  await page.getByRole("link", { name: "Anular venta" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?confirmar=anular$/);
  // Desde la 24.6.2-d es el diálogo de la lámina 04, con el efecto **calculado** antes de
  // confirmar y no dos textos fijos que no miraban la venta.
  const dialog = page.getByRole("dialog", { name: "Anular venta V-000001" });
  await expect(dialog).toBeVisible();
  // AC-10: la salida segura tiene el foco al abrirse.
  await expect(
    page.getByRole("link", { name: "Conservar venta" }),
  ).toBeFocused();
  // AC-7: el origen y **el número real** de lo que vuelve al stock.
  await expect(dialog).toContainText("Venta de mostrador sin pedido");
  await expect(dialog).toContainText("Se reponen 3 unidades al stock");
  // AC-8 y AC-9: el efecto en dinero, calculado, y que es una foto que puede cambiar.
  await expect(dialog).toContainText(/Se conserva el cobro de \$\s3\.703,50/);
  await expect(dialog).toContainText(
    /Quedará \$\s3\.703,50 a devolver porque no tiene cliente/,
  );
  await expect(dialog).toContainText(
    "Calculado ahora. Si entra un cobro mientras tanto, la anulación se hace igual y este importe cambia.",
  );
  await expectAccessible(page, "confirmación de la anulación");
  // El orden del teclado: primero la salida segura, después el destructivo.
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Anular venta" }),
  ).toBeFocused();
  await dialog.getByRole("radio", { name: "Operación no concretada" }).check();
  await dialog.getByRole("button", { name: "Anular venta" }).click();

  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]{36}\?aviso=anulada$/);
  await expect(page.getByText("Venta anulada.")).toBeVisible();
  await expect(page.getByText(/^Anulada por A-000001 el /)).toBeVisible();
  await expect(page.getByText(/Operación no concretada\.$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Anular venta" })).toHaveCount(0);
  await expectAccessible(page, "venta anulada");
  // La historia vive en la pestaña «Actividad» desde la 24.6.2-b (D-4).
  await page.getByRole("link", { name: "Actividad" }).click();
  await expect(
    page.getByRole("table", { name: "Historia de la venta V-000001" }),
  ).toContainText("Anulación A-000001: Operación no concretada");
  await page.getByRole("link", { name: "Resumen" }).click();
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
  await page.getByRole("button", { name: "Anular venta" }).click();
  await expect(page).toHaveURL(/\?aviso=anulada$/);

  await page.goto("/ventas");
  // La vigencia se elige en la barra de pestañas de la lámina 01, que son enlaces con su contador
  // (brief-24.6.2-b). Antes era un <select> con «Aplicar filtros».
  const vigencia = page.getByRole("navigation", {
    name: "Vigencia de las ventas",
  });
  await expect(vigencia.getByRole("link", { name: /^Todas/ })).toContainText(
    "1",
  );
  await expect(vigencia.getByRole("link", { name: /^Anuladas/ })).toContainText(
    "1",
  );
  await vigencia.getByRole("link", { name: /^Anuladas/ }).click();
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Emitir venta" })
    .click();
  await expect(page).toHaveURL(/\?aviso=emitida$/);
  const firstUrl = page.url().replace(/\?.*$/, "");

  await page.goto(`${firstUrl}?confirmar=anular`);
  // AC-7, el segundo de los tres orígenes de la tabla del README.
  await expect(page.getByText("Venta de un pedido entregado")).toBeVisible();
  await expect(page.getByText(/El stock no cambia/)).toBeVisible();
  await page.getByRole("radio", { name: "Error de carga" }).check();
  await page.getByRole("button", { name: "Anular venta" }).click();
  await expect(page).toHaveURL(/\?aviso=anulada$/);
  expect(await counts()).toEqual({ sales: 1, movements: 0 });

  await page.goto(`/pedidos/${orderId}`);
  await expect(page.getByRole("region", { name: "Venta" })).toContainText(
    "Este pedido todavía no tiene su venta.",
  );
  await page.getByRole("link", { name: "Emitir venta" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Emitir venta" })
    .click();
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
  await expect(page.getByRole("button", { name: "Anular venta" })).toHaveCount(
    0,
  );

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

// Un producto que se vende por unidad con sus unidades disponibles. Nació en la 24.6.1-b, para
// fijar que el alta de mostrador **no cambiaba**; desde la 24.6.2 lo usan los casos que prueban
// que **sí** cambió, y el barrido de anchos.
async function insertUnitProduct(
  sku: string,
  name: string,
  price: string,
  serials: string[],
) {
  const productId = await insertStockedProduct(
    sku,
    name,
    price,
    String(serials.length),
  );
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${productId}`,
  );
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${SEED_ORGANIZATION_ID}, 'serialized_units', ${ADMIN_SEED.id})
        on conflict do nothing`,
  );
  for (const serial of serials) {
    await db.execute(
      sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
                                   price, price_currency, origin_type, created_by)
          values (${SEED_ORGANIZATION_ID}, ${productId}, ${serial}, 100, 'ARS', ${price}, 'ARS',
                  'manual', ${ADMIN_SEED.id})`,
    );
  }
  return productId;
}

test("brief-24.6.2: el alta de mostrador elige los equipos en el panel, como el alta de un pedido", async ({
  page,
}) => {
  // AC-1 a AC-5. Es el caso que la 24.6.1-b escribió **al revés** —probaba que acá no estaba el
  // panel, porque su D-2 lo dejó detrás de una propiedad que solo Pedidos encendía— y que esta
  // subfase invierte en lugar de borrar, para no perder la cobertura (brief-24.6.2, D-6).
  const productId = await insertUnitProduct("IPH-13", "iPhone 13", "450", [
    "356938035645001",
    "356938035645002",
  ]);
  await login(page, ADMIN);
  await page.goto("/ventas/nueva");
  await pick(line(page, 1), "Producto", "iPhone");

  // Lo que hasta la 24.6.1-b era solo de Pedidos: el campo de escaneo y el disparador del panel.
  // El camino servido —el textarea y la lista en línea— ya no se dibuja con JavaScript.
  const escanear = line(page, 1).getByLabel("Escanear o agregar IMEI");
  await expect(escanear).toBeVisible();
  await expect(line(page, 1).getByLabel("IMEI de las unidades")).toHaveCount(0);
  await expect(line(page, 1)).not.toContainText("Unidades disponibles");

  // AC-3: el IMEI escrito va en monoespaciada y el marcador, que es prosa, en la del sistema.
  // Es la lección de la 24.6.2-b anterior: se mide, no se afirma.
  const fuentes = await escanear.evaluate((el) => ({
    valor: getComputedStyle(el).fontFamily,
    marcador: getComputedStyle(el, "::placeholder").fontFamily,
  }));
  expect(fuentes.valor, "el IMEI escrito va en monoespaciada").toMatch(
    /mono|Courier/i,
  );
  expect(
    fuentes.marcador,
    "el marcador va en la tipografía del sistema",
  ).toMatch(/Manrope|system-ui|sans-serif/i);
  expect(fuentes.marcador).not.toBe(fuentes.valor);

  // Enter agrega el IMEI y **no** envía el formulario. Comprobar que algo no pasó exige darle
  // tiempo a que pase: medido al instante, ni la URL cambió ni la venta existe todavía **aunque
  // el formulario se haya enviado**, y la aserción pasa igual. Lo tiene medido `orders.spec.ts`
  // con una mutación, y la primera versión de este caso repetía el error: lo encontró la
  // revisión independiente de la 24.6.2 (NB-3).
  await escanear.fill("356938035645001");
  await escanear.press("Enter");
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/ventas\/nueva$/);
  expect(await saleCount(), "Enter en el escaneo no emite la venta").toBe(0);
  const chips = line(page, 1).getByRole("list", {
    name: /Equipos seleccionados/,
  });
  await expect(chips.getByRole("listitem")).toHaveCount(1);
  await expect(chips).toContainText("$ 450,00");

  // AC-4: la cantidad y el subtotal pasan a ser de solo lectura, con el texto de la lámina.
  await expect(line(page, 1)).toContainText("1 equipo");
  await expect(line(page, 1)).toContainText(
    "Derivada de la unidad seleccionada.",
  );
  await expect(line(page, 1)).toContainText("Precio unitario");
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveCount(0);

  // AC-1 y AC-5: el panel, el cuerpo inerte y «Emitir venta» deshabilitado.
  const abrir = line(page, 1).getByRole("button", {
    name: "Elegir unidades",
    exact: true,
  });
  await expect(abrir).toHaveAttribute("aria-haspopup", "dialog");
  await abrir.click();
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByRole("heading", { name: "Elegir unidades", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("checkbox")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Emitir venta" }),
  ).toBeDisabled();
  // El cuerpo y el resumen quedan inertes: exactamente dos elementos, no cero.
  await expect(page.locator("[inert]")).toHaveCount(2);
  await expectAccessible(page, "alta de mostrador con el panel abierto");

  await panel.getByRole("checkbox", { name: /356938035645002/ }).check();
  await panel.getByRole("button", { name: "Usar selección" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Al cerrarse, el foco vuelve al disparador.
  await expect(abrir).toBeFocused();
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(line(page, 1)).toContainText("2 equipos");
  await expect(
    page.locator("p", { hasText: /^Total estimado:/ }),
  ).toContainText("$ 900,00");

  // AC-2: el «Quitar» de un chip nombra su unidad.
  await chips
    .getByRole("button", { name: "Quitar el IMEI 356938035645001" })
    .click();
  await expect(chips.getByRole("listitem")).toHaveCount(1);
  await expect(line(page, 1)).toContainText("1 equipo");
  // El objetivo táctil del README de la v2 es 44 px de lado, y se **mide**: la subfase anterior
  // tuvo dos controles en 30 y 34 px y los encontró medirlos, no mirarlos.
  for (const [nombre, control] of [
    ["quitar el chip", chips.getByRole("button").first()],
    ["emitir", page.getByRole("button", { name: "Emitir venta" })],
    [
      "volver sin guardar",
      page.getByRole("button", { name: "Volver sin guardar" }),
    ],
  ] as const) {
    const caja = await control.boundingBox();
    expect(caja, nombre).not.toBeNull();
    expect(
      Math.round(caja!.height),
      `alto de ${nombre}`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      Math.round(caja!.width),
      `ancho de ${nombre}`,
    ).toBeGreaterThanOrEqual(44);
  }
  await expectAccessible(page, "alta de mostrador por unidad");

  // El camino sigue andando de punta a punta, y vende la unidad que quedó.
  await page.getByRole("button", { name: "Emitir venta" }).click();
  // El nivel importa: el número también titula el comprobante imprimible, y sin él son dos.
  await expect(
    page.getByRole("heading", { name: "Venta V-000001", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("356938035645002");
  await expect(page.getByRole("main")).not.toContainText("356938035645001");
  expect(await onHand(productId)).toBe("1.000");
});

test("brief-24.6.2: «Antes de emitir» resume la venta, y «Volver sin guardar» avisa solo si hay algo cargado", async ({
  page,
}) => {
  // AC-6 y AC-7. El resumen es lo propio de esta lámina: el alta de un pedido no lo tiene.
  await insertStockedProduct("CAF-250", "Café molido", "1234.50", "10");
  await insertClient("Lucía Gómez");
  await login(page, ADMIN);
  await page.goto("/ventas/nueva");

  const resumen = page.getByRole("complementary", { name: "Antes de emitir" });
  await expect(resumen).toContainText("Consumidor final");
  await expect(resumen).toContainText("Sin líneas cargadas");
  await expect(resumen).toContainText("Al emitir, el equipo pasa a vendido");
  await expect(resumen).toContainText("El cobro se registra después.");
  await expect(resumen).toContainText("La venta emitida no se edita.");

  // Sin nada cargado, salir no pregunta nada.
  await resumen.getByRole("button", { name: "Volver sin guardar" }).click();
  await expect(page).toHaveURL(/\/ventas$/);

  await page.goto("/ventas/nueva");
  await pick(page, "Cliente (opcional)", "Luc");
  await pick(line(page, 1), "Producto", "Café");
  await line(page, 1).getByLabel("Cantidad").fill("2");
  await expect(resumen).toContainText("Lucía Gómez");
  await expect(resumen).toContainText("1 línea");
  await expect(
    page.locator("p", { hasText: /^Total estimado:/ }),
  ).toContainText("$ 2.469,00");
  await expectAccessible(page, "alta de mostrador con su resumen");

  // Con algo cargado, salir pregunta, y «Seguir editando» no pierde el borrador.
  await resumen.getByRole("button", { name: "Volver sin guardar" }).click();
  const aviso = page.getByRole("dialog", {
    name: "Tenés cambios sin guardar",
  });
  await expect(aviso).toBeVisible();
  await aviso.getByRole("button", { name: "Seguir editando" }).click();
  await expect(page).toHaveURL(/\/ventas\/nueva$/);
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveValue("2");

  await resumen.getByRole("button", { name: "Volver sin guardar" }).click();
  await aviso.getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(page).toHaveURL(/\/ventas$/);
});

test("brief-24.6.2: después de un rechazo del servidor, salir sigue preguntando", async ({
  page,
}) => {
  // AC-7, el estado que la primera versión no cubría y que encontró la revisión independiente
  // (NB-8). El formulario se vuelve a montar en cada rechazo, con lo que se envió: para el
  // mecanismo de la 23.2 —que compara contra lo que había al montarse— la pantalla queda «sin
  // cambios» aunque tenga todo cargado. «Volver sin guardar» no usa esa comparación.
  const coffee = await insertStockedProduct(
    "CAF-250",
    "Café molido",
    "1234.50",
    "1",
  );
  await login(page, ADMIN);
  await page.goto("/ventas/nueva");
  await pick(line(page, 1), "Producto", "Café");
  // Más que lo disponible: el servidor rechaza y devuelve el borrador.
  await line(page, 1).getByLabel("Cantidad").fill("5");
  await page.getByRole("button", { name: "Emitir venta" }).click();
  await expect(
    page
      .getByRole("alert", { name: "" })
      .filter({ hasText: "No alcanza el stock" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/ventas\/nueva$/);
  // El borrador sigue cargado, y nada se emitió.
  await expect(line(page, 1).getByLabel("Cantidad")).toHaveValue("5");
  expect(await saleCount()).toBe(0);
  expect(await onHand(coffee)).toBe("1.000");

  // Y salir pregunta igual, que es lo que AC-7 promete.
  await page
    .getByRole("complementary", { name: "Antes de emitir" })
    .getByRole("button", { name: "Volver sin guardar" })
    .click();
  const aviso = page.getByRole("dialog", {
    name: "Tenés cambios sin guardar",
  });
  await expect(aviso).toBeVisible();
  await aviso.getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(page).toHaveURL(/\/ventas$/);
});

test("brief-24.6.2: la cabecera del panel muestra la miniatura del producto", async ({
  page,
}) => {
  // AC-1, la mitad que faltaba. La miniatura es **la única lectura que esta subfase le agrega a
  // la pantalla** —la sentencia de más que mide AC-14— y hasta acá nada probaba que llegara al
  // navegador en Ventas. Lo encontró la revisión independiente (B-1). La imagen se genera acá: no
  // es una foto ni muestra personas, como en product-images.spec.ts.
  const productId = await insertUnitProduct("IPH-13", "iPhone 13", "450", [
    "356938035645001",
  ]);
  await login(page, ADMIN);

  await page.goto(`/productos/${productId}`);
  await page.getByLabel("Subir imagen").setInputFiles({
    name: "equipo.jpg",
    mimeType: "image/jpeg",
    buffer: await sharp({
      create: {
        width: 800,
        height: 800,
        channels: 3,
        background: { r: 30, g: 30, b: 60 },
      },
    })
      .jpeg()
      .toBuffer(),
  });
  await page.getByRole("button", { name: "Guardar imagen" }).click();
  await expect(page.getByRole("status")).toContainText("Imagen guardada.");

  await page.goto("/ventas/nueva");
  await pick(line(page, 1), "Producto", "iPhone");
  await line(page, 1)
    .getByRole("button", { name: "Elegir unidades", exact: true })
    .click();

  const miniatura = page
    .getByRole("dialog")
    .locator(`img[src^="/productos/${productId}/imagen/miniatura"]`);
  await expect(miniatura).toBeVisible();
  // Que el navegador la haya traído de verdad, con la cookie de sesión.
  await expect
    .poll(() =>
      miniatura.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  // Y que la dirección lleve la versión, que es lo que la 17.5 dejó para que reemplazarla no
  // muestre la anterior.
  await expect(miniatura).toHaveAttribute("src", /\?v=[0-9a-f]{8}/);
});

// Desbordamiento horizontal: la medida sale del documento, no de la vista. `scrollWidth` mayor que
// `clientWidth` es exactamente la barra horizontal que no tiene que aparecer.
const anchoDesbordado = (page: Page) =>
  page.evaluate(() => {
    const raiz = document.documentElement;
    return raiz.scrollWidth - raiz.clientWidth;
  });

test("brief-24.6.2: sin desbordamiento horizontal en el alta de mostrador, de 320 a 1440 px", async ({
  page,
}) => {
  // AC-13. Los cinco anchos del criterio, con un chip de IMEI completo cargado y con el panel
  // abierto, que es donde una columna de ancho fijo se nota primero. A 320 px con 200 % de zoom el
  // ancho efectivo es mayor que 320, así que el barrido lo cubre por abajo.
  await insertUnitProduct("IPH-13", "iPhone 13", "450", [
    "356938035645001",
    "356938035645002",
  ]);
  await login(page, ADMIN);
  for (const ancho of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto("/ventas/nueva");
    await pick(line(page, 1), "Producto", "iPhone");
    const escanear = line(page, 1).getByLabel("Escanear o agregar IMEI");
    await escanear.fill("356938035645001");
    await escanear.press("Enter");
    await expect(
      line(page, 1).getByRole("list", { name: /Equipos seleccionados/ }),
    ).toContainText("356938035645001");
    expect(
      await anchoDesbordado(page),
      `alta con un chip a ${ancho} px`,
    ).toBeLessThanOrEqual(0);
    await line(page, 1)
      .getByRole("button", { name: "Elegir unidades", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await anchoDesbordado(page),
      `panel abierto a ${ancho} px`,
    ).toBeLessThanOrEqual(0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// La 24.6.2-c: el mostrador en dos monedas, un comprobante por moneda.
// ─────────────────────────────────────────────────────────────────────────────

test("brief-24.6.2-c: el mostrador dice qué comprobantes va a emitir y emite uno por moneda", async ({
  page,
}) => {
  // AC-8, AC-10, AC-12 y AC-13. Café en pesos y un teléfono en dólares, que es el caso que el
  // usuario pidió: un accesorio y un equipo en la misma atención.
  const coffee = await insertStockedProduct(
    "CAF-250",
    "Café molido",
    "1234.50",
    "10",
  );
  const phone = await insertStockedProduct(
    "TEL-13",
    "Teléfono 13",
    "400.00",
    "5",
    "USD",
  );
  await insertStockedProduct("AUR-01", "Auriculares", "30.00", "8", "EUR");
  await login(page, ADMIN);
  await page.goto("/ventas/nueva");
  const summary = page.getByRole("complementary", { name: "Antes de emitir" });
  // La región viva del resumen, que tiene que ser **la misma** con una moneda y con varias para que
  // el cambio se anuncie (revisión independiente, hallazgo 3).
  const live = summary.locator("[data-resumen-total]");

  // Con una sola moneda, el resumen es el de siempre y el bloque no existe.
  await pick(line(page, 1), "Producto", "Café");
  await line(page, 1).getByLabel("Cantidad").fill("3");
  await expect(
    summary.locator("p", { hasText: /^Total estimado:/ }),
  ).toContainText("$ 3.703,50");
  await expect(summary.getByText("Comprobantes a emitir")).toHaveCount(0);
  await expect(live).toHaveCount(1);
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toContainText("Total estimado:");

  // Con dos, el total único desaparece —las monedas no se suman— y aparece el bloque, una fila por
  // moneda con su recuento de líneas y su total estimado (D-7).
  await pick(line(page, 2), "Producto", "Teléfono");
  await line(page, 2).getByLabel("Cantidad").fill("2");
  await expect(summary.getByText("Comprobantes a emitir")).toBeVisible();
  await expect(
    summary.locator("p", { hasText: /^Total estimado:/ }),
  ).toHaveCount(0);
  const documents = summary.getByRole("listitem");
  await expect(documents.filter({ hasText: "ARS · 1 línea" })).toContainText(
    "$ 3.703,50",
  );
  await expect(documents.filter({ hasText: "USD · 1 línea" })).toContainText(
    "US$ 800,00",
  );
  await expect(summary).toContainText(
    "Se emiten 2 comprobantes, uno por moneda, cada uno con su número y su cobro.",
  );
  // La región viva sigue siendo una sola y la misma: cambió su contenido, no su existencia.
  await expect(live).toHaveCount(1);
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toContainText("Comprobantes a emitir");
  await expect(live).not.toContainText("Total estimado:");
  // El aviso rojo de antes de esta subfase decía que las otras monedas se rechazaban: ya no está.
  await expect(page.getByText("monedas distintas")).toHaveCount(0);
  await expectAccessible(page, "mostrador con dos monedas");

  // AC-12 pide **tres** monedas desplegadas, que es el bloque más alto, así que la tercera entra
  // acá. *Agregada el 2026-11-03*, por la revisión independiente (hallazgo 1): el barrido corría con
  // dos y el criterio nombra tres.
  await pick(line(page, 3), "Producto", "Auriculares");
  await line(page, 3).getByLabel("Cantidad").fill("1");
  await expect(
    summary.getByRole("listitem").filter({ hasText: "EUR" }),
  ).toHaveCount(1);
  await expect(summary).toContainText("Se emiten 3 comprobantes");
  for (const ancho of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await expect(summary.getByText("Comprobantes a emitir")).toBeVisible();
    expect(
      await anchoDesbordado(page),
      `resumen con tres monedas a ${ancho} px`,
    ).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // Y se vuelve a dos para lo que sigue: el destino con tres ya lo cubre el aviso genérico.
  await line(page, 3)
    .getByRole("button", { name: /Quitar/ })
    .click();
  await expect(summary).toContainText("Se emiten 2 comprobantes");

  await page.getByRole("button", { name: "Emitir venta" }).click();

  // AC-10: con dos comprobantes el destino es el listado, con el aviso que los nombra, porque ya no
  // hay «la» venta a la que llevar (D-5).
  await expect(page).toHaveURL(
    /\/ventas\?aviso=emitidas&numeros=V-000001(,|%2C)V-000002$/,
  );
  await expect(
    page.getByText(
      "Se emitieron 2 comprobantes, uno por moneda: V-000001 y V-000002.",
    ),
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Ventas de la organización" });
  await expect(table).toContainText("V-000001");
  await expect(table).toContainText("V-000002");
  await expect(table).toContainText("$ 3.703,50");
  await expect(table).toContainText("US$ 800,00");
  expect(await saleCount()).toBe(2);
  expect(await onHand(coffee)).toBe("7.000");
  expect(await onHand(phone)).toBe("3.000");
  await expectAccessible(page, "listado con los dos comprobantes");

  // Cada comprobante se imprime por su lado, con su moneda.
  await table.getByRole("link", { name: "Ver la venta V-000002" }).click();
  await expect(page.locator("[data-comprobante]")).toContainText("US$ 800,00");

  // Un parámetro que no tiene la forma de un número de venta cae en el aviso genérico, y lo que
  // venía en la URL no se escribe en la página. **Alcanza con que uno solo no tenga la forma**: con
  // los válidos mezclados con basura, el aviso tampoco nombra ninguno, porque si no afirmaría un
  // recuento que no es el de lo que vino (revisión independiente, hallazgo 4).
  for (const numeros of ["%3Cscript%3E", "V-000001,basura,V-000002", "V-1"]) {
    await page.goto(`/ventas?aviso=emitidas&numeros=${numeros}`);
    await expect(
      page.getByText("Se emitieron los comprobantes."),
    ).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("script");
    await expect(page.getByRole("main")).not.toContainText("basura");
  }
});

test.describe("brief-24.6.2-c sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("el bloque no aparece y la emisión produce igual un comprobante por moneda", async ({
    page,
  }) => {
    // AC-9 y H-5 del brief: el precio de cada línea lo trae el buscador de productos, que vive
    // detrás de la hidratación, así que sin JavaScript el navegador no sabe en qué moneda está cada
    // uno y el bloque no puede existir. **No es un defecto**: la agrupación que vale la hace el
    // servidor, que es el único que conoce los precios vigentes.
    const coffee = await insertStockedProduct(
      "CAF-250",
      "Café molido",
      "1234.50",
      "10",
    );
    const phone = await insertStockedProduct(
      "TEL-13",
      "Teléfono 13",
      "400.00",
      "5",
      "USD",
    );
    await login(page, ADMIN);
    await page.goto("/ventas/nueva");

    await expect(page.getByText("Comprobantes a emitir")).toHaveCount(0);
    // Sin JavaScript el producto se resuelve por su SKU, como en el alta de un pedido.
    await line(page, 1).getByLabel("Producto").fill("caf-250");
    await line(page, 1).getByLabel("Cantidad").fill("3");
    await line(page, 2).getByLabel("Producto").fill("tel-13");
    await line(page, 2).getByLabel("Cantidad").fill("2");
    await page.getByRole("button", { name: "Emitir venta" }).click();

    await expect(page).toHaveURL(
      /\/ventas\?aviso=emitidas&numeros=V-000001(,|%2C)V-000002$/,
    );
    const table = page.getByRole("table", {
      name: "Ventas de la organización",
    });
    await expect(table).toContainText("$ 3.703,50");
    await expect(table).toContainText("US$ 800,00");
    expect(await saleCount()).toBe(2);
    expect(await onHand(coffee)).toBe("7.000");
    expect(await onHand(phone)).toBe("3.000");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La 24.6.2-b: el listado con la forma de la lámina 01 y la ficha en pestañas.
// ─────────────────────────────────────────────────────────────────────────────

// Un medio de pago y un cobro por SQL: las pantallas de cobro tienen sus propios casos, acá solo
// hace falta que la venta tenga cobrado algo para mirar la columna «Cobros» del listado.
async function insertTransferMethod() {
  // payment_methods **no** está en el TRUNCATE de esta spec, así que el medio sobrevive entre casos:
  // se reusa el que haya y se crea solo la primera vez. Insertar a secas rompe con el único por
  // nombre, que fue lo que pasó al escribir estos casos.
  const result = await db.execute<{ id: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Transferencia', false)
        on conflict do nothing
        returning id`,
  );
  if (result.rows[0]) return result.rows[0].id;
  const found = await db.execute<{ id: string }>(
    sql`select id from payment_methods
        where organization_id = ${SEED_ORGANIZATION_ID} and lower(name) = 'transferencia'`,
  );
  return found.rows[0]!.id;
}

async function insertSaleReceipt(
  saleId: string,
  number: number,
  methodId: string,
  amount: string,
) {
  await db.execute(
    sql`insert into receipts (organization_id, number, target, sale_id, client_id,
                              payment_method_id, session_id, currency, amount, created_by)
        select organization_id, ${number}, 'sale', id, client_id, ${methodId}, null, currency,
               ${amount}, ${ADMIN_SEED.id}
        from sales where id = ${saleId}`,
  );
}

// Una venta de mostrador con su número y su total, para armar una página con varias.
async function insertSaleNumbered(
  number: number,
  productId: string,
  clientId: string | null,
  currency: string,
  total: string,
) {
  const sale = await db.execute<{ id: string }>(
    sql`insert into sales (organization_id, number, order_id, client_id, currency, total,
                           created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, null, ${clientId}, ${currency}, ${total},
                ${ADMIN_SEED.id})
        returning id`,
  );
  const saleId = sale.rows[0]!.id;
  await db.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${saleId}, ${productId}, 1, '1', ${total}, ${currency},
                ${total})`,
  );
  return saleId;
}

async function voidSaleRow(saleId: string, number: number) {
  await db.execute(
    sql`insert into sale_voids (organization_id, number, sale_id, reason, currency, total,
                                created_by)
        select organization_id, ${number}, id, 'data_entry_error', currency, total,
               ${ADMIN_SEED.id}
        from sales where id = ${saleId}`,
  );
}

test("brief-24.6.2-b: el listado dice el origen y la situación de cobro en su moneda, con los contadores de vigencia", async ({
  page,
}) => {
  const productId = await insertStockedProduct(
    "CAF-250",
    "Café",
    "1000.00",
    "50",
  );
  const clientId = await insertClient("Lucía Gómez");
  const method = await insertTransferMethod();
  // Cuatro ventas que cubren los tres estados de cobro y las dos monedas, más una anulada.
  await insertSaleNumbered(1, productId, null, "ARS", "480000.00");
  const parcial = await insertSaleNumbered(
    2,
    productId,
    clientId,
    "ARS",
    "500000.00",
  );
  await insertSaleReceipt(parcial, 1, method, "120000.00");
  const cobrada = await insertSaleNumbered(
    3,
    productId,
    null,
    "ARS",
    "80000.00",
  );
  await insertSaleReceipt(cobrada, 2, method, "80000.00");
  await insertSaleNumbered(4, productId, null, "USD", "650.00");
  const anulada = await insertSaleNumbered(
    5,
    productId,
    null,
    "ARS",
    "90000.00",
  );
  await voidSaleRow(anulada, 1);

  await login(page, ADMIN);
  await page.goto("/ventas");

  // AC-5: el período filtra la emisión, y la pantalla lo dice.
  await expect(
    page.getByText("El período filtra la fecha de emisión."),
  ).toBeVisible();

  // AC-3: los contadores de vigencia, dentro del ámbito de los filtros puestos.
  const vigencia = page.getByRole("navigation", {
    name: "Vigencia de las ventas",
  });
  await expect(vigencia.getByRole("link", { name: /^Todas/ })).toContainText(
    "5",
  );
  await expect(vigencia.getByRole("link", { name: /^Vigentes/ })).toContainText(
    "4",
  );
  await expect(vigencia.getByRole("link", { name: /^Anuladas/ })).toContainText(
    "1",
  );

  const table = page.getByRole("table", { name: "Ventas de la organización" });
  const row = (numero: string) =>
    table.getByRole("row").filter({ hasText: numero });

  // AC-1 y AC-2: la situación sale de los recibos vigentes, no de la suma bruta, y lleva su moneda.
  await expect(row("V-000001")).toContainText("Pendiente");
  // *Corregido el 2026-11-03*, por la 24.6.2-e: en una pendiente el importe por cobrar es el
  // total, así que ya no se muestra (su D-3). Lo que queda afirmado es el total.
  await expect(row("V-000001")).toContainText("$ 480.000,00");
  await expect(row("V-000001")).not.toContainText("por cobrar");
  await expect(row("V-000002")).toContainText("Parcial");
  // 500.000 − 120.000 = 380.000, calculado a mano.
  await expect(row("V-000002")).toContainText("$ 380.000,00 por cobrar");
  await expect(row("V-000003")).toContainText("Cobrada");
  await expect(row("V-000003")).not.toContainText("por cobrar");
  // AC-1: los importes conservan su moneda y **no hay un total único** entre ARS y USD.
  await expect(row("V-000004")).toContainText("US$ 650,00");
  // *Corregido el 2026-11-03*, por la 24.6.2-e (su D-3). La moneda sigue siendo la de la venta:
  // el total dice «US$» y no se suma con los pesos de las otras filas, que es lo que AC-1 mide.
  await expect(row("V-000004")).not.toContainText("por cobrar");
  // La anulada no es un estado de cobro y no se presenta como una deuda saldada.
  await expect(row("V-000005")).toContainText("Anulada");
  await expect(row("V-000005")).not.toContainText("por cobrar");

  // AC-1: el origen. Sin la capacidad repairs, mostrador y pedido.
  await expect(row("V-000001")).toContainText("Mostrador");

  // AC-2: lo que dice el listado coincide con la ficha de esa venta.
  await page.goto(`/ventas/${parcial}?pestana=cobros`);
  await expect(
    page.getByRole("region", { name: "Cobros", exact: true }),
  ).toContainText("380.000,00");

  await page.goto("/ventas");
  await expectAccessible(page, "listado de ventas con cobros y origen");
});

// La subfase 24.6.2-e: una sola columna «Estado» en el listado, el importe solo cuando dice algo
// que la fila no dijo ya, y la acción como el botón sólido de `/pedidos`. Salió del recorrido del
// usuario sobre producción al cerrar la 24.6.2-b: **no eran defectos de aquella subfase**, que
// coincidía con su lámina, sino un cambio de criterio al verla funcionando.
test("brief-24.6.2-e: el listado dice el estado una sola vez, con el botón «Ver» de la lámina y el importe solo cuando difiere del total", async ({
  page,
}) => {
  const productId = await insertStockedProduct(
    "CAF-250",
    "Café",
    "1000.00",
    "50",
  );
  const clientId = await insertClient("Lucía Gómez");
  const method = await insertTransferMethod();
  // Una venta por estado, para que el caso pueda distinguir los cuatro. Sin las cuatro filas, un
  // caso que afirme «Parcial» no prueba que «Pendiente» siga existiendo (D-2).
  await insertSaleNumbered(1, productId, null, "ARS", "480000.00");
  const parcial = await insertSaleNumbered(
    2,
    productId,
    clientId,
    "ARS",
    "500000.00",
  );
  await insertSaleReceipt(parcial, 1, method, "120000.00");
  const cobrada = await insertSaleNumbered(
    3,
    productId,
    null,
    "ARS",
    "80000.00",
  );
  await insertSaleReceipt(cobrada, 2, method, "80000.00");
  const anulada = await insertSaleNumbered(
    4,
    productId,
    null,
    "ARS",
    "90000.00",
  );
  await voidSaleRow(anulada, 1);
  // Y una parcial **en dólares**. Es la fila que fija AC-7 sobre el importe que falta: con D-3, la
  // única venta en USD del caso de la 24.6.2-b quedó sin mostrar importe —es pendiente, así que lo
  // que falta es su total—, y ningún caso seguía afirmando la moneda de un «por cobrar» fuera de
  // los pesos. Lo encontró la revisión independiente (su MENOR-2).
  const parcialUsd = await insertSaleNumbered(
    5,
    productId,
    clientId,
    "USD",
    "650.00",
  );
  await insertSaleReceipt(parcialUsd, 3, method, "250.00");

  await login(page, ADMIN);
  await page.goto("/ventas");

  const table = page.getByRole("table", { name: "Ventas de la organización" });
  const row = (numero: string) =>
    table.getByRole("row").filter({ hasText: numero });

  // AC-1: la columna se llama «Estado» y «Cobros» ya no es un encabezado del listado.
  await expect(
    table.getByRole("columnheader", { name: "Estado" }),
  ).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Cobros" })).toHaveCount(
    0,
  );

  // AC-3: los cuatro estados, con sus rótulos exactos y cada uno en su fila.
  await expect(
    row("V-000001").getByText("Pendiente", { exact: true }),
  ).toBeVisible();
  await expect(
    row("V-000002").getByText("Parcial", { exact: true }),
  ).toBeVisible();
  await expect(
    row("V-000003").getByText("Cobrada", { exact: true }),
  ).toBeVisible();
  await expect(
    row("V-000004").getByText("Anulada", { exact: true }),
  ).toBeVisible();

  // AC-1 y AC-2: la insignia de vigencia **no está**, y la anulada dice «Anulada» **una** sola vez.
  // Las dos aserciones son las que fallan si vuelve la insignia debajo del número: la primera
  // porque reaparece «Vigente» en las tres vigentes, la segunda porque la anulada pasa a dos.
  await expect(table.getByText("Vigente", { exact: true })).toHaveCount(0);
  await expect(
    row("V-000004").getByText("Anulada", { exact: true }),
  ).toHaveCount(1);
  await expect(row("V-000004")).not.toContainText("por cobrar");

  // AC-4: el importe aparece **solo cuando difiere del total**. En la pendiente es el mismo número
  // que la columna TOTAL y por eso no está; en la parcial dice algo nuevo y por eso sí.
  await expect(row("V-000001")).toContainText("$ 480.000,00");
  await expect(row("V-000001")).not.toContainText("por cobrar");
  // 500.000 − 120.000 = 380.000, calculado a mano.
  await expect(row("V-000002")).toContainText("$ 380.000,00 por cobrar");
  await expect(row("V-000003")).not.toContainText("por cobrar");
  // AC-7: el importe que falta va **en la moneda de su venta** y no se suma con los pesos de las
  // otras filas. 650 − 250 = 400, calculado a mano.
  await expect(row("V-000005")).toContainText("Parcial");
  await expect(row("V-000005")).toContainText("US$ 400,00 por cobrar");

  // AC-5: la acción es un botón y no el enlace de texto que se confundía con el número de venta.
  // Se afirman las tres cosas que lo hacen un botón: la clase compartida con `/pedidos` —la misma
  // constante `outlineButtonClass`, que es lo que los hace iguales y lo que dibujan las dos
  // láminas—, que tenga un fondo propio, y que ese fondo sea **distinto** del del número de venta,
  // que era la queja. El número de venta no tiene fondo, así que la tercera es la que muerde.
  const ver = row("V-000001").getByRole("link", {
    name: "Ver la venta V-000001",
  });
  await expect(ver).toBeVisible();
  await expect(ver).toHaveClass(outlineButtonClass);
  const fondo = (locator: Locator) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const fondoBoton = await fondo(ver);
  expect(fondoBoton).not.toBe("rgba(0, 0, 0, 0)");
  expect(fondoBoton).not.toBe(
    // `exact` es obligatorio: el nombre accesible del botón **contiene** el número de venta, así
    // que sin él el selector del número agarra los dos enlaces de la fila. Es la misma confusión
    // que el usuario vio en pantalla, aparecida en el selector.
    await fondo(
      row("V-000001").getByRole("link", { name: "V-000001", exact: true }),
    ),
  );
  // D-5 y el pedido del usuario: que los dos botones sean **iguales**. Se mide el de `/pedidos` y
  // no un control cualquiera de la misma clase, porque un botón **fuera** de una tabla mide
  // distinto: el alto sale de la caja de línea y la tabla es `text-sm`. El primer intento de este
  // caso comparó el sólido del listado contra «Aplicar filtros», de la misma clase, y dio 36
  // contra 40; esa diferencia es la que descubrió que la cifra del brief estaba mal.
  //
  // La aserción es una **igualdad entre las dos pantallas**, no un valor fijo: sigue en verde el
  // día que el objetivo táctil se arregle en todo el repositorio, que es una subfase propia (D-5),
  // y se pone roja si alguien desempareja las dos pantallas, que es lo que el usuario pidió
  // evitar. El alto **se imprime** en vez de fijarse, como la medición del chip de `orders.spec`:
  // el número queda en la corrida y el criterio no queda clavado a un defecto aceptado.
  const altoDe = async (locator: Locator) => {
    const caja = await locator.boundingBox();
    expect(caja).not.toBeNull();
    return Math.round(caja!.height);
  };
  await insertDeliveredOrder(1, clientId, productId);
  await page.goto("/pedidos");
  const altoDePedidos = await altoDe(
    page.getByRole("link", { name: "Ver el pedido P-000001" }),
  );
  await page.goto("/ventas");
  const altoDeVentas = await altoDe(ver);
  console.log(
    `Medición · botón «Ver» dentro de la tabla: ventas ${altoDeVentas} px, pedidos ${altoDePedidos} px (objetivo táctil 44)`,
  );
  expect(altoDeVentas, "alto del botón Ver del listado de ventas").toBe(
    altoDePedidos,
  );

  // AC-9: axe en claro y en oscuro, con filas de los cuatro estados a la vista.
  await expectAccessible(
    page,
    "listado de ventas con una sola columna de estado",
  );

  // AC-1 y AC-5 en la vista de tarjetas del teléfono: tampoco lleva insignia de vigencia, y **no**
  // lleva el botón, porque no tiene columna «Acción» y su número de venta es el enlace (V-3).
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/ventas");
  const tarjetas = page.getByRole("list", {
    name: "Ventas de la organización",
  });
  await expect(tarjetas).toBeVisible();
  await expect(tarjetas.getByText("Vigente", { exact: true })).toHaveCount(0);
  await expect(tarjetas.getByText("Anulada", { exact: true })).toHaveCount(1);
  await expect(tarjetas.getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(
    tarjetas.getByRole("link", { name: "Ver la venta V-000001" }),
  ).toHaveCount(0);

  // AC-10: el botón nuevo es lo que puede desbordar una tabla, así que el barrido corre con las
  // cuatro filas puestas y no con una.
  for (const ancho of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto("/ventas");
    expect(
      await anchoDesbordado(page),
      `listado con cuatro estados a ${ancho} px`,
    ).toBeLessThanOrEqual(0);
  }
});

test("brief-24.6.2-b: un viewer ve el listado con los cobros y sin «Nueva venta»", async ({
  page,
}) => {
  const productId = await insertStockedProduct(
    "CAF-250",
    "Café",
    "1000.00",
    "50",
  );
  await insertSaleNumbered(1, productId, null, "ARS", "480000.00");
  await login(page, VIEWER);
  await page.goto("/ventas");
  const table = page.getByRole("table", { name: "Ventas de la organización" });
  await expect(table).toContainText("Pendiente");
  await expect(table).toContainText("Mostrador");
  // AC-9: consulta, sin acciones de gestión.
  await expect(page.getByRole("link", { name: "+ Nueva venta" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "listado de ventas, viewer");
});

test("brief-24.6.2-b: la ficha tiene tres pestañas por URL y el encabezado dice lo mismo en las tres", async ({
  page,
}) => {
  const productId = await insertStockedProduct(
    "CAF-250",
    "Café",
    "1000.00",
    "50",
  );
  const clientId = await insertClient("Lucía Gómez");
  const method = await insertTransferMethod();
  const saleId = await insertSaleNumbered(
    1,
    productId,
    clientId,
    "ARS",
    "500000.00",
  );
  await insertSaleReceipt(saleId, 1, method, "120000.00");

  await login(page, ADMIN);
  await page.goto(`/ventas/${saleId}`);

  // AC-6: las tres pestañas existen y son **enlaces**, así que andan sin JavaScript.
  const pestanas = page.getByRole("navigation", {
    name: "Secciones de la venta V-000001",
  });
  for (const nombre of ["Resumen", "Cobros", "Actividad"]) {
    await expect(pestanas.getByRole("link", { name: nombre })).toBeVisible();
  }

  // AC-6 y AC-7: el encabezado no depende de la lectura de una sola pestaña. El estado de cobro y
  // «Registrar cobro» tienen que verse igual en las tres, incluida Actividad, que **no** pide los
  // recibos. Es el defecto que la 24.6.1 encontró en dos mitades.
  for (const tab of ["", "?pestana=cobros", "?pestana=actividad"]) {
    await page.goto(`/ventas/${saleId}${tab}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Venta V-000001" }),
    ).toBeVisible();
    await expect(page.getByText("Parcial", { exact: true })).toBeVisible();
    await expect(page.getByText("Vigente", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Registrar cobro" }),
    ).toBeVisible();
  }

  // Cada pestaña muestra lo suyo, y solo lo suyo.
  await page.goto(`/ventas/${saleId}`);
  await expect(page.locator("[data-comprobante]")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Cobros de la venta V-000001" }),
  ).toHaveCount(0);
  await expectAccessible(page, "ficha de la venta, Resumen");

  await pestanas.getByRole("link", { name: "Cobros" }).click();
  await expect(page).toHaveURL(/\?pestana=cobros$/);
  await expect(
    page.getByRole("region", { name: "Cobros de la venta V-000001" }),
  ).toContainText("R-000001");
  await expect(page.locator("[data-comprobante]")).toHaveCount(0);
  await expectAccessible(page, "ficha de la venta, Cobros");

  await pestanas.getByRole("link", { name: "Actividad" }).click();
  await expect(page).toHaveURL(/\?pestana=actividad$/);
  // Esta venta se cargó por SQL, así que su historia está vacía: lo que importa acá es que la
  // pestaña es la de la historia y que **no** trae los cobros. Las filas de la historia las
  // afirman los casos de la 20.2 y la 20.4, que emiten de verdad.
  await expect(
    page.getByRole("region", { name: "Historial de auditoría" }),
  ).toContainText("Sin cambios registrados todavía.");
  await expect(
    page.getByRole("region", { name: "Cobros de la venta V-000001" }),
  ).toHaveCount(0);
  await expect(page.locator("[data-comprobante]")).toHaveCount(0);
  await expectAccessible(page, "ficha de la venta, Actividad");

  // AC-7: una venta cobrada no ofrece un cobro innecesario.
  await insertSaleReceipt(saleId, 2, method, "380000.00");
  await page.goto(`/ventas/${saleId}`);
  await expect(page.getByText("Cobrada", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Registrar cobro" })).toHaveCount(
    0,
  );
});

test("brief-24.6.2-b: un viewer consulta la ficha sin «Actividad» ni acciones de gestión", async ({
  page,
}) => {
  const productId = await insertStockedProduct(
    "CAF-250",
    "Café",
    "1000.00",
    "50",
  );
  const clientId = await insertClient("Lucía Gómez");
  const saleId = await insertSaleNumbered(
    1,
    productId,
    clientId,
    "ARS",
    "500000.00",
  );
  await login(page, VIEWER);
  await page.goto(`/ventas/${saleId}`);
  // AC-9: consulta sin acciones de gestión. «Actividad» es solo de admin.
  await expect(
    page
      .getByRole("navigation", { name: "Secciones de la venta V-000001" })
      .getByRole("link", { name: "Actividad" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Registrar cobro" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Anular venta" })).toHaveCount(0);
  // Y sí ve lo suyo: el comprobante y los cobros registrados.
  await expect(page.locator("[data-comprobante]")).toBeVisible();
  await page.goto(`/ventas/${saleId}?pestana=cobros`);
  await expect(
    page.getByRole("region", { name: "Cobros", exact: true }),
  ).toBeVisible();
  await expectAccessible(page, "ficha de la venta, viewer");
});

test("brief-24.6.2-b: el origen de una venta de reparación es su orden de servicio, y sin la capacidad no se lee", async ({
  page,
}) => {
  const productId = await insertStockedProduct(
    "CAF-250",
    "Café",
    "1000.00",
    "50",
  );
  const clientId = await insertClient("Lucía Gómez");
  const saleId = await insertSaleNumbered(
    1,
    productId,
    clientId,
    "ARS",
    "80000.00",
  );
  const model = await db.execute<{ id: string }>(
    sql`insert into product_models (organization_id, name)
        values (${SEED_ORGANIZATION_ID}, 'iPhone 13') returning id`,
  );
  // La orden entregada que produjo esa venta. El CHECK de service_orders exige que sale_id solo
  // exista en una customer_device entregada y reparada, así que se llega por los mismos pasos.
  const order = await db.execute<{ id: string }>(
    sql`insert into service_orders (organization_id, number, client_id, model_id, device_serial,
                                    reported_issue, created_by)
        values (${SEED_ORGANIZATION_ID}, 123, ${clientId}, ${model.rows[0]!.id},
                '356938035643809', 'No carga', ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  const technician = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name) values (${SEED_ORGANIZATION_ID}, 'Taller')
        returning id`,
  );
  // El CHECK service_orders_technician_sent exige técnico desde «sent».
  await db.execute(
    sql`update service_orders set status = 'sent', sent_at = now(),
          technician_id = ${technician.rows[0]!.id} where id = ${orderId}`,
  );
  await db.execute(
    sql`update service_orders set status = 'quoted', quoted_at = now(),
          customer_currency = 'ARS', customer_total = 80000,
          technician_currency = 'ARS', technician_total = 30000 where id = ${orderId}`,
  );
  await db.execute(
    sql`update service_orders set status = 'approved', approved_at = now() where id = ${orderId}`,
  );
  await db.execute(
    sql`update service_orders set status = 'repaired', repaired_at = now() where id = ${orderId}`,
  );
  await db.execute(
    sql`update service_orders set status = 'delivered', delivered_at = now(), sale_id = ${saleId}
        where id = ${orderId}`,
  );

  await login(page, ADMIN);
  const table = page.getByRole("table", { name: "Ventas de la organización" });

  // Sin la capacidad `repairs`, `service` no se consulta y la venta se ve como de mostrador.
  await page.goto("/ventas");
  await expect(table).toContainText("Mostrador");
  await expect(table).not.toContainText("OS-000123");

  // Con la capacidad encendida, el origen es la orden, con su número.
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${SEED_ORGANIZATION_ID}, 'repairs', ${ADMIN_SEED.id})`,
  );
  await page.goto("/ventas");
  await expect(table.getByRole("link", { name: /OS-000123/ })).toBeVisible();
  await expect(table).not.toContainText("Mostrador");
  await expectAccessible(page, "listado con el origen de una reparación");
});

test("brief-24.6.2-b: sin desbordamiento de 320 a 1440 px en el listado y en las tres pestañas, con los controles en 44 px", async ({
  page,
}) => {
  const productId = await insertStockedProduct(
    "CAF-250",
    "Café",
    "1000.00",
    "50",
  );
  const clientId = await insertClient("Lucía Gómez");
  const method = await insertTransferMethod();
  const saleId = await insertSaleNumbered(
    1,
    productId,
    clientId,
    "ARS",
    "500000.00",
  );
  await insertSaleReceipt(saleId, 1, method, "120000.00");
  await login(page, ADMIN);

  for (const ancho of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto("/ventas");
    expect(
      await anchoDesbordado(page),
      `listado a ${ancho} px`,
    ).toBeLessThanOrEqual(0);
    for (const tab of ["", "?pestana=cobros", "?pestana=actividad"]) {
      await page.goto(`/ventas/${saleId}${tab}`);
      expect(
        await anchoDesbordado(page),
        `ficha ${tab || "resumen"} a ${ancho} px`,
      ).toBeLessThanOrEqual(0);
    }
  }

  // AC-14: los controles se **miden**, no se miran. La subfase anterior tuvo dos en 30 y 34 px.
  //
  // **Medido y no corregido**: el botón «Imprimir o guardar PDF» mide **38 px** de alto. Vive en
  // print-button.tsx, que no está en la lista cerrada de esta subfase, así que queda declarado como
  // pendiente en vez de arreglado de prepo. Por eso no está en esta lista.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/ventas/${saleId}`);
  for (const [nombre, control] of [
    ["registrar cobro", page.getByRole("link", { name: "Registrar cobro" })],
    [
      "pestaña Cobros",
      page
        .getByRole("navigation", { name: "Secciones de la venta V-000001" })
        .getByRole("link", { name: "Cobros" }),
    ],
  ] as const) {
    const caja = await control.boundingBox();
    expect(caja, nombre).not.toBeNull();
    expect(
      Math.round(caja!.height),
      `alto de ${nombre}`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      Math.round(caja!.width),
      `ancho de ${nombre}`,
    ).toBeGreaterThanOrEqual(44);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// La 24.6.2-d: el cobro en un panel de la ficha (lámina 03) y la anulación con
// su vista previa (lámina 04).
// ─────────────────────────────────────────────────────────────────────────────

// «Efectivo», para el aviso de la caja cerrada. Como «Transferencia»: payment_methods no está en
// el TRUNCATE de esta spec, así que se reusa el que haya.
async function insertCashMethod() {
  const result = await db.execute<{ id: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Efectivo', true)
        on conflict do nothing
        returning id`,
  );
  if (result.rows[0]) return result.rows[0].id;
  const found = await db.execute<{ id: string }>(
    sql`select id from payment_methods
        where organization_id = ${SEED_ORGANIZATION_ID} and lower(name) = 'efectivo'`,
  );
  return found.rows[0]!.id;
}

// Una venta de 3.000 con 1.000 ya cobrados: dos números distintos para que la vista previa no
// pueda pasar por casualidad con uno solo.
async function insertPartlyCollectedSale() {
  const product = await insertStockedProduct(
    "CAF-250",
    "Café molido",
    "1000",
    "10",
  );
  const saleId = await insertCounterSale(product, "3", "1000", "3000.00");
  await insertSaleReceipt(saleId, 1, await insertTransferMethod(), "1000.00");
  // **El contador va con el recibo que se inserta por SQL.** `document_counters` está en el
  // TRUNCATE de esta spec y `insertSaleReceipt` no lo toca, así que sin esto el primer cobro que
  // registra la aplicación vuelve a pedir el número 1 y choca con el que ya está. El síntoma no
  // dice de dónde viene: la acción devuelve su error genérico y el caso ve una pantalla que no
  // cambió. Costó media hora encontrarlo escribiendo estos casos.
  // Nace en 0 y sube de a uno: lo exige el trigger de la 0036, que rechaza las dos cosas con
  // «document_counters nace en 0».
  await db.execute(
    sql`insert into document_counters (organization_id, kind, last_number)
        values (${SEED_ORGANIZATION_ID}, 'receipt', 0)
        on conflict (organization_id, kind) do nothing`,
  );
  await db.execute(
    sql`update document_counters set last_number = 1
        where organization_id = ${SEED_ORGANIZATION_ID} and kind = 'receipt'`,
  );
  await insertCashMethod();
  return saleId;
}

test("brief-24.6.2-d: el cobro es un panel de la ficha con su vista previa, y /cobrar lleva a él", async ({
  page,
}) => {
  const saleId = await insertPartlyCollectedSale();
  await login(page, ADMIN);

  // AC-13: la ruta que la aplicación viene generando desde la 21.3 sigue respondiendo y lleva al
  // panel. No se borra: borrarla rompería enlaces que el proyecto no controla (D-4).
  await page.goto(`/ventas/${saleId}/cobrar`);
  await expect(page).toHaveURL(/\?pestana=cobros&panel=cobro$/);

  // AC-1: el panel de la lámina 03, con la venta que se está cobrando.
  const panel = page.getByRole("dialog", { name: "Registrar cobro" });
  await expect(panel).toContainText("V-000001");
  // AC-3: sin la capacidad «trade_ins» la permuta **no existe**, ni siquiera deshabilitada: una
  // opción deshabilitada promete una función que la organización no contrató.
  await expect(panel.getByRole("radio", { name: /Permuta/ })).toHaveCount(0);

  // AC-4: la previsión dice la situación **después** del cobro y sigue lo que se escribe.
  const amount = panel.getByLabel(/Monto en/);
  await expect(amount).toHaveValue("2000.00");
  const preview = panel.getByRole("region", { name: "Vista previa del cobro" });
  await expect(preview).toContainText(/Cobrados después:\s*\$\s3\.000,00/);
  await expect(preview).toContainText(/Faltará:\s*\$\s0,00/);
  await expect(preview).toContainText(
    "Previsión. El cobro todavía no se registró.",
  );
  // 800 y no 500: con 500 las dos filas darían 1.500 y la aserción no distinguiría una de la otra.
  await amount.fill("800");
  await expect(preview).toContainText(/Cobrados después:\s*\$\s1\.800,00/);
  await expect(preview).toContainText(/Faltará:\s*\$\s1\.200,00/);
  // Escribir de más no dibuja un saldo negativo: dice el rechazo que el registro va a dar.
  await amount.fill("5000");
  await expect(preview).toContainText("Supera lo que falta cobrar");
  await expectAccessible(page, "panel de cobro");

  // AC-6: efectivo con la caja cerrada avisa, ofrece abrirla y **no borra lo cargado**.
  await amount.fill("2000");
  await panel.getByRole("radio", { name: /Efectivo/ }).check();
  await panel.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page.getByText(/La caja está cerrada/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir caja" })).toBeVisible();
  await expect(panel.getByLabel(/Monto en/)).toHaveValue("2000");
  await expectAccessible(page, "panel de cobro rechazado");

  await panel.getByRole("radio", { name: "Transferencia" }).check();
  await panel.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
  await expect(page.getByText("Se registró el cobro")).toBeVisible();
  // Cobrada: el encabezado ya no ofrece el panel.
  await expect(page.getByRole("link", { name: "Registrar cobro" })).toHaveCount(
    0,
  );
});

// AC-11: las dos piezas andan sin JavaScript. No es una preferencia: 22 archivos de esta carpeta
// lo prueban, y por eso ni el panel ni el diálogo se hicieron con estado de cliente.
test.describe("brief-24.6.2-d sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("el panel de cobro y el diálogo de anulación funcionan igual", async ({
    page,
  }) => {
    const saleId = await insertPartlyCollectedSale();
    await login(page, ADMIN);

    // El panel es una dirección, así que se abre y se cierra con enlaces.
    await page.goto(`/ventas/${saleId}?pestana=cobros&panel=cobro`);
    const panel = page.getByRole("dialog", { name: "Registrar cobro" });
    await expect(panel).toBeVisible();
    // Sin JavaScript la previsión no sigue lo que se escribe, pero dice la verdad al abrirse: la
    // calculó el servidor con el monto propuesto.
    await expect(
      panel.getByRole("region", { name: "Vista previa del cobro" }),
    ).toContainText(/Cobrados después:\s*\$\s3\.000,00/);
    await panel.getByRole("radio", { name: "Transferencia" }).check();
    await panel.getByLabel(/Monto en/).fill("500");
    await panel.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));

    // El diálogo es un <dialog open> del servidor: sin JavaScript no se promueve a modal, y sigue
    // siendo un formulario con sus enlaces.
    await page.goto(`/ventas/${saleId}?confirmar=anular`);
    const dialog = page.getByRole("dialog", { name: "Anular venta V-000001" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Se reponen 3 unidades al stock");
    await expect(dialog).toContainText(/Se conserva el cobro de \$\s1\.500,00/);
    await dialog.getByRole("radio", { name: "Error de carga" }).check();
    await dialog.getByRole("button", { name: "Anular venta" }).click();
    await expect(page).toHaveURL(/\?aviso=anulada$/);
    await expect(page.getByText("Venta anulada.")).toBeVisible();
  });
});
