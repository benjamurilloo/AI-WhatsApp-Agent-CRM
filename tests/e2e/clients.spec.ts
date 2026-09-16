import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 6 y 7 de punta a punta: Chromium, next start, Server Actions, crm, audit y PostgreSQL
// real, sin mocks (brief-5.3). Los clientes los crea cada caso (brief-4.4, D-5).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const ADMIN_NAME = ADMIN_SEED.name;
const TIMEZONE = "America/Argentina/Buenos_Aires";
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";
const NOT_FOUND = "Este cliente no existe.";
// Distinto del ejemplo de la ayuda del formulario, que viaja en el JS del navegador.
const PHONE = "+5491166667788";
// El número guardado, entero o sin los últimos 4 dígitos (H-5). La búsqueda del viewer se escribe
// con separadores, que la página le devuelve en el campo: eso es lo que él tipeó, no una fuga.
const HIDDEN_FRAGMENTS = ["5491166667788", "549116666"];

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

// Los demás specs borran organizaciones: no pueden quedar clientes que lo impidan.
// TRUNCATE de clients exige vaciar en la misma sentencia las tablas que la referencian (brief-6.1).
test.afterAll(async () => {
  await db.execute(sql`truncate table messages, conversations, clients`);
  await db.$client.end();
});

// audit_logs y messages son de solo inserción: TRUNCATE es la vía documentada para vaciarlas (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, messages, conversations, clients`,
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

async function insertClient(
  displayName: string,
  {
    phone = null,
    notes = null,
    isActive = true,
    organizationId = SEED_ORGANIZATION_ID,
  }: {
    phone?: string | null;
    notes?: string | null;
    isActive?: boolean;
    organizationId?: string;
  } = {},
) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, notes, is_active)
        values (${organizationId}, ${displayName}, ${phone}, ${notes}, ${isActive})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function clientCount() {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from clients`,
  );
  return result.rows[0]!.count;
}

const clientsTable = (page: Page) =>
  page.getByRole("table", { name: "Clientes de la organización" });

test("caso 1: un admin llega desde la navegación, ve el vacío y crea el primer cliente", async ({
  page,
}) => {
  await login(page, ADMIN);
  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("link", { name: "Clientes" }).click();
  await expect(page).toHaveURL("/clientes");
  await expect(nav.getByRole("link", { name: "Clientes" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("Todavía no hay clientes.")).toBeVisible();
  await expectAccessible(page, "lista vacía");

  await page.getByRole("link", { name: "Crear el primero" }).click();
  await expect(page).toHaveURL("/clientes/nuevo");
  await page.getByLabel("Nombre *").fill("Ana Pérez");
  await page.getByLabel("Teléfono").fill("+54 9 11 6666-7788");
  await expect(page.getByLabel("Notas")).toHaveAccessibleDescription(
    "No registres datos sensibles innecesarios.",
  );
  await page.getByLabel("Notas").fill("Prefiere retirar por la tarde.");
  await expectAccessible(page, "alta");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}\?aviso=creado$/);
  await expect(page.getByText("Cliente creado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clientes" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const data = page.getByRole("region", { name: "Datos" });
  await expect(data).toContainText(PHONE);
  await expect(data).toContainText("Prefiere retirar por la tarde.");
  const audit = page.getByRole("table", { name: "Auditoría de Ana Pérez" });
  await expect(audit).toContainText("Alta");
  await expect(audit).toContainText(
    `Nombre: Ana Pérez · Teléfono: ${PHONE} · Notas cargadas`,
  );
  await expect(audit).not.toContainText("Prefiere retirar");
  await expect(audit).toContainText(ADMIN_NAME);
  await expect(page.getByText(`Fechas en ${TIMEZONE}.`)).toBeVisible();
  await expect(data).toContainText("Última interacción");
  await expect(data).toContainText("Sin interacciones");
  await expectAccessible(page, "detalle recién creado");

  await page.getByRole("link", { name: "Volver a clientes" }).click();
  await expect(clientsTable(page)).toContainText("Ana Pérez");
  await expect(clientsTable(page)).toContainText(PHONE);
  await expect(clientsTable(page)).toContainText("Última interacción");
  await expect(clientsTable(page)).toContainText("Sin interacciones");
  await expectAccessible(page, "lista con un cliente");
});

test("caso 2: la validación marca el campo, conserva lo escrito y no crea nada", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");
  await page.getByLabel("Nombre *").fill("   ");
  await page.getByLabel("Teléfono").fill("011 5555-1234");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  const name = page.getByLabel("Nombre *");
  await expect(name).toHaveAccessibleDescription(
    "Ingresá un nombre de hasta 200 caracteres.",
  );
  await expect(name).toBeFocused();

  await name.fill("Bruno Díaz");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  const phone = page.getByLabel("Teléfono");
  await expect(phone).toHaveAccessibleDescription(/con \+ y código de país/);
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).toBeFocused();
  await expect(phone).toHaveValue("011 5555-1234");
  await expect(page.getByLabel("Nombre *")).toHaveValue("Bruno Díaz");
  await expectAccessible(page, "alta con teléfono inválido");

  await phone.fill("+5491155559999");
  await page.getByLabel("Notas").fill("n".repeat(1001));
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByLabel("Notas")).toHaveAccessibleDescription(
    /no pueden superar los 1000 caracteres/,
  );
  expect(await clientCount()).toBe(0);
});

test("caso 3: el teléfono de un cliente desactivado da el aviso en el campo y se encuentra con Todos", async ({
  page,
}) => {
  await insertClient("Ana Pérez", { phone: PHONE, isActive: false });
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");
  await page.getByLabel("Nombre *").fill("Otra Ana");
  await page.getByLabel("Teléfono").fill("+54 (9) 11 6666.7788");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  const phone = page.getByLabel("Teléfono");
  await expect(phone).toHaveAccessibleDescription(
    /Ya existe un cliente con ese teléfono\. Si está desactivado/,
  );
  await expect(phone).toBeFocused();
  await expect(page.getByLabel("Nombre *")).toHaveValue("Otra Ana");
  await expectAccessible(page, "alta con teléfono duplicado");
  expect(await clientCount()).toBe(1);

  await page.goto("/clientes");
  await page.getByLabel("Buscar").fill("+54 9 11 6666-7788");
  await page.getByLabel("Actividad").selectOption("todos");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(
    "/clientes?q=%2B54+9+11+6666-7788&actividad=todos",
  );
  await expect(clientsTable(page)).toContainText("Ana Pérez");
  await expect(clientsTable(page)).toContainText("No");
});

test("caso 4: busca por nombre y por teléfono, filtra y pagina desde la URL", async ({
  page,
}) => {
  await insertClient("Ana Pérez", { phone: PHONE });
  await insertClient("Bruno Díaz", { phone: "+5491155559999" });
  await insertClient("Carla Inactiva", { isActive: false });
  await login(page, ADMIN);

  await page.goto("/clientes");
  await expect(clientsTable(page).getByRole("row")).toHaveCount(3);
  await expect(clientsTable(page)).not.toContainText("Carla");

  await page.getByLabel("Buscar").fill("ana");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL("/clientes?q=ana&actividad=activos");
  await expect(clientsTable(page).getByRole("row")).toHaveCount(2);
  await expect(clientsTable(page)).toContainText("Ana Pérez");

  await page.goto("/clientes?q=%2B54%209%2011%205555-9999");
  await expect(clientsTable(page)).toContainText("Bruno Díaz");
  await expect(clientsTable(page)).not.toContainText("Ana Pérez");

  await page.goto("/clientes?q=5555");
  await expect(
    page.getByText("Ningún cliente coincide con esta búsqueda."),
  ).toBeVisible();
  await expectAccessible(page, "sin resultados");
  await page.getByRole("link", { name: "Limpiar filtros" }).last().click();
  await expect(page).toHaveURL("/clientes");

  await page.goto("/clientes?actividad=inactivos");
  await expect(clientsTable(page)).toContainText("Carla Inactiva");
  await expect(clientsTable(page).getByRole("row")).toHaveCount(2);

  for (let i = 0; i < 26; i++) {
    await insertClient(`Zeta ${String(i).padStart(2, "0")}`);
  }
  await page.goto("/clientes");
  await expect(page.getByText("Página 1 de 2 · 28 clientes")).toBeVisible();
  await page.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL("/clientes?pagina=2");
  await expect(clientsTable(page).getByRole("row")).toHaveCount(4);
  await expect(clientsTable(page)).toContainText("Zeta 25");
});

test("caso 5: editar deja el cambio resumido en la auditoría", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", {
    phone: PHONE,
    notes: "Nota vieja confidencial",
  });
  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}`);
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(`/clientes/${clientId}?editar=1`);
  await expect(page.getByLabel("Teléfono")).toHaveValue(PHONE);
  await expectAccessible(page, "edición");

  await page.getByLabel("Teléfono").fill("");
  await page.getByLabel("Notas").fill("Nota nueva");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cliente actualizado.")).toBeVisible();

  const data = page.getByRole("region", { name: "Datos" });
  await expect(data).toContainText("Sin teléfono");
  await expect(data).toContainText("Nota nueva");
  const audit = page.getByRole("table", { name: /Auditoría de/ });
  await expect(audit).toContainText("Edición");
  await expect(audit).toContainText(
    `Teléfono: ${PHONE} → vacío · Notas actualizadas`,
  );
  await expect(audit).not.toContainText("confidencial");
  await expectAccessible(page, "detalle editado");
});

test("caso 6: editar con el teléfono de otro cliente muestra el aviso en el campo", async ({
  page,
}) => {
  await insertClient("Ana Pérez", { phone: PHONE });
  const brunoId = await insertClient("Bruno Díaz", {
    phone: "+5491155559999",
  });
  await login(page, ADMIN);
  await page.goto(`/clientes/${brunoId}?editar=1`);
  await page.getByLabel("Teléfono").fill(PHONE);
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  const phone = page.getByLabel("Teléfono");
  await expect(phone).toHaveAccessibleDescription(
    /Ya existe un cliente con ese teléfono/,
  );
  await expect(phone).toHaveValue(PHONE);
  const stored = await db.execute<{ phone_e164: string }>(
    sql`select phone_e164 from clients where id = ${brunoId}`,
  );
  expect(stored.rows[0]!.phone_e164).toBe("+5491155559999");
});

test("caso 7: desactivar pide confirmación y se puede reactivar", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", { phone: PHONE });
  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}`);
  await page.getByRole("link", { name: "Desactivar" }).click();
  await expect(page.getByText('¿Desactivar "Ana Pérez"?')).toBeFocused();
  await expectAccessible(page, "confirmación de desactivar");
  await page.getByRole("button", { name: "Sí, desactivar" }).click();

  await expect(page.getByText("Cliente desactivado.")).toBeVisible();
  await expect(page.getByText("Inactivo", { exact: true })).toBeVisible();
  await expectAccessible(page, "cliente inactivo");

  await page.goto("/clientes");
  await expect(page.getByText("Ana Pérez")).toBeHidden();

  await page.goto(`/clientes/${clientId}`);
  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Cliente reactivado.")).toBeVisible();
  await expect(page.getByText("Activo", { exact: true })).toBeVisible();
  const audit = page.getByRole("table", { name: /Auditoría de/ });
  await expect(audit).toContainText("Desactivación");
  await expect(audit).toContainText("Reactivación");
});

test("caso 8: un viewer ve el teléfono enmascarado y no recibe formularios ni auditoría", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", {
    phone: PHONE,
    notes: "Prefiere la tarde.",
  });
  await insertClient("Número corto", { phone: "+1234" });
  await login(page, VIEWER);
  await page.goto("/clientes");
  await expect(
    page.getByRole("link", { name: "+ Nuevo cliente" }),
  ).toBeHidden();
  const table = clientsTable(page);
  await expect(table).toContainText("•••• 7788");
  await expect(
    table.getByText("Teléfono enmascarado, termina en 7788"),
  ).toBeAttached();
  await expect(
    table.getByText("Teléfono enmascarado", { exact: true }),
  ).toBeAttached();
  await expectAccessible(page, "lista como viewer");

  await page.goto(`/clientes/${clientId}`);
  const data = page.getByRole("region", { name: "Datos" });
  await expect(data).toContainText("•••• 7788");
  await expect(data).toContainText("Prefiere la tarde.");
  await expect(page.getByRole("link", { name: "Editar" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Desactivar" })).toBeHidden();
  await expect(page.getByRole("table", { name: /Auditoría de/ })).toBeHidden();
  expect(await page.content()).not.toContain("Historial de auditoría");
  await expectAccessible(page, "detalle como viewer");

  await page.goto("/clientes/nuevo");
  await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
  await expect(page.getByLabel("Nombre *")).toBeHidden();

  // Forzar la edición por la URL tampoco entrega el formulario.
  await page.goto(`/clientes/${clientId}?editar=1`);
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toBeHidden();
  await expect(page.getByLabel("Teléfono")).toBeHidden();
});

test("caso 9 (H-5): nada de lo que recibe el navegador de un viewer contiene el número", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", { phone: PHONE });
  const routes = [
    "/clientes",
    "/clientes?q=%2B54%209%2011%206666-7788",
    `/clientes/${clientId}`,
    `/clientes/${clientId}?editar=1`,
  ];

  // Todo lo que el servidor manda durante la navegación: documentos y datos de RSC.
  async function collectBodies(email: string) {
    const bodies: string[] = [];
    let pending: Promise<void>[] = [];
    const listener = (response: import("@playwright/test").Response) => {
      if (!response.url().startsWith("http://localhost")) return;
      pending.push(
        response
          .text()
          .then((text) => void bodies.push(text))
          .catch(() => undefined),
      );
    };
    // Cada cuerpo se lee antes de la navegación siguiente: una respuesta que la navegación corta
    // (un prefetch o una sección en streaming) deja su lectura sin resolver.
    const drain = async () => {
      await page.waitForLoadState("networkidle");
      await Promise.all(pending);
      pending = [];
    };
    await login(page, email);
    page.on("response", listener);
    for (const route of routes) {
      await page.goto(route);
      await drain();
      bodies.push(await page.content());
      const raw = await page.request.get(route);
      bodies.push(await raw.text());
    }
    // Navegación del lado del cliente: la lista pide el detalle como datos de RSC.
    await page.goto("/clientes");
    await drain();
    await page
      .getByRole("table", { name: "Clientes de la organización" })
      .getByRole("link", { name: "Ana Pérez" })
      .click();
    await expect(page).toHaveURL(`/clientes/${clientId}`);
    await expect(
      page.getByRole("heading", { name: "Ana Pérez" }),
    ).toBeVisible();
    await drain();
    page.off("response", listener);
    await page.context().clearCookies();
    return bodies;
  }

  const viewerBodies = await collectBodies(VIEWER);
  expect(viewerBodies.length).toBeGreaterThan(8);
  for (const body of viewerBodies) {
    for (const fragment of HIDDEN_FRAGMENTS) {
      expect(body).not.toContain(fragment);
    }
  }
  expect(viewerBodies.join("\n")).toContain("•••• 7788");

  // Control: con admin el mismo recorrido sí contiene el número; el test no pasa por vacío.
  const adminBodies = await collectBodies(ADMIN);
  expect(adminBodies.join("\n")).toContain(PHONE);
});

test("caso 10: un cliente de otra organización o un id inválido no existen", async ({
  page,
}) => {
  const other = await db.execute<{ id: string }>(
    sql`insert into organizations (name) values ('Otra organización') returning id`,
  );
  const foreignId = await insertClient("Cliente ajeno", {
    phone: PHONE,
    organizationId: other.rows[0]!.id,
  });

  await login(page, ADMIN);
  for (const id of [foreignId, "no-es-un-uuid"]) {
    await page.goto(`/clientes/${id}`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    expect(await page.content()).not.toContain("Cliente ajeno");
  }
  await expectAccessible(page, "cliente inexistente");

  await page.goto("/clientes?q=%2B5491166667788&actividad=todos");
  await expect(
    page.getByText("Ningún cliente coincide con esta búsqueda."),
  ).toBeVisible();
  expect(await page.content()).not.toContain("Cliente ajeno");
});

test("caso 11: el alta se completa solo con teclado", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");

  const name = page.getByLabel("Nombre *");
  for (let i = 0; i < 12; i++) {
    if (await name.evaluate((element) => element === document.activeElement)) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(name).toBeFocused();
  await page.keyboard.type("Cliente de teclado");
  await page.keyboard.press("Tab");
  await page.keyboard.type("+5491155557777");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Sin datos sensibles");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Crear cliente" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Cliente creado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cliente de teclado" }),
  ).toBeVisible();
});

test("caso 12: en móvil la lista se ve como tarjetas", async ({ page }) => {
  await insertClient("Ana Pérez", { phone: PHONE });
  await insertClient("Lucía Fernández");
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, VIEWER);

  await page.goto("/clientes");
  const cards = page.getByRole("list", { name: "Clientes de la organización" });
  await expect(cards.getByRole("listitem")).toHaveCount(2);
  await expect(cards).toContainText("•••• 7788");
  await expect(cards).toContainText("Sin teléfono");
  await expect(clientsTable(page)).toBeHidden();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
  await expectAccessible(page, "lista en móvil");
});

// Conversación mínima para la última interacción (brief-6.4, D-5): fixture sintético por SQL.
async function insertConversation(
  clientId: string,
  status: "open" | "pending" | "closed",
  sentAt: Date,
) {
  const result = await db.execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, status, started_at, last_message_at)
        values (${SEED_ORGANIZATION_ID}, ${clientId}, 'whatsapp', ${status},
          ${sentAt.toISOString()}, ${sentAt.toISOString()})
        returning id`,
  );
  const conversationId = result.rows[0]!.id;
  await db.execute(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
        values (${SEED_ORGANIZATION_ID}, ${conversationId}, 'inbound', ${sentAt.toISOString()}, 'hola')`,
  );
  return conversationId;
}

test("caso 13: la lista se ordena por última interacción y la muestra en la zona de la organización", async ({
  page,
}) => {
  const ana = await insertClient("Ana Pérez");
  await insertClient("Bruno Díaz");
  const zoe = await insertClient("Zoe Luna");
  await insertConversation(ana, "closed", new Date("2026-09-01T12:00:00Z"));
  // 02:30 UTC del 11 es todavía el 10 en Buenos Aires.
  await insertConversation(zoe, "open", new Date("2026-09-11T02:30:00Z"));

  await login(page, VIEWER);
  await page.goto("/clientes");
  const rows = clientsTable(page).getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText("Zoe Luna");
  await expect(rows.nth(1)).toContainText("10/09 23:30");
  await expect(rows.nth(2)).toContainText("Ana Pérez");
  await expect(rows.nth(2)).toContainText("01/09 09:00");
  await expect(rows.nth(3)).toContainText("Bruno Díaz");
  await expect(rows.nth(3)).toContainText("Sin interacciones");
  await expect(
    page.getByText(`Ordenados por última interacción · Fechas en ${TIMEZONE}.`),
  ).toBeVisible();
  await expectAccessible(page, "lista con última interacción");
});

test("caso 14: el detalle muestra la última interacción y las conversaciones del cliente", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", { phone: PHONE });
  const base = new Date("2026-09-01T12:00:00Z").getTime();
  for (let index = 0; index < 26; index += 1) {
    await insertConversation(
      clientId,
      index === 25 ? "closed" : "open",
      new Date(base + index * 60 * 60 * 1000),
    );
  }

  await login(page, VIEWER);
  await page.goto(`/clientes/${clientId}`);
  const data = page.getByRole("region", { name: "Datos" });
  await expect(data).toContainText("Última interacción");
  await expect(data).toContainText("02/09 10:00 · WhatsApp");
  const section = page.getByRole("region", { name: "Conversaciones" });
  const table = section.getByRole("table", {
    name: "Conversaciones de Ana Pérez",
  });
  await expect(table.getByRole("row")).toHaveCount(1 + 25);
  await expect(table.getByRole("row").nth(1)).toContainText("Cerrada");
  await expect(
    section.getByText("Página 1 de 2 · 26 conversaciones"),
  ).toBeVisible();
  await expectAccessible(page, "detalle con conversaciones");

  await section.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL(`/clientes/${clientId}?pagina_conv=2`);
  await expect(table.getByRole("row")).toHaveCount(1 + 1);

  await section.getByLabel("Estado").selectOption("cerrada");
  await section.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(`/clientes/${clientId}?estado_conv=cerrada`);
  await expect(table.getByRole("row")).toHaveCount(1 + 1);
  await section.getByLabel("Estado").selectOption("pendiente");
  await section.getByRole("button", { name: "Filtrar" }).click();
  await expect(
    section.getByText("Ninguna conversación con este estado."),
  ).toBeVisible();
  await expectAccessible(page, "conversaciones sin resultados");
  // La sección nueva no filtra el teléfono completo a un viewer (H-5).
  for (const fragment of HIDDEN_FRAGMENTS) {
    expect(await page.content()).not.toContain(fragment);
  }

  await section.getByRole("link", { name: "Limpiar filtro" }).first().click();
  await expect(page).toHaveURL(`/clientes/${clientId}`);
  await section.getByRole("link", { name: "Ver en Conversaciones" }).click();
  await expect(page).toHaveURL(`/conversaciones?cliente=${clientId}`);
  await expect(page.getByText("Cliente: Ana Pérez")).toBeVisible();

  await page.goto(`/clientes/${clientId}`);
  await table.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/conversaciones\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
});

test("caso 15: un cliente sin conversaciones muestra el vacío", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Fernández");
  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}`);
  const section = page.getByRole("region", { name: "Conversaciones" });
  await expect(
    section.getByText("Sin conversaciones registradas."),
  ).toBeVisible();
  await expect(
    section.getByRole("link", { name: "Ver en Conversaciones" }),
  ).toBeHidden();
  await expectAccessible(page, "cliente sin conversaciones");
});
