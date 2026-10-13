import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Campos ampliados de clientes de punta a punta: Chromium, next start, Server Actions, crm, audit
// y PostgreSQL real, sin mocks (brief-17.1, AC-8). El formulario, la ficha y los filtros de la
// lista, con axe en claro y en oscuro, el teclado y el móvil a 375 px. Cada caso crea sus clientes
// (D-14).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.execute(
    sql`truncate table sale_lines, sales, order_lines, orders, audit_logs, client_tag_assignments, client_tags, conversation_notes, messages, conversations, clients`,
  );
  await db.$client.end();
});

// audit_logs es de solo inserción: TRUNCATE es la vía documentada para vaciarla (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table sale_lines, sales, order_lines, orders, audit_logs, client_tag_assignments, client_tags, conversation_notes, messages, conversations, clients`,
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

type Extra = {
  email?: string;
  kind?: "person" | "company";
  company?: string;
  address?: string;
  city?: string;
  province?: string;
  postal?: string;
  segment?: string;
};

async function insertClient(name: string, extra: Extra = {}) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, email, kind, company_name,
                             address_line, city, province, postal_code, segment)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${extra.email ?? null},
                ${extra.kind ?? null}::client_kind, ${extra.company ?? null},
                ${extra.address ?? null}, ${extra.city ?? null}, ${extra.province ?? null},
                ${extra.postal ?? null}, ${extra.segment ?? null})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function clientRow(name: string) {
  const result = await db.execute<Record<string, string | null>>(
    sql`select id, email, kind, company_name, job_title, address_line, city, province,
               postal_code, segment
        from clients where display_name = ${name}`,
  );
  return result.rows[0]!;
}

const status = (page: Page) => page.getByRole("status");

// Pasa el foco con Tab hasta `target`, como lo haría una persona con el teclado.
async function tabTo(page: Page, target: ReturnType<Page["getByLabel"]>) {
  for (let i = 0; i < 60; i++) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab no llegó al elemento");
}

const FULL = {
  email: "ana.kumquat@example.com",
  company: "Kumquats SRL",
  job: "Encargada de compras",
  address: "Calle Pomelo 1234",
  city: "Rosario",
  postal: "S2000ABC",
  segment: "Mayorista",
};

test("1. FR-CLI-12: un admin da de alta y edita con los campos nuevos, y el historial los nombra", async ({
  page,
}) => {
  await insertClient("Otro Cliente", { segment: "Minorista" });
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");
  for (const card of ["Contacto", "Empresa", "Dirección", "Clasificación"]) {
    await expect(page.getByRole("region", { name: card })).toBeVisible();
  }
  await expectAccessible(page, "alta con los campos nuevos");

  await page.getByLabel("Nombre *").fill("Ana Kumquat");
  await page.getByLabel("Email").fill("  Ana.Kumquat@Example.com ");
  await page.getByLabel("Tipo").selectOption({ label: "Empresa" });
  await page
    .getByRole("textbox", { name: "Empresa", exact: true })
    .fill(FULL.company);
  await page.getByLabel("Cargo").fill(FULL.job);
  await page.getByLabel("Calle y número").fill(FULL.address);
  await page.getByLabel("Ciudad").fill(FULL.city);
  await page.getByLabel("Provincia").selectOption({ label: "Santa Fe" });
  await page.getByLabel("Código postal").fill("s2000abc");
  // D-5: el segmento sugiere los ya cargados en la organización.
  await page.getByLabel("Segmento").fill("Mi");
  await expect(page.getByRole("option", { name: "Minorista" })).toBeVisible();
  await page.getByLabel("Segmento").fill(FULL.segment);
  await page.getByRole("button", { name: "Crear cliente" }).click();

  await expect(status(page)).toHaveText("Cliente creado.");
  expect(await clientRow("Ana Kumquat")).toMatchObject({
    email: FULL.email,
    kind: "company",
    company_name: FULL.company,
    job_title: FULL.job,
    address_line: FULL.address,
    city: FULL.city,
    province: "AR-S",
    postal_code: FULL.postal,
    segment: FULL.segment,
  });
  const contact = page.getByRole("region", { name: "Contacto" });
  await expect(contact).toContainText(FULL.email);
  const address = page.getByRole("region", { name: "Dirección" });
  await expect(address).toContainText("Santa Fe");
  await expect(address).toContainText(FULL.postal);
  await expect(page.getByRole("region", { name: "Empresa" })).toContainText(
    FULL.company,
  );
  await expectAccessible(page, "ficha con los campos nuevos");

  // Editar: otra provincia y sin segmento. El formulario precarga lo guardado.
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByLabel("Email")).toHaveValue(FULL.email);
  await expect(page.getByLabel("Provincia")).toHaveValue("AR-S");
  await page.getByLabel("Provincia").selectOption({ label: "Córdoba" });
  await page.getByLabel("Segmento").fill("");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(status(page)).toHaveText("Cliente actualizado.");
  expect(await clientRow("Ana Kumquat")).toMatchObject({
    province: "AR-X",
    segment: null,
  });
  await expect(
    page.getByRole("table", { name: /^Auditoría de Ana Kumquat/ }),
  ).toContainText(
    "Provincia: Santa Fe → Córdoba · Segmento: Mayorista → vacío",
  );
});

test("2. AC-2: un código postal inválido marca su campo y conserva lo escrito", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");
  await page.getByLabel("Nombre *").fill("Bruno Postal");
  await page.getByLabel("Ciudad").fill("Rosario");
  await page.getByLabel("Código postal").fill("14-25");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  const postal = page.getByLabel("Código postal");
  await expect(postal).toBeFocused();
  await expect(postal).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/Ingresá un código postal/)).toBeVisible();
  await expect(page.getByLabel("Ciudad")).toHaveValue("Rosario");
  await expect(postal).toHaveValue("14-25");
  await expectAccessible(page, "error en el código postal");
});

test("3. FR-CLI-13: un viewer no recibe el email, la calle ni el código postal", async ({
  page,
}) => {
  const clientId = await insertClient("Eva Lectora", {
    email: FULL.email,
    kind: "company",
    company: FULL.company,
    address: FULL.address,
    city: FULL.city,
    province: "AR-S",
    postal: FULL.postal,
    segment: FULL.segment,
  });
  await login(page, VIEWER);
  const response = await page.goto(`/clientes/${clientId}`);
  const html = (await response?.text()) ?? "";
  for (const hidden of [FULL.email, FULL.address, FULL.postal]) {
    expect(html, hidden).not.toContain(hidden);
  }
  const contact = page.getByRole("region", { name: "Contacto" });
  await expect(contact).toContainText("Solo visible para administradores.");
  const address = page.getByRole("region", { name: "Dirección" });
  await expect(address).toContainText(FULL.city);
  await expect(address).toContainText("Santa Fe");
  await expect(page.getByRole("region", { name: "Empresa" })).toContainText(
    FULL.company,
  );
  await expect(
    page.getByRole("region", { name: "Clasificación" }),
  ).toContainText(FULL.segment);
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await expectAccessible(page, "ficha del viewer");

  // La lista tampoco los trae.
  const list = await page.goto("/clientes");
  const listHtml = (await list?.text()) ?? "";
  for (const hidden of [FULL.email, FULL.address, FULL.postal]) {
    expect(listHtml, hidden).not.toContain(hidden);
  }
});

test("4. FR-CLI-14: la lista filtra por tipo, provincia y segmento, combinados y en la URL", async ({
  page,
}) => {
  await insertClient("Ana Persona", {
    kind: "person",
    province: "AR-S",
    segment: "Minorista",
  });
  await insertClient("Bruno Empresa", {
    kind: "company",
    province: "AR-S",
    segment: "Mayorista",
  });
  await insertClient("Carla Empresa", {
    kind: "company",
    province: "AR-X",
    segment: "Mayorista",
  });
  await insertClient("Dario Sin Datos");
  await login(page, VIEWER);
  await page.goto("/clientes");

  const table = page.getByRole("table", {
    name: "Clientes de la organización",
  });
  // El selector de provincia ofrece solo las que tiene algún cliente.
  await expect(page.getByLabel("Provincia").locator("option")).toHaveText([
    "Todas",
    "Córdoba",
    "Santa Fe",
  ]);
  await page.getByLabel("Tipo").selectOption({ label: "Empresa" });
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/tipo=empresa/);
  await expect(
    table.getByRole("link", { name: "Bruno Empresa" }),
  ).toBeVisible();
  await expect(
    table.getByRole("link", { name: "Carla Empresa" }),
  ).toBeVisible();
  await expect(table.getByRole("link", { name: "Ana Persona" })).toHaveCount(0);

  await page.getByLabel("Provincia").selectOption({ label: "Santa Fe" });
  await page.getByLabel("Segmento").selectOption({ label: "Mayorista" });
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(
    /tipo=empresa&provincia=AR-S&segmento=Mayorista/,
  );
  await expect(table.getByRole("link")).toHaveText(["Bruno Empresa"]);
  await expectAccessible(page, "lista filtrada");

  // Un segmento o una provincia que no tiene ningún cliente se ignoran, como una etiqueta ajena.
  await page.goto("/clientes?segmento=Ajeno&provincia=AR-T");
  await expect(table.getByRole("link")).toHaveCount(4);
  await expect(page.getByRole("link", { name: "Limpiar filtros" })).toHaveCount(
    0,
  );

  // En el móvil, los filtros sin desplazamiento horizontal.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/clientes?tipo=persona");
  await expect(
    page.getByRole("link", { name: "Ana Persona" }).first(),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "lista filtrada en el móvil");
});

test("5. AC-8: el alta con los campos nuevos solo con teclado, y la ficha a 375 px", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");
  await tabTo(page, page.getByLabel("Nombre *"));
  await page.keyboard.type("Gabi Teclado");
  await tabTo(page, page.getByLabel("Email"));
  await page.keyboard.type("gabi@example.com");
  await tabTo(page, page.getByLabel("Tipo"));
  await page.keyboard.type("P");
  await tabTo(page, page.getByLabel("Provincia"));
  await page.keyboard.type("Tuc");
  await tabTo(page, page.getByRole("button", { name: "Crear cliente" }));
  await page.keyboard.press("Enter");

  await expect(status(page)).toHaveText("Cliente creado.");
  expect(await clientRow("Gabi Teclado")).toMatchObject({
    email: "gabi@example.com",
    kind: "person",
    province: "AR-T",
  });

  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expect(page.getByRole("region", { name: "Dirección" })).toContainText(
    "Tucumán",
  );
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "ficha en el móvil");
});
