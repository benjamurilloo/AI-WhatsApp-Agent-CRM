import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 14 a 16 de punta a punta (brief-19.2, AC-9): Chromium, next start, Server Actions,
// orders, crm, catalog, numbering, audit y PostgreSQL real, sin mocks. Los clientes, los productos
// y sus precios los crea cada caso. Desde la 19.3 (AC-8), el ciclo: confirmar, entregar y cancelar
// un confirmado, con lo reservado en las pantallas de productos. Desde la 19.4 (AC-8), el origen de
// un pedido que dejó el agente.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";
const PHONE = "+5491155553333";
const EMAIL = "lucia@example.com";
// El emisor de los pedidos del agente de esta spec (brief-19.4); su credencial se borra en cada caso.
const AGENT_SOURCE = "agente-pedidos-e2e";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// order_lines, product_prices y audit_logs son de solo inserción, y orders y document_counters no
// se borran: TRUNCATE es la vía documentada para vaciarlas (ADR 0013). El contador se vacía para
// que cada caso empiece en P-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, document_counters, audit_logs, inventory_movements,
          inventories, product_images, product_costs, product_prices, attribute_values, stock_units, products, conversation_notes,
          messages, conversations, client_tag_assignments, clients`,
  );
  await db.execute(
    sql`delete from ingestion_credentials where source = ${AGENT_SOURCE}`,
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

async function insertClient(name: string, phone: string | null = null) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, email)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${phone}, ${phone ? EMAIL : null})
        returning id`,
  );
  return result.rows[0]!.id;
}

function setPrice(productId: string, amount: string) {
  return db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${amount}, 'ARS', ${ADMIN_SEED.id})`,
  );
}

async function insertProduct(sku: string, name: string, price: string) {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${sku}, ${name}) returning id`,
  );
  const productId = product.rows[0]!.id;
  await setPrice(productId, price);
  return productId;
}

// Saldo directo por SQL, sin movimiento: estas pantallas no lo concilian.
function setStock(productId: string, quantity: string) {
  return db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${SEED_ORGANIZATION_ID}, ${productId}, ${quantity})`,
  );
}

// Un pedido pendiente por SQL, como lo deja el alta, con sus líneas [producto, cantidad].
async function insertOrder(
  number: number,
  clientId: string,
  lines: [productId: string, quantity: string][],
) {
  const order = await db.execute<{ id: string }>(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId}, 'ARS', '100.00', ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  for (const [index, [productId, quantity]] of lines.entries()) {
    await db.execute(
      sql`insert into order_lines (organization_id, order_id, product_id, position, quantity,
                                   unit_price, currency, line_total)
          values (${SEED_ORGANIZATION_ID}, ${orderId}, ${productId}, ${index + 1}, ${quantity},
                  '10.00', 'ARS', '100.00')`,
    );
  }
  return orderId;
}

// Un pedido que dejó el agente (brief-19.4, D-4), por SQL: la credencial, el evento que lo creó, el
// pedido sin usuario y su auditoría create con la credencial como actor.
async function insertAgentOrder(
  number: number,
  clientId: string,
  lines: [productId: string, quantity: string][],
) {
  const credential = await db.execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${SEED_ORGANIZATION_ID}, ${AGENT_SOURCE}, 'ingest', gen_random_uuid()::text)
        returning id`,
  );
  const credentialId = credential.rows[0]!.id;
  const event = await db.execute<{ id: string }>(
    sql`insert into ingestion_events (organization_id, source, external_ref, event_type,
                                      payload_hash, status, processed_at)
        values (${SEED_ORGANIZATION_ID}, ${AGENT_SOURCE}, gen_random_uuid()::text, 'order.placed',
                'hash', 'processed', now())
        returning id`,
  );
  const order = await db.execute<{ id: string }>(
    sql`insert into orders (organization_id, number, client_id, currency, total,
                            created_by_credential_id, ingestion_event_id)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId}, 'ARS', '100.00', ${credentialId},
                ${event.rows[0]!.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  for (const [index, [productId, quantity]] of lines.entries()) {
    await db.execute(
      sql`insert into order_lines (organization_id, order_id, product_id, position, quantity,
                                   unit_price, currency, line_total)
          values (${SEED_ORGANIZATION_ID}, ${orderId}, ${productId}, ${index + 1}, ${quantity},
                  '10.00', 'ARS', '100.00')`,
    );
  }
  await db.execute(
    sql`insert into audit_logs (organization_id, actor_credential_id, entity_type, entity_id,
                                action, diff)
        values (${SEED_ORGANIZATION_ID}, ${credentialId}, 'order', ${orderId}, 'create',
                ${JSON.stringify({ before: null, after: { number, status: "pending" } })}::jsonb)`,
  );
  return orderId;
}

async function balance(productId: string) {
  const result = await db.execute<{ on_hand: string; reserved: string }>(
    sql`select quantity_on_hand as on_hand, quantity_reserved as reserved
        from inventories where product_id = ${productId}`,
  );
  return result.rows[0];
}

const line = (page: Page, position: number) =>
  page.getByRole("group", { name: `Línea ${position}`, exact: true });

// Elige una opción de un buscador del alta con el teclado: escribe, espera la lista, baja a la
// primera opción y la elige con Enter.
async function pick(scope: Locator | Page, label: string, text: string) {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(text);
  await expect(scope.getByRole("option").first()).toBeVisible();
  await field.press("ArrowDown");
  await field.press("Enter");
}

async function orderCount() {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from orders`,
  );
  return result.rows[0]!.count;
}

test("un admin crea un pedido de dos líneas, lo encuentra y lo cancela", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez", PHONE);
  await insertProduct("CAF-250", "Café molido", "1234.50");
  await insertProduct("TE-100", "Té verde", "800");
  await login(page, ADMIN);

  await page.goto("/pedidos");
  await expect(page.getByText("Todavía no hay pedidos.")).toBeVisible();
  await page.getByRole("link", { name: "+ Nuevo pedido" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuevo pedido" }),
  ).toBeVisible();
  await expectAccessible(page, "alta vacía");

  await pick(page, "Cliente", "Luc");
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
    "Lucía Gómez",
  );
  await pick(line(page, 1), "Producto", "Café");
  await expect(line(page, 1).getByLabel("Producto")).toHaveValue(
    "Café molido (CAF-250)",
  );
  await line(page, 1).getByLabel("Cantidad").fill("3");
  await expect(line(page, 1)).toContainText("Subtotal estimado: $ 3.703,50");
  await pick(line(page, 2), "Producto", "Té");
  await line(page, 2).getByLabel("Cantidad").fill("0,5");
  await expect(page.getByText("Total estimado: $ 4.103,50")).toBeVisible();
  await expectAccessible(page, "alta con dos líneas");

  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}\?aviso=creado$/);
  await expect(
    page.getByRole("heading", { name: "Pedido P-000001" }),
  ).toBeVisible();
  await expect(page.getByText("Pedido creado.")).toBeVisible();
  const lines = page.getByRole("table", { name: /Líneas del pedido/ });
  await expect(lines).toContainText("Café molido");
  await expect(lines).toContainText("$ 3.703,50");
  await expect(lines).toContainText("$ 400,00");
  await expect(lines).toContainText("$ 4.103,50");
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expectAccessible(page, "detalle pendiente");

  await page.goto("/pedidos");
  await expect(page.getByRole("link", { name: "P-000001" })).toHaveCount(1);
  await page.goto(`/clientes/${clientId}`);
  const card = page.getByRole("region", { name: "Pedidos" });
  await expect(card.getByRole("link", { name: "P-000001" })).toBeVisible();
  await card.getByRole("link", { name: "P-000001" }).click();

  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(page.getByText(/¿Cancelar el pedido P-000001\?/)).toBeVisible();
  await expectAccessible(page, "confirmación de la cancelación");
  await page.getByRole("button", { name: "Sí, cancelar el pedido" }).click();
  await expect(page).toHaveURL(/\?aviso=cancelado$/);
  await expect(page.getByText("Pedido cancelado.")).toBeVisible();
  const status = await db.execute<{ status: string }>(
    sql`select status from orders`,
  );
  expect(status.rows[0]!.status).toBe("cancelled");
  await expect(
    page.getByRole("button", { name: "Cancelar pedido" }),
  ).toHaveCount(0);
  const history = page.getByRole("table", { name: /Historia del pedido/ });
  await expect(history).toContainText("Pendiente → Cancelado");
  await expect(history).toContainText("Pedido P-000001 · 2 líneas");

  await page.goto("/pedidos?estado=cancelados");
  await expect(page.getByRole("link", { name: "P-000001" })).toHaveCount(1);
  await page.goto("/pedidos?estado=pendientes");
  await expect(
    page.getByText("Ningún pedido coincide con estos filtros."),
  ).toBeVisible();
});

test("si un precio cambia entre la vista y el envío, muestra el nuevo y no crea nada", async ({
  page,
}) => {
  await insertClient("Martín Ruiz");
  const coffee = await insertProduct("CAF-250", "Café molido", "1000");
  await login(page, ADMIN);
  await page.goto("/pedidos/nuevo");

  await pick(page, "Cliente", "Mar");
  await pick(line(page, 1), "Producto", "Café");
  await line(page, 1).getByLabel("Cantidad").fill("2");
  await expect(line(page, 1)).toContainText("Precio: $ 1.000,00");
  await setPrice(coffee, "1500");

  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Cambió el precio de un producto",
  );
  await expect(line(page, 1)).toContainText("Precio: $ 1.500,00");
  await expect(line(page, 1)).toContainText("El precio cambió.");
  expect(await orderCount()).toBe(0);
  await expectAccessible(page, "precio cambiado");

  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedido P-000001" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: /Líneas del pedido/ }),
  ).toContainText("$ 3.000,00");
});

test("el alta marca cada línea rechazada y no consume número", async ({
  page,
}) => {
  await insertClient("Martín Ruiz");
  const tea = await insertProduct("TE-100", "Té verde", "800");
  await login(page, ADMIN);
  await page.goto("/pedidos/nuevo");

  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Revisá el cliente.",
  );

  await pick(page, "Cliente", "Mar");
  await pick(line(page, 1), "Producto", "Té");
  await line(page, 1).getByLabel("Cantidad").fill("1");
  await db.execute(
    sql`update products set is_active = false where id = ${tea}`,
  );
  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Revisá las líneas marcadas.",
  );
  await expect(line(page, 1)).toContainText("El producto está desactivado.");
  expect(await orderCount()).toBe(0);
  await expectAccessible(page, "línea rechazada");
});

test("un viewer ve la lista y el detalle sin contacto ni botones, y no entra al alta", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez", PHONE);
  const coffee = await insertProduct("CAF-250", "Café molido", "1234.50");
  const order = await db.execute<{ id: string }>(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, 7, ${clientId}, 'ARS', '1234.50', ${ADMIN_SEED.id})
        returning id`,
  );
  const orderId = order.rows[0]!.id;
  await db.execute(
    sql`insert into order_lines (organization_id, order_id, product_id, position, quantity,
                                 unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${orderId}, ${coffee}, 1, '1', '1234.50', 'ARS', '1234.50')`,
  );
  await login(page, VIEWER);

  await page.goto("/pedidos");
  await expect(page.getByRole("link", { name: "P-000007" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "+ Nuevo pedido" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "lista del viewer");

  await page.getByRole("link", { name: "P-000007" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedido P-000007" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Lucía Gómez" })).toBeVisible();
  const content = await page.content();
  expect(content).not.toContain("5491155553333");
  expect(content).not.toContain(EMAIL);
  await expect(
    page.getByRole("button", { name: "Cancelar pedido" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirmar pedido" }),
  ).toHaveCount(0);
  await expect(page.getByRole("table", { name: /Historia/ })).toHaveCount(0);
  await expectAccessible(page, "detalle del viewer");

  // brief-19.3 (revisión independiente, R-7): en un confirmado, tampoco «Marcar entregado».
  const confirmedOrder = await insertOrder(8, clientId, [[coffee, "1"]]);
  await db.execute(
    sql`update orders set status = 'confirmed', confirmed_at = now() where id = ${confirmedOrder}`,
  );
  await page.goto(`/pedidos/${confirmedOrder}`);
  await expect(
    page.getByRole("heading", { name: "Pedido P-000008" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Marcar entregado|Cancelar pedido|Confirmar pedido/,
    }),
  ).toHaveCount(0);

  await page.goto("/pedidos/nuevo");
  await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();

  await page.goto(`/clientes/${clientId}`);
  const card = page.getByRole("region", { name: "Pedidos" });
  await expect(card.getByRole("link", { name: "P-000007" })).toBeVisible();
  await expect(card.getByRole("link", { name: "+ Nuevo pedido" })).toHaveCount(
    0,
  );
});

test("brief-19.3: un admin confirma con el teclado, ve lo reservado en el producto, entrega y ve la entrega en el historial", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez");
  const coffee = await insertProduct("CAF-250", "Café molido", "10");
  await setStock(coffee, "10");
  const orderId = await insertOrder(7, clientId, [[coffee, "3"]]);
  await login(page, ADMIN);

  await page.goto(`/pedidos/${orderId}`);
  const lines = page.getByRole("table", { name: /Líneas del pedido/ });
  await expect(
    lines.getByRole("columnheader", { name: "Disponible" }),
  ).toBeVisible();
  await expect(lines).toContainText("10");
  await expectAccessible(page, "pendiente con lo disponible");

  // Con el teclado (revisión independiente, R-6): Enter en el botón lleva el foco a «Sí, …», y
  // «No, volver» lo devuelve al botón.
  const start = page.getByRole("button", { name: "Confirmar pedido" });
  const yes = page.getByRole("button", { name: "Sí, confirmar el pedido" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(yes).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "No, volver" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(start).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(yes).toBeFocused();
  await expect(
    page.getByText(/¿Confirmar el pedido P-000007\? Reserva el stock/),
  ).toBeVisible();
  await expectAccessible(page, "confirmación de confirmar");
  await expect(yes).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?aviso=confirmado$/);
  await expect(
    page.getByText("Pedido confirmado: el stock quedó reservado."),
  ).toBeVisible();
  expect(await balance(coffee)).toEqual({
    on_hand: "10.000",
    reserved: "3.000",
  });
  await expect(
    page.getByRole("columnheader", { name: "Disponible" }),
  ).toHaveCount(0);
  await expectAccessible(page, "detalle confirmado");

  await page.goto(`/productos/${coffee}`);
  const stock = page.getByRole("region", { name: "Stock" });
  await expect(stock).toContainText("Reservado");
  await expect(stock).toContainText("3 unidad");
  await expect(stock).toContainText("Disponible");
  await expect(stock).toContainText("7 unidad");
  await page.goto("/productos");
  await expect(page.getByRole("main")).toContainText("3 reservado");
  await expectAccessible(page, "lista con lo reservado");

  await page.goto(`/pedidos/${orderId}`);
  await page.getByRole("button", { name: "Marcar entregado" }).click();
  await page.getByRole("button", { name: "Sí, marcar entregado" }).click();
  await expect(page).toHaveURL(/\?aviso=entregado$/);
  expect(await balance(coffee)).toEqual({
    on_hand: "7.000",
    reserved: "0.000",
  });
  await expect(
    page.getByRole("button", { name: /Cancelar pedido|Marcar entregado/ }),
  ).toHaveCount(0);
  const history = page.getByRole("table", { name: /Historia del pedido/ });
  await expect(history).toContainText("Pendiente → Confirmado");
  await expect(history).toContainText("Confirmado → Entregado");

  await page.goto(`/productos/${coffee}/movimientos?tipo=entrega`);
  const movements = page.getByRole("main");
  await expect(movements).toContainText("Entrega de pedido");
  await expect(movements).toContainText("Entrega del pedido P-000007");
  await expectAccessible(page, "historial con la entrega");
});

test("brief-19.3: sin stock no confirma y dice qué falta; un ajuste no baja de lo reservado; cancelar un confirmado libera", async ({
  page,
}) => {
  const clientId = await insertClient("Martín Ruiz");
  const coffee = await insertProduct("CAF-250", "Café molido", "10");
  const tea = await insertProduct("TE-100", "Té verde", "10");
  await setStock(coffee, "2");
  await setStock(tea, "10");
  const short = await insertOrder(1, clientId, [[coffee, "3"]]);
  const enough = await insertOrder(2, clientId, [[tea, "8"]]);
  await login(page, ADMIN);

  await page.goto(`/pedidos/${short}`);
  await expect(page.getByText("No alcanza")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await page.getByRole("button", { name: "Sí, confirmar el pedido" }).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText(
    "No hay stock disponible para confirmar el pedido.",
  );
  await expect(alert).toContainText("Café molido: pide 3, hay 2 disponible.");
  expect(await balance(coffee)).toEqual({
    on_hand: "2.000",
    reserved: "0.000",
  });
  await expectAccessible(page, "confirmación rechazada");

  await page.goto(`/pedidos/${enough}`);
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await page.getByRole("button", { name: "Sí, confirmar el pedido" }).click();
  await expect(page).toHaveURL(/\?aviso=confirmado$/);

  await page.goto(`/productos/${tea}/movimientos`);
  await expect(page.getByText(/Reservado: 8 · Disponible: 2/)).toBeVisible();
  await page.getByLabel("Negativo (−)").check();
  await page.getByLabel("Cantidad *").fill("3");
  await page.getByLabel("Motivo *").fill("Rotura");
  await expect(
    page.getByText(/Por debajo de lo reservado \(8\)/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar ajuste" }).click();
  await expect(
    page.getByText(/por debajo de lo reservado por pedidos confirmados/),
  ).toBeVisible();
  expect(await balance(tea)).toEqual({ on_hand: "10.000", reserved: "8.000" });
  await expectAccessible(page, "ajuste por debajo de lo reservado");

  await page.goto(`/pedidos/${enough}`);
  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(page.getByText(/Libera el stock reservado/)).toBeVisible();
  await page.getByRole("button", { name: "Sí, cancelar el pedido" }).click();
  await expect(page).toHaveURL(/\?aviso=cancelado$/);
  expect(await balance(tea)).toEqual({ on_hand: "10.000", reserved: "0.000" });
  await page.goto(`/productos/${tea}`);
  const stock = page.getByRole("region", { name: "Stock" });
  await expect(stock).toContainText("Reservado");
  await expect(stock).toContainText("0 unidad");
  await expect(stock).toContainText("10 unidad");
});

test("brief-19.4: un pedido del agente muestra su origen en la lista y el detalle, y un admin lo confirma", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Gómez");
  const coffee = await insertProduct("CAF-250", "Café molido", "10");
  await setStock(coffee, "10");
  await insertOrder(8, clientId, [[coffee, "1"]]);
  const agentOrder = await insertAgentOrder(9, clientId, [[coffee, "2"]]);
  await login(page, ADMIN);

  await page.goto("/pedidos");
  const table = page.getByRole("table", { name: "Pedidos de la organización" });
  await expect(
    table.getByRole("columnheader", { name: "Origen" }),
  ).toBeVisible();
  await expect(table.getByRole("row", { name: /P-000009/ })).toContainText(
    "Agente",
  );
  await expect(table.getByRole("row", { name: /P-000008/ })).toContainText(
    "Equipo",
  );
  await expectAccessible(page, "lista con el origen");

  await page.goto(`/pedidos/${agentOrder}`);
  const state = page.getByRole("region", { name: "Estado" });
  await expect(state).toContainText("Origen");
  await expect(state).toContainText(`Agente · ${AGENT_SOURCE}`);
  const history = page.getByRole("table", { name: /Historia del pedido/ });
  await expect(history).toContainText(`Servicio · ${AGENT_SOURCE}`);
  await expectAccessible(page, "detalle de un pedido del agente");

  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await page.getByRole("button", { name: "Sí, confirmar el pedido" }).click();
  await expect(page).toHaveURL(/\?aviso=confirmado$/);
  expect(await balance(coffee)).toEqual({
    on_hand: "10.000",
    reserved: "2.000",
  });
  await expect(state).toContainText(`Agente · ${AGENT_SOURCE}`);
});

// Sin JavaScript, los buscadores son campos de texto: el cliente se reconoce por su nombre exacto
// y el producto por su SKU exacto (brief-19.2, D-7).
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("el alta funciona con el nombre del cliente y el SKU del producto", async ({
    page,
  }) => {
    await insertClient("Martín Ruiz");
    await insertProduct("CAF-250", "Café molido", "1000");
    await login(page, ADMIN);
    await page.goto("/pedidos/nuevo");

    await page.getByLabel("Cliente", { exact: true }).fill("Martín Ruiz");
    await line(page, 1).getByLabel("Producto").fill("caf-250");
    await line(page, 1).getByLabel("Cantidad").fill("2");
    await page.getByRole("button", { name: "Crear pedido" }).click();

    await expect(
      page.getByRole("heading", { name: "Pedido P-000001" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: /Líneas del pedido/ }),
    ).toContainText("$ 2.000,00");
  });
});
