import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// El marco común de la brief-15.1 (D-4 a D-6): panel lateral desde 1024 px y menú desplegable
// debajo, con una sola navegación «Principal» en todos los tamaños.

const [ADMIN_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

test.beforeEach(async () => {
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

test("caso 1: a 1280 px el panel lateral navega entre las pantallas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, ADMIN);

  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav).toBeVisible();
  // El botón del menú es solo para pantallas chicas.
  await expect(page.getByRole("button", { name: "Menú" })).toBeHidden();

  await nav.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL("/productos");
  await expect(nav.getByRole("link", { name: "Productos" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // El panel queda a la izquierda del contenido.
  const panel = await nav.boundingBox();
  const title = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(panel && title).toBeTruthy();
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(title!.x);
  await expectAccessible(page, "marco a 1280 px");
});

test("caso 2: a 375 px el menú se abre, se cierra con Escape y devuelve el foco", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN);

  const menu = page.getByRole("button", { name: "Menú" });
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();

  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toBeVisible();
  await expectAccessible(page, "menú abierto a 375 px");

  await nav.getByRole("link", { name: "Clientes" }).focus();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(menu).toBeFocused();

  // Navegar también lo cierra.
  await menu.click();
  await nav.getByRole("link", { name: "Clientes" }).click();
  await expect(page).toHaveURL("/clientes");
  await expect(nav).toBeHidden();
  await expect(menu).toHaveAttribute("aria-expanded", "false");

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("caso 3: brief-15.5 la marca muestra el símbolo de Vixora y la pestaña tiene su ícono", async ({
  page,
  request,
}) => {
  // Los íconos responden con su tipo, sin sesión.
  for (const [path, type] of [
    ["/favicon.ico", /image\/(x-icon|vnd\.microsoft\.icon)/],
    ["/icon.png", /image\/png/],
    ["/apple-icon.png", /image\/png/],
    ["/marca/vixora-simbolo-32.png", /image\/png/],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toMatch(type);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/login");
  await expect(page.locator('link[rel="icon"][href^="/icon.png"]')).toHaveCount(
    1,
  );
  await login(page, ADMIN);

  // El símbolo es decorativo (alt vacío) y cargó; el nombre y el lema son texto.
  const symbol = page.locator('img[src="/marca/vixora-simbolo-32.png"]');
  await expect(symbol).toHaveAttribute("alt", "");
  await expect
    .poll(() => symbol.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByText("Vixora", { exact: true })).toBeVisible();
  await expect(page.getByText("AI SOLUTIONS", { exact: true })).toBeVisible();
  await expectAccessible(page, "marca a 1280 px");

  // En el celular, el símbolo y el nombre, sin el lema.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(symbol).toBeVisible();
  await expect(page.getByText("AI SOLUTIONS", { exact: true })).toBeHidden();
});
