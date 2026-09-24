import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantalla 10 y marco común de punta a punta: Chromium, next start, Server Actions, organizations,
// auth, audit y PostgreSQL real, sin mocks (brief-3.7, casos 1 a 12 del alcance). El caso 13 es
// el selector de tema del diseño visual base (brief-4.0).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const ADMIN_NAME = ADMIN_SEED.name;
const VIEWER_NAME = VIEWER_SEED.name;
const ORGANIZATION = "Organización de ejemplo";
const LAST_ADMIN =
  "No podés quitar ni desactivar al último admin de la organización.";
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";
const INITIAL_PASSWORD = /^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Cada test parte del seed: sin auditoría, sesiones, usuarios ni organizaciones agregados.
// audit_logs es de solo inserción; TRUNCATE es la vía documentada para vaciarla (brief-3.6).
test.beforeEach(async () => {
  await db.execute(sql`truncate table audit_logs`);
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

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

// Cada estado se analiza en claro y en oscuro (brief-4.0, D-6).
async function expectAccessible(page: Page, state: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    // Una navegación en el cliente puede dejar el <title> vacío un instante (brief-6.4, D-6).
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

async function memberIdOf(userId: string) {
  const result = await db.execute<{ id: string }>(
    sql`select id from organization_members where user_id = ${userId}`,
  );
  return result.rows[0]!.id;
}

async function auditRows() {
  const result = await db.execute<{ action: string; diff: unknown }>(
    sql`select action, diff from audit_logs order by created_at`,
  );
  return result.rows;
}

async function userState(userId: string) {
  const role = await db.execute<{ role: string }>(
    sql`select role from organization_members where user_id = ${userId}`,
  );
  const user = await db.execute<{ is_active: boolean }>(
    sql`select is_active from users where id = ${userId}`,
  );
  return { role: role.rows[0]!.role, isActive: user.rows[0]!.is_active };
}

const membersTable = (page: Page) =>
  page.getByRole("table", { name: "Usuarios de la organización" });

async function fillNewMember(
  page: Page,
  member: { name: string; email: string; role?: "admin" | "viewer" },
) {
  await page.getByLabel("Nombre").fill(member.name);
  await page.getByLabel("Email").fill(member.email);
  await page.getByRole("radio", { name: member.role ?? "viewer" }).check();
  await page.getByRole("button", { name: "Crear usuario" }).click();
}

test("caso 1: un admin ve la lista con (vos), el marco común con su organización y la navegación", async ({
  page,
}) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL("/");

  const banner = page.getByRole("banner");
  await expect(banner.getByText(ORGANIZATION)).toBeVisible();
  await expect(banner.getByText(`${ADMIN_NAME} (admin)`)).toBeVisible();
  await expect(banner.getByRole("button", { name: "Salir" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "Usuarios" }).click();
  await expect(page).toHaveURL("/usuarios");
  await expect(
    page.getByRole("heading", { name: "Usuarios y roles" }),
  ).toBeVisible();
  await expect(nav.getByRole("link", { name: "Usuarios" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const rows = membersTable(page).getByRole("row");
  await expect(rows).toHaveCount(1 + SEED_USERS.length);
  await expect(rows.nth(1)).toContainText(`${ADMIN_NAME} (vos)`);
  await expect(rows.nth(2)).toContainText(VIEWER_NAME);
  await expect(rows.nth(2)).not.toContainText("(vos)");
});

test("caso 2: la contraseña inicial se muestra una vez y sirve para el primer ingreso", async ({
  page,
  browser,
}) => {
  await login(page, ADMIN);
  await page.goto("/usuarios");
  await page.getByRole("link", { name: "+ Nuevo usuario" }).click();
  await expect(page).toHaveURL("/usuarios/nuevo");

  await fillNewMember(page, { name: "Pablo Díaz", email: "pablo@example.com" });
  await expect(
    page.getByRole("heading", { name: "Usuario creado" }),
  ).toBeFocused();
  await expect(
    page.getByText("Contraseña inicial de Pablo Díaz:"),
  ).toBeVisible();
  const password = (
    await page.locator("#contrasena-inicial").innerText()
  ).trim();
  expect(password).toMatch(INITIAL_PASSWORD);
  expect(page.url()).not.toContain(password);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copiar" }).click();
  await expect(page.getByText("Copiada.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    password,
  );

  // Recargar vuelve al formulario vacío: la contraseña ya no está en el HTML.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Nuevo usuario" }),
  ).toBeVisible();
  expect(await page.content()).not.toContain(password);

  const stored = await db.execute<{ must_change_password: boolean }>(
    sql`select must_change_password from users where email = 'pablo@example.com'`,
  );
  expect(stored.rows).toEqual([{ must_change_password: true }]);
  expect(JSON.stringify(await auditRows())).not.toContain(password);

  const other = await browser.newContext();
  try {
    const newUserPage = await other.newPage();
    await login(newUserPage, "pablo@example.com", password);
    await expect(newUserPage).toHaveURL("/cambiar-contrasena");
  } finally {
    await other.close();
  }
});

test("caso 3: un email repetido muestra el mensaje en el campo y no crea nada", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/usuarios/nuevo");
  await fillNewMember(page, {
    name: "Otra persona",
    email: VIEWER.toUpperCase(),
  });

  const email = page.getByLabel("Email");
  await expect(email).toHaveAccessibleDescription(
    "Ya existe un usuario con ese email.",
  );
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toBeFocused();
  await expect(email).toHaveValue(VIEWER.toUpperCase());
  await expect(page.getByLabel("Nombre")).toHaveValue("Otra persona");

  const users = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from users`,
  );
  expect(users.rows[0]!.count).toBe(SEED_USERS.length);
  expect(await auditRows()).toEqual([]);
});

test("caso 4: el cambio de rol se refleja en la lista y deja una fila en audit_logs", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/usuarios");
  await membersTable(page)
    .getByRole("link", { name: `Editar a ${VIEWER_NAME}` })
    .click();
  await expect(
    page.getByRole("heading", { name: `Editar a ${VIEWER_NAME}` }),
  ).toBeVisible();

  await page.getByRole("radio", { name: "admin" }).check();
  await page.getByRole("button", { name: "Guardar rol" }).click();
  await expect(page.getByRole("status")).toHaveText("Rol actualizado.");
  await expect(page.getByRole("radio", { name: "admin" })).toBeChecked();

  await page.getByRole("link", { name: "Volver a usuarios" }).click();
  const row = membersTable(page).getByRole("row", {
    name: new RegExp(VIEWER_NAME),
  });
  await expect(row.getByRole("cell").nth(2)).toHaveText("admin");

  expect(await auditRows()).toEqual([
    {
      action: "role_change",
      diff: { before: { role: "viewer" }, after: { role: "admin" } },
    },
  ]);
});

test("caso 5: desactivar pide confirmación, cierra la sesión abierta del usuario y reactivar lo habilita", async ({
  page,
  browser,
}) => {
  const viewerContext = await browser.newContext();
  try {
    const viewerPage = await viewerContext.newPage();
    await login(viewerPage, VIEWER);
    await expect(viewerPage).toHaveURL("/");

    await login(page, ADMIN);
    const memberId = await memberIdOf(VIEWER_SEED.id);
    await page.goto(`/usuarios/${memberId}`);

    await page.getByRole("link", { name: "Desactivar" }).click();
    await expect(page).toHaveURL(`/usuarios/${memberId}?confirmar=desactivar`);
    const confirm = page.getByRole("group", {
      name: `¿Desactivar a ${VIEWER_NAME}?`,
    });
    await expect(
      confirm.getByText(`¿Desactivar a ${VIEWER_NAME}?`),
    ).toBeFocused();
    // Mientras no se confirma, nada cambia.
    await confirm.getByRole("link", { name: "Cancelar" }).click();
    await expect(page).toHaveURL(`/usuarios/${memberId}`);
    expect(await userState(VIEWER_SEED.id)).toEqual({
      role: "viewer",
      isActive: true,
    });

    await page.getByRole("link", { name: "Desactivar" }).click();
    await confirm.getByRole("button", { name: "Sí, desactivar" }).click();
    await expect(page.getByRole("status")).toHaveText("Usuario desactivado.");
    await expect(page.getByRole("button", { name: "Reactivar" })).toBeVisible();
    expect(await userState(VIEWER_SEED.id)).toMatchObject({ isActive: false });

    // La sesión que el usuario tenía abierta en otro navegador ya no sirve.
    await viewerPage.goto("/");
    await expect(viewerPage).toHaveURL("/login");

    await page.getByRole("button", { name: "Reactivar" }).click();
    await expect(page.getByRole("status")).toHaveText("Usuario reactivado.");
    await login(viewerPage, VIEWER);
    await expect(viewerPage).toHaveURL("/");

    expect((await auditRows()).map((row) => row.action)).toEqual([
      "deactivate",
      "reactivate",
    ]);
  } finally {
    await viewerContext.close();
  }
});

test("caso 6: el último admin no puede quitarse el rol ni desactivarse, y nada cambia", async ({
  page,
}) => {
  await login(page, ADMIN);
  const memberId = await memberIdOf(ADMIN_SEED.id);
  await page.goto(`/usuarios/${memberId}`);
  await expect(
    page.getByRole("heading", { name: `Editar a ${ADMIN_NAME} (vos)` }),
  ).toBeVisible();

  await page.getByRole("radio", { name: "viewer" }).check();
  await page.getByRole("button", { name: "Guardar rol" }).click();
  const roleMessage = page.getByText(LAST_ADMIN);
  await expect(roleMessage).toBeVisible();
  await expect(roleMessage).toBeFocused();

  await page.goto(`/usuarios/${memberId}?confirmar=desactivar`);
  await expect(page.getByText(/^Es tu propia cuenta/)).toBeVisible();
  await page.getByRole("button", { name: "Sí, desactivar" }).click();
  await expect(page.getByText(LAST_ADMIN)).toBeVisible();

  expect(await userState(ADMIN_SEED.id)).toEqual({
    role: "admin",
    isActive: true,
  });
  expect(await auditRows()).toEqual([]);
  await page.goto("/usuarios");
  await expect(membersTable(page)).toBeVisible();
});

test("caso 7: un viewer no ve el enlace y las páginas de usuarios muestran el permiso sin datos", async ({
  page,
}) => {
  await login(page, VIEWER);
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Usuarios" })).toHaveCount(0);

  const adminMemberId = await memberIdOf(ADMIN_SEED.id);
  for (const path of [
    "/usuarios",
    "/usuarios/nuevo",
    `/usuarios/${adminMemberId}`,
  ]) {
    const response = await page.goto(path);
    // D-10: sin forbidden() experimental la respuesta es 200; lo que importa es que no hay datos.
    expect(response?.status()).toBe(200);
    await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("@example.com");
    expect(html).not.toContain(ADMIN_NAME);
  }
});

test("caso 8: el id de un miembro de otra organización muestra que no existe", async ({
  page,
}) => {
  const organization = await db.execute<{ id: string }>(
    sql`insert into organizations (name) values ('Otra organización') returning id`,
  );
  const user = await db.execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values ('otra@example.com', 'hash-sintetico', 'Persona de otra organización')
        returning id`,
  );
  const member = await db.execute<{ id: string }>(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organization.rows[0]!.id}, ${user.rows[0]!.id}, 'admin')
        returning id`,
  );

  await login(page, ADMIN);
  for (const id of [member.rows[0]!.id, "no-es-un-uuid"]) {
    await page.goto(`/usuarios/${id}`);
    await expect(page.getByText("No encontramos ese usuario.")).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("otra@example.com");
    expect(html).not.toContain("Persona de otra organización");
  }

  await page.goto("/usuarios?estado=todos");
  await expect(membersTable(page)).not.toContainText("otra@example.com");
});

test("caso 9: filtros y página viven en la URL y sobreviven a recargar", async ({
  page,
}) => {
  // 30 viewers más, uno de cada cinco inactivo: 27 activos en total.
  await db.execute(
    sql`with created as (
          insert into users (email, password_hash, name, is_active)
          select 'persona' || i || '@example.com', 'hash-sintetico',
                 'Persona ' || lpad(i::text, 2, '0'), i % 5 <> 0
          from generate_series(1, 30) as i
          returning id
        )
        insert into organization_members (organization_id, user_id, role)
        select ${SEED_ORGANIZATION_ID}, id, 'viewer' from created`,
  );
  await login(page, ADMIN);
  await page.goto("/usuarios");

  const pagination = page.getByRole("navigation", { name: "Paginación" });
  await expect(pagination.getByText("Página 1 de 2")).toBeVisible();
  await expect(membersTable(page).getByRole("row")).toHaveCount(1 + 25);
  await pagination.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL("/usuarios?pagina=2");
  await expect(pagination.getByText("Página 2 de 2")).toBeVisible();
  await expect(membersTable(page).getByRole("row")).toHaveCount(1 + 2);
  await page.reload();
  await expect(pagination.getByText("Página 2 de 2")).toBeVisible();

  await page.goto("/usuarios");
  await page.getByLabel("Rol").selectOption("viewer");
  await page.getByLabel("Estado").selectOption("inactivos");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL("/usuarios?rol=viewer&estado=inactivos");
  await expect(membersTable(page).getByRole("row")).toHaveCount(1 + 6);
  await page.reload();
  await expect(page.getByLabel("Rol")).toHaveValue("viewer");
  await expect(page.getByLabel("Estado")).toHaveValue("inactivos");
  await expect(membersTable(page).getByRole("row")).toHaveCount(1 + 6);

  await page.goto("/usuarios?rol=admin&estado=inactivos");
  await expect(
    page.getByText("Ningún usuario coincide con estos filtros."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Limpiar filtros" }).last().click();
  await expect(page).toHaveURL("/usuarios");
  await expect(pagination.getByText("Página 1 de 2")).toBeVisible();
});

test("caso 11: el alta se completa solo con teclado", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/usuarios/nuevo");

  // Desde el inicio del documento, atravesando el marco común hasta el primer campo.
  const name = page.getByLabel("Nombre");
  for (let i = 0; i < 12; i++) {
    if (await name.evaluate((element) => element === document.activeElement)) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(name).toBeFocused();
  await page.keyboard.type("Persona de teclado");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.type("teclado@example.com");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "viewer" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "admin" })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Crear usuario" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Usuario creado" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Copiar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Entendido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/usuarios");
  await expect(membersTable(page)).toContainText("Persona de teclado");

  const created = await db.execute<{ role: string }>(
    sql`select m.role from organization_members m
        join users u on u.id = m.user_id where u.email = 'teclado@example.com'`,
  );
  expect(created.rows).toEqual([{ role: "admin" }]);
});

test("caso 12: axe no encuentra violaciones WCAG 2.x A ni AA en los estados de la pantalla", async ({
  page,
  browser,
}) => {
  await login(page, ADMIN);

  await page.goto("/usuarios");
  await expect(membersTable(page)).toBeVisible();
  await expectAccessible(page, "lista");

  await page.goto("/usuarios?rol=admin&estado=inactivos");
  await expect(
    page.getByText("Ningún usuario coincide con estos filtros."),
  ).toBeVisible();
  await expectAccessible(page, "sin resultados");

  await page.goto("/usuarios/nuevo");
  await page.getByRole("button", { name: "Crear usuario" }).click();
  await expect(
    page.getByText("Ingresá un nombre de hasta 200 caracteres."),
  ).toBeVisible();
  await expectAccessible(page, "alta con error");

  await fillNewMember(page, { name: "Axe", email: "axe@example.com" });
  await expect(
    page.getByRole("heading", { name: "Usuario creado" }),
  ).toBeVisible();
  await expectAccessible(page, "contraseña inicial");

  const viewerMemberId = await memberIdOf(VIEWER_SEED.id);
  await page.goto(`/usuarios/${viewerMemberId}?confirmar=desactivar`);
  await expect(
    page.getByRole("button", { name: "Sí, desactivar" }),
  ).toBeVisible();
  await expectAccessible(page, "edición con confirmación");

  const adminMemberId = await memberIdOf(ADMIN_SEED.id);
  await page.goto(`/usuarios/${adminMemberId}`);
  await page.getByRole("radio", { name: "viewer" }).check();
  await page.getByRole("button", { name: "Guardar rol" }).click();
  await expect(page.getByText(LAST_ADMIN)).toBeVisible();
  await expectAccessible(page, "último admin");

  const viewerContext = await browser.newContext();
  try {
    const viewerPage = await viewerContext.newPage();
    await login(viewerPage, VIEWER);
    await viewerPage.goto("/usuarios");
    await expect(viewerPage.getByText(FORBIDDEN_PAGE)).toBeVisible();
    await expectAccessible(viewerPage, "sin permiso");
  } finally {
    await viewerContext.close();
  }
});

test.describe("móvil", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("caso 10: a 375 px la lista usa tarjetas sin desplazamiento horizontal", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/usuarios");

    const cards = page
      .getByRole("list", { name: "Usuarios de la organización" })
      .getByRole("listitem");
    await expect(cards).toHaveCount(SEED_USERS.length);
    await expect(cards.first()).toContainText(`${ADMIN_NAME} (vos)`);
    await expect(cards.first()).toContainText("admin · Activo");
    // La tabla queda oculta y fuera del árbol de accesibilidad.
    await expect(page.getByRole("table")).toHaveCount(0);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("caso 13: el selector de tema cambia el modo, sobrevive a recargar y vuelve al sistema", async ({
  page,
}) => {
  // brief-4.0, D-3 y D-4: tema leído en el servidor y fuente servida sin red.
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "localhost") {
      external.push(request.url());
    }
  });
  const LIGHT_BACKGROUND = "rgb(243, 247, 246)";
  const DARK_BACKGROUND = "rgb(11, 21, 20)";
  const html = page.locator("html");
  const selector = page.getByRole("group", { name: "Tema" });
  const background = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: "dark" });
  await login(page, ADMIN);

  // Sin preferencia guardada sigue al sistema.
  await expect(html).not.toHaveAttribute("data-theme");
  await expect(
    selector.getByRole("button", { name: "Sistema" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await background()).toBe(DARK_BACKGROUND);

  // Claro gana sobre un sistema oscuro y sobrevive a recargar.
  await selector.getByRole("button", { name: "Claro" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(selector.getByRole("button", { name: "Claro" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await background()).toBe(LIGHT_BACKGROUND);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  expect(await background()).toBe(LIGHT_BACKGROUND);

  // Oscuro gana sobre un sistema claro.
  await selector.getByRole("button", { name: "Oscuro" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  expect(await background()).toBe(DARK_BACKGROUND);
  await expectAccessible(page, "tema oscuro elegido");

  // Sistema borra la preferencia.
  await selector.getByRole("button", { name: "Sistema" }).click();
  await expect(html).not.toHaveAttribute("data-theme");
  await page.emulateMedia({ colorScheme: "light" });
  expect(await background()).toBe(LIGHT_BACKGROUND);

  // Manrope cargada desde el propio servidor.
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toMatch(/manrope/i);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].some(
          (font) => /manrope/i.test(font.family) && font.status === "loaded",
        );
      }),
    )
    .toBe(true);
  expect(external).toEqual([]);
});
