import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 16 a 18 de punta a punta (brief-20.2, AC-7): Chromium, next start, Server Actions,
// sales, orders, numbering, audit y PostgreSQL real, sin mocks. La venta se emite desde el detalle
// de un pedido entregado; el detalle de la venta es su comprobante imprimible.

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
    sql`truncate table sale_lines, sales, order_lines, orders, document_counters, audit_logs,
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
