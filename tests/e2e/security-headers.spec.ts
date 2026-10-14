import { expect, test, type Page, type Request } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Endurecimiento web de punta a punta (brief-8.1): las cabeceras que emite src/proxy.ts sobre
// next start, la ausencia de violaciones de CSP en las diez pantallas —más la 5b, la 11 y la 12
// desde la 11.4 (D-8)—, y el rechazo CSRF de una
// Server Action con Origin ajeno. No mide accesibilidad: eso ya lo hace el spec de cada pantalla.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.execute(
    sql`truncate table receipts, sale_voids, sale_lines, sales, order_lines, orders, conversation_notes, messages, conversations, client_tag_assignments, clients, knowledge_entries,
        inventory_movements, inventories, product_images, product_costs, product_prices, products`,
  );
  await db.$client.end();
});

test.beforeEach(async () => {
  // inventory_movements, product_prices, messages, ingestion_events y audit_logs son de solo
  // inserción: TRUNCATE es la vía documentada (ADR 0013), y vacía en la misma sentencia lo que las
  // referencia (6.1).
  await db.execute(
    sql`truncate table receipts, sale_voids, sale_lines, sales, order_lines, orders, audit_logs, ingestion_events, conversation_notes, messages, conversations, client_tag_assignments, clients,
        knowledge_entries, inventory_movements, inventories, product_images, product_costs, product_prices, products`,
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

// Las violaciones se recogen del evento del propio navegador, no del texto de la consola: el
// evento trae la directiva que falló y el recurso que la disparó, que es lo que hace falta para
// arreglar la política en vez de adivinar.
type Violation = { directive: string; blockedURI: string; sample: string };

async function collectViolations(page: Page): Promise<Violation[]> {
  const violations: Violation[] = [];
  await page.exposeFunction("__reportCspViolation", (violation: Violation) => {
    violations.push(violation);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      void (
        window as unknown as {
          __reportCspViolation: (violation: Violation) => void;
        }
      ).__reportCspViolation({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sample: event.sample,
      });
    });
  });
  return violations;
}

async function insertProduct(): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit, reorder_point, is_active)
        values (${SEED_ORGANIZATION_ID}, 'SEG-001', 'Producto de seguridad', 'unidad', 5, true)
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertKnowledgeEntry(): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into knowledge_entries (organization_id, title, category, content)
        values (${SEED_ORGANIZATION_ID}, 'Horario de seguridad', 'Horarios',
          'De lunes a viernes de 10 a 19 h.')
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertClientWithConversation(): Promise<{
  clientId: string;
  conversationId: string;
}> {
  const client = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, 'Cliente de seguridad', '+5491155550001')
        returning id`,
  );
  const clientId = client.rows[0]!.id;
  const sentAt = new Date("2026-09-10T14:00:00.000Z");
  const conversation = await db.execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, status, started_at, last_message_at)
        values (${SEED_ORGANIZATION_ID}, ${clientId}, 'whatsapp', 'open',
          ${sentAt.toISOString()}, ${sentAt.toISOString()})
        returning id`,
  );
  const conversationId = conversation.rows[0]!.id;
  await db.execute(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
        values (${SEED_ORGANIZATION_ID}, ${conversationId}, 'inbound',
          ${sentAt.toISOString()}, 'Hola')`,
  );
  return { clientId, conversationId };
}

test("1. la respuesta de un documento lleva las cabeceras de seguridad", async ({
  page,
}) => {
  const response = await page.goto("/login");
  const headers = response!.headers();

  const policy = headers["content-security-policy"];
  expect(policy, "falta Content-Security-Policy").toBeTruthy();
  // Enforce, no report-only: una política que solo reporta no protege nada (brief-8.1, D-3).
  expect(headers["content-security-policy-report-only"]).toBeUndefined();

  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'none'");
  expect(policy).toContain("form-action 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("style-src-attr 'none'");
  expect(policy).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/]+={0,2}'/);
  expect(policy).toContain("'strict-dynamic'");

  // Lo que la política nunca puede tener.
  expect(policy).not.toContain("'unsafe-eval'");
  const scriptSrc = policy!
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("script-src"));
  expect(scriptSrc, "script-src con 'unsafe-inline'").not.toContain(
    "'unsafe-inline'",
  );

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("same-origin");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");

  // HSTS se emite SOLO sobre HTTPS (brief-9.1, AC-3): acá el servidor local es http, así que
  // no tiene que estar. La emisión positiva la cubre `src/proxy.test.ts`, que ejercita la
  // función real — este caso por sí solo también pasaría si nadie emitiera la cabecera nunca.
  expect(headers["strict-transport-security"]).toBeUndefined();
});

test("2. el nonce es distinto en cada respuesta", async ({ page }) => {
  const nonceOf = (policy: string) =>
    /'nonce-([A-Za-z0-9+/]+={0,2})'/.exec(policy)?.[1];

  const first = await page.goto("/login");
  const second = await page.goto("/login");
  const firstNonce = nonceOf(first!.headers()["content-security-policy"]!);
  const secondNonce = nonceOf(second!.headers()["content-security-policy"]!);

  expect(firstNonce).toBeTruthy();
  expect(secondNonce).toBeTruthy();
  expect(firstNonce).not.toBe(secondNonce);
});

test("3. las catorce pantallas cargan sin violaciones de CSP, en claro y oscuro", async ({
  page,
}) => {
  const violations = await collectViolations(page);
  const productId = await insertProduct();
  const { clientId, conversationId } = await insertClientWithConversation();
  const entryId = await insertKnowledgeEntry();

  await login(page, ADMIN);

  const screens: ReadonlyArray<readonly [string, string]> = [
    ["1 — Ingreso", "/login"],
    ["2 — Dashboard", "/"],
    ["3 — Productos", "/productos"],
    ["4 — Detalle de producto", `/productos/${productId}`],
    ["5 — Movimientos", `/productos/${productId}/movimientos`],
    ["5b — Precios", `/productos/${productId}/precios`],
    ["6 — Clientes", "/clientes"],
    ["7 — Detalle de cliente", `/clientes/${clientId}`],
    ["8 — Conversaciones", "/conversaciones"],
    ["9 — Detalle de conversación", `/conversaciones/${conversationId}`],
    ["10 — Usuarios", "/usuarios"],
    ["11 — Información del negocio", "/informacion"],
    ["12 — Detalle de una entrada", `/informacion/${entryId}`],
    ["13 — Etiquetas de clientes", "/clientes/etiquetas"],
  ];

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const [name, path] of screens) {
      // /login redirige a / con sesión: se recorre igual, porque la redirección también
      // atraviesa el proxy y su respuesta también tiene que llevar las cabeceras.
      await page.goto(path);
      // Un título vacío significa que la página no llegó a renderizar (convención de la 6.4, D-6).
      await expect(page).toHaveTitle(/.+/);
      expect(
        violations,
        `violaciones de CSP en la pantalla ${name} (${colorScheme}): ${JSON.stringify(violations)}`,
      ).toEqual([]);
    }
  }
  await page.emulateMedia({ colorScheme: null });
});

test("4. una Server Action con Origin ajeno es rechazada y no escribe", async ({
  page,
}) => {
  await login(page, ADMIN);

  // Se captura una Server Action real: el id de la acción viaja en Next-Action y no se puede
  // inventar desde afuera. La primera creación es legítima y sirve de control.
  let captured: Request | undefined;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined
    ) {
      captured ??= request;
    }
  });

  await page.goto("/clientes/nuevo");
  await page.getByLabel("Nombre *").fill("Cliente legítimo");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page).not.toHaveURL(/\/nuevo$/);

  expect(captured, "no se capturó ninguna Server Action").toBeTruthy();
  const headers = { ...captured!.headers() };
  const body = captured!.postData() ?? "";
  const before = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from clients`,
  );

  // El mismo request, con el Origin de otro sitio: es exactamente lo que haría un CSRF.
  const response = await page.request.post(captured!.url(), {
    headers: { ...headers, origin: "https://sitio-atacante.example" },
    data: body,
    failOnStatusCode: false,
  });

  // Next aborta la acción y contesta 500 con "Invalid Server Actions request"
  // (action-handler.js, verificado en next 16.3.5). Lo que importa es que no ejecutó nada.
  expect(response.status()).toBe(500);
  const after = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from clients`,
  );
  expect(
    after.rows[0]!.count,
    "la acción con Origin ajeno escribió en la base",
  ).toBe(before.rows[0]!.count);
});

test("5. el endpoint de ingestión no expone CORS ni acepta la sesión", async ({
  page,
}) => {
  await login(page, VIEWER);

  // La sesión del navegador viaja sola en la cookie; la ingestión no la acepta como credencial
  // (brief-6.5.3, D-5). Se reafirma acá porque la 8.1 toca las cabeceras de todas las respuestas.
  const response = await page.request.post("/api/ingestion/v1/events", {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({ event: "message.recorded" }),
    failOnStatusCode: false,
  });

  expect(response.status()).not.toBe(200);
  const headers = response.headers();
  expect(headers["access-control-allow-origin"]).toBeUndefined();
  expect(headers["access-control-allow-credentials"]).toBeUndefined();
});
