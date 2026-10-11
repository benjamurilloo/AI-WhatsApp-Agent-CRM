import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 14 a 16 de punta a punta (brief-19.2, AC-9): Chromium, next start, Server Actions,
// orders, crm, catalog, numbering, audit y PostgreSQL real, sin mocks. Los clientes, los productos
// y sus precios los crea cada caso.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";
const PHONE = "+5491155553333";
const EMAIL = "lucia@example.com";

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
    sql`truncate table order_lines, orders, document_counters, audit_logs, inventory_movements,
          inventories, product_images, product_costs, product_prices, products, conversation_notes,
          messages, conversations, client_tag_assignments, clients`,
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
  await expect(page.getByRole("table", { name: /Historia/ })).toHaveCount(0);
  await expectAccessible(page, "detalle del viewer");

  await page.goto("/pedidos/nuevo");
  await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();

  await page.goto(`/clientes/${clientId}`);
  const card = page.getByRole("region", { name: "Pedidos" });
  await expect(card.getByRole("link", { name: "P-000007" })).toBeVisible();
  await expect(card.getByRole("link", { name: "+ Nuevo pedido" })).toHaveCount(
    0,
  );
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
