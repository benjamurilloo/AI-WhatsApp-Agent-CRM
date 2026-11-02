import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 14 a 16 de punta a punta (brief-19.2, AC-9): Chromium, next start, Server Actions,
// orders, crm, catalog, numbering, audit y PostgreSQL real, sin mocks. Los clientes, los productos
// y sus precios los crea cada caso. Desde la 19.3 (AC-8), el ciclo: confirmar, entregar y cancelar
// un confirmado, con lo reservado en las pantallas de productos. Desde la 19.4 (AC-8), el origen de
// un pedido que dejó el agente.
//
// Desde la 24.6.1 (brief-24.6.1) las dos pantallas están rediseñadas: la lista tiene una barra de
// estados con contadores y una columna «Resumen», y la ficha tiene tres pestañas y cinco paneles
// que abren y cierran por la URL. Lo que cambió acá es **cómo se llega a cada operación**, no qué
// hace: ninguna regla del pedido se tocó (AC-9).

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
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, document_counters, audit_logs, inventory_movements,
          inventories, product_images, product_costs, product_prices, attribute_values, stock_units, products, conversation_notes,
          messages, conversations, client_tag_assignments, clients`,
  );
  await db.execute(
    sql`delete from ingestion_credentials where source = ${AGENT_SOURCE}`,
  );
  // La capacidad `serialized_units` la encienden solo los casos del alta por equipos de la
  // 24.6.1-b: la semilla no la da, así que se borra para que cada caso empiece sin ella. **Y
  // también al terminar**, abajo: limpiarla solo acá deja la organización semilla con la capacidad
  // puesta cuando termina el último caso del archivo, y se filtra a la spec que corra después.
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${SEED_ORGANIZATION_ID}`,
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

// Apaga `serialized_units` al terminar cada caso, para que no se filtre al archivo siguiente. Ver
// el comentario del `beforeEach`: en `afterEach` para que valga aunque el caso falle.
test.afterEach(async () => {
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${SEED_ORGANIZATION_ID}`,
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

// «Más acciones» del encabezado de la ficha: con JavaScript es un botón de revelación, así que
// la cancelación está detrás de él. Sin JavaScript la lista queda a la vista y este paso no hace
// falta (more-actions.tsx).
async function openMore(page: Page) {
  await page.getByRole("button", { name: "Más acciones del pedido" }).click();
}

// Un panel abierto (brief-24.6.1, D-5; AC-7). Comprueba las tres cosas que las láminas piden y que
// el paso en dos no podía dar: que el panel está **en la URL**, que el cuerpo de la pantalla quedó
// `inert` —exactamente un elemento, no cero— y que el disparador que lo abrió se dibuja
// deshabilitado, para que no queden dos controles activos que ejecuten la misma transición.
async function expectPanelOpen(
  page: Page,
  name: string,
  trigger: string | null = null,
) {
  await expect(page).toHaveURL(new RegExp(`panel=${name}`));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("main [inert]")).toHaveCount(1);
  if (trigger !== null) {
    // El primero es el del encabezado: «Registrar seña» también está dentro de la tarjeta de
    // recibos, y los dos tienen que quedar deshabilitados con el panel abierto.
    const triggers = page.getByRole("link", { name: trigger });
    for (let i = 0; i < (await triggers.count()); i += 1) {
      await expect(triggers.nth(i)).toHaveAttribute("aria-disabled", "true");
    }
    expect(await triggers.count()).toBeGreaterThan(0);
  }
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
  const lines = page.getByRole("table", { name: /Productos del pedido/ });
  await expect(lines).toContainText("Café molido");
  await expect(lines).toContainText("$ 3.703,50");
  await expect(lines).toContainText("$ 400,00");
  await expect(lines).toContainText("$ 4.103,50");
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expectAccessible(page, "detalle pendiente");

  await page.goto("/pedidos");
  await expect(
    page.getByRole("link", { name: "P-000001", exact: true }),
  ).toHaveCount(1);
  // En la pestaña Operaciones de la ficha (brief-24.4.1, D-5).
  await page.goto(`/clientes/${clientId}?pestana=operaciones`);
  const card = page.getByRole("region", { name: /^Operaciones de / });
  await expect(card.getByRole("link", { name: /P-000001/ })).toBeVisible();
  await card.getByRole("link", { name: /P-000001/ }).click();

  // Desde la 24.6.1 la cancelación vive en «Más acciones», en rojo, y **el panel es la
  // confirmación**: ya no hay un botón que abre una pregunta en línea (D-5, AC-6).
  await openMore(page);
  await page.getByRole("link", { name: "Cancelar pedido" }).click();
  await expectPanelOpen(page, "cancelar");
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByRole("heading", { name: "¿Cancelar el pedido P-000001?" }),
  ).toBeFocused();
  // El efecto antes del cambio (AC-8) y «Conservar pedido» antes del destructivo.
  await expect(panel).toContainText("No había reserva que liberar.");
  await expect(panel).toContainText("No se puede deshacer");
  await expect(
    panel.getByRole("link", { name: "Conservar pedido" }),
  ).toBeVisible();
  await expectAccessible(page, "panel de la cancelación");
  await panel.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(page).toHaveURL(/\?aviso=cancelado$/);
  await expect(page.getByText("Pedido cancelado.")).toBeVisible();
  const status = await db.execute<{ status: string }>(
    sql`select status from orders`,
  );
  expect(status.rows[0]!.status).toBe("cancelled");
  // Un pedido cancelado es final: ni acción principal ni «Más acciones», y el panel se cerró.
  await expect(
    page.getByRole("button", { name: "Más acciones del pedido" }),
  ).toHaveCount(0);
  await expect(page.locator("main [inert]")).toHaveCount(0);
  await page.getByRole("link", { name: "Actividad" }).click();
  await expect(page.getByRole("region", { name: "Cronología" })).toContainText(
    "Cancelado",
  );
  const history = page.getByRole("table", { name: /Historia del pedido/ });
  await expect(history).toContainText("Pendiente → Cancelado");
  await expect(history).toContainText("Pedido P-000001 · 2 líneas");

  await page.goto("/pedidos?estado=cancelados");
  await expect(
    page.getByRole("link", { name: "P-000001", exact: true }),
  ).toHaveCount(1);
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
    page.getByRole("table", { name: /Productos del pedido/ }),
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
  await expect(
    page.getByRole("link", { name: "P-000007", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: "+ Nuevo pedido" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "lista del viewer");

  await page.getByRole("link", { name: "P-000007", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pedido P-000007" }),
  ).toBeVisible();
  // El nombre del cliente está en el encabezado y en la tarjeta «Cliente» del Resumen.
  await expect(
    page.getByRole("link", { name: "Lucía Gómez" }).first(),
  ).toBeVisible();
  const content = await page.content();
  expect(content).not.toContain("5491155553333");
  expect(content).not.toContain(EMAIL);
  // Ningún control de gestión (AC-10): ni la acción principal, ni la seña, ni «Más acciones». Y
  // pedir un panel por la URL tampoco se lo abre: `panel` se lee solo para un admin.
  await expect(
    page.getByRole("link", {
      name: /Confirmar pedido|Marcar entregado|Registrar seña|Emitir venta|Cancelar pedido/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Más acciones del pedido" }),
  ).toHaveCount(0);
  await page.goto(`/pedidos/${orderId}?panel=cancelar`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("main [inert]")).toHaveCount(0);
  // La auditoría no se le entrega: en Actividad ve la cronología y nada más.
  await page.getByRole("link", { name: "Actividad" }).click();
  await expect(page.getByRole("region", { name: "Cronología" })).toBeVisible();
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
    page.getByRole("link", {
      name: /Marcar entregado|Cancelar pedido|Confirmar pedido/,
    }),
  ).toHaveCount(0);

  await page.goto("/pedidos/nuevo");
  await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();

  await page.goto(`/clientes/${clientId}?pestana=operaciones`);
  const card = page.getByRole("region", { name: /^Operaciones de / });
  await expect(card.getByRole("link", { name: /P-000007/ })).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Nueva operación" }),
  ).toHaveCount(0);
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
  const lines = page.getByRole("table", { name: /Productos del pedido/ });
  await expect(
    lines.getByRole("columnheader", { name: "Disponible" }),
  ).toBeVisible();
  await expect(lines).toContainText("10");
  await expectAccessible(page, "pendiente con lo disponible");

  // Con el teclado, como exigía la 19.3 (R-6), pero contra el recorrido de la 24.6.1: Enter en el
  // disparador **navega al panel**, el panel pone el foco en su título, y «Volver» lo cierra. Lo
  // que la 19.3 pedía —no perder el teclado entre el disparador y la confirmación— se sigue
  // cumpliendo; lo que cambió es que ahora son dos direcciones y no dos pasos en la misma.
  const start = page.getByRole("link", { name: "Confirmar pedido" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expectPanelOpen(page, "confirmar", "Confirmar pedido");
  const confirmPanel = page.getByRole("dialog");
  const confirmTitle = confirmPanel.getByRole("heading", {
    name: "¿Confirmar el pedido P-000007?",
  });
  await expect(confirmTitle).toBeFocused();
  await expect(confirmPanel).toContainText("Reservará los equipos guardados.");
  await expect(confirmPanel).toContainText("La reserva es íntegra");
  await expectAccessible(page, "panel de confirmar");
  await confirmPanel.getByRole("link", { name: "Volver" }).click();
  await expect(page.locator("main [inert]")).toHaveCount(0);

  await start.focus();
  await page.keyboard.press("Enter");
  await expect(confirmTitle).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    confirmPanel.getByRole("link", { name: "Volver" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const confirmSubmit = confirmPanel.getByRole("button", {
    name: "Confirmar reserva",
  });
  await expect(confirmSubmit).toBeFocused();
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
  // La franja de la lámina 03 y el «Siguiente paso», que dicen qué compromete el estado y qué va
  // a hacer el botón principal antes de abrirlo (AC-6 y AC-8).
  await expect(page.getByRole("main")).toContainText(
    "El equipo está reservado para este pedido.",
  );
  await expect(
    page.getByRole("region", { name: "Siguiente paso" }),
  ).toContainText("Marcar entregado registra la salida");
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
  await page.getByRole("link", { name: "Marcar entregado" }).click();
  await expectPanelOpen(page, "entregar", "Marcar entregado");
  const deliverPanel = page.getByRole("dialog");
  await expect(deliverPanel).toContainText("Registrará la salida de stock");
  await expect(deliverPanel).toContainText("Este paso no se puede deshacer.");
  await deliverPanel.getByRole("button", { name: "Confirmar entrega" }).click();
  await expect(page).toHaveURL(/\?aviso=entregado$/);
  expect(await balance(coffee)).toEqual({
    on_hand: "7.000",
    reserved: "0.000",
  });
  await expect(
    page.getByRole("link", { name: /Cancelar pedido|Marcar entregado/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Más acciones del pedido" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Actividad" }).click();
  const history = page.getByRole("table", { name: /Historia del pedido/ });
  await expect(history).toContainText("Pendiente → Confirmado");
  await expect(history).toContainText("Confirmado → Entregado");
  // El stepper de la lámina 05, dentro de Actividad (V-1).
  const chronology = page.getByRole("region", { name: "Cronología" });
  for (const step of ["Creado", "Confirmado", "Entregado"]) {
    await expect(chronology).toContainText(step);
  }

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
  await page.getByRole("link", { name: "Confirmar pedido" }).click();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText(
    "No hay stock disponible para confirmar el pedido.",
  );
  await expect(alert).toContainText("Café molido: pide 3, hay 2 disponible.");
  // El «Ver disponibilidad» de la lámina 08, que acá lleva a la columna «Estado de stock».
  await expect(
    alert.getByRole("link", { name: "Ver el estado de stock de los equipos" }),
  ).toBeVisible();
  expect(await balance(coffee)).toEqual({
    on_hand: "2.000",
    reserved: "0.000",
  });
  await expectAccessible(page, "confirmación rechazada");

  await page.goto(`/pedidos/${enough}`);
  await page.getByRole("link", { name: "Confirmar pedido" }).click();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page).toHaveURL(/\?aviso=confirmado$/);

  await page.goto(`/productos/${tea}/movimientos`);
  // Desde la 24.5.1 la línea lleva también el stock y va sin dos puntos (brief-24.5.1, D-8); lo
  // que esta prueba vigila sigue siendo lo de la 19.3: que reservado y disponible sean 8 y 2.
  await expect(
    page.getByText(/Stock 10 unidad · Reservado 8 · Disponible 2/),
  ).toBeVisible();
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
  await openMore(page);
  await page.getByRole("link", { name: "Cancelar pedido" }).click();
  const releasePanel = page.getByRole("dialog");
  await expect(releasePanel).toContainText("Liberará los equipos reservados.");
  await releasePanel.getByRole("button", { name: "Cancelar pedido" }).click();
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
  // El origen va en la línea del encabezado y, con su emisor, en la tarjeta de la lámina 03: la
  // región «Estado» de la 19.4 ya no existe.
  await expect(page.getByRole("main")).toContainText(
    `Origen: Agente · ${AGENT_SOURCE}`,
  );
  const origin = page.getByRole("region", { name: "Origen del pedido" });
  await expect(origin).toContainText(`Agente · ${AGENT_SOURCE}`);
  await expectAccessible(page, "detalle de un pedido del agente");

  await page.goto(`/pedidos/${agentOrder}?pestana=actividad`);
  const history = page.getByRole("table", { name: /Historia del pedido/ });
  await expect(history).toContainText(`Servicio · ${AGENT_SOURCE}`);

  await page.goto(`/pedidos/${agentOrder}`);
  await page.getByRole("link", { name: "Confirmar pedido" }).click();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page).toHaveURL(/\?aviso=confirmado$/);
  expect(await balance(coffee)).toEqual({
    on_hand: "10.000",
    reserved: "2.000",
  });
  await expect(origin).toContainText(`Agente · ${AGENT_SOURCE}`);
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
      page.getByRole("table", { name: /Productos del pedido/ }),
    ).toContainText("$ 2.000,00");
  });
});

// Lo que sigue es de la 24.6.1 (brief-24.6.1): la barra de estados con contadores, la columna
// «Resumen», las tres pestañas, los cinco paneles, los chips de grado y batería, y el barrido de
// anchos con axe. Lo de arriba es de la 19.2 a la 19.4 y sigue mandando: ninguna regla cambió.

// Fija el estado de un pedido por SQL **pasando por los estados intermedios y con sus fechas**.
// Las dos defensas de la base lo exigen: el CHECK `orders_status_dates` no acepta un confirmado
// sin `confirmed_at`, y el trigger `orders_guard_change` rechaza `pendiente → entregado` incluso
// por SQL directo. Se fija por SQL y no con las acciones porque estas pruebas miran las pantallas
// nuevas, no las transiciones, que ya tienen sus propios casos más arriba.
async function setStatus(
  orderId: string,
  status: "confirmed" | "delivered" | "cancelled",
) {
  if (status === "cancelled") {
    await db.execute(
      sql`update orders set status = 'cancelled', cancelled_at = now() where id = ${orderId}`,
    );
    return;
  }
  await db.execute(
    sql`update orders set status = 'confirmed', confirmed_at = now() where id = ${orderId}`,
  );
  if (status === "delivered") {
    await db.execute(
      sql`update orders set status = 'delivered', delivered_at = now() where id = ${orderId}`,
    );
  }
}

// Un producto que se vende por unidad, con sus unidades, su grado y su batería, enganchadas a la
// línea de un pedido (brief-24.6.1, D-6 y AC-20). `unit_grades` no se vacía en cada caso, así que
// el grado se borra antes de crearlo: su nombre es único por organización.
async function addUnits(
  orderId: string,
  productId: string,
  units: [serial: string, battery: number | null][],
) {
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${productId}`,
  );
  await db.execute(
    sql`delete from unit_grades where organization_id = ${SEED_ORGANIZATION_ID}`,
  );
  const grade = await db.execute<{ id: string }>(
    sql`insert into unit_grades (organization_id, name, position)
        values (${SEED_ORGANIZATION_ID}, 'A', 1) returning id`,
  );
  const gradeId = grade.rows[0]!.id;
  const lineRow = await db.execute<{ id: string }>(
    sql`select id from order_lines where order_id = ${orderId} and product_id = ${productId}`,
  );
  const lineId = lineRow.rows[0]!.id;
  for (const [serial, battery] of units) {
    const unit = await db.execute<{ id: string }>(
      sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
                                   origin_type, grade_id, battery_health, created_by)
          values (${SEED_ORGANIZATION_ID}, ${productId}, ${serial}, 100, 'ARS', 'manual',
                  ${gradeId}, ${battery}, ${ADMIN_SEED.id})
          returning id`,
    );
    await db.execute(
      sql`insert into order_line_units (organization_id, order_line_id, product_id, unit_id,
                                        unit_price)
          values (${SEED_ORGANIZATION_ID}, ${lineId}, ${productId}, ${unit.rows[0]!.id},
                  '100.00')`,
    );
  }
}

// Desbordamiento horizontal: la medida sale del documento, no de la vista. `scrollWidth` mayor que
// `clientWidth` es exactamente la barra horizontal que no tiene que aparecer.
const anchoDesbordado = (page: Page) =>
  page.evaluate(() => {
    const raiz = document.documentElement;
    return raiz.scrollWidth - raiz.clientWidth;
  });

test("brief-24.6.1: la barra de estados cuenta cada estado y el «Resumen» dice qué se pidió", async ({
  page,
}) => {
  // AC-1 a AC-4. Cinco pedidos en los cuatro estados, con uno repetido para que un contador que
  // devolviera «1 por estado» no pase por casualidad, y uno de otro cliente para el ámbito.
  const lucia = await insertClient("Lucía Gómez");
  const martin = await insertClient("Martín Ruiz");
  const coffee = await insertProduct("CAF-250", "Café molido", "10");
  const tea = await insertProduct("TE-100", "Té verde", "10");
  await insertOrder(1, lucia, [
    [coffee, "3"],
    [tea, "1"],
  ]);
  await insertOrder(2, martin, [[coffee, "1"]]);
  await setStatus(await insertOrder(3, lucia, [[coffee, "1"]]), "confirmed");
  await setStatus(await insertOrder(4, lucia, [[coffee, "1"]]), "delivered");
  await setStatus(await insertOrder(5, lucia, [[coffee, "1"]]), "cancelled");
  await login(page, ADMIN);

  await page.goto("/pedidos");
  const bar = page.getByRole("navigation", { name: "Estado de los pedidos" });
  const counters: [string, number][] = [
    ["Todos", 5],
    ["Pendientes", 2],
    ["Confirmados", 1],
    ["Entregados", 1],
    ["Cancelados", 1],
  ];
  for (const [label, count] of counters) {
    await expect(
      bar.getByRole("link", { name: `${label} ${count}` }),
    ).toBeVisible();
  }

  // AC-1: las siete columnas de la lámina 01, y la fila con su cliente, su estado, su origen, su
  // total y su «Ver».
  const table = page.getByRole("table", { name: "Pedidos de la organización" });
  for (const column of [
    "Pedido",
    "Cliente",
    "Resumen",
    "Estado",
    "Origen",
    "Total",
    "Acción",
  ]) {
    await expect(
      table.getByRole("columnheader", { name: column }),
    ).toBeVisible();
  }
  const first = table.getByRole("row", { name: /P-000001/ });
  await expect(first).toContainText("Lucía Gómez");
  await expect(first).toContainText("Pendiente");
  await expect(first).toContainText("Equipo");
  await expect(first).toContainText("$ 100,00");
  await expect(first.getByRole("link", { name: /^Ver/ })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "Pendiente: sin reserva · Confirmado: stock reservado · Entregado: salida registrada.",
  );

  // AC-4: el resumen nombra el producto de la **primera** línea y dice cuántas más hay.
  await expect(first).toContainText("Café molido y 1 más · 2 líneas");
  await expect(table.getByRole("row", { name: /P-000002/ })).toContainText(
    "Café molido · 1 línea",
  );

  // AC-2: cada contador coincide con la cantidad de filas que su filtro devuelve, y los contadores
  // **no cambian** al mirar otra pestaña: cuentan dentro del ámbito, no del estado elegido.
  for (const [param, count] of [
    ["pendientes", 2],
    ["confirmados", 1],
    ["entregados", 1],
    ["cancelados", 1],
  ] as const) {
    await page.goto(`/pedidos?estado=${param}`);
    await expect(table.getByRole("row")).toHaveCount(count + 1);
    await expect(bar.getByRole("link", { name: "Pendientes 2" })).toBeVisible();
  }

  // AC-3: con un cliente filtrado, los contadores cuentan dentro de ese ámbito.
  await page.goto(`/pedidos?cliente=${lucia}`);
  await expect(bar.getByRole("link", { name: "Todos 4" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Pendientes 1" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Cancelados 1" })).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(4 + 1);
  // Y con un número, también.
  await page.goto("/pedidos?numero=P-000002");
  await expect(bar.getByRole("link", { name: "Todos 1" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Pendientes 1" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Confirmados 0" })).toBeVisible();
  await expectAccessible(page, "lista filtrada por número");

  // El buscador de clientes de D-11: elegir una sugerencia manda el id, que es exacto, y el
  // listado y los contadores quedan en su ámbito.
  await page.goto("/pedidos");
  await pick(page, "Cliente", "Luc");
  await page.getByRole("main").getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(new RegExp(`cliente=${lucia}`));
  await expect(page.getByRole("main")).toContainText("Pedidos de Lucía Gómez");
  await expect(bar.getByRole("link", { name: "Todos 4" })).toBeVisible();
  expect(martin).not.toBe(lucia);
});

test("brief-24.6.1: la ficha tiene tres pestañas y cinco paneles que abren y cierran por la URL", async ({
  page,
}) => {
  // AC-5 y AC-7. Un pendiente para confirmar, cancelar y señar, un confirmado para entregar, y un
  // entregado sin venta para emitirla.
  const clientId = await insertClient("Lucía Gómez", PHONE);
  const coffee = await insertProduct("CAF-250", "Café molido", "10");
  await setStock(coffee, "10");
  const pending = await insertOrder(1, clientId, [[coffee, "2"]]);
  const confirmed = await insertOrder(2, clientId, [[coffee, "1"]]);
  await setStatus(confirmed, "confirmed");
  const delivered = await insertOrder(3, clientId, [[coffee, "1"]]);
  await setStatus(delivered, "delivered");
  await login(page, ADMIN);

  // Las tres pestañas, por URL, con lo que cada una muestra.
  await page.goto(`/pedidos/${pending}`);
  const tabs = page.getByRole("navigation", {
    name: "Secciones del pedido P-000001",
  });
  await expect(tabs.getByRole("link", { name: "Resumen" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("table", { name: /Productos del pedido/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Siguiente paso" }),
  ).toBeVisible();
  // Las tres tarjetas, con lo señado y lo que falta compuestos con `cash` por la página (D-3).
  const main = page.getByRole("main");
  await expect(main).toContainText("Total del pedido");
  await expect(main).toContainText("Señado");
  await expect(main).toContainText("Falta del total");

  await tabs.getByRole("link", { name: "Señas" }).click();
  await expect(page).toHaveURL(/pestana=senas/);
  await expect(
    page.getByRole("region", { name: "Señas registradas" }),
  ).toBeVisible();
  await expect(main).toContainText("Una seña no confirma el pedido");
  await expect(
    page.getByRole("table", { name: /Productos del pedido/ }),
  ).toHaveCount(0);
  await expectAccessible(page, "pestaña Señas");

  await tabs.getByRole("link", { name: "Actividad" }).click();
  await expect(page).toHaveURL(/pestana=actividad/);
  await expect(page.getByRole("region", { name: "Cronología" })).toBeVisible();
  // El pedido lo insertó SQL, así que no tiene auditoría: lo que se comprueba es que la tarjeta
  // **se pide en esta pestaña**, con su vacío. Que sus filas digan lo que pasó lo prueban los
  // casos de la 19.2 y la 19.3, sobre pedidos creados por la pantalla.
  await expect(
    page.getByRole("region", { name: "Historial de auditoría" }),
  ).toContainText("Sin cambios registrados todavía.");
  // Actividad no pide los recibos: las tarjetas de dinero no están (AC-5).
  await expect(main).not.toContainText("Falta del total");
  // Y aun así **el encabezado es el mismo en las tres pestañas**, que es lo que pide el README de
  // la v2. Es el choque que esta subfase tuvo que resolver: el botón de la seña no puede depender
  // de una lectura que esta pestaña no hace.
  for (const accion of ["Confirmar pedido", "Registrar seña"]) {
    await expect(page.getByRole("link", { name: accion })).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Más acciones del pedido" }),
  ).toBeVisible();
  await expectAccessible(page, "pestaña Actividad");

  // Los paneles del pendiente, y que cerrarlos devuelve la pantalla.
  await page.goto(`/pedidos/${pending}?pestana=senas&panel=senar`);
  await expectPanelOpen(page, "senar", "Registrar seña");
  await expect(page.getByRole("dialog")).toContainText("Registrar seña");
  await expectAccessible(page, "panel de la seña");
  await page.goto(`/pedidos/${pending}?panel=confirmar`);
  await expectPanelOpen(page, "confirmar", "Confirmar pedido");
  await page.getByRole("dialog").getByRole("link", { name: "Volver" }).click();
  await expect(page).toHaveURL(new RegExp(`/pedidos/${pending}$`));
  await expect(page.locator("main [inert]")).toHaveCount(0);

  // Pedir un panel que el estado no permite no ejecuta nada: lo dice y ofrece volver.
  await page.goto(`/pedidos/${pending}?panel=entregar`);
  await expect(page.getByRole("dialog")).toContainText(
    "Esta operación ya no está disponible para este pedido.",
  );

  await page.goto(`/pedidos/${confirmed}?panel=entregar`);
  await expectPanelOpen(page, "entregar", "Marcar entregado");

  // Un panel abierto **desde Actividad** dice el dinero igual (AC-8). Es el caso que se escapó:
  // Actividad no pide los recibos, y los paneles se abren conservando la pestaña, así que el
  // bloque de dinero desaparecía sin avisar (revisión independiente, F-1).
  await page.goto(`/pedidos/${confirmed}?pestana=actividad&panel=entregar`);
  await expect(page.getByRole("dialog")).toContainText("Falta por cobrar");
  await page.goto(`/pedidos/${delivered}?pestana=actividad&panel=emitir`);
  await expect(page.getByRole("dialog")).toContainText("Faltará cobrar");
  await expect(page.getByRole("dialog")).toContainText("Seña existente");

  // El panel de la venta de la lámina 06, con su resumen económico y sus tres afirmaciones.
  await page.goto(`/pedidos/${delivered}`);
  await page.getByRole("link", { name: "Emitir venta" }).click();
  await expectPanelOpen(page, "emitir", "Emitir venta");
  const issue = page.getByRole("dialog");
  await expect(issue).toContainText("Emitir la venta del pedido P-000003");
  await expect(issue).toContainText("Faltará cobrar");
  await expect(issue).toContainText("No vuelve a descontar stock");
  await expect(issue).toContainText(
    "La venta emitida no se edita ni se borra.",
  );
  await expectAccessible(page, "panel de emitir la venta");
  // La dirección que la 20.2 viene generando desde octubre sigue abriendo el mismo panel.
  await page.goto(`/pedidos/${delivered}?confirmar=venta`);
  await expect(page.getByRole("dialog")).toContainText(
    "Emitir la venta del pedido P-000003",
  );
  // Y `/senar` redirige al panel, con la moneda elegida (D-5).
  await page.goto(`/pedidos/${pending}/senar?moneda=USD`);
  await expect(page).toHaveURL(/\?panel=senar&moneda=USD$/);
});

test("brief-24.6.1: la ficha muestra el grado y la batería de cada equipo, y su estado de stock", async ({
  page,
}) => {
  // AC-20 y V-2. Los dos datos son opcionales: la segunda unidad va sin batería, para comprobar
  // que lo que no hay no se dibuja, en vez de aparecer como un «—» que parecería un dato.
  const clientId = await insertClient("Lucía Gómez");
  const coffee = await insertProduct("CAF-250", "Café molido", "100");
  const orderId = await insertOrder(1, clientId, [[coffee, "2"]]);
  await addUnits(orderId, coffee, [
    ["356938035643801", 92],
    ["356938035643802", null],
  ]);
  await login(page, ADMIN);

  await page.goto(`/pedidos/${orderId}`);
  const lines = page.getByRole("table", { name: /Productos del pedido/ });
  await expect(
    lines.getByRole("columnheader", { name: "Estado de stock" }),
  ).toBeVisible();
  const imeis = lines.getByRole("list", { name: "IMEI" }).getByRole("listitem");
  await expect(imeis).toHaveCount(2);
  // El grado en las dos; la batería solo en la que la declaró.
  await expect(imeis.filter({ hasText: "Grado A" })).toHaveCount(2);
  await expect(imeis.filter({ hasText: "Batería" })).toHaveCount(1);
  await expect(imeis.filter({ hasText: "Batería 92 %" })).toHaveCount(1);
  await expect(lines).toContainText("IMEI 356938035643801");
  await expect(lines).toContainText("Disponible");
  await expectAccessible(page, "ficha con grado y batería");

  // Y en el teléfono, donde la lámina 07 los pone bajo el IMEI.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.reload();
  await expect(page.getByRole("main")).toContainText("Grado A");
  await expect(page.getByRole("main")).toContainText("Batería 92 %");
  expect(
    await anchoDesbordado(page),
    "desbordamiento de la ficha con equipos a 390 px",
  ).toBe(0);
  await expectAccessible(page, "ficha con equipos a 390 px");
});

test("brief-24.6.1: sin desbordamiento horizontal en la lista, las tres pestañas y los paneles, de 320 a 1440 px", async ({
  page,
}) => {
  // AC-13. Los cinco anchos del criterio, sobre las dos pantallas, sus tres pestañas y sus cuatro
  // paneles. Un panel con un ancho fijo es donde esto se nota primero: por eso van en la lista.
  const clientId = await insertClient("Lucía Gómez", PHONE);
  const coffee = await insertProduct("CAF-250", "Café molido", "123456.78");
  await setStock(coffee, "10");
  const pending = await insertOrder(1, clientId, [[coffee, "2"]]);
  const delivered = await insertOrder(2, clientId, [[coffee, "1"]]);
  await setStatus(delivered, "delivered");
  await login(page, ADMIN);

  const rutas = [
    "/pedidos",
    "/pedidos?estado=pendientes",
    `/pedidos?cliente=${clientId}`,
    `/pedidos/${pending}`,
    `/pedidos/${pending}?pestana=senas`,
    `/pedidos/${pending}?pestana=actividad`,
    `/pedidos/${pending}?panel=confirmar`,
    `/pedidos/${pending}?panel=cancelar`,
    `/pedidos/${pending}?panel=senar`,
    `/pedidos/${delivered}?panel=emitir`,
  ];
  for (const ancho of [320, 390, 640, 1082, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    for (const ruta of rutas) {
      await page.goto(ruta);
      await expect(page.getByRole("main")).toBeVisible();
      expect(
        await anchoDesbordado(page),
        `desbordamiento en ${ruta} a ${ancho} px`,
      ).toBe(0);
    }
  }

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/pedidos");
  await expectAccessible(page, "lista a 320 px");
  await page.goto(`/pedidos/${pending}?panel=cancelar`);
  await expectAccessible(page, "panel de la cancelación a 320 px");
});

// Sin JavaScript, la 24.6.1 agrega dos recorridos: los paneles, que son páginas servidas, y el
// buscador de clientes, que sin id manda solo el nombre escrito (D-11).
test.describe("sin JavaScript, la 24.6.1", () => {
  test.use({ javaScriptEnabled: false });

  test("los paneles abren por la URL y la operación se ejecuta igual", async ({
    page,
  }) => {
    const clientId = await insertClient("Lucía Gómez");
    const coffee = await insertProduct("CAF-250", "Café molido", "10");
    await setStock(coffee, "10");
    const orderId = await insertOrder(1, clientId, [[coffee, "2"]]);
    await login(page, ADMIN);

    await page.goto(`/pedidos/${orderId}`);
    await page.getByRole("link", { name: "Confirmar pedido" }).click();
    await expect(page).toHaveURL(/panel=confirmar/);
    const panel = page.getByRole("dialog");
    await expect(panel).toContainText("¿Confirmar el pedido P-000001?");
    await panel.getByRole("button", { name: "Confirmar reserva" }).click();
    await expect(page).toHaveURL(/\?aviso=confirmado$/);
    expect(await balance(coffee)).toEqual({
      on_hand: "10.000",
      reserved: "2.000",
    });

    // Las pestañas también son enlaces, y «Más acciones» queda a la vista sin su botón.
    await page.getByRole("link", { name: "Actividad" }).click();
    await expect(
      page.getByRole("region", { name: "Cronología" }),
    ).toContainText("Confirmado");
  });

  test("el buscador de clientes filtra por el nombre escrito, y dice qué pasó si no resuelve", async ({
    page,
  }) => {
    const clientId = await insertClient("Lucía Gómez");
    await insertClient("Martín Ruiz");
    const coffee = await insertProduct("CAF-250", "Café molido", "10");
    await insertOrder(1, clientId, [[coffee, "1"]]);
    await insertOrder(2, await insertClient("Ana Pérez"), [[coffee, "1"]]);
    await login(page, ADMIN);

    await page.goto("/pedidos");
    await page.getByLabel("Cliente", { exact: true }).fill("Lucía Gómez");
    await page
      .getByRole("main")
      .getByRole("button", { name: "Buscar" })
      .click();
    // Sin JavaScript no hay id: lo único que viaja es el nombre, y la pantalla lo resuelve por
    // coincidencia exacta.
    await expect(page).toHaveURL(/clienteNombre=/);
    await expect(page).not.toHaveURL(/cliente=[0-9a-f]{8}/);
    await expect(
      page.getByRole("link", { name: "P-000001", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "P-000002", exact: true }),
    ).toHaveCount(0);
    const bar = page.getByRole("navigation", { name: "Estado de los pedidos" });
    await expect(bar.getByRole("link", { name: "Todos 1" })).toBeVisible();
    await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
      "Lucía Gómez",
    );

    // Un nombre que no resuelve no filtra por un cliente cualquiera: deja la lista vacía y lo
    // dice, con los contadores en cero por el mismo camino.
    await page.goto("/pedidos?clienteNombre=Nadie");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Ningún cliente activo se llama «Nadie»",
    );
    await expect(bar.getByRole("link", { name: "Todos 0" })).toBeVisible();
    await expect(
      page.getByText("Ningún pedido coincide con estos filtros."),
    ).toBeVisible();
    // Sin axe: necesita JavaScript para inyectarse, y acá está apagado.
  });
});

// Un producto que se vende por unidad con unidades **disponibles**, que es lo que ofrece el panel
// del alta (brief-24.6.1-b). A diferencia de `addUnits`, estas no están enganchadas a ningún
// pedido. Cada unidad puede traer su propio precio: así el subtotal no puede salir de multiplicar
// la cantidad por el precio del producto, y si saliera de ahí la aserción lo delata.
async function insertUnitProduct(
  sku: string,
  name: string,
  price: string,
  units: [serial: string, battery: number | null, unitPrice: string | null][],
) {
  const productId = await insertProduct(sku, name, price);
  await db.execute(
    sql`update products set tracking = 'unit' where id = ${productId}`,
  );
  // Sin la capacidad, el alta pide la cantidad y no los equipos: es la que enciende esta pantalla.
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${SEED_ORGANIZATION_ID}, 'serialized_units', ${ADMIN_SEED.id})
        on conflict do nothing`,
  );
  await db.execute(
    sql`delete from unit_grades where organization_id = ${SEED_ORGANIZATION_ID}`,
  );
  const grade = await db.execute<{ id: string }>(
    sql`insert into unit_grades (organization_id, name, position)
        values (${SEED_ORGANIZATION_ID}, 'A', 1) returning id`,
  );
  const gradeId = grade.rows[0]!.id;
  for (const [serial, battery, unitPrice] of units) {
    await db.execute(
      sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
                                   price, price_currency, origin_type, grade_id, battery_health,
                                   created_by)
          values (${SEED_ORGANIZATION_ID}, ${productId}, ${serial}, 100, 'ARS', ${unitPrice},
                  ${unitPrice === null ? null : "ARS"}, 'manual', ${gradeId}, ${battery},
                  ${ADMIN_SEED.id})`,
    );
  }
  return productId;
}

const IPHONE_UNITS: [string, number | null, string | null][] = [
  ["356938035643421", 91, "120.00"],
  ["356938035643422", 88, "130.00"],
  ["356938035643423", 87, null],
];

test("brief-24.6.1-b: el panel elige dos equipos, los chips los muestran y el subtotal los suma", async ({
  page,
}) => {
  // AC-1 a AC-7. Tres unidades, con una sin precio propio para que herede el del producto.
  await insertClient("Lucía Gómez");
  await insertUnitProduct("IPH-13", "iPhone 13", "100", IPHONE_UNITS);
  await login(page, ADMIN);
  await page.goto("/pedidos/nuevo");

  await pick(page, "Cliente", "Luc");
  await pick(line(page, 1), "Producto", "iPhone");
  // AC-13: el precio unitario es un campo de solo lectura, como en la lámina, y no el renglón de
  // texto de antes.
  await expect(line(page, 1)).toContainText("Precio unitario");
  await expect(line(page, 1)).toContainText("$ 100,00");
  await expect(line(page, 1)).toContainText("Todavía no elegiste equipos.");

  // AC-6, primera mitad: sin el panel abierto no hay nada inerte y se puede crear.
  const crear = page.getByRole("button", { name: "Crear pedido" });
  await expect(crear).toBeEnabled();
  await expect(page.locator("[inert]")).toHaveCount(0);

  const abrir = line(page, 1).getByRole("button", {
    name: "Elegir unidades",
    exact: true,
  });
  await expect(abrir).toHaveAttribute("aria-haspopup", "dialog");
  await abrir.click();

  // AC-1: la forma de la lámina, por rol y por texto.
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByRole("heading", { name: "Elegir unidades", exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText("iPhone 13 (IPH-13)");
  await expect(panel).toContainText("$ 100,00");
  await expect(panel.getByRole("searchbox")).toBeVisible();
  await expect(panel.getByRole("checkbox")).toHaveCount(3);
  await expect(panel.getByRole("button", { name: "Volver" })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Usar selección" }),
  ).toBeVisible();
  // La unidad sin precio propio muestra el del producto, no «sin precio».
  await expect(panel).toContainText("Grado A · Batería 87 %");

  // El objetivo táctil del README de la v2: 44 px de lado. Medido, no supuesto — los dos
  // controles nuevos quedaban en ~30 y ~34 px hasta que la revisión independiente los midió.
  const lado = (control: Locator) =>
    control.evaluate((el) => {
      const caja = el.getBoundingClientRect();
      return Math.min(Math.round(caja.width), Math.round(caja.height));
    });
  expect(
    await lado(
      panel.getByRole("button", { name: "Cerrar el panel de unidades" }),
    ),
    "el botón de cerrar el panel",
  ).toBeGreaterThanOrEqual(44);

  // AC-6, segunda mitad: con el panel abierto, el cuerpo es inerte y no se puede crear.
  await expect(page.locator("[inert]")).toHaveCount(1);
  await expect(crear).toBeDisabled();
  await expect(abrir).toHaveAttribute("aria-disabled", "true");

  // AC-4: el recuento dice la verdad antes y después de elegir.
  await expect(panel).toContainText("3 disponibles · 0 seleccionadas");
  await panel.getByRole("checkbox", { name: /356938035643421/ }).check();
  await panel.getByRole("checkbox", { name: /356938035643422/ }).check();
  await expect(panel).toContainText("3 disponibles · 2 seleccionadas");

  // AC-3: buscar **no pide nada**. Se cuentan las peticiones que salen del navegador mientras se
  // escribe, no se estima: la lista ya está en memoria.
  let pedidos = 0;
  const contar = () => {
    pedidos += 1;
  };
  page.on("request", contar);
  await panel.getByRole("searchbox").fill("643423");
  await expect(panel.getByRole("checkbox")).toHaveCount(1);
  await expect(panel).toContainText("1 disponible · 2 seleccionadas");
  page.off("request", contar);
  expect(pedidos, "buscar en el panel no pide nada al servidor").toBe(0);

  await panel.getByRole("searchbox").fill("");
  await expect(panel.getByRole("checkbox")).toHaveCount(3);
  await expectAccessible(page, "alta con el panel abierto");

  // AC-2: usar la selección deja dos chips, la cantidad en equipos y el subtotal sumado.
  await panel.getByRole("button", { name: "Usar selección" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // El foco vuelve al disparador que lo abrió.
  await expect(abrir).toBeFocused();
  const chips = line(page, 1).getByRole("list", {
    name: /Equipos seleccionados/,
  });
  // El nombre del grupo lleva **el producto**, que es la mitad de AC-5 que el chip no muestra y
  // que el regex de arriba no fija: pasaría igual si el producto desapareciera del nombre. Se
  // comprueba entero una vez. Lo encontró la revisión independiente.
  await expect(
    line(page, 1).getByRole("list", {
      name: "Equipos seleccionados de iPhone 13 (IPH-13)",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(chips).toContainText("356938035643421");
  await expect(chips).toContainText("356938035643422");
  await expect(chips).toContainText("$ 120,00");
  await expect(chips).toContainText("$ 130,00");
  await expect(line(page, 1)).toContainText("2 equipos");
  await expect(line(page, 1)).toContainText("$ 250,00");
  await expect(page.getByText("Total estimado: $ 250,00")).toBeVisible();
  await expect(crear).toBeEnabled();

  // AC-5: quitar un chip identifica la unidad en su nombre accesible.
  const quitar = page.getByRole("button", {
    name: "Quitar el IMEI 356938035643422",
    exact: true,
  });
  expect(
    await lado(quitar),
    "el botón de quitar un chip",
  ).toBeGreaterThanOrEqual(44);
  await quitar.click();
  await expect(chips.getByRole("listitem")).toHaveCount(1);
  await expect(line(page, 1)).toContainText("1 equipo");
  await expect(page.getByText("Total estimado: $ 120,00")).toBeVisible();

  // El campo de escaneo agrega un IMEI completo con Enter, que es lo que manda un lector, y **no**
  // envía el formulario.
  const escanear = line(page, 1).getByLabel("Escanear o agregar IMEI");
  // La tipografía del campo, medida y no afirmada: el IMEI se escribe en monoespaciada, como
  // los chips y el textarea servido, pero el marcador es prosa en castellano y tiene que salir
  // en la del sistema. El recorrido del usuario sobre `7eada2a` encontró el marcador en
  // monoespaciada, que es lo único que esa pantalla tenía fuera de la tipografía del sistema.
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
  await escanear.fill("356938035643423");
  await escanear.press("Enter");
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(line(page, 1)).toContainText("2 equipos");
  // La unidad sin precio propio estima con el del producto: 120 + 100.
  await expect(page.getByText("Total estimado: $ 220,00")).toBeVisible();
  // Y Enter **no** envió el formulario. Comprobar que algo no pasó exige darle tiempo a que
  // pase: medido al instante, ni la URL cambió ni el pedido existe todavía **aunque el
  // formulario se haya enviado**, y la aserción pasa igual. Lo midió una mutación de AC-15, que
  // sacó el `preventDefault` y aun así pasó por acá en verde para morir doce líneas más abajo.
  // Por eso esta espera fija, que es el único lugar del archivo donde hay una: el viaje de la
  // acción contra PostgreSQL local tarda unos cientos de milisegundos, así que 1,5 s lo cubre.
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/pedidos\/nuevo$/);
  expect(await orderCount(), "Enter en el escaneo no crea el pedido").toBe(0);

  // AC-7: el borrador sobrevivió a abrir y cerrar el panel.
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
    "Lucía Gómez",
  );
  await expectAccessible(page, "alta con dos equipos elegidos");

  await crear.click();
  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}\?aviso=creado$/);
  const creado = page.getByRole("table", { name: /Productos del pedido/ });
  await expect(creado).toContainText("356938035643421");
  await expect(creado).toContainText("356938035643423");
  await expect(creado).toContainText("$ 220,00");
});

test("brief-24.6.1-b: «Volver» no cambia la selección y el panel no pierde el borrador", async ({
  page,
}) => {
  // AC-7, la mitad que el caso de arriba no cubre: lo que se marca y se abandona no entra.
  await insertClient("Lucía Gómez");
  await insertUnitProduct("IPH-13", "iPhone 13", "100", IPHONE_UNITS);
  await insertProduct("CAF-250", "Café molido", "50");
  await login(page, ADMIN);
  await page.goto("/pedidos/nuevo");

  await pick(page, "Cliente", "Luc");
  await pick(line(page, 2), "Producto", "Café");
  await line(page, 2).getByLabel("Cantidad").fill("3");
  await pick(line(page, 1), "Producto", "iPhone");

  const abrir = line(page, 1).getByRole("button", {
    name: "Elegir unidades",
    exact: true,
  });
  await abrir.click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("checkbox", { name: /356938035643421/ }).check();
  await panel.getByRole("button", { name: "Volver" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(line(page, 1)).toContainText("Todavía no elegiste equipos.");
  // Y la otra línea y el cliente siguen donde estaban.
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
    "Lucía Gómez",
  );
  await expect(line(page, 2).getByLabel("Cantidad")).toHaveValue("3");
  await expect(page.getByText("Total estimado: $ 150,00")).toBeVisible();

  // Escape hace lo mismo que «Volver».
  await abrir.click();
  await page.getByRole("dialog").getByRole("checkbox").first().check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(line(page, 1)).toContainText("Todavía no elegiste equipos.");
  await expect(abrir).toBeFocused();
});

test("brief-24.6.1-b: sin desbordamiento horizontal con el panel abierto y cerrado, de 320 a 1440 px", async ({
  page,
}) => {
  // AC-12. Dos equipos elegidos, que es donde los chips desbordan si desbordan (Medición 3).
  await insertClient("Lucía Gómez");
  await insertUnitProduct("IPH-13", "iPhone 13", "100", IPHONE_UNITS);
  await login(page, ADMIN);
  await page.goto("/pedidos/nuevo");
  await pick(page, "Cliente", "Luc");
  await pick(line(page, 1), "Producto", "iPhone");
  const abrir = line(page, 1).getByRole("button", {
    name: "Elegir unidades",
    exact: true,
  });
  await abrir.click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("checkbox", { name: /356938035643421/ }).check();
  await panel.getByRole("checkbox", { name: /356938035643422/ }).check();

  // AC-12 pide axe **en los cinco anchos**, con el panel abierto y cerrado, en claro y en oscuro:
  // veinte corridas. Antes corría en tres configuraciones, una de ellas a 1280 px, que no es
  // ninguno de los cinco. Lo encontró la revisión independiente.
  for (const width of [320, 390, 640, 1082, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await anchoDesbordado(page),
      `desbordamiento con el panel abierto a ${width} px`,
    ).toBeLessThanOrEqual(0);
    await expectAccessible(page, `panel abierto a ${width} px`);
  }

  await panel.getByRole("button", { name: "Usar selección" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Acotado a la línea **a propósito**: `page.getByRole("listitem")` sin ámbito resuelve a un
  // ítem del menú de la aplicación, así que la aserción pasaría igual sin un solo chip en
  // pantalla y la medición se tomaría sobre nada. Lo encontró la revisión independiente.
  const chipsMedidos = line(page, 1).getByRole("list", {
    name: /Equipos seleccionados/,
  });
  for (const width of [320, 390, 640, 1082, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(chipsMedidos.getByRole("listitem")).toHaveCount(2);
    expect(
      await anchoDesbordado(page),
      `desbordamiento con dos chips a ${width} px`,
    ).toBeLessThanOrEqual(0);
    await expectAccessible(page, `dos chips a ${width} px`);
  }

  // Medición 3 del brief, **versionada acá y no en un script suelto**: el ancho del chip más ancho
  // a 320 px, que es donde los chips desbordan si desbordan. El límite es el ancho del grupo que
  // los contiene: un chip más ancho que su contenedor es exactamente la barra horizontal.
  await page.setViewportSize({ width: 320, height: 900 });
  const chips = line(page, 1).getByRole("list", {
    name: /Equipos seleccionados/,
  });
  const anchoChip = await chips
    .getByRole("listitem")
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const anchoGrupo = await chips.evaluate((el) =>
    Math.round(el.getBoundingClientRect().width),
  );
  console.log(
    `Medición 3 · a 320 px: chip ${anchoChip} px, grupo ${anchoGrupo} px`,
  );
  expect(
    anchoChip,
    "el chip más ancho a 320 px entra en su grupo",
  ).toBeLessThanOrEqual(anchoGrupo);
  // Sin axe acá: los dos bucles de arriba ya lo corrieron en los cinco anchos y en los dos
  // esquemas de color, con el panel abierto y cerrado.
});

test.describe("sin JavaScript, la 24.6.1-b", () => {
  test.use({ javaScriptEnabled: false });

  test("el alta sigue creando un pedido con el IMEI escrito a mano", async ({
    page,
  }) => {
    // AC-8 y V-3: sin JavaScript no hay panel ni chips, queda el camino servido de siempre.
    await insertClient("Lucía Gómez");
    await insertUnitProduct("IPH-13", "iPhone 13", "100", IPHONE_UNITS);
    await login(page, ADMIN);
    await page.goto("/pedidos/nuevo");

    await expect(
      page.getByRole("button", { name: "Elegir unidades", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Cliente", { exact: true }).fill("Lucía Gómez");
    // Sin JavaScript el producto se resuelve por su SKU, como en el caso de la 19.2.
    await line(page, 1).getByLabel("Producto").fill("iph-13");
    await line(page, 1)
      .getByLabel("IMEI de las unidades")
      .fill("356938035643421");
    await page.getByRole("button", { name: "Crear pedido" }).click();

    await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}\?aviso=creado$/);
    const lines = page.getByRole("table", { name: /Productos del pedido/ });
    await expect(lines).toContainText("356938035643421");
    expect(await orderCount()).toBe(1);
  });
});

test("brief-24.6.1-b: la cabecera del panel muestra la miniatura del producto", async ({
  page,
}) => {
  // AC-1 y D-3: la miniatura es la única razón por la que `searchOrderUnitsAction` pide una lectura
  // más, así que hay que demostrar que **se carga**, no solo que el `<img>` está en el HTML. La
  // imagen se genera acá: no es una foto ni muestra personas, como en product-images.spec.ts.
  await insertClient("Lucía Gómez");
  const productId = await insertUnitProduct(
    "IPH-13",
    "iPhone 13",
    "100",
    IPHONE_UNITS,
  );
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

  await page.goto("/pedidos/nuevo");
  await pick(page, "Cliente", "Luc");
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
