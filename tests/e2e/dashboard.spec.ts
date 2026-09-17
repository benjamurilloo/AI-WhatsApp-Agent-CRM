import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { calendarDayIn, shiftDays } from "@/app/_format/date-time";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantalla 2 de punta a punta: Chromium, next start, el módulo analytics y PostgreSQL real, sin
// mocks (brief-7.4). Los valores esperados están calculados a mano acá abajo; la exactitud de cada
// métrica ya quedó certificada en la 7.1 a la 7.3, así que lo que se prueba es la pantalla.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const TIMEZONE = "America/Argentina/Buenos_Aires";
// Datos que no deben viajar a la pantalla 2: no coinciden con ningún texto de la interfaz.
const SECRET_BODY = "Kumquat-7Q3 confidencial";
const CLIENT_NAME = "Ada Reservada";
const CLIENT_PHONE = "+5491166660001";
const SECRET_REF = "ref-externa-secreta";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.execute(
    sql`truncate table ingestion_events, messages, conversations, clients`,
  );
  await db.$client.end();
});

// messages e ingestion_events son de solo inserción: TRUNCATE es la vía documentada (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, ingestion_events, messages, conversations, clients`,
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

// Fixture anclado a días locales, no a "hace N días" en UTC: en 2026 Buenos Aires es UTC−3 fijo, así
// que 14:00Z es el mismo día local siempre y el período por defecto (30 días completos sin hoy) lo
// contiene con margen.
//
// | Conv. | Cliente | Estado   | Mensajes (UTC)                             |
// |-------|---------|----------|--------------------------------------------|
// | C1    | Ada     | open     | in D-5 14:00 · out D-5 14:30 (respondida)  |
// | C2    | —       | pending  | in D-5 16:00 (sin respuesta)               |
// | C3    | Ada     | closed   | out D-4 12:00 · out D-4 12:05 (proactiva)  |
//
// 1 iniciadas = 3 · 2 con actividad = 3 · 3 clientes = 1 y 1 sin cliente · 4 entrantes = 2
// 5 salientes = 3 · 6 prom. 5/3 = 1,7 y mediana de [2, 1, 2] = 2,0 · 7 respondidas = 1 (solo C1)
// 8 cobertura = 1 / 2 = 50,0 % (C3 no tiene entrantes) · 9 mediana 30,0 min, 1 sin primera respuesta
// de 2 · 11 abiertas 1, pendientes 1, cerradas 1
// 12 eventos: 2 failed y 1 processed en D-5 → 2 de 3 = 66,7 %, con un grupo por código.
// 10 diaria: D-5 iniciadas 2, entrantes 2, salientes 1; D-4 iniciadas 1, salientes 2; el resto en 0.
function days() {
  const today = calendarDayIn(TIMEZONE);
  return { today, d5: shiftDays(today, -5), d4: shiftDays(today, -4) };
}

const at = (day: string, time: string) => `${day}T${time}:00Z`;

async function insertConversation(options: {
  clientId?: string | null;
  status?: "open" | "pending" | "closed";
  messages: { direction: "inbound" | "outbound"; sentAt: string }[];
}) {
  const times = options.messages.map((message) => message.sentAt).sort();
  const result = await db.execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, status, started_at, last_message_at)
        values (${SEED_ORGANIZATION_ID}, ${options.clientId ?? null}, 'whatsapp',
          ${options.status ?? "open"}, ${times[0]!}, ${times.at(-1)!})
        returning id`,
  );
  const id = result.rows[0]!.id;
  for (const message of options.messages) {
    await db.execute(
      sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
          values (${SEED_ORGANIZATION_ID}, ${id}, ${message.direction},
            ${message.sentAt}, ${SECRET_BODY})`,
    );
  }
  return id;
}

async function insertIngestionEvent(options: {
  index: number;
  status: "processed" | "failed";
  errorCode?: string;
  receivedAt: string;
}) {
  await db.execute(
    sql`insert into ingestion_events
          (organization_id, source, external_ref, event_type, payload_hash, status, error_code,
           received_at, processed_at)
        values (${SEED_ORGANIZATION_ID}, 'wa-cloud', ${`${SECRET_REF}-${options.index}`},
          'message.received', ${`hash-secreto-${options.index}`}, ${options.status},
          ${options.errorCode ?? null}, ${options.receivedAt}, ${options.receivedAt})`,
  );
}

async function seedFixture() {
  const { d5, d4 } = days();
  const client = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, ${CLIENT_NAME}, ${CLIENT_PHONE}) returning id`,
  );
  const clientId = client.rows[0]!.id;
  await insertConversation({
    clientId,
    messages: [
      { direction: "inbound", sentAt: at(d5, "14:00") },
      { direction: "outbound", sentAt: at(d5, "14:30") },
    ],
  });
  await insertConversation({
    status: "pending",
    messages: [{ direction: "inbound", sentAt: at(d5, "16:00") }],
  });
  await insertConversation({
    clientId,
    status: "closed",
    messages: [
      { direction: "outbound", sentAt: at(d4, "12:00") },
      { direction: "outbound", sentAt: at(d4, "12:05") },
    ],
  });
  await insertIngestionEvent({
    index: 1,
    status: "failed",
    errorCode: "CONFLICT",
    receivedAt: at(d5, "14:05"),
  });
  await insertIngestionEvent({
    index: 2,
    status: "failed",
    errorCode: "PAYLOAD_MISMATCH",
    receivedAt: at(d5, "14:06"),
  });
  await insertIngestionEvent({
    index: 3,
    status: "processed",
    receivedAt: at(d5, "14:07"),
  });
}

// Cada tarjeta es una región con el nombre de su métrica.
const card = (page: Page, name: string) =>
  page.getByRole("region", { name: new RegExp(name) });

test("caso 1: el dashboard es la portada y muestra el período y la zona horaria", async ({
  page,
}) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL("/");
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(`Zona horaria: ${TIMEZONE}`)).toBeVisible();
  await expect(page.getByText("(hoy no incluido)")).toBeVisible();
  await expect(page.getByLabel("Período")).toHaveValue("30d");
  // Sin datos cargados, los conteos son 0 explícito y las métricas con denominador, "Sin datos".
  await expect(
    card(page, "Conversaciones iniciadas").getByText("0"),
  ).toBeVisible();
  await expect(
    card(page, "Mensajes por conversación").getByText("Sin datos"),
  ).toBeVisible();
  await expectAccessible(page, "dashboard vacío");
});

test("caso 2: las doce métricas muestran los valores calculados a mano", async ({
  page,
}) => {
  await seedFixture();
  await login(page, ADMIN);

  await expect(card(page, "Conversaciones iniciadas")).toContainText("3");
  await expect(card(page, "Conversaciones con actividad")).toContainText("3");
  const clients = card(page, "Clientes únicos");
  await expect(clients).toContainText("1");
  await expect(clients).toContainText("1 sin cliente");
  await expect(card(page, "Mensajes entrantes")).toContainText("2");
  await expect(card(page, "Mensajes salientes")).toContainText("3");
  const perConversation = card(page, "Mensajes por conversación");
  await expect(perConversation).toContainText("Prom. 1,7");
  await expect(perConversation).toContainText("Mediana 2,0");
  await expect(card(page, "Conversaciones respondidas")).toContainText("1");
  const coverage = card(page, "Cobertura de respuesta");
  await expect(coverage).toContainText("50,0 %");
  await expect(coverage).toContainText("1 de 2 con mensajes entrantes");
  const firstResponse = card(page, "Mediana de primera respuesta");
  await expect(firstResponse).toContainText("30,0 min");
  await expect(firstResponse).toContainText("1 sin primera respuesta, de 2");
  const byStatus = card(page, "Conversaciones por estado");
  await expect(byStatus).toContainText("Abiertas");
  await expect(byStatus).toContainText("Pendientes");
  await expect(byStatus).toContainText("Cerradas");
  const ingestion = card(page, "Errores de ingestión");
  await expect(ingestion).toContainText("66,7 %");
  await expect(ingestion).toContainText("2 fallidos de 3 eventos");
  await expect(ingestion).toContainText("wa-cloud · CONFLICT: 1");
  await expect(ingestion).toContainText("wa-cloud · PAYLOAD_MISMATCH: 1");
  await expectAccessible(page, "dashboard con datos");
});

test('caso 3: 0, "Sin datos" y el error son tres cosas distintas en pantalla', async ({
  page,
}) => {
  await seedFixture();
  await login(page, ADMIN);
  // Un período pasado sin actividad: los conteos son 0 y las métricas con denominador no lo son.
  await page.goto("/?periodo=personalizado&desde=2026-01-05&hasta=2026-01-07");

  await expect(card(page, "Conversaciones iniciadas")).toContainText("0");
  await expect(card(page, "Mensajes entrantes")).toContainText("0");
  for (const name of [
    "Mensajes por conversación",
    "Cobertura de respuesta",
    "Mediana de primera respuesta",
    "Errores de ingestión",
  ]) {
    const metric = card(page, name);
    await expect(metric).toContainText("Sin datos");
    await expect(metric).not.toContainText("No disponible");
  }
  // La 9 informa igual cuántas quedaron sin primera respuesta (brief-7.2, D-3).
  await expect(card(page, "Mediana de primera respuesta")).toContainText(
    "0 sin primera respuesta, de 0",
  );
  // Y la 11 muestra sus tres estados en 0, en lugar de desaparecer.
  await expect(card(page, "Conversaciones por estado")).toContainText(
    "Abiertas",
  );
  await expectAccessible(page, "período sin actividad");
});

test("caso 4: el período viaja en la URL y un período inválido no calcula nada", async ({
  page,
}) => {
  await seedFixture();
  await login(page, ADMIN);

  await page.getByLabel("Período").selectOption("7d");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL("/?periodo=7d");
  await expect(page.getByLabel("Período")).toHaveValue("7d");
  await expect(card(page, "Conversaciones iniciadas")).toContainText("3");

  await page.goto("/?periodo=personalizado&desde=2026-09-10&hasta=2026-09-09");
  // El anunciador de rutas de Next también es un role=alert: se busca el aviso por su id, que es
  // además el que describe a los dos campos de fecha.
  await expect(page.locator("#periodo-error")).toContainText(
    "El período no es válido",
  );
  await expect(page.locator("#periodo-error")).toHaveAttribute("role", "alert");
  await expect(
    page.getByText("Ninguna métrica se calculó con este período."),
  ).toBeVisible();
  await expect(card(page, "Conversaciones iniciadas")).toHaveCount(0);
  await expect(page.getByLabel("Desde")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expectAccessible(page, "período inválido");
});

test("caso 5: el gráfico diario tiene tabla de datos con los días en 0", async ({
  page,
}) => {
  await seedFixture();
  const { d5, d4, today } = days();
  const asLabel = (day: string) => {
    const [year, month, date] = day.split("-");
    return `${date}/${month}/${year}`;
  };
  await login(page, ADMIN);

  const section = page.getByRole("region", { name: /Evolución diaria/ });
  await expect(section).toBeVisible();
  await section.getByText("Ver tabla de datos").click();
  const table = section.getByRole("table");
  const rowOf = (day: string) =>
    table.getByRole("row").filter({ has: page.getByText(asLabel(day)) });
  await expect(rowOf(d5)).toContainText("2");
  await expect(rowOf(d4)).toContainText("2");
  // El día anterior al fixture no tuvo actividad y aparece igual, con 0 explícito.
  await expect(rowOf(shiftDays(today, -6))).toContainText("0");
  // La serie de mensajes se cambia por la URL, sin estado de cliente.
  await section.getByRole("link", { name: "Mensajes" }).click();
  await expect(page).toHaveURL("/?serie=mensajes");
  await expect(section.getByRole("link", { name: "Mensajes" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expectAccessible(page, "gráfico diario");
});

test("caso 6: un viewer ve lo mismo y la pantalla no entrega datos personales", async ({
  page,
}) => {
  await seedFixture();
  const bodies: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/login")) return;
    bodies.push(response.url());
  });
  await login(page, VIEWER);

  await expect(card(page, "Conversaciones iniciadas")).toContainText("3");
  await expect(card(page, "Cobertura de respuesta")).toContainText("50,0 %");
  const html = await page.content();
  for (const secret of [SECRET_BODY, CLIENT_NAME, CLIENT_PHONE, SECRET_REF]) {
    expect(html).not.toContain(secret);
  }
  // También en las respuestas RSC de una navegación en el cliente.
  await page.getByLabel("Período").selectOption("90d");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL("/?periodo=90d");
  const afterNavigation = await page.content();
  for (const secret of [SECRET_BODY, CLIENT_NAME, CLIENT_PHONE, SECRET_REF]) {
    expect(afterNavigation).not.toContain(secret);
  }
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
});

test("caso 7: el fallo de una métrica no rompe las demás tarjetas", async ({
  page,
}) => {
  await seedFixture();
  await login(page, ADMIN);
  // Falla real y acotada a una métrica: la tabla que lee la 12 deja de existir mientras dura el
  // caso. Los end-to-end corren en serie (playwright.config.ts), así que nadie más la usa, y el
  // nombre se restaura siempre.
  await db.execute(
    sql`alter table ingestion_events rename to ingestion_events_oculta`,
  );
  try {
    await page.reload();
    const ingestion = card(page, "Errores de ingestión");
    await expect(ingestion).toContainText("No se pudo calcular.");
    await expect(ingestion).toContainText("Código:");
    await expect(
      ingestion.getByRole("link", { name: "Reintentar" }),
    ).toBeVisible();
    // Las demás siguen mostrando sus valores.
    await expect(card(page, "Conversaciones iniciadas")).toContainText("3");
    await expect(card(page, "Cobertura de respuesta")).toContainText("50,0 %");
    await expect(
      page.getByRole("region", { name: /Evolución diaria/ }),
    ).toBeVisible();
    await expectAccessible(page, "una métrica fallada");
  } finally {
    await db.execute(
      sql`alter table ingestion_events_oculta rename to ingestion_events`,
    );
  }
});

test("caso 8: la definición de cada métrica se abre con el teclado", async ({
  page,
}) => {
  await seedFixture();
  await login(page, ADMIN);

  const definition = card(page, "Errores de ingestión").getByText(
    "Definición",
    { exact: true },
  );
  await definition.focus();
  await page.keyboard.press("Enter");
  await expect(
    card(page, "Errores de ingestión").getByText(
      /Cuenta solo los eventos que el CRM aceptó procesar/,
    ),
  ).toBeVisible();
  await expectAccessible(page, "definición abierta");
});

test.describe("móvil", () => {
  test("caso 9: a 375 px las tarjetas son una columna sin desplazamiento horizontal", async ({
    page,
  }) => {
    await seedFixture();
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page, ADMIN);

    await expect(card(page, "Conversaciones iniciadas")).toContainText("3");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectAccessible(page, "dashboard en móvil");
  });
});
