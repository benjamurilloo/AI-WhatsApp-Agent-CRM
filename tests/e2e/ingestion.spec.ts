import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_INGESTION_CREDENTIAL_ID, E2E_PASSWORD } from "./global-setup";

// Endpoint de ingestión de punta a punta (brief-6.5.3, D-6): next start con el modo de prueba
// encendido, la credencial sintética, PostgreSQL real y la pantalla 8. El evento sale de un
// fixture con forma asumida: no hay emisor real.

const ENDPOINT = "/api/ingestion/v1/events";
// Token sintético de 43 caracteres; su hash es lo único que se guarda.
const TOKEN = `crm_ing_${"e2e-ingestion-token-".repeat(3).slice(0, 43)}`;
const CLIENT_NAME = "Cliente Ingestado E2E";
const [ADMIN] = SEED_USERS;

const fixture = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      "tests/fixtures/ingestion/v1/valid-inbound-with-client.json",
    ),
    "utf8",
  ),
);
if (fixture.shape !== "assumed") throw new Error("fixture sin forma asumida");
const payload = fixture.payload;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

// Los demás specs vacían conversaciones y clientes; los eventos y la credencial se quitan acá.
test.afterAll(async () => {
  await db.execute(
    sql`truncate table ingestion_rate_windows, ingestion_events, conversation_notes, messages, conversations, client_tag_assignments, clients`,
  );
  await db.execute(
    sql`delete from ingestion_credentials where id = ${E2E_INGESTION_CREDENTIAL_ID}`,
  );
  await db.$client.end();
});

test.beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, ingestion_rate_windows, ingestion_events, conversation_notes, messages, conversations, client_tag_assignments, clients`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  await seedBasic(db, E2E_PASSWORD);
  await db.execute(
    sql`insert into ingestion_credentials (id, organization_id, source, token_hash)
        values (${E2E_INGESTION_CREDENTIAL_ID}, ${SEED_ORGANIZATION_ID}, 'emisor-e2e',
          ${createHash("sha256").update(TOKEN).digest("hex")})
        on conflict (id) do nothing`,
  );
});

test("caso 1: un evento aceptado aparece en la pantalla de conversaciones", async ({
  page,
  request,
}) => {
  await db.execute(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, ${CLIENT_NAME},
          ${payload.conversation.client_phone})`,
  );

  const accepted = await request.post(ENDPOINT, {
    headers: { authorization: `Bearer ${TOKEN}` },
    data: payload,
  });
  expect(accepted.status()).toBe(201);
  expect(await accepted.json()).toMatchObject({
    result: "accepted",
    event_id: payload.event_id,
  });

  const again = await request.post(ENDPOINT, {
    headers: { authorization: `Bearer ${TOKEN}` },
    data: payload,
  });
  expect(again.status()).toBe(200);

  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  await page.goto("/conversaciones");
  const table = page.getByRole("table", {
    name: "Conversaciones de la organización",
  });
  await expect(table.getByRole("row")).toHaveCount(2);
  await table.getByRole("link", { name: CLIENT_NAME }).click();
  await expect(
    page
      .getByRole("list", { name: "Mensajes" })
      .getByText(payload.message.body_text),
  ).toBeVisible();
});

test("caso 2: sin credencial, o con una sesión del CRM, responde 401 y no escribe", async ({
  page,
  request,
}) => {
  const anonymous = await request.post(ENDPOINT, { data: payload });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["www-authenticate"]).toBe("Bearer");

  // La cookie de sesión del navegador no autentica el endpoint (D-5).
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  const withSession = await page.request.post(ENDPOINT, { data: payload });
  expect(withSession.status()).toBe(401);

  const events = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from ingestion_events`,
  );
  expect(events.rows[0]!.count).toBe(0);
});
