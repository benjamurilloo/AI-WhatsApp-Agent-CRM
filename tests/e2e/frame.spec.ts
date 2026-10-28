import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// El marco común de la brief-15.1 (D-4 a D-6), con el aspecto de los mockups desde la brief-23.1:
// panel lateral desde 1024 px y barra inferior debajo, con una sola navegación «Principal» visible
// en cada tamaño, y las migas y el menú del usuario en la barra superior. Desde la brief-24.1, el
// menú va en grupos por tarea, las migas suman el grupo y la barra inferior se retira en los
// formularios y en el hilo.

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

test("caso 1: a 1280 px el panel navega en grupos, las migas siguen el grupo y la sección, y el menú del usuario se abre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, ADMIN);

  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav).toBeVisible();
  // La barra inferior es solo para pantallas chicas.
  await expect(page.getByRole("button", { name: "Más" })).toBeHidden();

  // Los grupos por tarea (brief-24.1, D-1). La organización del seed no tiene capacidades: no hay
  // Turnos, Modelos, Grados, Usados ni Reparaciones, y el grupo Servicio técnico no aparece.
  await expect(nav.getByRole("button")).toHaveText([
    "Atención",
    "Catálogo e inventario",
    "Comercial",
    "Finanzas",
    "Abastecimiento",
    "Administración",
  ]);
  await expect(nav.getByRole("link")).toHaveText([
    "Inicio",
    "Conversaciones",
    "Clientes",
    "Productos",
    "Pedidos",
    "Ventas",
    "Caja",
    "Cuentas de clientes",
    "Compras",
    "Recepciones",
    "Pagos",
    "Proveedores",
    "Información",
    "Horarios",
    "Usuarios",
  ]);

  // Migas «‹organización› / ‹grupo› / ‹sección›» (D-4): en la portada, la sección es la página
  // actual. Inicio no tiene grupo.
  const crumbs = page.getByRole("navigation", { name: "Migas" });
  await expect(crumbs).toContainText("Organización de ejemplo");
  await expect(crumbs.getByText("Inicio")).toHaveAttribute(
    "aria-current",
    "page",
  );

  await nav.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL("/productos");
  await expect(nav.getByRole("link", { name: "Productos" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(crumbs).toContainText("Catálogo e inventario");
  await expect(crumbs.getByText("Productos")).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Más adentro de la sección, la sección es un enlace.
  await page.goto("/productos/nuevo");
  await crumbs.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL("/productos");

  // Un destino que es una subruta se marca él, y no la sección que lo contiene (H-3).
  await page.goto("/compras/recepciones");
  await expect(nav.getByRole("link", { name: "Recepciones" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Compras" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(crumbs).toContainText("Abastecimiento");

  // El panel queda a la izquierda del contenido, con el usuario al pie.
  const panel = await nav.boundingBox();
  const title = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(panel && title).toBeTruthy();
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(title!.x);
  await expect(
    page.getByText(ADMIN_SEED.name, { exact: true }).first(),
  ).toBeVisible();

  // El menú del usuario (D-5): se abre con el teclado, Escape lo cierra y devuelve el foco.
  const userMenu = page.getByRole("button", { name: "Menú del usuario" });
  const logout = page.getByRole("button", { name: "Salir" });
  await expect(userMenu).toHaveAttribute("aria-expanded", "false");
  await expect(logout).toBeHidden();
  await userMenu.focus();
  await page.keyboard.press("Enter");
  await expect(userMenu).toHaveAttribute("aria-expanded", "true");
  await expect(logout).toBeVisible();
  await expectAccessible(page, "menú del usuario abierto a 1280 px");
  await logout.focus();
  await page.keyboard.press("Escape");
  await expect(logout).toBeHidden();
  await expect(userMenu).toBeFocused();

  // Tocar fuera también lo cierra.
  await userMenu.click();
  await expect(logout).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(logout).toBeHidden();
  await expectAccessible(page, "marco a 1280 px");
});

test("caso 1b: a 1280 px un grupo se cierra con el teclado, se recuerda al recargar, y el de la página actual se abre siempre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, ADMIN);

  const nav = page.getByRole("navigation", { name: "Principal" });
  const comercial = nav.getByRole("button", { name: "Comercial" });
  const ventas = nav.getByRole("link", { name: "Ventas" });
  // La primera vez, todos abiertos (D-2).
  await expect(comercial).toHaveAttribute("aria-expanded", "true");
  await expect(ventas).toBeVisible();

  await comercial.focus();
  await page.keyboard.press("Enter");
  await expect(comercial).toHaveAttribute("aria-expanded", "false");
  await expect(ventas).toBeHidden();
  await expectAccessible(page, "grupo cerrado a 1280 px");

  // Se recuerda en este navegador.
  await page.reload();
  await expect(comercial).toHaveAttribute("aria-expanded", "false");
  await expect(ventas).toBeHidden();

  // En una página del grupo, el grupo se abre aunque esté cerrado.
  await page.goto("/ventas");
  await expect(comercial).toHaveAttribute("aria-expanded", "true");
  await expect(ventas).toHaveAttribute("aria-current", "page");

  // Volver a abrirlo lo deja abierto también fuera de sus páginas.
  await page.goto("/");
  await expect(comercial).toHaveAttribute("aria-expanded", "false");
  await comercial.click();
  await expect(comercial).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(ventas).toBeVisible();
});

test("caso 2: a 375 px la barra inferior navega y «Más» lista los grupos, se cierra con Escape y devuelve el foco", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN);

  const nav = page.getByRole("navigation", { name: "Principal" });
  const more = nav.getByRole("button", { name: "Más" });
  await expect(nav).toBeVisible();
  // Cinco destinos de al menos 44 px de alto (brief-23.1, D-7).
  for (const name of ["Inicio", "Chats", "Clientes", "Ventas"]) {
    const box = await nav.getByRole("link", { name }).boundingBox();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
  expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(nav.getByRole("link", { name: "Inicio" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await nav.getByRole("link", { name: "Clientes" }).click();
  await expect(page).toHaveURL("/clientes");
  await expect(nav.getByRole("link", { name: "Clientes" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // «Más» lleva el resto de los destinos del rol, bajo el título de su grupo (brief-24.1, D-3).
  // Atención queda sin destinos fuera de la barra y no aparece.
  const extra = nav.locator("#navegacion-mas");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(extra).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(extra.getByRole("list")).toHaveCount(5);
  await expect(
    extra.getByRole("list", { name: "Abastecimiento" }).getByRole("link"),
  ).toHaveText(["Compras", "Recepciones", "Pagos", "Proveedores"]);
  await expect(extra.getByRole("link")).toHaveText([
    "Productos",
    "Pedidos",
    "Caja",
    "Cuentas de clientes",
    "Compras",
    "Recepciones",
    "Pagos",
    "Proveedores",
    "Información",
    "Horarios",
    "Usuarios",
  ]);
  for (const link of await extra.getByRole("link").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expectAccessible(page, "«Más» abierto a 375 px");

  await extra.getByRole("link", { name: "Caja" }).focus();
  await page.keyboard.press("Escape");
  await expect(extra).toBeHidden();
  await expect(more).toBeFocused();

  // Navegar también lo cierra, y el destino que vive en «Más» marca «Más».
  await more.click();
  await extra.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL("/productos");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(extra).toBeHidden();

  // El final de la página no queda tapado por la barra.
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const bar = await nav.boundingBox();
  const lastInMain = await page.locator("main > *").last().boundingBox();
  expect(lastInMain!.y + lastInMain!.height).toBeLessThanOrEqual(bar!.y);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectAccessible(page, "barra inferior a 375 px");
});

test("caso 2b: a 375 px, «Más» de un viewer no lista Abastecimiento ni Usuarios", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, SEED_USERS[1].email);

  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("button", { name: "Más" }).click();
  const extra = nav.locator("#navegacion-mas");
  await expect(extra.getByRole("list", { name: "Abastecimiento" })).toHaveCount(
    0,
  );
  await expect(extra.getByRole("link")).toHaveText([
    "Productos",
    "Pedidos",
    "Caja",
    "Cuentas de clientes",
    "Información",
    "Horarios",
  ]);
});

test("caso 2c: a 375 px la barra inferior se retira en un formulario y en el hilo, y vuelve en la lista", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN);

  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav).toBeVisible();

  // Un formulario (brief-24.1, D-7): sin barra, y la página no reserva su alto.
  await page.goto("/clientes/nuevo");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(nav).toHaveCount(0);
  await expectAccessible(page, "formulario sin barra inferior a 375 px");

  // El hilo de una conversación: la ruta alcanza, aunque la conversación no exista.
  await page.goto("/conversaciones/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(nav).toHaveCount(0);

  await page.goto("/clientes");
  await expect(nav).toBeVisible();
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

  // El símbolo es decorativo (alt vacío) y cargó; el nombre y el lema son texto. Desde la brief-23.1
  // la marca está dos veces: en el panel y en la barra superior del teléfono, y en cada tamaño se
  // ve una sola.
  const symbol = page
    .locator('img[src="/marca/vixora-simbolo-32.png"]')
    .filter({ visible: true });
  const name = page
    .getByText("Vixora", { exact: true })
    .filter({ visible: true });
  const motto = page
    .getByText("AI SOLUTIONS", { exact: true })
    .filter({ visible: true });
  await expect(symbol).toHaveCount(1);
  await expect(symbol).toHaveAttribute("alt", "");
  await expect
    .poll(() => symbol.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(name).toHaveCount(1);
  await expect(motto).toHaveCount(1);
  await expectAccessible(page, "marca a 1280 px");

  // En el celular, el símbolo y el nombre en la barra superior, sin el lema.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByRole("banner").locator("img")).toBeVisible();
  await expect(symbol).toHaveCount(1);
  await expect(name).toHaveCount(1);
  await expect(motto).toHaveCount(0);
});

test("brief-23.2: una dirección que no existe muestra el 404 en castellano con el camino al inicio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, ADMIN);

  const response = await page.goto("/no-existe");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(/Página no encontrada/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "No encontramos esta página",
    }),
  ).toBeVisible();
  await expectAccessible(page, "404");
  await page.setViewportSize({ width: 375, height: 800 });
  await expectAccessible(page, "404 a 375 px");

  await page.getByRole("link", { name: "Ir al inicio" }).click();
  await expect(page).toHaveURL("/");
});

test("brief-23.2: al navegar, la barra de carga anuncia «Cargando…» hasta que llega la pantalla", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, ADMIN);
  await expect(
    page.getByRole("button", { name: "Menú del usuario" }),
  ).toBeVisible();
  const loading = page
    .locator('[aria-live="polite"]')
    .filter({ hasText: "Cargando…" });
  await expect(loading).toHaveCount(0);

  // Se retiene la respuesta de la pantalla para ver el estado intermedio.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/productos\?_rsc=/, async (route) => {
    await held;
    await route.continue();
  });
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Productos" })
    .click();
  await expect(loading).toHaveCount(1);
  release();

  await expect(page).toHaveURL("/productos");
  await expect(
    page.getByRole("heading", { level: 1, name: "Productos" }),
  ).toBeVisible();
  await expect(loading).toHaveCount(0);
});
