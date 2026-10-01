import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  getActiveConversations,
  getConversationsStarted,
  getDailyActivity,
  getFirstResponseTime,
  getMessageCounts,
  getMessagesPerConversation,
  getRespondedConversations,
  getResponseCoverage,
  getStatusDistribution,
  getUniqueClients,
} from "@/modules/analytics";
import { getDb } from "@/shared/db";
import { exportClientData } from "../../scripts/client-data-export";
import {
  deleteClientRow,
  describeRetained,
  ERASED_DIFF,
  eraseClientData,
  minimizedName,
  reportClientData,
} from "../../scripts/client-data-delete";
import {
  addUser,
  contextFor,
  preparePasswordHash,
  valueOf,
} from "./analytics-helpers";
import { resetDatabase } from "./reset-database";

// Exportación y borrado de los datos de un cliente, contra PostgreSQL real (brief-8.2, D-2 a D-4;
// brief-13.4, D-2 y AC-5). Los dos casos del hallazgo 7 de la 8.2 se prueban por separado: un
// cliente con conversaciones se vacía, uno sin conversaciones se borra. Los tests corren con el
// dueño, que es el rol con el que el operador corre el script.

const PHONE = "+5491155551111";
const NAME = "Ana Kumquat";
const NOTES = "Departamento 7B";
const BODY = "Hola, ¿tenés stock?";
const REPLY = "Sí, Ana, te lo reservo";

let organizationId: string;

async function insertClient(
  name: string,
  phone: string | null,
  notes: string | null,
): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, notes)
        values (${organizationId}, ${name}, ${phone}, ${notes}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertConversationWithMessage(clientId: string, body: string) {
  const at = new Date("2026-09-10T12:00:00.000Z").toISOString();
  const reply = new Date("2026-09-10T12:03:00.000Z").toISOString();
  const conversation = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, status, started_at, last_message_at, external_ref)
        values (${organizationId}, ${clientId}, 'whatsapp', 'open', ${at}, ${reply},
                ${`conv-${clientId}`})
        returning id`,
  );
  const conversationId = conversation.rows[0]!.id;
  await getDb().execute(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text, external_ref)
        values (${organizationId}, ${conversationId}, 'inbound', ${at}, ${body}, ${`in-${clientId}`}),
               (${organizationId}, ${conversationId}, 'outbound', ${reply}, ${REPLY}, ${`out-${clientId}`})`,
  );
  return conversationId;
}

// Las columnas de texto y jsonb de todas las tablas de public que contienen el valor. Es la
// comprobación de AC-5: ninguna tabla guarda nada de la persona, sin enumerar las tablas a mano.
async function columnsContaining(value: string): Promise<string[]> {
  const columns = await getDb().execute<{
    table_name: string;
    column_name: string;
  }>(
    sql`select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and data_type in ('text', 'character varying', 'jsonb', 'json')
        order by table_name, column_name`,
  );
  // Una sola consulta por valor: con una por columna, el archivo cargaba tanto la base que otro
  // test de la suite, que crea una base, pasaba su límite de 5 s.
  const pattern = `%${value}%`;
  const probes = columns.rows.map(
    ({ table_name, column_name }) =>
      sql`select ${`${table_name}.${column_name}`} as found
          where exists (select 1 from ${sql.identifier(table_name)}
                        where ${sql.identifier(column_name)}::text like ${pattern})`,
  );
  const hits = await getDb().execute<{ found: string }>(
    sql`select found from (${sql.join(probes, sql` union all `)}) as hits
        order by found`,
  );
  return hits.rows.map((row) => row.found);
}

async function insertAuditEntry(clientId: string) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${`auditor-${clientId.slice(0, 8)}@example.com`}, 'x', 'Auditor', false)
        returning id`,
  );
  await getDb().execute(
    sql`insert into audit_logs
          (organization_id, actor_user_id, entity_type, entity_id, action, diff)
        values (${organizationId}, ${user.rows[0]!.id}, 'client', ${clientId}, 'update',
          ${sql.raw(`'${JSON.stringify({ before: { phoneE164: PHONE, notes: NOTES }, after: { phoneE164: null, notes: null } })}'::jsonb`)})`,
  );
}

async function clientRow(clientId: string) {
  const result = await getDb().execute<{
    display_name: string;
    phone_e164: string | null;
    notes: string | null;
  }>(
    sql`select display_name, phone_e164, notes from clients
        where organization_id = ${organizationId} and id = ${clientId}`,
  );
  return result.rows[0];
}

beforeEach(async () => {
  await resetDatabase(getDb());
  const org = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio Datos') returning id`,
  );
  organizationId = org.rows[0]!.id;
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("exportación de los datos de un cliente", () => {
  it("1. incluye ficha, conversaciones, mensajes con cuerpo y auditoría", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    await insertAuditEntry(clientId);

    const data = await exportClientData(getDb(), organizationId, clientId);

    expect(data.client).toMatchObject({
      display_name: NAME,
      phone_e164: PHONE,
      notes: NOTES,
    });
    expect(data.conversations).toHaveLength(1);
    expect(data.messages.map((message) => message.body_text).sort()).toEqual(
      [BODY, REPLY].sort(),
    );
    expect(data.audit_logs).toHaveLength(1);
    // El propio archivo dice qué no incluye y por qué.
    expect(data.excluded.ingestion_events).toContain("Sin datos personales");
  });

  it("2. no incluye datos de otro cliente ni de otra organización", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    const otherClient = await insertClient(
      "Otra Persona",
      "+5491155552222",
      "x",
    );
    await insertConversationWithMessage(otherClient, "Mensaje ajeno");

    const otherOrg = await getDb().execute<{ id: string }>(
      sql`insert into organizations (name) values ('Otro Negocio') returning id`,
    );
    const foreignOrganizationId = otherOrg.rows[0]!.id;

    const data = await exportClientData(getDb(), organizationId, clientId);
    expect(data.conversations).toEqual([]);
    expect(data.messages).toEqual([]);

    // El mismo id de cliente pedido desde otra organización no devuelve nada.
    const foreign = await exportClientData(
      getDb(),
      foreignOrganizationId,
      clientId,
    );
    expect(foreign.client).toBeNull();
    expect(foreign.messages).toEqual([]);
  });

  it("3. de un cliente inexistente devuelve la ficha nula y listas vacías", async () => {
    const data = await exportClientData(
      getDb(),
      organizationId,
      "00000000-0000-4000-8000-000000000000",
    );
    expect(data.client).toBeNull();
    expect(data.conversations).toEqual([]);
    expect(data.messages).toEqual([]);
    expect(data.audit_logs).toEqual([]);
  });
});

describe("cliente con conversaciones: se vacía, no se borra (brief-13.4, D-2)", () => {
  it("4. el informe dice que no es borrable y qué quedaría", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    await insertAuditEntry(clientId);

    const report = await reportClientData(getDb(), organizationId, clientId);
    expect(report).toMatchObject({
      exists: true,
      conversations: 1,
      messages: 2,
      auditEntries: 1,
      deletable: false,
    });

    const retained = describeRetained(report).join(" ");
    expect(retained).toContain("sin texto ni referencia externa");
    expect(retained).toContain("audit_logs");
  });

  it("5. después del vaciado, ninguna tabla tiene su nombre, su teléfono, sus notas ni sus mensajes", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    await insertAuditEntry(clientId);

    // Control: antes del vaciado, el barrido los encuentra.
    expect(await columnsContaining(PHONE)).toEqual([
      "audit_logs.diff",
      "clients.phone_e164",
    ]);
    expect(await columnsContaining(BODY)).toEqual(["messages.body_text"]);

    expect(await eraseClientData(getDb(), organizationId, clientId)).toEqual({
      client: true,
      conversations: 1,
      messages: 2,
      auditEntries: 1,
    });

    for (const value of [
      NAME,
      PHONE,
      NOTES,
      BODY,
      REPLY,
      `conv-${clientId}`,
      `in-${clientId}`,
    ]) {
      expect(await columnsContaining(value), value).toEqual([]);
    }
    expect(await clientRow(clientId)).toMatchObject({
      display_name: minimizedName(clientId),
      phone_e164: null,
      notes: null,
    });
    const after = await exportClientData(getDb(), organizationId, clientId);
    expect(after.messages).toHaveLength(2);
    expect(after.messages.map((m) => m.body_text)).toEqual([null, null]);
    expect(after.audit_logs.map((a) => a.diff)).toEqual([ERASED_DIFF]);
  });

  it("6. las métricas del período dan lo mismo antes y después del vaciado", async () => {
    await preparePasswordHash();
    await addUser(organizationId, "admin-datos@example.com", "admin");
    const context = await contextFor("admin-datos@example.com");
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    const period = { from: "2026-09-01", to: "2026-09-30" };

    const metrics = async () => ({
      started: valueOf(await getConversationsStarted(context, period)),
      active: valueOf(await getActiveConversations(context, period)),
      clients: valueOf(await getUniqueClients(context, period)),
      messages: valueOf(await getMessageCounts(context, period)),
      perConversation: valueOf(
        await getMessagesPerConversation(context, period),
      ),
      responded: valueOf(await getRespondedConversations(context, period)),
      coverage: valueOf(await getResponseCoverage(context, period)),
      firstResponse: valueOf(await getFirstResponseTime(context, period)),
      status: valueOf(await getStatusDistribution(context, period)),
      daily: valueOf(await getDailyActivity(context, period)),
    });

    const before = await metrics();
    // Control: el fixture tiene algo que contar.
    expect(before.messages).toMatchObject({ inbound: 1, outbound: 1 });
    await eraseClientData(getDb(), organizationId, clientId);
    expect(await metrics()).toEqual(before);
  });

  it("7. borrar la ficha de un cliente con conversaciones lo rechaza la base, sin vaciar nada", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    await insertAuditEntry(clientId);

    // ON DELETE RESTRICT de conversations hacia clients (23001). La transacción deshace también
    // el vaciado de la auditoría.
    await expect(
      deleteClientRow(getDb(), organizationId, clientId),
    ).rejects.toThrow();

    expect(await clientRow(clientId)).toMatchObject({ phone_e164: PHONE });
    expect(await columnsContaining(PHONE)).toContain("audit_logs.diff");
  });

  it("8. el vaciado no escribe en audit_logs, que reintroduciría el teléfono", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);

    const before = await reportClientData(getDb(), organizationId, clientId);
    await eraseClientData(getDb(), organizationId, clientId);
    const after = await reportClientData(getDb(), organizationId, clientId);

    expect(after.auditEntries).toBe(before.auditEntries);
  });

  it("9. un segundo vaciado no cambia nada ni falla", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    await insertAuditEntry(clientId);
    await eraseClientData(getDb(), organizationId, clientId);

    expect(await eraseClientData(getDb(), organizationId, clientId)).toEqual({
      client: true,
      conversations: 0,
      messages: 0,
      auditEntries: 0,
    });
  });

  it("10. no toca a otro cliente de la misma organización", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    const other = await insertClient("Otra Persona", "+5491155552222", "x");
    await insertConversationWithMessage(other, "Mensaje ajeno");
    await insertAuditEntry(other);

    await eraseClientData(getDb(), organizationId, clientId);

    expect(await columnsContaining("Mensaje ajeno")).toEqual([
      "messages.body_text",
    ]);
    expect(await clientRow(other)).toMatchObject({
      phone_e164: "+5491155552222",
    });
    expect(await columnsContaining(`conv-${other}`)).toEqual([
      "conversations.external_ref",
    ]);
  });
});

describe("cliente sin conversaciones: se borra de verdad", () => {
  it("11. el informe lo marca borrable y sin nada retenido", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    const report = await reportClientData(getDb(), organizationId, clientId);
    expect(report).toMatchObject({
      exists: true,
      conversations: 0,
      messages: 0,
      deletable: true,
    });
    expect(describeRetained(report)).toEqual([]);
  });

  it("12. la ficha se borra y no queda rastro de la persona", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);

    expect(await deleteClientRow(getDb(), organizationId, clientId)).toBe(true);

    expect(await clientRow(clientId)).toBeUndefined();
    const after = await reportClientData(getDb(), organizationId, clientId);
    expect(after.exists).toBe(false);
  });

  it("13. con auditoría, la ficha se borra y la auditoría queda vaciada", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertAuditEntry(clientId);

    await deleteClientRow(getDb(), organizationId, clientId);

    for (const value of [NAME, PHONE, NOTES]) {
      expect(await columnsContaining(value), value).toEqual([]);
    }
    const remaining = await getDb().execute<{ diff: unknown }>(
      sql`select diff from audit_logs
          where organization_id = ${organizationId} and entity_id = ${clientId}`,
    );
    expect(remaining.rows.map((row) => row.diff)).toEqual([ERASED_DIFF]);
  });
});
