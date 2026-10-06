import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 11 y 12 de punta a punta: Chromium, next start, Server Actions, knowledge, audit y
// PostgreSQL real, sin mocks (brief-11.2, AC-8). Las entradas las crea cada caso (D-9).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const ADMIN_NAME = ADMIN_SEED.name;
const TIMEZONE = "America/Argentina/Buenos_Aires";
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";
const NOT_FOUND = "Esta entrada no existe.";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

// Las entradas referencian a su organización: si quedaran, el `delete from organizations` de los
// demás specs fallaría por la clave foránea.
test.afterAll(async () => {
  await db.execute(sql`truncate table audit_logs, knowledge_entries`);
  await db.$client.end();
});

// audit_logs es de solo inserción: TRUNCATE es la vía documentada para vaciarla (ADR 0013).
test.beforeEach(async () => {
  await db.execute(sql`truncate table audit_logs, knowledge_entries`);
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

// Día de la organización, desplazado, calculado por PostgreSQL como lo hace el servicio.
async function day(offset: number): Promise<string> {
  const result = await db.execute<{ day: string }>(
    sql`select ((now() at time zone ${TIMEZONE})::date + ${offset}::int)::text as day`,
  );
  return result.rows[0]!.day;
}

async function insertEntry(
  title: string,
  {
    category = "General",
    content = "Contenido de prueba.",
    isActive = true,
    validFrom = null,
    validUntil = null,
    organizationId = SEED_ORGANIZATION_ID,
  }: {
    category?: string;
    content?: string;
    isActive?: boolean;
    validFrom?: string | null;
    validUntil?: string | null;
    organizationId?: string;
  } = {},
) {
  const result = await db.execute<{ id: string }>(
    sql`insert into knowledge_entries
          (organization_id, title, category, content, is_active, valid_from, valid_until)
        values (${organizationId}, ${title}, ${category}, ${content}, ${isActive},
                ${validFrom}, ${validUntil})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function entryRows() {
  const result = await db.execute<{
    title: string;
    category: string;
    content: string;
    is_active: boolean;
    valid_from: string | null;
    valid_until: string | null;
  }>(
    sql`select title, category, content, is_active, valid_from::text, valid_until::text
        from knowledge_entries order by created_at`,
  );
  return result.rows;
}

// La etiqueta de estado lleva un ícono decorativo antes del texto (status-badge.tsx).
const badge = (page: Page, label: string) =>
  page
    .locator("main")
    .getByText(new RegExp(`^\\S\\s*${label}$`))
    .first();

const entriesTable = (page: Page) =>
  page.getByRole("table", {
    name: "Información del negocio de la organización",
  });

async function fillForm(
  page: Page,
  values: {
    title?: string;
    category?: string;
    content?: string;
    validFrom?: string;
    validUntil?: string;
  },
) {
  if (values.title !== undefined) {
    await page.getByLabel("Título").fill(values.title);
  }
  if (values.category !== undefined) {
    await page.getByLabel("Categoría").fill(values.category);
  }
  if (values.content !== undefined) {
    await page.getByLabel("Contenido").fill(values.content);
  }
  if (values.validFrom !== undefined) {
    await page.getByLabel("Vigente desde").fill(values.validFrom);
  }
  if (values.validUntil !== undefined) {
    await page.getByLabel("Vigente hasta").fill(values.validUntil);
  }
}

test("caso 1: FR-INFO-01 un admin llega desde la navegación, ve el vacío y crea la primera entrada", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Información" })
    .click();
  await expect(page).toHaveURL("/informacion");
  await expect(
    page.getByText("Todavía no hay información del negocio."),
  ).toBeVisible();
  await expectAccessible(page, "lista vacía");

  await page.getByRole("link", { name: "+ Nueva entrada" }).click();
  await expect(page).toHaveURL("/informacion/nueva");
  await expectAccessible(page, "alta");
  // El contenido trae saltos de línea y caracteres de HTML: se muestran escapados.
  await fillForm(page, {
    title: "Horario de atención",
    category: "Horarios",
    content:
      "Lunes a viernes de 9 a 18.\nSábados de 9 a 13.\n  <b>Feriados</b> cerrado.",
  });
  await page.getByRole("button", { name: "Crear entrada" }).click();

  await expect(page.getByText("Entrada creada.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Horario de atención" }),
  ).toBeVisible();
  await expect(badge(page, "Vigente")).toBeVisible();
  await expect(page.getByText("Sin límite", { exact: true })).toBeVisible();
  // Escapado: el texto de la etiqueta está a la vista y no hay ningún <b> en la página. Con los
  // saltos de línea y la sangría: innerText respeta white-space, así que sin pre-wrap serían espacios
  // y la sangría se juntaría (revisión independiente, N-8).
  const content = page.getByText("Lunes a viernes de 9 a 18.");
  expect(
    await content.evaluate((element) => (element as HTMLElement).innerText),
  ).toBe(
    "Lunes a viernes de 9 a 18.\nSábados de 9 a 13.\n  <b>Feriados</b> cerrado.",
  );
  await expect(page.locator("main b")).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: "Auditoría de Horario de atención" }),
  ).toContainText("Alta");
  await expectAccessible(page, "detalle recién creado");

  expect(await entryRows()).toEqual([
    {
      title: "Horario de atención",
      category: "Horarios",
      content:
        "Lunes a viernes de 9 a 18.\nSábados de 9 a 13.\n  <b>Feriados</b> cerrado.",
      is_active: true,
      valid_from: null,
      valid_until: null,
    },
  ]);

  await page
    .getByRole("link", { name: "Volver a información del negocio" })
    .click();
  await expect(
    entriesTable(page).getByRole("link", { name: "Horario de atención" }),
  ).toBeVisible();
  await expectAccessible(page, "lista con una entrada");
});

test("caso 2: FR-INFO-01 la validación y el título repetido marcan el campo y conservan lo escrito", async ({
  page,
}) => {
  await insertEntry("Medios de pago", { category: "Pagos" });
  await login(page, ADMIN);
  await page.goto("/informacion/nueva");

  // Vigencia invertida: el error va al campo del final, con el foco.
  await fillForm(page, {
    title: "Envíos",
    category: "Envíos",
    content: "A todo el país.",
    validFrom: "2026-12-26",
    validUntil: "2026-12-24",
  });
  await page.getByRole("button", { name: "Crear entrada" }).click();
  const until = page.getByLabel("Vigente hasta");
  await expect(until).toBeFocused();
  await expect(until).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText(
      "Ingresá una fecha válida, igual o posterior a la de inicio, o dejala vacía.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Contenido")).toHaveValue("A todo el país.");
  await expect(page.getByLabel("Vigente desde")).toHaveValue("2026-12-26");
  await expectAccessible(page, "alta con error de vigencia");

  // Título repetido con otras mayúsculas: CONFLICT en el campo, y lo demás sigue escrito.
  await fillForm(page, { title: "MEDIOS DE PAGO", validUntil: "" });
  await page.getByRole("button", { name: "Crear entrada" }).click();
  const title = page.getByLabel("Título");
  await expect(title).toBeFocused();
  await expect(
    page.getByText("Ya existe una entrada con ese título."),
  ).toBeVisible();
  await expect(title).toHaveValue("MEDIOS DE PAGO");
  await expect(page.getByLabel("Categoría")).toHaveValue("Envíos");
  await expect(page.getByLabel("Contenido")).toHaveValue("A todo el país.");
  expect(await entryRows()).toHaveLength(1);

  // Se corrige y se envía sin reescribir lo demás.
  await fillForm(page, { title: "Envíos" });
  await page.getByRole("button", { name: "Crear entrada" }).click();
  await expect(page.getByText("Entrada creada.")).toBeVisible();
  await expect(page.getByText("Desde el 26/12/2026")).toBeVisible();
  expect((await entryRows()).map((row) => row.title)).toEqual([
    "Medios de pago",
    "Envíos",
  ]);
});

test("caso 3: FR-INFO-01 editar deja el cambio en la auditoría; guardar sin cambios no avisa", async ({
  page,
}) => {
  const entryId = await insertEntry("Horario de atención", {
    category: "Horarios",
    content: "Lunes a viernes de 9 a 18.",
  });
  await login(page, ADMIN);
  await page.goto(`/informacion/${entryId}`);
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByLabel("Título")).toHaveValue("Horario de atención");
  await expectAccessible(page, "edición");

  await fillForm(page, {
    content: "Lunes a sábados de 9 a 13.",
    validUntil: "2027-03-01",
  });
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Entrada actualizada.")).toBeVisible();
  await expect(page.getByText("Hasta el 01/03/2027")).toBeVisible();
  const audit = page.getByRole("table", {
    name: "Auditoría de Horario de atención",
  });
  await expect(audit).toContainText("Edición");
  await expect(audit).toContainText(
    "Contenido modificado · Vigente hasta: sin límite → 01/03/2027",
  );
  await expect(audit).toContainText(ADMIN_NAME);

  // Sin diferencias: vuelve al detalle sin aviso y sin otra fila de auditoría.
  await page.getByRole("link", { name: "Editar" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(`/informacion/${entryId}`);
  await expect(page.getByText("Entrada actualizada.")).toBeHidden();
  await expect(audit.getByRole("row")).toHaveCount(2);
});

test("caso 4: FR-INFO-01 desactivar pide confirmación, deja la entrada inactiva y se puede reactivar", async ({
  page,
}) => {
  const entryId = await insertEntry("Envíos", { category: "Envíos" });
  await login(page, ADMIN);
  await page.goto(`/informacion/${entryId}`);
  await page.getByRole("link", { name: "Desactivar" }).click();
  await expect(page).toHaveURL(`/informacion/${entryId}?confirmar=desactivar`);
  await expect(page.getByText('¿Desactivar "Envíos"?')).toBeFocused();
  await expectAccessible(page, "confirmación de desactivación");

  await page.getByRole("button", { name: "Sí, desactivar" }).click();
  await expect(page.getByText("Entrada desactivada.")).toBeVisible();
  await expect(badge(page, "Inactiva")).toBeVisible();
  await expect(page.getByRole("link", { name: "Desactivar" })).toBeHidden();
  await expectAccessible(page, "entrada inactiva");

  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Entrada reactivada.")).toBeVisible();
  await expect(badge(page, "Vigente")).toBeVisible();
  const audit = page.getByRole("table", { name: "Auditoría de Envíos" });
  await expect(audit).toContainText("Desactivación");
  await expect(audit).toContainText("Reactivación");
  expect((await entryRows())[0]!.is_active).toBe(true);
});

test("caso 5: FR-INFO-02 y FR-INFO-03 la búsqueda y los cinco estados viven en la URL", async ({
  page,
}) => {
  await insertEntry("Medios de pago", {
    category: "Pagos",
    content: "Efectivo, débito y transferencia.",
  });
  await insertEntry("Horario de feriados", {
    category: "Horarios",
    content: "Cerrado.",
    validFrom: await day(1),
  });
  await insertEntry("Promoción de invierno", {
    category: "Promociones",
    content: "Envío gratis.",
    validUntil: await day(-1),
  });
  await insertEntry("Horario anterior", {
    category: "Horarios",
    content: "Ya no rige.",
    isActive: false,
  });
  await login(page, ADMIN);

  const titles = async () =>
    (
      await entriesTable(page)
        .getByRole("row")
        .locator("td:first-child")
        .allTextContents()
    ).sort();

  await page.goto("/informacion");
  expect(await titles()).toEqual([
    "Horario anterior",
    "Horario de feriados",
    "Medios de pago",
    "Promoción de invierno",
  ]);

  for (const [param, expected] of [
    ["vigentes", ["Medios de pago"]],
    ["programadas", ["Horario de feriados"]],
    ["vencidas", ["Promoción de invierno"]],
    ["inactivas", ["Horario anterior"]],
  ] as const) {
    await page.goto(`/informacion?estado=${param}`);
    await expect(page.getByLabel("Estado")).toHaveValue(param);
    expect(await titles(), param).toEqual(expected);
  }
  await expect(badge(page, "Inactiva")).toBeVisible();
  await expectAccessible(page, "lista filtrada");

  // Búsqueda desde el formulario: por una palabra del contenido, sin acento.
  await page.goto("/informacion");
  await page.getByLabel("Buscar").fill("debito");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  // Un formulario GET envía todos sus campos; la paginación y «Limpiar filtros» usan la URL
  // canónica (convención de la 4.4).
  await expect(page).toHaveURL("/informacion?q=debito&estado=todas");
  expect(await titles()).toEqual(["Medios de pago"]);

  // Búsqueda y estado combinados, sin resultados: el mensaje lo distingue del vacío.
  await page.goto("/informacion?q=horario&estado=vencidas");
  await expect(
    page.getByText("Ninguna entrada coincide con estos filtros."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Limpiar filtros" }).first().click();
  await expect(page).toHaveURL("/informacion");
  // Un valor desconocido vuelve al de defecto, sin error.
  await page.goto("/informacion?estado=cualquiera");
  await expect(page.getByLabel("Estado")).toHaveValue("todas");
});

test("caso 6: FR-INFO-02 un viewer lee la lista y el detalle, sin formularios ni auditoría", async ({
  page,
}) => {
  const entryId = await insertEntry("Medios de pago", { category: "Pagos" });
  await login(page, VIEWER);
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Información" })
    .click();
  await expect(
    entriesTable(page).getByRole("link", { name: "Medios de pago" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+ Nueva entrada" }),
  ).toBeHidden();

  await page.goto(`/informacion/${entryId}`);
  await expect(
    page.getByRole("heading", { name: "Medios de pago" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Desactivar" })).toBeHidden();
  expect(await page.content()).not.toContain("Historial de auditoría");
  await expectAccessible(page, "detalle como viewer");

  await page.goto("/informacion/nueva");
  await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
  await expect(page.getByLabel("Título")).toBeHidden();

  // Forzar la edición o la confirmación por la URL tampoco entrega formularios.
  await page.goto(`/informacion/${entryId}?editar=1&confirmar=desactivar`);
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Sí, desactivar" }),
  ).toBeHidden();
});

test("caso 7: una entrada de otra organización o un id inválido no existen", async ({
  page,
}) => {
  const other = await db.execute<{ id: string }>(
    sql`insert into organizations (name) values ('Otra organización') returning id`,
  );
  const foreign = await insertEntry("Entrada ajena", {
    organizationId: other.rows[0]!.id,
  });

  await login(page, ADMIN);
  for (const id of [foreign, "no-es-un-uuid"]) {
    await page.goto(`/informacion/${id}`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    expect(await page.content()).not.toContain("Entrada ajena");
  }
  await expectAccessible(page, "entrada inexistente");

  await page.goto("/informacion?q=ajena");
  await expect(
    page.getByText("Ninguna entrada coincide con estos filtros."),
  ).toBeVisible();
  expect(await page.content()).not.toContain("Entrada ajena");
});

test("caso 8: FR-INFO-01 el alta se completa solo con teclado", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/informacion/nueva");

  const title = page.getByLabel("Título");
  for (let i = 0; i < 12; i++) {
    if (await title.evaluate((element) => element === document.activeElement)) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(title).toBeFocused();
  await page.keyboard.type("Garantía");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Categoría")).toBeFocused();
  await page.keyboard.type("Postventa");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Contenido")).toBeFocused();
  await page.keyboard.type("Seis meses en productos nuevos.");
  // Un campo de fecha de Chromium tiene una parada de tabulación por segmento (día, mes y año),
  // en el orden del locale del navegador: se avanza hasta salir de él, sin suponer cuántas son.
  const tabUntil = async (target: ReturnType<Page["getByLabel"]>) => {
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      if (
        await target.evaluate((element) => element === document.activeElement)
      ) {
        return;
      }
    }
  };
  await tabUntil(page.getByLabel("Vigente desde"));
  await expect(page.getByLabel("Vigente desde")).toBeFocused();
  await tabUntil(page.getByLabel("Vigente hasta"));
  await expect(page.getByLabel("Vigente hasta")).toBeFocused();
  const cancel = page.getByRole("link", { name: "Cancelar" });
  await tabUntil(cancel);
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Crear entrada" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Entrada creada.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Garantía" })).toBeVisible();
});

test("caso 9: FR-INFO-02 en móvil la lista se ve como tarjetas, sin desplazamiento horizontal", async ({
  page,
}) => {
  await insertEntry("Medios de pago", {
    category: "Pagos",
    validFrom: await day(0),
    validUntil: await day(30),
  });
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN);

  await page.goto("/informacion");
  const cards = page.getByRole("list", {
    name: "Información del negocio de la organización",
  });
  await expect(cards.getByRole("listitem")).toHaveCount(1);
  await expect(cards).toContainText("Vigente");
  await expect(entriesTable(page)).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expectAccessible(page, "lista en móvil");
});

test("caso 10: brief-15.2 la categoría sugiere las ya usadas con su propia lista", async ({
  page,
}) => {
  await insertEntry("Horarios", { category: "Atención" });
  await insertEntry("Medios de pago", { category: "Pagos" });
  const other = await db.execute<{ id: string }>(
    sql`insert into organizations (name) values ('Otra organización') returning id`,
  );
  await insertEntry("Entrada ajena", {
    category: "Ajena",
    organizationId: other.rows[0]!.id,
  });
  await login(page, ADMIN);
  await page.goto("/informacion/nueva");

  const category = page.getByRole("combobox", { name: "Categoría" });
  const list = page.getByRole("listbox", { name: "Sugerencias" });
  await category.press("ArrowDown");
  await expect(list.getByRole("option")).toHaveText(["Atención", "Pagos"]);
  await category.fill("aten");
  await expect(list.getByRole("option")).toHaveText(["Atención"]);
  await expectAccessible(page, "alta con la lista de categorías abierta");
  await category.press("ArrowDown");
  await category.press("Enter");
  await expect(category).toHaveValue("Atención");
  await expect(list).toBeHidden();
  await expect(page).toHaveURL("/informacion/nueva");
});
