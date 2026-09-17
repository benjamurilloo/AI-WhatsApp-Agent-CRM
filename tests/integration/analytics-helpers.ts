import { sql } from "drizzle-orm";
import type { MetricResult } from "@/modules/analytics";
import { hashPassword, login } from "@/modules/auth";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";

// Ayudantes de los tests de métricas, compartidos por los archivos de la 7.1 y la 7.2 (brief-7.2,
// D-5): cada archivo tiene su propio fixture con su cálculo a mano, y solo reparte estas funciones.

export const PASSWORD = "contraseña-correcta-larga";
export const SECRET_BODY = "Texto privado del mensaje";

let storedHash: string | undefined;

// Una sola vez por archivo, en beforeAll: hashear es caro a propósito.
export async function preparePasswordHash(): Promise<void> {
  storedHash ??= await hashPassword(PASSWORD);
}

function passwordHash(): string {
  if (storedHash === undefined) {
    throw new Error("falta preparePasswordHash() en beforeAll");
  }
  return storedHash;
}

export async function createOrganization(name: string, timezone?: string) {
  const result = await getDb().execute<{ id: string }>(
    timezone
      ? sql`insert into organizations (name, timezone) values (${name}, ${timezone}) returning id`
      : sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

export async function addUser(
  organizationId: string,
  email: string,
  role: "admin" | "viewer",
  mustChangePassword = false,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${passwordHash()}, ${`Persona ${email}`}, ${mustChangePassword}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
}

export async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

export async function insertClient(
  organizationId: string,
  displayName: string,
  phone: string,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${organizationId}, ${displayName}, ${phone}) returning id`,
  );
  return result.rows[0]!.id;
}

export type SeedMessage = { at: string; direction: "inbound" | "outbound" };
export const inbound = (at: string): SeedMessage => ({
  at,
  direction: "inbound",
});
export const outbound = (at: string): SeedMessage => ({
  at,
  direction: "outbound",
});

// Conversación con started_at igual a su primer mensaje (MetricsCatalog, convenciones).
export async function insertConversation(
  organizationId: string,
  options: {
    clientId?: string | null;
    status?: "open" | "pending" | "closed";
    messages: SeedMessage[];
  },
) {
  const times = options.messages.map((message) => message.at).sort();
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations (organization_id, client_id, channel, status, started_at, last_message_at)
        values (${organizationId}, ${options.clientId ?? null}, 'whatsapp', ${options.status ?? "open"},
                ${times[0]!}, ${times.at(-1)!})
        returning id`,
  );
  const id = result.rows[0]!.id;
  for (const message of options.messages) {
    await getDb().execute(
      sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
          values (${organizationId}, ${id}, ${message.direction}, ${message.at}, ${SECRET_BODY})`,
    );
  }
  return id;
}

export function valueOf<T>(result: MetricResult<T>): T {
  if (!result.ok) throw new Error(`métrica rechazada: ${result.code}`);
  return result.value;
}

// Dos organizaciones con sus usuarios: A para los valores, B para el aislamiento.
export async function users() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgA, "pendiente-a@example.com", "admin", true);
  await addUser(orgB, "admin-b@example.com", "admin");
  return {
    orgA,
    orgB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    pendingA: await contextFor("pendiente-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}
