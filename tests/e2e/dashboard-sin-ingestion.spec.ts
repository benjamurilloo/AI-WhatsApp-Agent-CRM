import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// El tercer estado de la métrica 12 en el navegador (brief-7.4). Corre contra el segundo servidor
// de end-to-end, el que arranca con la ingestión apagada: el principal la enciende para el spec de
// ingestión, y con la ingestión configurada la métrica sin eventos es "Sin datos", no
// "No disponible" (brief-7.3, D-1).

const [ADMIN_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.execute(
    sql`truncate table receipts, sale_voids, sale_lines, sales, order_lines, orders, ingestion_events`,
  );
  await db.$client.end();
});

test.beforeEach(async () => {
  await db.execute(
    sql`truncate table receipts, sale_voids, sale_lines, sales, order_lines, orders, audit_logs, ingestion_events, conversation_notes, messages, conversations, client_tag_assignments, clients`,
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

const card = (page: Page, name: string) =>
  page.getByRole("region", { name: new RegExp(name) });

test('caso 1: sin ingestión configurada y sin eventos, la métrica 12 es "No disponible"', async ({
  page,
}) => {
  await login(page, ADMIN);

  const ingestion = card(page, "Errores de ingestión");
  await expect(ingestion).toContainText("No disponible");
  // Los otros dos estados no aparecen en su lugar, que es la confusión que este caso descarta.
  await expect(ingestion).not.toContainText("Sin datos");
  await expect(ingestion).not.toContainText("0,0 %");
  // Y el resto de la pantalla sigue calculando: "no disponible" es de esa métrica, no de la página.
  await expect(card(page, "Conversaciones iniciadas")).toContainText("0");
  // Texto exacto: desde la brief-15.3, «Ver detalles» también nombra el estado del período anterior.
  await expect(
    card(page, "Mensajes por conversación").getByText("Sin datos", {
      exact: true,
    }),
  ).toBeVisible();

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page).toHaveTitle(/.+/);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((violation) => violation.id),
      `violaciones de axe con la métrica no disponible (${colorScheme})`,
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null });
});

test("caso 2: con eventos registrados muestra el valor, aunque la ingestión esté apagada", async ({
  page,
}) => {
  // Es la regla de D-1 de la 7.3: apagar el endpoint después de un incidente no esconde los fallos
  // que quedaron registrados.
  for (const [index, status, errorCode] of [
    [1, "failed", "CONFLICT"],
    [2, "processed", null],
  ] as const) {
    await db.execute(
      sql`insert into ingestion_events
            (organization_id, source, external_ref, event_type, payload_hash, status, error_code,
             received_at, processed_at)
          values (${SEED_ORGANIZATION_ID}, 'wa-cloud', ${`apagada-${index}`},
            'message.received', ${`hash-${index}`}, ${status}, ${errorCode},
            now() - interval '2 days', now() - interval '2 days')`,
    );
  }
  await login(page, ADMIN);

  const ingestion = card(page, "Errores de ingestión");
  await expect(ingestion).toContainText("50,0 %");
  await expect(ingestion).toContainText("1 fallidos de 2 eventos");
  // El estado de la tarjeta no es «No disponible». Desde la brief-15.3 el período anterior, sin
  // eventos y con la ingestión apagada, sí lo es, y «Ver detalles» lo nombra: eso es correcto.
  await expect(
    ingestion.getByText("No disponible", { exact: true }),
  ).toHaveCount(0);
  // La variación nombra el estado real del anterior, no «sin datos» (revisión de la 15.3).
  await expect(ingestion).toContainText("Período anterior no disponible");
});
