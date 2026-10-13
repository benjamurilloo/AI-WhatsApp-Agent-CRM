import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Campos de operación del producto de punta a punta: Chromium, next start, Server Actions,
// catalog, audit y PostgreSQL real, sin mocks (brief-17.2, AC-7). El formulario, la ficha y la
// búsqueda por código de barras, con axe en claro y en oscuro y el móvil a 375 px. El teclado lo
// recorre el caso 12 de products.spec.ts. Cada caso crea sus productos.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.execute(
    sql`truncate table sale_lines, sales, order_lines, orders, audit_logs, inventory_movements, inventories, product_images, product_costs, product_prices, products`,
  );
  await db.$client.end();
});

// Las tablas de solo inserción se vacían con TRUNCATE, la vía documentada (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table sale_lines, sales, order_lines, orders, audit_logs, inventory_movements, inventories, product_images, product_costs, product_prices, products`,
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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

type Operation = {
  barcode?: string;
  weightKg?: string;
  lengthCm?: string;
  widthCm?: string;
  heightCm?: string;
  location?: string;
  shelf?: string;
};

async function insertProduct(sku: string, name: string, extra: Operation = {}) {
  const result = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit, reorder_point, barcode,
                              weight_kg, length_cm, width_cm, height_cm, location, shelf)
        values (${SEED_ORGANIZATION_ID}, ${sku}, ${name}, 'unidad', 5,
                ${extra.barcode ?? null}, ${extra.weightKg ?? null}, ${extra.lengthCm ?? null},
                ${extra.widthCm ?? null}, ${extra.heightCm ?? null}, ${extra.location ?? null},
                ${extra.shelf ?? null})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function productRow(sku: string) {
  const result = await db.execute<Record<string, string | null>>(
    sql`select id, barcode, weight_kg, length_cm, width_cm, height_cm, location, shelf
        from products where sku = ${sku}`,
  );
  return result.rows[0]!;
}

const status = (page: Page) => page.getByRole("status");
// «Ubicación» nombra el campo y su tarjeta: el campo se busca por su rol.
const locationField = (page: Page) =>
  page.getByRole("combobox", { name: "Ubicación" });

test("1. FR-PROD-14: un admin da de alta y edita con los campos de operación, y el historial los nombra", async ({
  page,
}) => {
  await insertProduct("OTR-1", "Otro producto", { location: "Depósito" });
  await login(page, ADMIN);
  await page.goto("/productos/nuevo");
  for (const card of ["Logística", "Ubicación"]) {
    await expect(page.getByRole("region", { name: card })).toBeVisible();
  }
  await expectAccessible(page, "alta con los campos de operación");

  await page.getByLabel("SKU").fill("CAF-250");
  await page.getByLabel("Código de barras").fill(" 7790001000017 ");
  await page.getByLabel("Nombre").fill("Café molido 250 g");
  await page.getByLabel("Unidad").fill("unidad");
  await page.getByLabel("Punto de reposición").fill("1");
  await page.getByLabel("Peso (kg)").fill("0,25");
  await page.getByLabel("Largo (cm)").fill("10");
  await page.getByLabel("Ancho (cm)").fill("8");
  await page.getByLabel("Alto (cm)").fill("12,5");
  // D-6: la ubicación sugiere las ya cargadas en la organización.
  await locationField(page).fill("Dep");
  await expect(page.getByRole("option", { name: "Depósito" })).toBeVisible();
  await locationField(page).fill("Depósito");
  await page.getByLabel("Estante").fill("A-3");
  await page.getByRole("button", { name: "Crear producto" }).click();

  await expect(status(page)).toHaveText("Producto creado.");
  expect(await productRow("CAF-250")).toMatchObject({
    barcode: "7790001000017",
    weight_kg: "0.250",
    length_cm: "10.0",
    width_cm: "8.0",
    height_cm: "12.5",
    location: "Depósito",
    shelf: "A-3",
  });
  await expect(
    page.getByRole("region", { name: "Información básica" }),
  ).toContainText("7790001000017");
  const logistics = page.getByRole("region", { name: "Logística" });
  await expect(logistics).toContainText("0,25 kg");
  await expect(logistics).toContainText("10 × 8 × 12,5 cm");
  const place = page.getByRole("region", { name: "Ubicación" });
  await expect(place).toContainText("Depósito");
  await expect(place).toContainText("A-3");
  await expectAccessible(page, "ficha con los campos de operación");

  // Editar: otro peso y sin estante. El formulario precarga lo guardado, con coma decimal.
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByLabel("Peso (kg)")).toHaveValue("0,25");
  await expect(page.getByLabel("Alto (cm)")).toHaveValue("12,5");
  await page.getByLabel("Peso (kg)").fill("0,5");
  await page.getByLabel("Estante").fill("");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(status(page)).toHaveText("Producto actualizado.");
  expect(await productRow("CAF-250")).toMatchObject({
    weight_kg: "0.500",
    shelf: null,
  });
  await expect(
    page.getByRole("table", { name: /^Auditoría de Café molido 250 g/ }),
  ).toContainText("Peso: 0,25 kg → 0,5 kg");
  await expect(
    page.getByRole("table", { name: /^Auditoría de Café molido 250 g/ }),
  ).toContainText("Estante: A-3 → vacío");
});

test("2. AC-2 y AC-3: una dimensión suelta y un código repetido marcan su campo y conservan lo escrito", async ({
  page,
}) => {
  await insertProduct("YER-500", "Yerba 500 g", { barcode: "ABC-123" });
  await login(page, ADMIN);
  await page.goto("/productos/nuevo");
  await page.getByLabel("SKU").fill("CAF-250");
  await page.getByLabel("Nombre").fill("Café molido 250 g");
  await page.getByLabel("Unidad").fill("unidad");
  await page.getByLabel("Punto de reposición").fill("1");
  await page.getByLabel("Largo (cm)").fill("10");
  await page.getByRole("button", { name: "Crear producto" }).click();

  // D-5: largo, ancho y alto van juntos; el foco va al primero que falta.
  const width = page.getByLabel("Ancho (cm)");
  await expect(width).toBeFocused();
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(width).toHaveAccessibleDescription(/van juntos/);
  await expect(page.getByLabel("Largo (cm)")).toHaveValue("10");
  await expectAccessible(page, "error en las dimensiones");

  // D-3: un código de barras de otro producto, con otras mayúsculas.
  await page.getByLabel("Largo (cm)").fill("");
  await page.getByLabel("Código de barras").fill("abc-123");
  await page.getByRole("button", { name: "Crear producto" }).click();
  const barcode = page.getByLabel("Código de barras");
  await expect(barcode).toBeFocused();
  await expect(barcode).toHaveAccessibleDescription(
    /Ya existe un producto con ese código de barras\./,
  );
  await expect(page.getByLabel("Nombre")).toHaveValue("Café molido 250 g");

  // El formulario con las tarjetas nuevas, a 375 px.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByRole("region", { name: "Logística" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "formulario en el móvil");
  const stored = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from products`,
  );
  expect(stored.rows[0]!.count).toBe(1);
});

test("3. FR-PROD-15: la lista encuentra un producto por su código de barras, como lo escribe un lector", async ({
  page,
}) => {
  await insertProduct("CAF-250", "Café molido 250 g", {
    barcode: "7790001000017",
  });
  await insertProduct("YER-500", "Yerba 500 g");
  await login(page, VIEWER);
  await page.goto("/productos");

  // Un lector de códigos escribe el código y manda Enter.
  const search = page.getByLabel("Buscar");
  await search.fill("7790001000017");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=7790001000017/);
  const table = page.getByRole("table", {
    name: "Productos de la organización",
  });
  await expect(table.getByRole("row")).toHaveCount(1 + 1);
  await expect(table).toContainText("Café molido 250 g");

  // Exacto: una parte del código no encuentra nada.
  await page.goto("/productos?q=779000");
  await expect(
    page.getByText("Ningún producto coincide con estos filtros."),
  ).toBeVisible();
});

test("4. FR-PROD-14: un viewer ve los campos de operación sin controles de escritura, también a 375 px", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    barcode: "7790001000017",
    weightKg: "1.5",
    lengthCm: "30",
    widthCm: "20",
    heightCm: "10",
    location: "Local",
    shelf: "B-2",
  });
  await login(page, VIEWER);
  await page.goto(`/productos/${productId}`);
  await expect(
    page.getByRole("region", { name: "Información básica" }),
  ).toContainText("7790001000017");
  await expect(page.getByRole("region", { name: "Logística" })).toContainText(
    "30 × 20 × 10 cm",
  );
  await expect(page.getByRole("region", { name: "Ubicación" })).toContainText(
    "B-2",
  );
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await expectAccessible(page, "ficha del viewer");

  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expect(page.getByRole("region", { name: "Logística" })).toContainText(
    "1,5 kg",
  );
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "ficha en el móvil");

  // Un producto sin los campos muestra «—» y no inventa unidades.
  const emptyId = await insertProduct("YER-500", "Yerba 500 g");
  await page.goto(`/productos/${emptyId}`);
  const logistics = page.getByRole("region", { name: "Logística" });
  await expect(logistics).not.toContainText("kg");
  await expect(logistics).not.toContainText("cm");
});
