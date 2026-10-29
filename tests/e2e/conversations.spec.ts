import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Response } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import {
  SEED_IPHONE_ORGANIZATION_ID,
  SEED_IPHONE_USERS,
  seedIphone,
} from "../../seeds/demo-iphone";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 8 y 9 de punta a punta: Chromium, next start, Server Actions, conversations, crm,
// audit y PostgreSQL real, sin mocks (brief-6.4). No hay ingestión todavía: cada caso inserta sus
// conversaciones y mensajes con SQL, como fixtures sintéticos (D-5).
//
// Desde la 24.3 (brief-24.3), los pasos de la v2: la bandeja abre en Abiertas, con las pestañas de
// estado y el chip «Atención humana»; la búsqueda de cliente va arriba y el resto en «Más filtros»;
// el hilo intercala las notas, la franja del agente toma y reactiva, el encabezado cierra y reabre,
// la nota va al pie y el contexto del cliente al costado, con «Ver contexto» en el teléfono.
//
// Desde la 24.3.1 (brief-24.3.1), como chat: la bandeja es una lista con una fila por cliente, que
// en escritorio abre el panel de vista previa con ?ver=; el hilo une las conversaciones del
// cliente; «Tomar conversación» pide confirmar; y los textos de la franja y de la nota son los de
// los mockups.

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
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, conversation_notes, messages, conversations, client_tag_assignments, client_tags, clients`,
  );
  await db.$client.end();
});

// audit_logs y messages son de solo inserción: TRUNCATE es la vía documentada para vaciarlas (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, conversation_notes, messages, conversations, client_tag_assignments, client_tags, clients`,
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

// La lista visible: en escritorio y en el teléfono hay una cada una, y la oculta no está en el árbol.
const inbox = (page: Page) =>
  page.getByRole("list", { name: "Conversaciones de la organización" });
const inboxRows = (page: Page) => inbox(page).getByRole("listitem");
const timeline = (page: Page) => page.getByRole("list", { name: "Mensajes" });
const statusTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Estado de las conversaciones" });
const moreFilters = (page: Page) =>
  page.getByText("Más filtros", { exact: true }).click();
// La franja del agente: su título dice si está pausado o activo (brief-24.3, D-7).
const agentStrip = (page: Page) =>
  page.getByRole("region", {
    name: /^(Atención humana · Agente pausado|Agente activo)$/,
  });
const headerBadge = (page: Page, text: string) =>
  page.getByRole("main").getByText(text, { exact: true }).first();

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
  await page.goto("/conversaciones?estado=todos");
  const rows = inboxRows(page);
  await expect(rows).toHaveCount(2);
  // Del último mensaje más reciente al más antiguo; el día del último, en la zona de la
  // organización (brief-24.3.1).
  await expect(rows.nth(0)).toContainText("María Gómez");
  await expect(rows.nth(0)).toContainText("Abierta");
  await expect(rows.nth(0)).toContainText("Agente activo");
  await expect(rows.nth(0)).toContainText("11/09");
  await expect(rows.nth(1)).toContainText("Sin cliente");
  await expect(rows.nth(1)).toContainText("Pendiente");
  await expect(inbox(page)).not.toContainText("6666");
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
  for (const route of [
    "/conversaciones?estado=todos",
    "/conversaciones?estado=pendiente",
  ]) {
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
  await expect(inbox(page)).toBeVisible();
  await drain();
  page.off("response", listener);
  expect(bodies.length).toBeGreaterThan(4);
  for (const body of bodies) expect(body).not.toContain(SECRET_BODY);

  // Control: el panel y el detalle sí lo muestran; el test no pasa por vacío. El panel solo con
  // ?ver= (FR-CONV-01, enmendado por la 24.3.1).
  await page.goto("/conversaciones?estado=todos");
  await rows.nth(1).getByRole("link").click();
  await expect(page).toHaveURL(/[?&]ver=/);
  await expect(timeline(page)).toContainText(SECRET_BODY);
  await page.getByRole("link", { name: "Abrir conversación" }).click();
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
  await page.goto("/conversaciones?estado=todos");
  await expect(inboxRows(page)).toHaveCount(25);
  await expect(
    page.getByText("Mostrando 1 a 25 de 26 conversaciones"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL("/conversaciones?estado=todos&pagina=2");
  await expect(inboxRows(page)).toHaveCount(1);
  await expect(inbox(page)).toContainText("Cerrada");

  await moreFilters(page);
  await page.getByLabel("Período (último mensaje)").selectOption("30d");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  // Un formulario GET envía todos sus campos; los enlaces usan la URL canónica.
  await expect(page).toHaveURL(/[?&]periodo=30d(&|$)/);
  await expect(inboxRows(page)).toHaveCount(25);
  await expect(inbox(page)).not.toContainText("Cerrada");

  // El estado es una pestaña: conserva el período (brief-24.3, D-1).
  await statusTabs(page)
    .getByRole("link", { name: /^Cerradas/ })
    .click();
  await expect(page).toHaveURL(/periodo=30d&estado=cerrada(&|$)/);
  await expect(
    page.getByText("Ninguna conversación coincide con estos filtros."),
  ).toBeVisible();
  await expectAccessible(page, "sin resultados");
  await page.getByRole("link", { name: "Limpiar filtros" }).first().click();
  await expect(page).toHaveURL("/conversaciones");
  await expect(inboxRows(page)).toHaveCount(25);

  // Período personalizado: las fechas aparecen al elegirlo y uno invertido se señala.
  await moreFilters(page);
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
  await expect(inbox(page)).toBeHidden();
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
  await page.getByLabel("Buscar cliente").fill("bru");
  await page.getByLabel("Buscar cliente").press("Enter");
  await expect(page).toHaveURL(`/conversaciones?cliente=${bruno}`);
  await expect(page.getByText("Cliente: Bruno Díaz")).toBeVisible();
  await expect(inboxRows(page)).toHaveCount(1);
  await expectAccessible(page, "filtrado por cliente");

  await page.getByRole("link", { name: "Quitar cliente" }).click();
  await expect(page).toHaveURL("/conversaciones");
  await page.getByLabel("Buscar cliente").fill("Ana");
  await page.getByLabel("Buscar cliente").press("Enter");
  await expect(page).toHaveURL(/[?&]buscar_cliente=Ana(&|$)/);
  const choices = page.getByRole("list", {
    name: "Varios clientes coinciden. Elegí uno para filtrar:",
  });
  await expect(choices.getByRole("listitem")).toHaveCount(2);
  await expect(inbox(page)).toBeHidden();
  await expectAccessible(page, "elegir cliente");
  await choices.getByRole("link", { name: "Anabel Ruiz" }).click();
  await expect(page).toHaveURL(`/conversaciones?cliente=${anabel}`);
  await expect(inbox(page)).toContainText("Anabel Ruiz");
  await expect(inbox(page)).not.toContainText("Ana Pérez");

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
  await inbox(page)
    .getByRole("link", { name: /María Gómez/ })
    .click();
  await expect(page).toHaveURL(`/conversaciones?ver=${conversationId}`);
  await page.getByRole("link", { name: "Abrir conversación" }).click();
  await expect(page).toHaveURL(`/conversaciones/${conversationId}`);
  await expect(
    page.getByRole("heading", { name: "María Gómez" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "WhatsApp · Iniciada el 10/09 09:12",
  );
  await expect(headerBadge(page, "Abierta")).toBeVisible();
  await expect(agentStrip(page)).toContainText(
    "Las respuestas automáticas están habilitadas.",
  );
  await expect(page.getByText(`Horas en ${TIMEZONE}.`)).toBeVisible();

  const items = timeline(page).getByRole("listitem");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("10 sept");
  await expect(items.nth(0)).toContainText("Cliente · 09:12");
  await expect(items.nth(0)).toContainText("Hola, ¿tienen café molido?");
  await expect(items.nth(1)).toContainText("Negocio · 09:20");
  await expect(items.nth(1)).not.toContainText("10 sept");
  await expect(items.nth(2)).toContainText("11 sept");
  // El marcado se muestra literal: ni negrita ni enlace (Screens §9).
  await expect(items.nth(2)).toContainText(MARKUP_BODY);
  await expect(items.nth(2).locator("b")).toHaveCount(0);
  await expect(items.nth(2).getByRole("link")).toHaveCount(0);
  await expect(items.nth(3)).toContainText("(mensaje sin texto)");
  await expect(page.locator("main")).not.toContainText("6666");
  await expect(
    page.getByRole("button", { name: "Cerrar conversación" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Cargar mensajes anteriores" }),
  ).toBeHidden();
  await expectAccessible(page, "detalle como viewer");

  await page.getByRole("link", { name: "Ver ficha" }).click();
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
    page.getByText("Se cargaron 10 entradas anteriores."),
  ).toBeAttached();
  await expect(items.first()).toContainText("Mensaje 01");
  const after = (await reading.boundingBox())!.y;
  expect(Math.abs(after - before)).toBeLessThan(2);
  // Sin más mensajes el botón desaparece y el foco queda en la lista.
  await expect(button).toBeHidden();
  await expect(timeline(page)).toBeFocused();
  await expectAccessible(page, "timeline completo");
});

test("caso 7: un admin cierra, reabre y marca como pendiente desde el encabezado, auditado y sin tocar la pausa", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    messages: [{ direction: "inbound", sentAt: ago(1), body: "hola" }],
  });
  await db.execute(
    sql`update conversations set agent_paused_at = now() where id = ${conversationId}`,
  );

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  await expect(headerBadge(page, "Abierta")).toBeVisible();
  await expectAccessible(page, "detalle como admin");

  await page.getByRole("button", { name: "Cerrar conversación" }).click();
  await expect(page.getByText("Estado cambiado a Cerrada.")).toBeVisible();
  await expect(headerBadge(page, "Cerrada")).toBeVisible();
  // Cerrar no reactiva al agente: las dos marcas son independientes (brief-24.3, H-4).
  await expect(agentStrip(page)).toContainText("Atención humana");
  await expectAccessible(page, "estado cambiado");

  await page.getByRole("button", { name: "Reabrir" }).click();
  await expect(page.getByText("Estado cambiado a Abierta.")).toBeVisible();
  const more = page.getByRole("button", {
    name: "Más acciones de la conversación",
  });
  await more.click();
  await page.getByRole("button", { name: "Marcar como pendiente" }).click();
  await expect(page.getByText("Estado cambiado a Pendiente.")).toBeVisible();
  await expect(headerBadge(page, "Pendiente")).toBeVisible();

  const audit = await db.execute<{
    action: string;
    diff: { before: { status: string }; after: { status: string } };
  }>(
    sql`select action, diff from audit_logs
        where entity_type = 'conversation' and entity_id = ${conversationId}
        order by created_at, id`,
  );
  expect(audit.rows).toEqual([
    {
      action: "status_change",
      diff: { before: { status: "open" }, after: { status: "closed" } },
    },
    {
      action: "status_change",
      diff: { before: { status: "closed" }, after: { status: "open" } },
    },
    {
      action: "status_change",
      diff: { before: { status: "open" }, after: { status: "pending" } },
    },
  ]);
  const row = await db.execute<{ paused: boolean }>(
    sql`select agent_paused_at is not null as paused from conversations where id = ${conversationId}`,
  );
  expect(row.rows[0]!.paused).toBe(true);

  await page.goto("/conversaciones?estado=pendiente");
  await expect(inboxRows(page)).toHaveCount(1);
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
    page.getByRole("button", { name: "Cerrar conversación" }),
  ).toBeHidden();
  expect(await page.content()).not.toContain("Cerrar conversación");
  expect(await page.content()).not.toContain("Marcar como pendiente");
  await page.context().clearCookies();

  // Un admin abre el formulario y pierde el rol antes de enviarlo: el control ya está en su
  // navegador, y solo el servidor puede rechazarlo.
  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  await db.execute(
    sql`update organization_members set role = 'viewer' where user_id = ${ADMIN_SEED.id}`,
  );
  await page.getByRole("button", { name: "Cerrar conversación" }).click();
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

test("caso 10: en móvil la lista son tarjetas y las burbujas entran en el ancho", async ({
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
  await page.goto("/conversaciones?estado=todos");
  const cards = inbox(page);
  await expect(cards.getByRole("listitem")).toHaveCount(1);
  await expect(cards).toContainText("Sin cliente");
  await expect(cards).toContainText("Pendiente");
  await expect(cards).toContainText("Agente activo");
  // En el teléfono la tarjeta abre el hilo, no el panel (brief-24.3.1, D-2).
  await expect(cards.getByRole("link")).toHaveAttribute(
    "href",
    `/conversaciones/${conversationId}`,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await expectAccessible(page, "lista en móvil");

  await page.goto(`/conversaciones/${conversationId}`);
  const items = timeline(page).getByRole("listitem");
  const listBox = (await timeline(page).boundingBox())!;
  for (const [index, text] of [
    [0, "hola"],
    [1, "buen día"],
  ] as const) {
    const box = (await items
      .nth(index)
      .getByText(text, { exact: true })
      .boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(listBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(
      listBox.x + listBox.width + 1,
    );
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
  await expect(items.nth(3)).toHaveText(/^Cliente · 09:06\s*Gracias\s*09:06$/);
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

  const rows = inboxRows(page);
  const firstClient = () => rows.first();
  await page.goto("/conversaciones");
  await expect(firstClient()).toContainText("Ana Pérez");

  await moreFilters(page);
  await page.getByLabel("Ordenar por").selectOption("antigua");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/[?&]orden=antigua$/);
  await expect(firstClient()).toContainText("Carla Gómez");
  await expect(rows.last()).toContainText("Ana Pérez");

  await page.goto("/conversaciones?orden=inicio");
  await expect(firstClient()).toContainText("Bruno Díaz");
  await expect(rows.last()).toContainText("Ana Pérez");

  const sizes = page.getByRole("group", { name: "Filas por página" });
  await sizes.getByRole("link", { name: "50 filas por página" }).click();
  await expect(page).toHaveURL("/conversaciones?orden=inicio&filas=50");
  await expect(
    sizes.getByText("50 filas por página", { exact: false }),
  ).toBeVisible();
  await expect(rows).toHaveCount(3);
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

  const rows = inboxRows(page);
  const firstClient = () => rows.first();
  await expect(firstClient()).toContainText("Cliente 01");

  const sizes = page.getByRole("group", { name: "Filas por página" });
  await sizes.getByRole("link", { name: "10 filas por página" }).click();
  await expect(page).toHaveURL("/conversaciones?orden=inicio&filas=10");
  await expect(rows).toHaveCount(10);
  const pagination = page.getByRole("navigation", { name: "Paginación" });
  await expect(
    pagination.getByText("Mostrando 1 a 10 de 12 conversaciones"),
  ).toBeVisible();

  await pagination.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL(
    "/conversaciones?orden=inicio&filas=10&pagina=2",
  );
  await expect(rows).toHaveCount(2);
  await expect(firstClient()).toContainText("Cliente 11");
  await expect(inbox(page)).not.toContainText("Cerrada Ruiz");
  await expect(
    statusTabs(page).getByRole("link", { name: /^Abiertas/ }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Ordenar por")).toHaveValue("inicio");
});

test("caso 14: brief-16.3 y 24.3 un admin toma la conversación y reactiva al agente con el teclado desde la franja; la lista marca la fila", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    status: "pending",
    messages: [{ direction: "inbound", sentAt: ago(0, 1), body: "hola" }],
  });

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  await expect(agentStrip(page)).toContainText(
    "Las respuestas automáticas están habilitadas.",
  );
  const pause = page.getByRole("button", { name: "Tomar conversación" });
  await pause.focus();
  await page.keyboard.press("Enter");
  // Pide confirmar (brief-24.3.1): el foco va al botón del panel y Enter toma.
  const confirm = page.getByRole("group", { name: "Tomar atención humana" });
  await expect(confirm).toBeVisible();
  await expect(
    confirm.getByRole("button", { name: "Tomar conversación" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Tomaste la conversación: el agente está pausado.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(agentStrip(page)).toContainText(
    /Atención humana · Agente pausado\s*Pausado desde el \d{2}\/\d{2} \d{2}:\d{2}\. Las respuestas automáticas están pausadas mientras atendés\./,
  );
  // El estado no cambia (invariante 1).
  await expect(headerBadge(page, "Pendiente")).toBeVisible();
  await expectAccessible(page, "agente pausado");

  await page.goto("/conversaciones?estado=pendiente");
  await expect(inbox(page)).toContainText("Atención humana");
  await expectAccessible(page, "lista con una pausada");
  await page.setViewportSize({ width: 375, height: 800 });
  const cards = page.getByRole("list", {
    name: "Conversaciones de la organización",
  });
  await expect(cards).toContainText("Atención humana");
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectAccessible(page, "lista con una pausada en móvil");

  await page.goto(`/conversaciones/${conversationId}`);
  await expectAccessible(page, "detalle pausado en móvil");
  const resume = page.getByRole("button", { name: "Reactivar agente" });
  await resume.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Agente reactivado.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tomar conversación" }),
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
  await expect(agentStrip(page)).toContainText(
    "Atención humana · Agente pausado",
  );
  await expect(
    page.getByRole("button", { name: "Reactivar agente" }),
  ).toBeHidden();
  expect(await page.content()).not.toContain("Reactivar agente");
  expect(await page.content()).not.toContain("Tomar conversación");
  await expectAccessible(page, "pausada como viewer");
  await page.context().clearCookies();

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${closedId}`);
  await expect(agentStrip(page)).toContainText(
    "Una conversación cerrada no se pausa",
  );
  await expect(
    page.getByRole("button", { name: "Tomar conversación" }),
  ).toBeHidden();

  // Un admin abre la pantalla y pierde el rol antes de reanudar: solo el servidor puede rechazarlo.
  await page.goto(`/conversaciones/${conversationId}`);
  await db.execute(
    sql`update organization_members set role = 'viewer' where user_id = ${ADMIN_SEED.id}`,
  );
  await page.getByRole("button", { name: "Reactivar agente" }).click();
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

// La nota al pie del hilo (brief-24.3, D-8) y las notas intercaladas en él (D-5).
const noteForm = (page: Page) =>
  page.getByRole("region", { name: "Nota interna" });
const noteItems = (page: Page) =>
  timeline(page).getByRole("listitem").filter({ hasText: "Nota interna" });

test("caso 16: brief-16.4 y 24.3 un admin guarda una nota al pie con el teclado, en una cerrada; aparece en el hilo y el texto no va a la auditoría", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    status: "closed",
    messages: [{ direction: "inbound", sentAt: ago(0, 2), body: "hola" }],
  });

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  const notes = noteForm(page);
  await expect(noteItems(page)).toHaveCount(0);
  await expect(notes).toContainText(
    "Solo el equipo puede ver esta nota. No se envía por WhatsApp.",
  );
  await expect(notes).toContainText("Guardar una nota no pausa al agente.");
  await expectAccessible(page, "sin notas");

  // Solo espacios: el navegador lo deja pasar y el servidor lo rechaza, con el foco en el campo.
  const field = page.getByLabel("Nota para el equipo");
  await field.fill("   ");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  await expect(
    notes.getByText("Escribí la nota, de hasta 1000 caracteres."),
  ).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expectAccessible(page, "nota rechazada");

  await field.fill(`Llamó al fijo: ${MARKUP_BODY}\nRetira el viernes`);
  await page.getByRole("button", { name: "Guardar nota" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    notes.getByText("Nota guardada.", { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue("");
  // La nota aparece al final del hilo, después del mensaje, con candado, autor y «Solo equipo».
  const item = noteItems(page);
  await expect(item).toHaveCount(1);
  await expect(timeline(page).getByRole("listitem").last()).toContainText(
    "Nota interna",
  );
  await expect(item).toContainText(ADMIN_SEED.name);
  await expect(item).toContainText("Solo equipo");
  await expect(item).toContainText(/\d{2}:\d{2}/);
  // El texto se muestra escapado, sin HTML ni enlaces.
  await expect(item).toContainText(MARKUP_BODY);
  await expect(item.locator("b, a")).toHaveCount(0);
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
  await expect(headerBadge(page, "Cerrada")).toBeVisible();
});

async function insertNote(
  conversationId: string,
  createdAt: Date,
  body: string,
  organizationId = SEED_ORGANIZATION_ID,
  actorUserId: string = ADMIN_SEED.id,
) {
  await db.execute(
    sql`insert into conversation_notes (organization_id, conversation_id, actor_user_id, body_text, created_at)
        values (${organizationId}, ${conversationId}, ${actorUserId}, ${body}, ${createdAt.toISOString()})`,
  );
}

test("caso 17: brief-24.3 un viewer lee las notas intercaladas, también en el borde de una página, sin el formulario, y el servidor rechaza a quien dejó de ser admin", async ({
  page,
}) => {
  // 55 mensajes, uno por minuto. La nota A va entre el 2 y el 3; la nota B, a la misma hora que el
  // 6. La primera página trae las 50 entradas más recientes: empieza en la nota B, y el mensaje 6,
  // de su misma hora, queda en la anterior (R-2).
  const base = new Date("2026-09-01T12:00:00Z").getTime();
  const at = (minute: number) => new Date(base + minute * 60_000);
  const conversationId = await insertConversation({
    messages: Array.from({ length: 55 }, (_, index) => ({
      direction: "inbound" as const,
      sentAt: at(index + 1),
      body: `Mensaje ${String(index + 1).padStart(2, "0")}`,
    })),
  });
  await insertNote(conversationId, new Date(base + 2.5 * 60_000), "Nota A");
  await insertNote(conversationId, at(6), "Nota B");

  await login(page, VIEWER);
  await page.goto(`/conversaciones/${conversationId}`);
  const items = timeline(page).getByRole("listitem");
  await expect(items).toHaveCount(50);
  await expect(items.first()).toContainText("Nota B");
  await expect(items.first()).toContainText("Nota interna");
  await expect(items.nth(1)).toContainText("Mensaje 07");
  await expect(noteForm(page)).toBeHidden();
  expect(await page.content()).not.toContain("Guardar nota");
  await expectAccessible(page, "notas como viewer");

  const older = page.getByRole("button", {
    name: "Cargar mensajes anteriores",
  });
  await older.focus();
  await page.keyboard.press("Enter");
  await expect(items).toHaveCount(57);
  await expect(
    page.getByText("Se cargaron 7 entradas anteriores."),
  ).toBeAttached();
  await expect(
    items.evaluateAll((elements) =>
      elements.map((element) =>
        element.textContent?.includes("Nota interna")
          ? `n:${element.textContent.match(/Nota [AB]/)?.[0]}`
          : `m:${element.textContent?.match(/Mensaje \d{2}/)?.[0]}`,
      ),
    ),
  ).resolves.toEqual([
    "m:Mensaje 01",
    "m:Mensaje 02",
    "n:Nota A",
    "m:Mensaje 03",
    "m:Mensaje 04",
    "m:Mensaje 05",
    "m:Mensaje 06",
    "n:Nota B",
    ...Array.from(
      { length: 49 },
      (_, index) => `m:Mensaje ${String(index + 7).padStart(2, "0")}`,
    ),
  ]);
  await expect(older).toBeHidden();
  await expect(timeline(page)).toBeFocused();
  await expectAccessible(page, "todas las notas como viewer");
  await page.context().clearCookies();

  // Un admin abre la pantalla y pierde el rol antes de guardar: solo el servidor puede rechazarlo.
  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  await db.execute(
    sql`update organization_members set role = 'viewer' where user_id = ${ADMIN_SEED.id}`,
  );
  const field = page.getByLabel("Nota para el equipo");
  await field.fill("No debería quedar");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  await expect(
    noteForm(page).getByText("No tenés permiso para esta acción."),
  ).toBeVisible();
  await expect(field).toHaveValue("No debería quedar");
  // El rechazo no es por el texto: el campo no se marca inválido.
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  const count = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from conversation_notes where conversation_id = ${conversationId}`,
  );
  expect(count.rows[0]!.count).toBe(2);
  const audit = await db.execute(
    sql`select 1 from audit_logs where action = 'note_added'`,
  );
  expect(audit.rows).toEqual([]);
});

test("caso 18: brief-24.3 las pestañas y el chip «Atención humana» filtran y cuentan, en la URL (AC-1 y AC-2)", async ({
  page,
}) => {
  const message = [
    { direction: "inbound" as const, sentAt: ago(1), body: "hola" },
  ];
  const pausedOpen = await insertConversation({ messages: message });
  await insertConversation({ messages: message });
  const pausedPending = await insertConversation({
    status: "pending",
    messages: message,
  });
  await insertConversation({ status: "closed", messages: message });
  for (const id of [pausedOpen, pausedPending]) {
    await db.execute(
      sql`update conversations set agent_paused_at = now() where id = ${id}`,
    );
  }

  await login(page, VIEWER);
  await page.goto("/conversaciones");
  const tab = (name: string) =>
    statusTabs(page).getByRole("link", { name, exact: true });
  await expect(tab("Abiertas 2")).toHaveAttribute("aria-current", "page");
  await expect(tab("Pendientes 1")).toBeVisible();
  await expect(tab("Cerradas 1")).toBeVisible();
  await expect(tab("Todas 4")).toBeVisible();
  await expect(inboxRows(page)).toHaveCount(2);
  const chip = page.getByRole("link", { name: /^Atención humana/ });
  await expect(chip).toHaveText(/Atención humana\s*1/);
  await expect(chip).not.toHaveAttribute("aria-current", /.*/);
  await expectAccessible(page, "bandeja con pestañas");

  // El chip se combina con la pestaña y las cantidades pasan a ser las del agente pausado.
  await chip.click();
  await expect(page).toHaveURL("/conversaciones?atencion=humana");
  await expect(chip).toHaveAttribute("aria-current", "true");
  await expect(inboxRows(page)).toHaveCount(1);
  await expect(inbox(page)).toContainText("Atención humana");
  await expect(tab("Abiertas 1")).toBeVisible();
  await expect(tab("Pendientes 1")).toBeVisible();
  await expect(tab("Cerradas 0")).toBeVisible();
  await expect(tab("Todas 2")).toBeVisible();
  await expectAccessible(page, "atención humana");

  await tab("Todas 2").click();
  await expect(page).toHaveURL("/conversaciones?estado=todos&atencion=humana");
  await expect(inboxRows(page)).toHaveCount(2);
  await expect(inbox(page)).not.toContainText("Agente activo");

  // Se quita con el mismo chip, y la pestaña se conserva.
  await page.getByRole("link", { name: /^Atención humana/ }).click();
  await expect(page).toHaveURL("/conversaciones?estado=todos");
  await expect(inboxRows(page)).toHaveCount(4);
  await expect(inbox(page)).toContainText("Agente activo");

  // La ficha del cliente lleva a todos los estados (brief-24.3, H-9).
  const clientId = await insertClient("Rosa Díaz");
  await insertConversation({
    clientId,
    status: "closed",
    messages: message,
  });
  await page.goto(`/clientes/${clientId}?pestana=actividad`);
  await page.getByRole("link", { name: "Ver en Conversaciones" }).click();
  await expect(page).toHaveURL(
    `/conversaciones?estado=todos&cliente=${clientId}`,
  );
  await expect(inbox(page)).toContainText("Rosa Díaz");
});

test("caso 19: brief-24.3 el contexto del cliente sin reparaciones ni turnos, sin cliente, y «Ver contexto» en el teléfono (AC-6 y AC-8)", async ({
  page,
}) => {
  const clientId = await insertClient("Carla Gómez", {
    phone: "+5491144445555",
  });
  const tag = await db.execute<{ id: string }>(
    sql`insert into client_tags (organization_id, name, color, is_active)
        values (${SEED_ORGANIZATION_ID}, 'Mayorista', 'blue', true) returning id`,
  );
  await db.execute(
    sql`insert into client_tag_assignments (organization_id, client_id, tag_id)
        values (${SEED_ORGANIZATION_ID}, ${clientId}, ${tag.rows[0]!.id})`,
  );
  const withClient = await insertConversation({
    clientId,
    messages: [{ direction: "inbound", sentAt: ago(1), body: "hola" }],
  });
  const withoutClient = await insertConversation({
    messages: [{ direction: "inbound", sentAt: ago(1), body: "hola" }],
  });

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${withClient}`);
  const contextCard = page.getByRole("region", {
    name: "Contexto del cliente",
  });
  await expect(contextCard).toContainText("Mayorista");
  // Sin repairs ni appointments, sus bloques no aparecen.
  await expect(contextCard).not.toContainText("Reparación");
  await expect(contextCard).not.toContainText("Turno");
  await expect(
    contextCard.getByRole("link", { name: "Crear turno" }),
  ).toHaveCount(0);
  await expect(
    contextCard.getByRole("link", { name: "Crear pedido" }),
  ).toHaveAttribute("href", `/pedidos/nuevo?cliente=${clientId}`);
  await expect(
    contextCard.getByRole("link", { name: "Ver ficha" }),
  ).toHaveAttribute("href", `/clientes/${clientId}`);
  // «Ver contexto» es del teléfono.
  await expect(page.getByRole("button", { name: "Ver contexto" })).toBeHidden();
  await expect(page.getByRole("main")).not.toContainText("4444");
  await expectAccessible(page, "contexto sin capacidades");

  await page.goto(`/conversaciones/${withoutClient}`);
  await expect(contextCard).toContainText(
    "Esta conversación no tiene un cliente asociado.",
  );

  // A 375 px el contexto se abre y se cierra con el teclado, debajo del encabezado.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/conversaciones/${withClient}`);
  const toggle = page.getByRole("button", { name: "Ver contexto" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(contextCard).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(contextCard).toBeVisible();
  await expect(contextCard).toContainText("Mayorista");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await expectAccessible(page, "contexto abierto en móvil");
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(contextCard).toBeHidden();
  // Las acciones de estado van en el encabezado también en el teléfono.
  await expect(
    page.getByRole("button", { name: "Cerrar conversación" }),
  ).toBeVisible();
  await expectAccessible(page, "detalle en móvil con la franja");
});

test("caso 21: brief-24.3.1 una fila por cliente, el panel con ?ver= y el hilo unido con sus separadores; una conversación anterior redirige a la más reciente (AC-1, AC-2 y AC-4)", async ({
  page,
}) => {
  const lucia = await insertClient("Lucía Gómez");
  const older = await insertConversation({
    clientId: lucia,
    status: "pending",
    messages: [
      { direction: "inbound", sentAt: ago(5), body: "Primera consulta" },
    ],
  });
  const latest = await insertConversation({
    clientId: lucia,
    messages: [
      { direction: "inbound", sentAt: ago(0, 2), body: "Segunda consulta" },
      {
        direction: "outbound",
        sentAt: ago(0, 1),
        body: "Te respondo",
        sentBy: "agent",
      },
    ],
  });
  await insertConversation({
    messages: [{ direction: "inbound", sentAt: ago(1), body: "anónima" }],
  });

  await login(page, VIEWER);
  // La pendiente vieja de Lucía no cuenta: su fila es la abierta (R-3).
  await page.goto("/conversaciones?estado=pendiente");
  await expect(
    page.getByText("Ninguna conversación coincide con estos filtros."),
  ).toBeVisible();
  await page.goto("/conversaciones?estado=todos");
  const rows = inboxRows(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Lucía Gómez");
  await expect(
    statusTabs(page).getByRole("link", { name: "Todas 2", exact: true }),
  ).toBeVisible();

  // Sin elegir, el panel lo dice y no lee ningún hilo (D-3).
  const preview = page.getByRole("region", { name: "Vista previa" });
  await expect(preview).toContainText("Elegí una conversación para verla acá.");
  await expect(timeline(page)).toHaveCount(0);
  await expectAccessible(page, "bandeja sin elegir");

  // La fila abre el panel sin perder los filtros, y queda marcada.
  await rows.first().getByRole("link").click();
  await expect(page).toHaveURL(`/conversaciones?estado=todos&ver=${latest}`);
  await expect(rows.first().getByRole("link")).toHaveAttribute(
    "aria-current",
    "true",
  );
  const panel = page.getByRole("region", { name: /^Vista previa: Lucía/ });
  await expect(panel).toContainText("Segunda consulta");
  await expect(panel).toContainText("Te respondo");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expectAccessible(page, "bandeja con el panel");

  // El hilo une las dos conversaciones, con un separador antes de cada una.
  await panel.getByRole("link", { name: "Abrir conversación" }).click();
  await expect(page).toHaveURL(`/conversaciones/${latest}`);
  const items = timeline(page).getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText(
    /Conversación del \d{2}\/\d{2}\/\d{4} · Pendiente/,
  );
  await expect(items.nth(0)).toContainText("Primera consulta");
  await expect(items.nth(1)).toContainText(
    /Conversación del \d{2}\/\d{2}\/\d{4} · Abierta/,
  );
  await expect(items.nth(2)).toContainText("Negocio · Agente");
  // La franja y el estado son los de la más reciente.
  await expect(headerBadge(page, "Abierta")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Contexto del cliente" }),
  ).toContainText("Respuesta automática");
  await expectAccessible(page, "hilo unido");

  // La anterior redirige a la más reciente, al separador de la pedida.
  await page.goto(`/conversaciones/${older}`);
  await expect(page).toHaveURL(
    `/conversaciones/${latest}#conversacion-${older}`,
  );
  await expect(page.locator(`#conversacion-${older}`)).toBeVisible();
});

test("caso 22: brief-24.3.1 la confirmación de «Tomar conversación» se cierra con Escape y con «Cancelar», devuelve el foco y no pausa (AC-3)", async ({
  page,
}) => {
  const conversationId = await insertConversation({
    messages: [{ direction: "inbound", sentAt: ago(0, 1), body: "hola" }],
  });

  await login(page, ADMIN);
  await page.goto(`/conversaciones/${conversationId}`);
  // El de la franja; el panel abierto tiene otro con el mismo nombre, que es el que toma.
  const take = page
    .getByRole("button", { name: "Tomar conversación" })
    .and(page.locator("[aria-expanded]"));
  const confirm = page.getByRole("group", { name: "Tomar atención humana" });
  await expect(take).toHaveAttribute("aria-expanded", "false");
  await take.focus();
  await page.keyboard.press("Enter");
  await expect(confirm).toBeVisible();
  await expect(take).toHaveAttribute("aria-expanded", "true");
  await expect(confirm).toContainText(
    "Pausa al agente para que puedas responder.",
  );
  await expectAccessible(page, "confirmar tomar");
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(take).toBeFocused();

  await page.keyboard.press("Enter");
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirm).toBeHidden();
  await expect(take).toBeFocused();

  // En el teléfono, la confirmación entra en la pantalla.
  await page.setViewportSize({ width: 375, height: 800 });
  await take.click();
  await expect(confirm).toBeVisible();
  const box = (await confirm.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await expectAccessible(page, "confirmar tomar en móvil");
  await confirm.getByRole("button", { name: "Cancelar" }).click();

  const audit = await db.execute(
    sql`select 1 from audit_logs where action = 'agent_pause_change'`,
  );
  expect(audit.rows).toEqual([]);
  const row = await db.execute<{ paused: boolean }>(
    sql`select agent_paused_at is not null as paused from conversations where id = ${conversationId}`,
  );
  expect(row.rows[0]!.paused).toBe(false);
});

test.describe("con reparaciones y turnos (brief-24.3, D-6)", () => {
  const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
  const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;

  // Lo que la clienta y su orden guardan y el contexto no copia (AC-7): el teléfono, el email, lo
  // que reportó y los dos totales del presupuesto, con y sin coma decimal. El cuerpo del mensaje
  // sí se muestra en el hilo.
  const LUCIA_PHONE = "+5491166554433";
  const LUCIA_EMAIL = "lucia.gomez@ejemplo.com.ar";
  const HIDDEN = [
    "5491166554433",
    "549116655",
    LUCIA_EMAIL,
    "Pantalla con manchas",
    "987.65",
    "987,65",
    "432.10",
    "432,10",
  ];

  test.afterAll(async () => {
    await db.execute(
      sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids,
          goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers,
          document_counters, audit_logs, refund_voids, refunds, receipt_voids, receipts,
          sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, conversation_notes, messages,
          conversations, client_tag_assignments, client_tags, clients, inventory_movements, inventories,
          product_images, product_costs, product_prices, attribute_values, stock_units, products`,
    );
    await db.execute(sql`delete from sessions`);
    for (const table of [
      "appointment_reasons",
      "attribute_options",
      "attribute_definitions",
      "product_models",
      "organization_capabilities",
      "organization_members",
    ]) {
      await db.execute(
        sql`delete from ${sql.identifier(table)} where organization_id = ${IPHONE}`,
      );
    }
    const iphoneUsers = sql.join(
      SEED_IPHONE_USERS.map((user) => sql`${user.id}`),
      sql`, `,
    );
    await db.execute(sql`delete from users where id in (${iphoneUsers})`);
    await db.execute(sql`delete from organizations where id = ${IPHONE}`);
  });

  test("caso 20: el contexto muestra la reparación abierta y el próximo turno, y un viewer no recibe un teléfono, un email ni un importe (AC-6 y AC-7)", async ({
    page,
  }) => {
    // Siembra la tienda de ejemplo y recorre con dos roles.
    test.slow();
    await seedIphone(db, E2E_PASSWORD);
    for (const capability of ["repairs", "appointments"]) {
      await db.execute(
        sql`insert into organization_capabilities (organization_id, capability, activated_by)
            values (${IPHONE}, ${capability}, ${ADMIN_IPHONE.id}) on conflict do nothing`,
      );
    }
    const one = async (query: ReturnType<typeof sql>) =>
      (await db.execute<{ id: string }>(query)).rows[0]!.id;
    const client = await one(
      sql`insert into clients (organization_id, display_name, phone_e164, email)
          values (${IPHONE}, 'Lucía Gómez', ${LUCIA_PHONE}, ${LUCIA_EMAIL}) returning id`,
    );
    const model = await one(
      sql`select id from product_models where organization_id = ${IPHONE} and name = 'iPhone 13'`,
    );
    const technician = await one(
      sql`insert into suppliers (organization_id, name, is_technician)
          values (${IPHONE}, 'Técnico Uno', true) returning id`,
    );
    const order = await one(
      sql`insert into service_orders (organization_id, number, client_id, model_id, device_serial,
            reported_issue, created_by)
          values (${IPHONE}, 248, ${client}, ${model}, '356938035643809', 'Pantalla con manchas',
            ${ADMIN_IPHONE.id}) returning id`,
    );
    // Hasta presupuestada, por SQL, como en repairs.spec.ts.
    await db.execute(
      sql`update service_orders set status = 'sent', technician_id = ${technician},
            sent_at = now() where id = ${order}`,
    );
    await db.execute(
      sql`update service_orders set status = 'quoted', quoted_at = now(),
            customer_currency = 'USD', customer_total = 987.65, technician_currency = 'USD',
            technician_total = 432.10 where id = ${order}`,
    );
    const reason = await one(
      sql`insert into appointment_reasons (organization_id, name, position, is_example)
          values (${IPHONE}, 'Retirar un equipo', 0, true) returning id`,
    );
    const appointment = await one(
      sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
            created_by, confirmed_at)
          values (${IPHONE}, ${client}, ${reason}, date_trunc('hour', now()) + interval '2 days',
            date_trunc('hour', now()) + interval '2 days 30 minutes', 'confirmed',
            ${ADMIN_IPHONE.id}, now())
          returning id`,
    );
    const conversationId = await insertConversation({
      clientId: client,
      organizationId: IPHONE,
      messages: [
        {
          direction: "inbound",
          sentAt: ago(0, 1),
          body: "¿Ya está mi iPhone?",
        },
      ],
    });
    await insertNote(
      conversationId,
      ago(0, 0.5),
      "Avisar cuando llegue el repuesto",
      IPHONE,
      ADMIN_IPHONE.id,
    );

    await login(page, ADMIN_IPHONE.email);
    await page.goto(`/conversaciones/${conversationId}`);
    const contextCard = page.getByRole("region", {
      name: "Contexto del cliente",
    });
    await expect(contextCard).toContainText("iPhone 13");
    await expect(
      contextCard.getByRole("link", { name: "Ver reparación" }),
    ).toHaveAttribute("href", `/reparaciones/${order}`);
    await expect(contextCard).toContainText("Retirar un equipo");
    await expect(
      contextCard.getByRole("link", { name: "Ver turno" }),
    ).toHaveAttribute("href", `/turnos/${appointment}`);
    await expect(
      contextCard.getByRole("link", { name: "Crear turno" }),
    ).toHaveAttribute("href", `/turnos/nuevo?cliente=${client}`);
    await expect(
      contextCard.getByRole("link", { name: "Crear pedido" }),
    ).toHaveAttribute("href", `/pedidos/nuevo?cliente=${client}`);
    await expectAccessible(page, "contexto con reparación y turno");
    await page.context().clearCookies();

    // Lo que recibe el navegador de un viewer en la bandeja y el hilo: el contexto llega sin
    // acciones y sin ningún dato oculto.
    await login(page, VIEWER_IPHONE.email);
    const bodies: string[] = [];
    let pending: Promise<void>[] = [];
    // Solo el documento, con su RSC en línea, y las respuestas POST de las Server Actions: los
    // prefetch de los enlaces piden otras pantallas, y uno cortado deja su lectura colgada.
    const listener = (response: Response) => {
      if (!response.url().startsWith("http://localhost")) return;
      const request = response.request();
      if (request.resourceType() !== "document" && request.method() !== "POST")
        return;
      pending.push(
        response
          .text()
          .then((text) => void bodies.push(text))
          .catch(() => undefined),
      );
    };
    page.on("response", listener);
    for (const route of [
      `/conversaciones/${conversationId}`,
      "/conversaciones",
      // El panel de vista previa lee la reparación y el hilo (brief-24.3.1, AC-7).
      `/conversaciones?ver=${conversationId}`,
    ]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await Promise.all(pending);
      pending = [];
      bodies.push(await page.content());
    }
    page.off("response", listener);
    await page.goto(`/conversaciones/${conversationId}`);
    await expect(contextCard).toContainText("iPhone 13");
    await expect(contextCard).toContainText("Retirar un equipo");
    await expect(
      contextCard.getByRole("link", { name: "Crear turno" }),
    ).toHaveCount(0);
    await expect(noteItems(page)).toContainText(
      "Avisar cuando llegue el repuesto",
    );
    // Control: el recorrido trajo la conversación, el contexto y la nota.
    const joined = bodies.join("\n");
    expect(joined).toContain("Lucía Gómez");
    expect(joined).toContain("Ver reparación");
    expect(joined).toContain("Avisar cuando llegue el repuesto");
    for (const hidden of HIDDEN) expect(joined).not.toContain(hidden);
    expect(joined).not.toContain("Crear pedido");
    await expectAccessible(page, "contexto como viewer");
  });
});
