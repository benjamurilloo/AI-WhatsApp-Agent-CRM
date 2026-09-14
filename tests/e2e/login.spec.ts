import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantalla 1 de punta a punta: Chromium, next start, Server Actions, auth, organizations y
// PostgreSQL real, sin mocks (brief-3.5, casos 1 a 12 del alcance).

const ADMIN = "admin@example.com";
const NEW_USER = "nuevo@example.com";
const WRONG_PASSWORD = "contraseña-incorrecta-e2e";
const NEW_PASSWORD = "contraseña-definitiva-e2e";
const COOKIE = "__Host-crm_session";
const CREDENTIALS = "Email o contraseña incorrectos.";
const RATE_LIMITED = /^Demasiados intentos\. Probá de nuevo en \d+ minutos?\.$/;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Cada test parte del seed, sin sesiones ni intentos fallidos acumulados.
test.beforeEach(async () => {
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  await seedBasic(db, E2E_PASSWORD);
});

const submitButton = (page: Page) =>
  page.getByRole("button", { name: /^(Ingresar|Ingresando…)$/ });

// Envía el formulario y espera la respuesta del servidor: el botón deja de decir
// "Ingresando…" o desaparece porque la acción redirigió.
async function submitLogin(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await submitButton(page).click();
  await expect(page.getByRole("button", { name: "Ingresando…" })).toHaveCount(
    0,
  );
}

async function expectAccessible(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
  expect(violations, `violaciones de axe en "${state}"`).toEqual([]);
}

async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === COOKIE);
}

test("caso 1: un ingreso correcto lleva a / con la cookie de sesión según D-5", async ({
  page,
}) => {
  await page.goto("/login");
  await submitLogin(page, ADMIN, E2E_PASSWORD);

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "AI WhatsApp Agent CRM" }),
  ).toBeVisible();

  const cookie = await sessionCookie(page);
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    domain: "localhost",
  });

  // La cookie vence en el tope absoluto de la sesión: created_at + 30 días.
  const rows = await db.execute<{ cap: number; expires: number }>(
    sql`select extract(epoch from created_at + interval '30 days')::float8 as cap,
               extract(epoch from expires_at)::float8 as expires
        from sessions`,
  );
  expect(rows.rows).toHaveLength(1);
  const session = rows.rows[0]!;
  expect(Math.abs(cookie!.expires - session.cap)).toBeLessThan(2);
  expect(cookie!.expires).toBeGreaterThan(session.expires + 22 * 24 * 3600);
});

test("caso 2: contraseña incorrecta y email inexistente muestran el mismo mensaje con el foco", async ({
  page,
}) => {
  const texts: string[] = [];
  for (const email of [ADMIN, "nadie@example.com"]) {
    await page.goto("/login");
    await submitLogin(page, email, WRONG_PASSWORD);
    const message = page.getByText(CREDENTIALS);
    await expect(message).toBeVisible();
    await expect(message).toBeFocused();
    await expect(page).toHaveURL("/login");
    texts.push(await page.locator("form").innerText());
  }
  expect(texts[0]).toBe(texts[1]);
});

test("caso 3: un email inválido muestra el mensaje asociado al campo", async ({
  page,
}) => {
  await page.goto("/login");
  await submitLogin(page, "no-es-un-email", E2E_PASSWORD);
  const email = page.getByLabel("Email");
  await expect(email).toHaveAccessibleDescription("Ingresá un email válido.");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toBeFocused();
  await expect(email).toHaveValue("no-es-un-email");
});

test("caso 4: el sexto intento fallido avisa cuándo reintentar y deshabilita el botón", async ({
  page,
}) => {
  await page.goto("/login");
  for (let attempt = 0; attempt < 5; attempt++) {
    await submitLogin(page, ADMIN, WRONG_PASSWORD);
    await expect(page.getByText(CREDENTIALS)).toBeVisible();
  }
  await submitLogin(page, ADMIN, E2E_PASSWORD);
  await expect(page.getByText(RATE_LIMITED)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeDisabled();
  await expect(page).toHaveURL("/login");
});

test("caso 5: / sin sesión redirige a /login (FR-ORG-03)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  expect(await sessionCookie(page)).toBeUndefined();
});

test("caso 6: un usuario autenticado que abre /login va a /", async ({
  page,
}) => {
  await page.goto("/login");
  await submitLogin(page, ADMIN, E2E_PASSWORD);
  await expect(page).toHaveURL("/");
  await page.goto("/login");
  await expect(page).toHaveURL("/");
});

test("caso 7: con must_change_password el ingreso exige definir la contraseña", async ({
  page,
}) => {
  await page.goto("/login");
  await submitLogin(page, NEW_USER, E2E_PASSWORD);
  await expect(page).toHaveURL("/cambiar-contrasena");
  await expect(
    page.getByRole("heading", { name: "Definí tu nueva contraseña" }),
  ).toBeVisible();

  // Hasta guardar, cualquier ruta protegida devuelve a este paso.
  await page.goto("/");
  await expect(page).toHaveURL("/cambiar-contrasena");

  const newPassword = page.getByLabel("Nueva contraseña", { exact: true });
  const confirmation = page.getByLabel("Repetir nueva contraseña", {
    exact: true,
  });
  const save = page.getByRole("button", {
    name: /^(Guardar y continuar|Guardando…)$/,
  });

  await newPassword.fill(NEW_PASSWORD);
  await confirmation.fill("otra-contraseña-distinta");
  await save.click();
  await expect(confirmation).toHaveAccessibleDescription(
    "Las contraseñas no coinciden.",
  );
  await expect(confirmation).toBeFocused();

  await newPassword.fill("corta");
  await confirmation.fill("corta");
  await save.click();
  await expect(newPassword).toHaveAccessibleDescription(
    "La contraseña debe tener entre 12 y 128 caracteres.",
  );
  await expect(newPassword).toBeFocused();

  await newPassword.fill(NEW_PASSWORD);
  await confirmation.fill(NEW_PASSWORD);
  await save.click();
  await expect(page).toHaveURL("/");

  // La contraseña inicial ya no sirve; la nueva sí.
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL("/login");
  await submitLogin(page, NEW_USER, E2E_PASSWORD);
  await expect(page.getByText(CREDENTIALS)).toBeVisible();
  await submitLogin(page, NEW_USER, NEW_PASSWORD);
  await expect(page).toHaveURL("/");
});

test("caso 8: el cierre de sesión borra la cookie y la cookie anterior no recupera la sesión", async ({
  page,
}) => {
  await page.goto("/login");
  await submitLogin(page, ADMIN, E2E_PASSWORD);
  await expect(page).toHaveURL("/");
  const previous = await sessionCookie(page);
  expect(previous).toBeDefined();

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL("/login");
  expect(await sessionCookie(page)).toBeUndefined();

  // Se vuelve a poner la misma cookie que tenía el navegador antes de cerrar sesión.
  await page.context().addCookies([previous!]);
  expect(await sessionCookie(page)).toBeDefined();
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("caso 9: la contraseña se oculta por defecto y el botón para verla es accesible", async ({
  page,
}) => {
  await page.goto("/login");
  const password = page.getByLabel("Contraseña", { exact: true });
  const toggle = page.getByRole("button", { name: "Ver contraseña" });

  await expect(password).toHaveAttribute("type", "password");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(password).toHaveAttribute("type", "password");
});

test("caso 10: el ingreso se completa solo con teclado", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.type(ADMIN);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeFocused();
  await page.keyboard.type(E2E_PASSWORD);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Ver contraseña" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/");
});

test("caso 11: axe no encuentra violaciones WCAG 2.x A ni AA en ningún estado", async ({
  page,
}) => {
  await page.goto("/login");
  await expectAccessible(page, "formulario vacío");

  await submitLogin(page, ADMIN, WRONG_PASSWORD);
  await expect(page.getByText(CREDENTIALS)).toBeVisible();
  await expectAccessible(page, "error de credenciales");

  await submitLogin(page, "no-es-un-email", WRONG_PASSWORD);
  await expect(page.getByText("Ingresá un email válido.")).toBeVisible();
  await expectAccessible(page, "email inválido");

  for (let attempt = 0; attempt < 4; attempt++) {
    await submitLogin(page, ADMIN, WRONG_PASSWORD);
  }
  await submitLogin(page, ADMIN, WRONG_PASSWORD);
  await expect(page.getByText(RATE_LIMITED)).toBeVisible();
  await expectAccessible(page, "límite de intentos");

  await page.goto("/login");
  await submitLogin(page, NEW_USER, E2E_PASSWORD);
  await expect(page).toHaveURL("/cambiar-contrasena");
  await expectAccessible(page, "cambio de contraseña");

  await page.getByLabel("Nueva contraseña", { exact: true }).fill(NEW_PASSWORD);
  await page
    .getByLabel("Repetir nueva contraseña", { exact: true })
    .fill("otra-contraseña-distinta");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
  await expectAccessible(page, "cambio de contraseña con error");

  await page.getByLabel("Nueva contraseña", { exact: true }).fill(NEW_PASSWORD);
  await page
    .getByLabel("Repetir nueva contraseña", { exact: true })
    .fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page).toHaveURL("/");
  await expectAccessible(page, "página protegida");
});

test.describe("móvil", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("caso 12: a 375 px el formulario ocupa una columna sin desplazamiento horizontal", async ({
    page,
  }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const email = await page.getByLabel("Email").boundingBox();
    const password = await page
      .getByLabel("Contraseña", { exact: true })
      .boundingBox();
    const button = await page
      .getByRole("button", { name: "Ingresar" })
      .boundingBox();
    expect(email && password && button).toBeTruthy();
    // Un campo debajo del otro, dentro de la pantalla.
    expect(password!.y).toBeGreaterThan(email!.y + email!.height);
    expect(button!.y).toBeGreaterThan(password!.y + password!.height);
    expect(email!.x + email!.width).toBeLessThanOrEqual(375);
    expect(button!.width).toBeGreaterThan(375 * 0.7);
  });
});
