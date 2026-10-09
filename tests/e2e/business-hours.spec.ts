import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// La pantalla del horario de atención de punta a punta: Chromium, next start, Server Actions,
// knowledge, audit y PostgreSQL real, sin mocks (brief-17.4, AC-7).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const TIMEZONE = "America/Argentina/Buenos_Aires";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

const TABLES = sql`truncate table audit_logs, business_hours, business_hour_exceptions, knowledge_entries`;

test.afterAll(async () => {
  await db.execute(TABLES);
  await db.$client.end();
});

// audit_logs es de solo inserción: TRUNCATE es la vía documentada para vaciarla (ADR 0013).
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

async function day(offset: number): Promise<string> {
  const result = await db.execute<{ day: string }>(
    sql`select ((now() at time zone ${TIMEZONE})::date + ${offset}::int)::text as day`,
  );
  return result.rows[0]!.day;
}

function dayGroup(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

async function fillDay(
  page: Page,
  name: string,
  [opens1, closes1, opens2 = "", closes2 = ""]: string[],
) {
  const group = dayGroup(page, name);
  await group.getByLabel("Abre", { exact: true }).fill(opens1!);
  await group.getByLabel("Cierra", { exact: true }).fill(closes1!);
  await group.getByLabel("Segundo tramo, abre").fill(opens2);
  await group.getByLabel("Segundo tramo, cierra").fill(closes2);
}

async function insertWeek() {
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    const open = weekday <= 5;
    await db.execute(
      sql`insert into business_hours (organization_id, weekday, opens_1, closes_1)
          values (${SEED_ORGANIZATION_ID}, ${weekday},
                  ${open ? "09:00" : null}, ${open ? "18:00" : null})`,
    );
  }
}

test("1. un admin carga el horario semanal desde la información del negocio, y queda en el historial", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/informacion");
  await page.getByRole("link", { name: "Horario de atención" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Horario de atención" }),
  ).toBeVisible();
  await expect(
    page.getByText("Todavía no hay un horario cargado."),
  ).toBeVisible();
  await expectAccessible(page, "horario vacío");

  await page.getByRole("link", { name: "Editar horario" }).click();
  await fillDay(page, "Lunes", ["09:00", "13:00", "16:00", "20:00"]);
  await fillDay(page, "Sábado", ["09:00", "13:00"]);
  await expectAccessible(page, "formulario del horario");
  await page.getByRole("button", { name: "Guardar horario" }).click();

  await expect(page.getByRole("status")).toHaveText("Horario guardado.");
  const week = page.getByRole("region", { name: "Horario semanal" });
  await expect(week).toContainText("Lunes09:00 a 13:00 y 16:00 a 20:00");
  await expect(week).toContainText("Sábado09:00 a 13:00");
  await expect(week).toContainText("DomingoCerrado");
  const history = page.getByRole("table", {
    name: "Historial del horario de atención",
  });
  await expect(history).toContainText("Horario semanal");
  await expect(history).toContainText(
    "Lunes: sin cargar → 09:00 a 13:00 y 16:00 a 20:00",
  );
  await expectAccessible(page, "horario cargado");

  const stored = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from business_hours where organization_id = ${SEED_ORGANIZATION_ID}`,
  );
  expect(stored.rows[0]!.count).toBe(7);
});

test("2. un tramo inválido marca su día, conserva lo escrito y no guarda nada", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/informacion/horario?editar=1");
  await fillDay(page, "Lunes", ["09:00", "18:00"]);
  await fillDay(page, "Martes", ["13:00", "09:00"]);
  await page.getByRole("button", { name: "Guardar horario" }).click();

  const tuesday = dayGroup(page, "Martes");
  await expect(tuesday).toContainText("Revisá el martes");
  await expect(tuesday.getByLabel("Abre", { exact: true })).toBeFocused();
  await expect(tuesday.getByLabel("Abre", { exact: true })).toHaveValue(
    "13:00",
  );
  await expect(
    dayGroup(page, "Lunes").getByLabel("Cierra", { exact: true }),
  ).toHaveValue("18:00");
  await expectAccessible(page, "formulario con un día inválido");
  const stored = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from business_hours`,
  );
  expect(stored.rows[0]!.count).toBe(0);
});

test("3. un admin agrega un día especial, no puede repetir la fecha y lo quita con el teclado", async ({
  page,
}) => {
  await insertWeek();
  const date = await day(3);
  await login(page, ADMIN);
  await page.goto("/informacion/horario");

  await page.getByLabel("Fecha").fill(date);
  await page.getByLabel("Motivo").fill("Feriado");
  await page.getByRole("button", { name: "Agregar día especial" }).click();
  await expect(page.getByRole("status")).toHaveText("Día especial agregado.");
  const specials = page.getByRole("region", { name: "Días especiales" });
  await expect(specials).toContainText("Cerrado · Feriado");

  await page.getByLabel("Fecha").fill(date);
  await page.getByRole("button", { name: "Agregar día especial" }).click();
  await expect(
    page.getByText("Ya hay un día especial para esa fecha."),
  ).toBeVisible();
  await expect(page.getByLabel("Fecha")).toBeFocused();
  await expectAccessible(page, "día especial repetido");

  const remove = specials.getByRole("button", { name: /^Quitar / });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Día especial quitado.");
  await expect(specials).toContainText("No hay días especiales próximos.");
  const history = page.getByRole("table", {
    name: "Historial del horario de atención",
  });
  await expect(history).toContainText("Día especial agregado");
  await expect(history).toContainText("Día especial quitado");
});

test("4. un viewer ve el horario y los días especiales sin controles ni historial, también a 375 px", async ({
  page,
}) => {
  await insertWeek();
  await db.execute(
    sql`insert into business_hour_exceptions (organization_id, date, reason)
        values (${SEED_ORGANIZATION_ID}, ${await day(2)}::date, 'Inventario')`,
  );
  await login(page, VIEWER);
  await page.goto("/informacion/horario");
  await expect(
    page.getByRole("region", { name: "Horario semanal" }),
  ).toContainText("Lunes09:00 a 18:00");
  await expect(
    page.getByRole("region", { name: "Días especiales" }),
  ).toContainText("Cerrado · Inventario");
  await expect(page.getByRole("link", { name: "Editar horario" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /Quitar/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Agregar día especial" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: "Historial del horario de atención" }),
  ).toHaveCount(0);
  // Aunque pida la edición por la URL, un viewer no ve el formulario.
  await page.goto("/informacion/horario?editar=1");
  await expect(
    page.getByRole("button", { name: "Guardar horario" }),
  ).toHaveCount(0);
  await expectAccessible(page, "horario de un viewer");

  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "horario en el móvil");
});

test("5. avisa si hay una entrada de texto vigente sobre horarios (D-5)", async ({
  page,
}) => {
  await db.execute(
    sql`insert into knowledge_entries (organization_id, title, category, content)
        values (${SEED_ORGANIZATION_ID}, 'Horarios de atención', 'Horarios', 'Lunes a viernes de 9 a 18.')`,
  );
  await login(page, ADMIN);
  await page.goto("/informacion/horario?editar=1");
  await expect(
    page.getByText("También hay una entrada de texto vigente sobre horarios"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Horarios de atención" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "formulario del horario en el móvil");
});
