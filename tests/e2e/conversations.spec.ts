import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Response } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 8 y 9 de punta a punta: Chromium, next start, Server Actions, conversations, crm,
// audit y PostgreSQL real, sin mocks (brief-6.4). No hay ingestión todavía: cada caso inserta sus
// conversaciones y mensajes con SQL, como fixtures sintéticos (D-5).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const TIMEZONE = "America/Argentina/Buenos_Aires";
const OTHER_ORGANIZATION_ID = "5eed0000-0000-4000-8000-0000000000f1";
// Cuerpo que no debe viajar a la pantalla 8: no coincide con ningún texto de la interfaz.
const SECRET_BODY = "Kumquat-7Q3 confidencial";
const MARKUP_BODY = "<b>Paso mañana</b> <a href='https://example.com'>ver</a>";
const DAY_MS = 24 * 60 * 60 * 1000;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

// Los demás specs borran organizaciones: no pueden quedar filas que lo impidan (brief-6.1).
test.afterAll(async () => {
  await db.execute(
    sql`truncate table order_lines, orders, conversation_notes, messages, conversations, client_tag_assignments, clients`,
  );
  await db.$client.end();
});

// audit_logs y messages son de solo inserción: TRUNCATE es la vía documentada para vaciarlas (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table order_lines, orders, audit_logs, conversation_notes, messages, conversations, client_tag_assignments, clients`,
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
    organizationId = SEED_ORGANIZATION_ID,
  }: { phone?: string | null; organizationId?: string } = {},
) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${organizationId}, ${displayName}, ${phone})
        returning id`,
  );
  return result.rows[0]!.id;
}

type MessageInput = {
  direction: "inbound" | "outbound";
  sentAt: Date;
  body: string | null;
  // Tipo original y autor de una salida (brief-12.3); sin ellos, null como en v1.
  kind?: "text" | "audio" | "image" | "video" | "document" | "other";
  sentBy?: "agent" | "person";
};

// Conversación con sus mensajes; inicio y último mensaje salen de ellos, como en la ingestión.
async function insertConversation({
  clientId = null,
  status = "open",
  messages,
  organizationId = SEED_ORGANIZATION_ID,
}: {
  clientId?: string | null;
  status?: "open" | "pending" | "closed";
  messages: MessageInput[];
  organizationId?: string;
}) {
  const times = messages.map((message) => message.sentAt.getTime());
  const startedAt = new Date(Math.min(...times));
  const lastMessageAt = new Date(Math.max(...times));
  const result = await db.execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, status, started_at, last_message_at)
        values (${organizationId}, ${clientId}, 'whatsapp', ${status},
          ${startedAt.toISOString()}, ${lastMessageAt.toISOString()})
        returning id`,
  );
  const conversationId = result.rows[0]!.id;
  for (const message of messages) {
    await db.execute(
      sql`insert into messages
            (organization_id, conversation_id, direction, sent_at, body_text, kind, sent_by)
          values (${organizationId}, ${conversationId}, ${message.direction},
            ${message.sentAt.toISOString()}, ${message.body}, ${message.kind ?? null},
            ${message.sentBy ?? null})`,
    );
  }
  return conversationId;
}

async function insertOtherOrganization() {
  await db.execute(
    sql`insert into organizations (id, name) values (${OTHER_ORGANIZATION_ID}, 'Otra organización')`,
  );
}

const ago = (days: number, hours = 0) =>
  new Date(Date.now() - days * DAY_MS - hours * 60 * 60 * 1000);

const conversationsTable = (page: Page) =>
  page.getByRole("table", { name: "Conversaciones de la organización" });
const timeline = (page: Page) => page.getByRole("list", { name: "Mensajes" });

test("caso 1: un admin llega desde la navegación y ve el vacío", async ({
  page,
}) => {
  await login(page, ADMIN);
  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("link", { name: "Conversaciones" }).click();
  await expect(page).toHaveURL("/conversaciones");
  await expect(
    nav.getByRole("link", { name: "Conversaciones" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No hay conversaciones.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Limpiar filtros" }),
  ).toBeHidden();
  await expect(page.getByText(`Fechas en ${TIMEZONE}.`)).toBeVisible();
  await expectAccessible(page, "lista vacía");
});

test("caso 2: la lista muestra cliente, estado, fechas y cantidad, sin contenido", async ({
  page,
}) => {
  const clientId = await insertClient("María Gómez", {
    phone: "+5491166667788",
  });
  await insertConversation({
    clientId,
    messages: [
      {
        direction: "inbound",
        sentAt: new Date("2026-09-10T12:12:00Z"),
        body: "Hola",
      },
      {
        direction: "outbound",
        sentAt: new Date("2026-09-11T21:40:00Z"),
        body: SECRET_BODY,
      },
    ],
  });
  await insertConversation({
    status: "pending",
    messages: [
      {
        direction: "inbound",
        sentAt: new Date("2026-09-11T11:03:00Z"),
        body: SECRET_BODY,
      },
    ],
  });

  await login(page, VIEWER);
  await page.goto("/conversaciones");
  const rows = conversationsTable(page).getByRole("row");
  await expect(rows).toHaveCount(3);
  // Del último mensaje más reciente al más antiguo; fechas en la zona de la organización.
  await expect(rows.nth(1)).toContainText("María Gómez");
  await expect(rows.nth(1)).toContainText("WhatsApp");
  await expect(rows.nth(1)).toContainText("Abierta");
  await expect(rows.nth(1)).toContainText("10/09 09:12");
  await expect(rows.nth(1)).toContainText("11/09 18:40");
  await expect(rows.nth(1).getByRole("cell").last()).toHaveText("2");
  await expect(rows.nth(2)).toContainText("Sin cliente");
  await expect(rows.nth(2)).toContainText("Pendiente");
  await expect(conversationsTable(page)).not.toContainText("6666");
  await expectAccessible(page, "lista con conversaciones");

  // Nada de lo que recibe el navegador en la pantalla 8 trae un cuerpo (FR-CONV-01): ni el
  // documento ni los datos de RSC de una navegación en el cliente.
  const bodies: string[] = [];
  let pending: Promise<void>[] = [];
  const listener = (response: Response) => {
    if (!response.url().startsWith("http://localhost")) return;
    pending.push(
      response
        .text()
        .then((text) => void bodies.push(text))
        .catch(() => undefined),
    );
  };
  // Cada cuerpo se lee antes de la navegación siguiente, como en clients.spec.ts: una respuesta
  // que la navegación corta (un prefetch de RSC) deja su lectura sin resolver ni rechazar, y el
  // Promise.all esperaría hasta agotar el test. Visto en la traza del run 36150156775 (2026-09-25).
  const drain = async () => {
    await page.waitForLoadState("networkidle");
    await Promise.all(pending);
    pending = [];
  };
  page.on("response", listener);
  for (const route of ["/conversaciones", "/conversaciones?estado=pendiente"]) {
    await page.goto(route);
    await drain();
    bodies.push(await page.content());
    bodies.push(await (await page.request.get(route)).text());
  }
  await page.goto("/");
  await drain();
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Conversaciones" })
    .click();
  await expect(conversationsTable(page)).toBeVisible();
  await drain();
  page.off("response", listener);
  expect(bodies.length).toBeGreaterThan(4);
  for (const body of bodies) expect(body).not.toContain(SECRET_BODY);

  // Control: el detalle sí lo muestra; el test no pasa por vacío.
  await rows.nth(2).getByRole("link", { name: "Sin cliente" }).click();
  await expect(timeline(page)).toContainText(SECRET_BODY);
});

test("caso 3: filtra por estado y período, distingue sin resultados y pagina", async ({
  page,
}) => {
  await insertConversation({
    status: "closed",
    messages: [{ direction: "inbound", sentAt: ago(60), body: "vieja" }],
  });
  for (let index = 0; index < 25; index += 1) {
    await insertConversation({
      messages: [
        { direction: "inbound", sentAt: ago(1, index), body: `m${index}` },
      ],
    });
  }

  await login(page, ADMIN);
  await page.goto("/conversaciones");
  await expect(conversationsTable(page).getByRole("row")).toHaveCount(1 + 25);
  await expect(
    page.getByText("Mostrando 1 a 25 de 26 conversaciones"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL("/conversaciones?pagina=2");
  await expect(conversationsTable(page).getByRole("row")).toHaveCount(1 + 1);
  await expect(conversationsTable(page)).toContainText("Cerrada");

  await page.getByLabel("Período (último mensaje)").selectOption("30d");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  // Un formulario GET envía todos sus campos; los enlaces usan la URL canónica.
  await expect(page).toHaveURL(/[?&]periodo=30d(&|$)/);
  await expect(conversationsTable(page).getByRole("row")).toHaveCount(1 + 25);
  await expect(conversationsTable(page)).not.toContainText("Cerrada");

  await page.getByLabel("Estado").selectOption("cerrada");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/periodo=30d&estado=cerrada(&|$)/);
  await expect(
    page.getByText("Ninguna conversación coincide con estos filtros."),
  ).toBeVisible();
  await expectAccessible(page, "sin resultados");
  await page.getByRole("link", { name: "Limpiar filtros" }).first().click();
  await expect(page).toHaveURL("/conversaciones");
  await expect(conversationsTable(page).getByRole("row")).toHaveCount(1 + 25);

  // Período personalizado: las fechas aparecen al elegirlo y uno invertido se señala.
  await page
    .getByLabel("Período (último mensaje)")
    .selectOption("personalizado");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await page.getByLabel("Desde").fill("2026-09-16");
  await page.getByLabel("Hasta").fill("2026-09-01");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByLabel("Desde")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Hasta")).toHaveAccessibleDescription(
    /«Desde» no puede ser posterior a «Hasta»/,
  );
  await expect(conversationsTable(page)).toBeHidden();
  await expectAccessible(page, "período inválido");
});

test("caso 4: el filtro de cliente busca con crm, aplica uno y ofrece elegir entre varios", async ({
  page,
}) => {
  const ana = await insertClient("Ana Pérez");
  const anabel = await insertClient("Anabel Ruiz");
  const bruno = await insertClient("Bruno Díaz");
  for (const clientId of [ana, anabel, bruno]) {
    await insertConversation({
      clientId,
      messages: [{ direction: "inbound", sentAt: ago(1), body: "hola" }],
    });
  }

  await login(page, VIEWER);
  await page.goto("/conversaciones");
  await page.getByLabel("Cliente").fill("bru");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(`/conversaciones?cliente=${bruno}`);
  await expect(page.getByText("Cliente: Bruno Díaz")).toBeVisible();
  await expect(conversationsTable(page).getByRole("row")).toHaveCount(2);
  await expectAccessible(page, "filtrado por cliente");

  await page.getByRole("link", { name: "Quitar cliente" }).click();
  await expect(page).toHaveURL("/conversaciones");
  await page.getByLabel("Cliente").fill("Ana");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/[?&]buscar_cliente=Ana&orden=reciente$/);
  const choices = page.getByRole("list", {
    name: "Varios clientes coinciden. Elegí uno para filtrar:",
  });
  await expect(choices.getByRole("listitem")).toHaveCount(2);
  await expect(conversationsTable(page)).toBeHidden();
  await expectAccessible(page, "elegir cliente");
  await choices.getByRole("link", { name: "Anabel Ruiz" }).click();
  await expect(page).toHaveURL(`/conversaciones?cliente=${anabel}`);
  await expect(conversationsTable(page)).toContainText("Anabel Ruiz");
  await expect(conversationsTable(page)).not.toContainText("Ana Pérez");

  await page.goto("/conversaciones?buscar_cliente=Zoe");
  await expect(
    page.getByText("Ningún cliente coincide con esa búsqueda."),
  ).toBeVisible();
  await page.goto("/conversaciones?cliente=no-es-un-id");
  await expect(
    page.getByText("El cliente del filtro no existe."),
  ).toBeVisible();
});

test("caso 5: el detalle muestra el timeline en orden, con la dirección en texto y el cuerpo escapado", async ({
  page,
}) => {
  const clientId = await insertClient("María Gómez", {
    phone: "+5491166667788",
  });
  const conversationId = await insertConversation({
    clientId,
    messages: [
      {
        direction: "outbound",
        sentAt: new Date("2026-09-10T12:20:00Z"),
        body: "Sí, nos quedan 6 unidades.",
      },
      {
        direction: "inbound",
        sentAt: new Date("2026-09-10T12:12:00Z"),
        body: "Hola, ¿tienen café molido?",
      },
      {
        direction: "inbound",
        sentAt: new Date("2026-09-11T21:40:00Z"),
        body: MARKUP_BODY,
      },
      {
        direction: "inbound",
        sentAt: new Date("2026-09-11T21:41:00Z"),
        body: null,
      },
    ],
  });

  await login(page, VIEWER);
  await page.goto("/conversaciones");
  await conversationsTable(page)
    .getByRole("link", { name: "María Gómez" })
    .click();
  await expect(page).toHaveURL(`/conversaciones/${conversationId}`);
  await expect(
    page.getByRole("heading", { name: "María Gómez" }),
  ).toBeVisible();
  await expect(page.getByText("WhatsApp · Estado: Abierta")).toBeVisible();
  await expect(page.getByText(`Horas en ${TIMEZONE}.`)).toBeVisible();

  const items = timeline(page).getByRole("listitem");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("10/09/2026");
  await expect(items.nth(0)).toContainText("Cliente · 09:12");
  await expect(items.nth(0)).toContainText("Hola, ¿tienen café molido?");
  await expect(items.nth(1)).toContainText("Negocio · 09:20");
  await expect(items.nth(1)).not.toContainText("10/09/2026");
  await expect(items.nth(2)).toContainText("11/09/2026");
  // El marcado se muestra literal: ni negrita ni enlace (Screens §9).
  await expect(items.nth(2)).toContainText(MARKUP_BODY);
  await expect(items.nth(2).locator("b")).toHaveCount(0);
  await expect(items.nth(2).getByRole("link")).toHaveCount(0);
  await expect(items.nth(3)).toContainText("(mensaje sin texto)");
  await expect(page.locator("main")).not.toContainText("6666");
  await expect(
    page.getByRole("button", { name: "Cambiar estado" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Cargar mensajes anteriores" }),
  ).toBeHidden();
  await expectAccessible(page, "detalle como viewer");

  await page.getByRole("link", { name: "Ver cliente" }).click();
  await expect(page).toHaveURL(`/clientes/${clientId}`);
});

test("caso 6: cargar mensajes anteriores agrega 50 arriba sin mover la lectura", async ({
  page,
}) => {
  const base = new Date("2026-09-01T12:00:00Z").getTime();
  const conversationId = await insertConversation({
    messages: Array.from({ length: 60 }, (_, index) => ({
      direction: index % 2 === 0 ? ("inbound" as const) : ("outbound" as const),
      sentAt: new Date(base + index * 60_000),
      body: `Mensaje ${String(index + 1).padStart(2, "0")}`,
    })),
  });

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  const items = timeline(page).getByRole("listitem");
  await expect(items).toHaveCount(50);
  await expect(items.first()).toContainText("Mensaje 11");
  await expect(items.last()).toContainText("Mensaje 60");
  await expectAccessible(page, "timeline con más mensajes");

  const reading = items.filter({ hasText: "Mensaje 11" });
  await reading.scrollIntoViewIfNeeded();
  const before = (await reading.boundingBox())!.y;
  const button = page.getByRole("button", {
    name: "Cargar mensajes anteriores",
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(items).toHaveCount(60);
  await expect(
    page.getByText("Se cargaron 10 mensajes anteriores."),
  ).toBeAttached();
  await expect(items.first()).toContainText("Mensaje 01");
  const after = (await reading.boundingBox())!.y;
  expect(Math.abs(after - before)).toBeLessThan(2);
  // Sin más mensajes el botón desaparece y el foco queda en la lista.
  await expect(button).toBeHidden();
  await expect(timeline(page)).toBeFocused();
  await expectAccessible(page, "timeline completo");
});

test("caso 7: un admin cambia el estado y queda auditado", async ({ page }) => {
  const conversationId = await insertConversation({
    messages: [{ direction: "inbound", sentAt: ago(1), body: "hola" }],
  });

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  const status = page.getByRole("combobox", { name: "Estado" });
  await expect(status).toHaveValue("open");
  await expectAccessible(page, "detalle como admin");

  await status.selectOption("closed");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByText("Estado cambiado a Cerrada.")).toBeVisible();
  await expect(page.getByText("WhatsApp · Estado: Cerrada")).toBeVisible();
  await expect(status).toHaveValue("closed");
  await expectAccessible(page, "estado cambiado");

  // Elegir el mismo estado no escribe nada.
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(
    page.getByText("La conversación ya estaba Cerrada."),
  ).toBeVisible();

  const audit = await db.execute<{
    action: string;
    diff: { before: { status: string }; after: { status: string } };
  }>(
    sql`select action, diff from audit_logs
        where entity_type = 'conversation' and entity_id = ${conversationId}`,
  );
  expect(audit.rows).toEqual([
    {
      action: "status_change",
      diff: { before: { status: "open" }, after: { status: "closed" } },
    },
  ]);

  await page.goto("/conversaciones?estado=cerrada");
  await expect(conversationsTable(page).getByRole("row")).toHaveCount(2);
});

test("caso 8: el servidor rechaza el cambio de estado de quien dejó de ser admin", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    messages: [{ direction: "inbound", sentAt: ago(1), body: "hola" }],
  });

  await login(page, VIEWER);
  await page.goto(`/conversaciones/${conversationId}`);
  await expect(
    page.getByRole("region", { name: "Cambiar estado" }),
  ).toBeHidden();
  expect(await page.content()).not.toContain("Cambiar estado");
  await page.context().clearCookies();

  // Un admin abre el formulario y pierde el rol antes de enviarlo: el control ya está en su
  // navegador, y solo el servidor puede rechazarlo.
  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  await db.execute(
    sql`update organization_members set role = 'viewer' where user_id = ${ADMIN_SEED.id}`,
  );
  await page.getByRole("combobox", { name: "Estado" }).selectOption("closed");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  const message = page.getByText("No tenés permiso para esta acción.");
  await expect(message).toBeVisible();
  await expect(message).toBeFocused();
  const row = await db.execute<{ status: string }>(
    sql`select status from conversations where id = ${conversationId}`,
  );
  expect(row.rows[0]!.status).toBe("open");
});

test("caso 9: una conversación de otra organización o un id inválido no existen", async ({
  page,
}) => {
  await insertOtherOrganization();
  const foreign = await insertConversation({
    organizationId: OTHER_ORGANIZATION_ID,
    messages: [{ direction: "inbound", sentAt: ago(1), body: SECRET_BODY }],
  });

  await login(page, ADMIN);
  for (const id of [foreign, "no-es-un-id"]) {
    await page.goto(`/conversaciones/${id}`);
    await expect(page.getByText("Esta conversación no existe.")).toBeVisible();
    expect(await page.content()).not.toContain(SECRET_BODY);
  }
  await expectAccessible(page, "conversación inexistente");
  await page.goto("/conversaciones");
  await expect(page.getByText("No hay conversaciones.")).toBeVisible();
});

test("caso 10: en móvil la lista son tarjetas y las burbujas ocupan el ancho", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    status: "pending",
    messages: [
      { direction: "inbound", sentAt: ago(2), body: "hola" },
      { direction: "outbound", sentAt: ago(1), body: "buen día" },
    ],
  });

  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, VIEWER);
  await page.goto("/conversaciones");
  await expect(page.getByRole("table")).toBeHidden();
  const cards = page.getByRole("list", {
    name: "Conversaciones de la organización",
  });
  await expect(cards.getByRole("listitem")).toHaveCount(1);
  await expect(cards).toContainText("Sin cliente");
  await expect(cards).toContainText("Pendiente");
  await expect(cards).toContainText("2 mensajes");
  await expectAccessible(page, "lista en móvil");

  await page.goto(`/conversaciones/${conversationId}`);
  const items = timeline(page).getByRole("listitem");
  const listBox = (await timeline(page).boundingBox())!;
  for (const index of [0, 1]) {
    const bubble = items.nth(index).locator("p").last();
    const box = (await bubble.boundingBox())!;
    expect(Math.abs(box.width - listBox.width)).toBeLessThan(2);
  }
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectAccessible(page, "detalle en móvil");
});

test("caso 11: FR-API-07: el timeline rotula el tipo original y quién respondió (brief-12.3, D-5)", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    messages: [
      {
        direction: "inbound",
        sentAt: new Date("2026-09-10T12:00:00Z"),
        body: "Hola, ¿tienen café molido?",
        kind: "audio",
      },
      {
        direction: "outbound",
        sentAt: new Date("2026-09-10T12:01:00Z"),
        body: "Sí, nos quedan 6 unidades.",
        kind: "text",
        sentBy: "agent",
      },
      {
        direction: "outbound",
        sentAt: new Date("2026-09-10T12:05:00Z"),
        body: null,
        kind: "image",
        sentBy: "person",
      },
      {
        direction: "inbound",
        sentAt: new Date("2026-09-10T12:06:00Z"),
        body: "Gracias",
      },
    ],
  });

  await login(page, VIEWER);
  await page.goto(`/conversaciones/${conversationId}`);
  const items = timeline(page).getByRole("listitem");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("Cliente · 09:00");
  await expect(items.nth(0)).toContainText("Audio (transcripción)");
  await expect(items.nth(1)).toContainText("Negocio · Agente · 09:01");
  await expect(items.nth(1)).not.toContainText("Texto");
  await expect(items.nth(2)).toContainText("Negocio · Persona · 09:05");
  await expect(items.nth(2)).toContainText("Imagen");
  // Sin dato (un mensaje de v1 o de los seeds): sin rótulo.
  await expect(items.nth(3)).toHaveText(/^Cliente · 09:06s*Gracias$/);
  await expectAccessible(page, "timeline con tipo y autor");
});

test("caso 12: brief-15.2 ordena por último mensaje en los dos sentidos y por inicio, con filas por página", async ({
  page,
}) => {
  const ana = await insertClient("Ana Pérez");
  const bruno = await insertClient("Bruno Díaz");
  const carla = await insertClient("Carla Gómez");
  const message = (sentAt: Date) => ({
    direction: "inbound" as const,
    sentAt,
    body: "hola",
  });
  // Ana empezó primero y escribió último; Bruno empezó último; Carla está en el medio.
  await insertConversation({
    clientId: ana,
    messages: [message(ago(9)), message(ago(1))],
  });
  await insertConversation({ clientId: bruno, messages: [message(ago(3))] });
  await insertConversation({
    clientId: carla,
    messages: [message(ago(6)), message(ago(5))],
  });
  await login(page, ADMIN);

  const rows = conversationsTable(page).getByRole("row");
  const firstClient = () => rows.nth(1).getByRole("cell").first();
  await page.goto("/conversaciones");
  await expect(firstClient()).toContainText("Ana Pérez");

  await page.getByLabel("Ordenar por").selectOption("antigua");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/[?&]orden=antigua$/);
  await expect(firstClient()).toContainText("Carla Gómez");
  await expect(rows.last().getByRole("cell").first()).toContainText(
    "Ana Pérez",
  );

  await page.goto("/conversaciones?orden=inicio");
  await expect(firstClient()).toContainText("Bruno Díaz");
  await expect(rows.last().getByRole("cell").first()).toContainText(
    "Ana Pérez",
  );

  const sizes = page.getByRole("group", { name: "Filas por página" });
  await sizes.getByRole("link", { name: "50 filas por página" }).click();
  await expect(page).toHaveURL("/conversaciones?orden=inicio&filas=50");
  await expect(
    sizes.getByText("50 filas por página", { exact: false }),
  ).toBeVisible();
  await expect(rows).toHaveCount(1 + 3);
  await expectAccessible(page, "lista por inicio, 50 filas");
});

test("caso 13: brief-15.2 con 10 filas por página, el estado y el orden se conservan al paginar", async ({
  page,
}) => {
  // Doce abiertas, que empezaron de 1 a 12 días atrás, y una cerrada que no debe aparecer.
  for (let i = 1; i <= 12; i++) {
    const client = await insertClient(`Cliente ${String(i).padStart(2, "0")}`);
    await insertConversation({
      clientId: client,
      messages: [{ direction: "inbound", sentAt: ago(i), body: "hola" }],
    });
  }
  const closed = await insertClient("Cerrada Ruiz");
  await insertConversation({
    clientId: closed,
    status: "closed",
    messages: [{ direction: "inbound", sentAt: ago(13), body: "hola" }],
  });
  await login(page, ADMIN);
  await page.goto("/conversaciones?estado=abierta&orden=inicio");

  const rows = conversationsTable(page).getByRole("row");
  const firstClient = () => rows.nth(1).getByRole("cell").first();
  await expect(firstClient()).toContainText("Cliente 01");

  const sizes = page.getByRole("group", { name: "Filas por página" });
  await sizes.getByRole("link", { name: "10 filas por página" }).click();
  await expect(page).toHaveURL(
    "/conversaciones?estado=abierta&orden=inicio&filas=10",
  );
  await expect(rows).toHaveCount(1 + 10);
  const pagination = page.getByRole("navigation", { name: "Paginación" });
  await expect(
    pagination.getByText("Mostrando 1 a 10 de 12 conversaciones"),
  ).toBeVisible();

  await pagination.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL(
    "/conversaciones?estado=abierta&orden=inicio&filas=10&pagina=2",
  );
  await expect(rows).toHaveCount(1 + 2);
  await expect(firstClient()).toContainText("Cliente 11");
  await expect(conversationsTable(page)).not.toContainText("Cerrada Ruiz");
  await expect(page.getByLabel("Estado")).toHaveValue("abierta");
  await expect(page.getByLabel("Ordenar por")).toHaveValue("inicio");
});

test("caso 14: brief-16.3 un admin pausa y reanuda al agente con el teclado; la lista marca la fila", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    status: "pending",
    messages: [{ direction: "inbound", sentAt: ago(0, 1), body: "hola" }],
  });

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  const agent = page.getByRole("region", { name: "Agente" });
  await expect(agent).toContainText("el agente no contesta");
  const pause = page.getByRole("button", { name: "Pausar al agente" });
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Agente pausado.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Conversación" }),
  ).toContainText(/Agente pausado\s*Pausado desde el \d{2}\/\d{2} \d{2}:\d{2}/);
  // El estado no cambia (invariante 1).
  await expect(page.getByText("WhatsApp · Estado: Pendiente")).toBeVisible();
  await expectAccessible(page, "agente pausado");

  await page.goto("/conversaciones");
  await expect(conversationsTable(page)).toContainText("Agente pausado");
  await expectAccessible(page, "lista con una pausada");
  await page.setViewportSize({ width: 375, height: 800 });
  const cards = page.getByRole("list", {
    name: "Conversaciones de la organización",
  });
  await expect(cards).toContainText("Agente pausado");
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectAccessible(page, "lista con una pausada en móvil");

  await page.goto(`/conversaciones/${conversationId}`);
  await expectAccessible(page, "detalle pausado en móvil");
  const resume = page.getByRole("button", { name: "Reanudar al agente" });
  await resume.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Agente reanudado.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pausar al agente" }),
  ).toBeVisible();

  const audit = await db.execute<{
    action: string;
    actor_user_id: string;
    diff: unknown;
  }>(
    sql`select action, actor_user_id, diff from audit_logs
        where entity_type = 'conversation' and entity_id = ${conversationId}
        order by created_at, id`,
  );
  expect(audit.rows).toEqual([
    {
      action: "agent_pause_change",
      actor_user_id: ADMIN_SEED.id,
      diff: { before: { agentPaused: false }, after: { agentPaused: true } },
    },
    {
      action: "agent_pause_change",
      actor_user_id: ADMIN_SEED.id,
      diff: { before: { agentPaused: true }, after: { agentPaused: false } },
    },
  ]);
  const row = await db.execute<{ status: string; paused: boolean }>(
    sql`select status, agent_paused_at is not null as paused from conversations where id = ${conversationId}`,
  );
  expect(row.rows[0]).toEqual({ status: "pending", paused: false });
});

test("caso 15: brief-16.3 un viewer ve la marca sin el botón, una cerrada no se pausa, y el servidor rechaza a quien dejó de ser admin", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    messages: [{ direction: "inbound", sentAt: ago(1), body: "hola" }],
  });
  const closedId = await insertConversation({
    status: "closed",
    messages: [{ direction: "inbound", sentAt: ago(2), body: "chau" }],
  });
  await db.execute(
    sql`update conversations set agent_paused_at = now() where id = ${conversationId}`,
  );

  await login(page, VIEWER);
  await page.goto(`/conversaciones/${conversationId}`);
  await expect(
    page.getByRole("region", { name: "Conversación" }),
  ).toContainText("Agente pausado");
  await expect(page.getByRole("region", { name: "Agente" })).toBeHidden();
  expect(await page.content()).not.toContain("Reanudar al agente");
  await expectAccessible(page, "pausada como viewer");
  await page.context().clearCookies();

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${closedId}`);
  await expect(page.getByRole("region", { name: "Agente" })).toContainText(
    "Una conversación cerrada no se pausa",
  );
  await expect(
    page.getByRole("button", { name: "Pausar al agente" }),
  ).toBeHidden();

  // Un admin abre la pantalla y pierde el rol antes de reanudar: solo el servidor puede rechazarlo.
  await page.goto(`/conversaciones/${conversationId}`);
  await db.execute(
    sql`update organization_members set role = 'viewer' where user_id = ${ADMIN_SEED.id}`,
  );
  await page.getByRole("button", { name: "Reanudar al agente" }).click();
  const message = page.getByText("No tenés permiso para esta acción.");
  await expect(message).toBeVisible();
  await expect(message).toBeFocused();
  const row = await db.execute<{ paused: boolean }>(
    sql`select agent_paused_at is not null as paused from conversations where id = ${conversationId}`,
  );
  expect(row.rows[0]!.paused).toBe(true);
  const audit = await db.execute(
    sql`select 1 from audit_logs where action = 'agent_pause_change'`,
  );
  expect(audit.rows).toEqual([]);
});

const notesList = (page: Page) => page.getByRole("list", { name: "Notas" });

test("caso 16: brief-16.4 un admin agrega una nota con el teclado, en una cerrada; el texto no va a la auditoría", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    status: "closed",
    messages: [{ direction: "inbound", sentAt: ago(0, 2), body: "hola" }],
  });

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  const notes = page.getByRole("region", { name: "Notas" });
  await expect(notes).toContainText("Sin notas.");
  await expectAccessible(page, "sin notas");

  // Solo espacios: el navegador lo deja pasar y el servidor lo rechaza, con el foco en el campo.
  const field = page.getByLabel("Nueva nota");
  await field.fill("   ");
  await page.getByRole("button", { name: "Agregar nota" }).click();
  await expect(
    notes.getByText("Escribí la nota, de hasta 1000 caracteres."),
  ).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expectAccessible(page, "nota rechazada");

  await field.fill(`Llamó al fijo: ${MARKUP_BODY}\nRetira el viernes`);
  await page.getByRole("button", { name: "Agregar nota" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    notes.getByText("Nota agregada.", { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue("");
  const item = notesList(page).getByRole("listitem");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(ADMIN_SEED.name);
  await expect(item).toContainText(/\d{2}\/\d{2} \d{2}:\d{2}/);
  // El texto se muestra escapado, sin HTML ni enlaces.
  await expect(item).toContainText(MARKUP_BODY);
  await expect(item.locator("b, a")).toHaveCount(0);
  await expect(notes).not.toContainText("Sin notas.");
  await expectAccessible(page, "con una nota");

  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expect(item).toHaveCount(1);
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectAccessible(page, "notas en móvil");

  const stored = await db.execute<{ id: string; body_text: string }>(
    sql`select id, body_text from conversation_notes where conversation_id = ${conversationId}`,
  );
  expect(stored.rows).toHaveLength(1);
  const audit = await db.execute<{
    action: string;
    actor_user_id: string;
    diff: unknown;
  }>(
    sql`select action, actor_user_id, diff from audit_logs
        where entity_type = 'conversation' and entity_id = ${conversationId}`,
  );
  expect(audit.rows).toEqual([
    {
      action: "note_added",
      actor_user_id: ADMIN_SEED.id,
      diff: {
        before: { noteId: null },
        after: { noteId: stored.rows[0]!.id },
      },
    },
  ]);
  // El estado no cambia: la conversación sigue cerrada.
  await expect(page.getByText("WhatsApp · Estado: Cerrada")).toBeVisible();
});

test("caso 17: brief-16.4 un viewer lee las notas sin el formulario, ve las anteriores, y el servidor rechaza a quien dejó de ser admin", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    messages: [{ direction: "inbound", sentAt: ago(1), body: "hola" }],
  });
  // 27 notas: 25 en la primera página y 2 detrás de «Ver anteriores».
  for (let index = 1; index <= 27; index++) {
    await db.execute(
      sql`insert into conversation_notes (organization_id, conversation_id, actor_user_id, body_text, created_at)
          values (${SEED_ORGANIZATION_ID}, ${conversationId}, ${ADMIN_SEED.id}, ${`Nota ${index}`},
                  ${new Date(Date.now() - (30 - index) * 60 * 1000).toISOString()})`,
    );
  }

  await login(page, VIEWER);
  await page.goto(`/conversaciones/${conversationId}`);
  const notes = page.getByRole("region", { name: "Notas" });
  await expect(notesList(page).getByRole("listitem")).toHaveCount(25);
  await expect(notesList(page).getByRole("listitem").first()).toContainText(
    "Nota 27",
  );
  await expect(notes.getByLabel("Nueva nota")).toBeHidden();
  expect(await page.content()).not.toContain("Agregar nota");
  await expectAccessible(page, "notas como viewer");

  const older = page.getByRole("button", { name: "Ver anteriores" });
  await older.focus();
  await page.keyboard.press("Enter");
  await expect(notesList(page).getByRole("listitem")).toHaveCount(27);
  await expect(notesList(page).getByRole("listitem").last()).toContainText(
    "Nota 1",
  );
  await expect(older).toBeHidden();
  await expect(notesList(page)).toBeFocused();
  await expectAccessible(page, "todas las notas como viewer");
  await page.context().clearCookies();

  // Un admin abre la pantalla y pierde el rol antes de agregar: solo el servidor puede rechazarlo.
  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  await db.execute(
    sql`update organization_members set role = 'viewer' where user_id = ${ADMIN_SEED.id}`,
  );
  await page.getByLabel("Nueva nota").fill("No debería quedar");
  await page.getByRole("button", { name: "Agregar nota" }).click();
  await expect(
    notes.getByText("No tenés permiso para esta acción."),
  ).toBeVisible();
  await expect(page.getByLabel("Nueva nota")).toHaveValue("No debería quedar");
  // El rechazo no es por el texto: el campo no se marca inválido.
  await expect(page.getByLabel("Nueva nota")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  const count = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from conversation_notes where conversation_id = ${conversationId}`,
  );
  expect(count.rows[0]!.count).toBe(27);
  const audit = await db.execute(
    sql`select 1 from audit_logs where action = 'note_added'`,
  );
  expect(audit.rows).toEqual([]);
});
