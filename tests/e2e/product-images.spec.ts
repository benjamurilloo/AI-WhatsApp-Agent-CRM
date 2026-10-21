import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// La imagen principal del producto de punta a punta: Chromium, next start, el Route Handler de la
// subida y el que sirve, la Server Action de quitar, catalog, audit y PostgreSQL real, sin mocks
// (brief-17.5, AC-7). Las imágenes se generan acá: ninguna es una foto ni muestra personas.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

const TABLES = sql`truncate table trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, inventories, product_images, product_costs, product_prices, attribute_values, stock_units, products`;

test.afterAll(async () => {
  await db.execute(TABLES);
  await db.$client.end();
});

// Las tablas de solo inserción se vacían con TRUNCATE, la vía documentada (ADR 0013).
test.beforeEach(async () => {
  await db.execute(TABLES);
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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function insertProduct(sku: string, name: string) {
  const result = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit, reorder_point)
        values (${SEED_ORGANIZATION_ID}, ${sku}, ${name}, 'unidad', 5)
        returning id`,
  );
  return result.rows[0]!.id;
}

function photo(color: { r: number; g: number; b: number }) {
  return sharp({
    create: { width: 2000, height: 1500, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();
}

// Que la imagen no solo esté en el HTML: que el navegador la haya cargado, con la cookie.
async function expectLoaded(page: Page, name: string | RegExp) {
  const image = page.getByRole("img", { name });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
}

const status = (page: Page) => page.getByRole("status");
const imageCard = (page: Page) => page.getByRole("region", { name: "Imagen" });

test("1. FR-PROD-16: un admin sube, reemplaza y quita la imagen, y la lista y el historial lo muestran", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g");
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}`);
  await expect(imageCard(page)).toContainText("Sin imagen");
  await expect(imageCard(page)).toContainText(
    "no subas fotos en las que se vean personas",
  );
  await expectAccessible(page, "ficha sin imagen");

  await page.getByLabel("Subir imagen").setInputFiles({
    name: "cafe.jpg",
    mimeType: "image/jpeg",
    buffer: await photo({ r: 120, g: 70, b: 30 }),
  });
  await page.getByRole("button", { name: "Guardar imagen" }).click();
  await expect(status(page)).toContainText("Imagen guardada.");
  await expectLoaded(page, "Imagen de Café molido 250 g");
  await expectAccessible(page, "ficha con imagen");
  const first = await page
    .getByRole("img", { name: "Imagen de Café molido 250 g" })
    .getAttribute("src");

  // Reemplazar cambia la dirección de la imagen (D-6).
  await page.getByLabel("Reemplazar imagen").setInputFiles({
    name: "cafe-2.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 600, height: 600, channels: 3, background: "#2a6" },
    })
      .png()
      .toBuffer(),
  });
  await page.getByRole("button", { name: "Guardar imagen" }).click();
  await expect(
    page.getByRole("img", { name: "Imagen de Café molido 250 g" }),
  ).not.toHaveAttribute("src", first!);
  await expectLoaded(page, "Imagen de Café molido 250 g");

  await page.goto("/productos");
  const thumbnail = page
    .locator(`img[src^="/productos/${productId}/imagen/miniatura"]`)
    .first();
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() =>
      thumbnail.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expectAccessible(page, "lista con miniatura");

  await page.goto(`/productos/${productId}`);
  await expect(page.getByRole("table", { name: /Auditoría/ })).toContainText(
    /Imagen: sin imagen → [0-9a-f]{8}, \d+ KB/,
  );

  await page.getByRole("link", { name: "Quitar imagen" }).click();
  await expect(
    page.getByRole("group", { name: "¿Quitar la imagen?" }),
  ).toBeVisible();
  await expectAccessible(page, "confirmar quitar");
  await page.getByRole("button", { name: "Sí, quitar" }).click();
  await expect(status(page)).toContainText("Imagen quitada.");
  await expect(imageCard(page)).toContainText("Sin imagen");
});

test("2. AC-3 y AC-7: un archivo que no es imagen y uno de más de 5 MB se rechazan con su mensaje, y el foco va al error", async ({
  page,
}) => {
  const productId = await insertProduct("YER-500", "Yerba 500 g");
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}`);

  // Un SVG con extensión .jpg: el servidor lo reconoce por el contenido.
  await page.getByLabel("Subir imagen").setInputFiles({
    name: "logo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    ),
  });
  await page.getByRole("button", { name: "Guardar imagen" }).click();
  const error = imageCard(page).getByText(
    "El archivo no es una imagen JPEG, PNG o WebP.",
  );
  await expect(error).toBeFocused();
  await expectAccessible(page, "error de formato");

  // Más de 5 MB: la pantalla lo avisa sin mandar nada.
  await page.getByLabel("Subir imagen").setInputFiles({
    name: "grande.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await page.getByRole("button", { name: "Guardar imagen" }).click();
  await expect(
    imageCard(page).getByText("La imagen pesa más de 5 MB."),
  ).toBeFocused();

  const rows = await db.execute(sql`select 1 from product_images`);
  expect(rows.rows).toHaveLength(0);
});

test("3. FR-PROD-17: un viewer ve la imagen sin controles, también a 375 px", async ({
  browser,
  page,
}) => {
  const productId = await insertProduct("MAT-01", "Mate de calabaza");
  const admin = await browser.newPage();
  await login(admin, ADMIN);
  await admin.goto(`/productos/${productId}`);
  await admin.getByLabel("Subir imagen").setInputFiles({
    name: "mate.webp",
    mimeType: "image/webp",
    buffer: await sharp({
      create: { width: 900, height: 900, channels: 3, background: "#963" },
    })
      .webp()
      .toBuffer(),
  });
  await admin.getByRole("button", { name: "Guardar imagen" }).click();
  await expect(admin.getByRole("status")).toContainText("Imagen guardada.");
  await admin.close();

  await login(page, VIEWER);
  await page.goto(`/productos/${productId}`);
  await expectLoaded(page, "Imagen de Mate de calabaza");
  await expect(page.getByLabel(/Subir imagen|Reemplazar imagen/)).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Quitar imagen" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "ficha del viewer");

  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expectLoaded(page, "Imagen de Mate de calabaza");
  await expectNoHorizontalScroll(page);
  await page.goto("/productos");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "lista en el móvil");
});

test("4. AC-7: con el teclado se elige el archivo y se guarda", async ({
  page,
}) => {
  const productId = await insertProduct("TER-01", "Termo 1 l");
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}`);

  const input = page.getByLabel("Subir imagen");
  await input.focus();
  await expect(input).toBeFocused();
  await input.setInputFiles({
    name: "termo.jpg",
    mimeType: "image/jpeg",
    buffer: await photo({ r: 40, g: 40, b: 40 }),
  });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Guardar imagen" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page)).toContainText("Imagen guardada.");
  await expectLoaded(page, "Imagen de Termo 1 l");
});
