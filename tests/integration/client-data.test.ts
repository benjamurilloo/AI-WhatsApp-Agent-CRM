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
import { getDb, type DbTransaction } from "@/shared/db";
import { exportClientData } from "../../scripts/client-data-export";
import {
  deleteClientRow,
  describeRetained,
  NOT_REACHED,
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

// Una etiqueta del catálogo puesta en el cliente, por SQL (brief-16.1, D-10).
async function tagClient(clientId: string, name: string): Promise<string> {
  const tag = await getDb().execute<{ id: string }>(
    sql`insert into client_tags (organization_id, name, color)
        values (${organizationId}, ${name}, 'red')
        on conflict (organization_id, lower(name)) do update set name = excluded.name
        returning id`,
  );
  await getDb().execute(
    sql`insert into client_tag_assignments (organization_id, client_id, tag_id)
        values (${organizationId}, ${clientId}, ${tag.rows[0]!.id})`,
  );
  return tag.rows[0]!.id;
}

// Una nota de un usuario del CRM en la conversación, por SQL (brief-16.4, D-5).
async function noteOn(
  conversationId: string,
  body: string,
  orgId = organizationId,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${`nota-${crypto.randomUUID()}@example.com`}, 'x', 'Vendedora', false)
        returning id`,
  );
  await getDb().execute(
    sql`insert into conversation_notes (organization_id, conversation_id, actor_user_id, body_text)
        values (${orgId}, ${conversationId}, ${user.rows[0]!.id}, ${body})`,
  );
}

async function assignmentCount(clientId: string): Promise<number> {
  const result = await getDb().execute<{ count: number }>(
    sql`select count(*)::int as count from client_tag_assignments
        where organization_id = ${organizationId} and client_id = ${clientId}`,
  );
  return result.rows[0]!.count;
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
    expect(data.excluded.ingestion_events).toContain("el CRM no lo valida");
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
      notes: 0,
      auditEntries: 1,
      tags: 0,
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
      notes: 0,
      auditEntries: 0,
      tags: 0,
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

// Una conexión aparte hace lo que la ingestión y retiene su transacción sin confirmar. El vaciado
// tiene que esperarla y alcanzar lo que escribió (revisión independiente de la 13.4, R-2). Cada
// escenario lo detiene un bloqueo distinto del vaciado: la ficha o la conversación.
async function holdIngestion(work: (tx: DbTransaction) => Promise<void>) {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await work(tx);
    taken();
    await released;
  });
  await lockTaken;
  return async () => {
    release();
    await holder;
  };
}

async function insertLateMessage(
  tx: DbTransaction,
  conversationId: string,
  ref: string,
) {
  await tx.execute(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text, external_ref)
        values (${organizationId}, ${conversationId}, 'inbound', '2026-09-10T12:10:00Z', ${LATE}, ${ref})`,
  );
}

async function waitForLockWaiters(count: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let waiting = -1;
  while (Date.now() < deadline) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = ${"Lock"}`,
    );
    waiting = result.rows[0]!.waiting;
    if (waiting === count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${count} conexiones en un bloqueo y hay ${waiting}`,
  );
}

const LATE = "Llego justo, ¿me lo guardás?";

describe("lo que el vaciado alcanza y lo que no (revisión independiente de la 13.4)", () => {
  // Como conversation.resolved: bloquea la ficha y abre una conversación nueva con su mensaje.
  it("14. la conversación que la ingestión v2 abre durante el vaciado también se vacía (R-2)", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    const commit = await holdIngestion(async (tx) => {
      await tx.execute(
        sql`select id from clients where id = ${clientId} for update`,
      );
      const created = await tx.execute<{ id: string }>(
        sql`insert into conversations (organization_id, client_id, channel, status, started_at, external_ref)
            values (${organizationId}, ${clientId}, 'whatsapp', 'open', '2026-09-10T12:10:00Z', 'conv-tarde')
            returning id`,
      );
      await insertLateMessage(tx, created.rows[0]!.id, "msg-tarde-v2");
    });

    const erasure = eraseClientData(getDb(), organizationId, clientId);
    await waitForLockWaiters(1);
    await commit();

    expect(await erasure).toMatchObject({ conversations: 2, messages: 3 });
    for (const value of [LATE, "conv-tarde", "msg-tarde-v2"]) {
      expect(await columnsContaining(value), value).toEqual([]);
    }
  });

  // Como message.recorded de v1: bloquea solo la conversación, por su referencia, y agrega el mensaje.
  it("15. el mensaje que la ingestión v1 agrega durante el vaciado también se vacía (R-2)", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    const conversationId = await insertConversationWithMessage(clientId, BODY);
    const commit = await holdIngestion(async (tx) => {
      await tx.execute(
        sql`select id from conversations where id = ${conversationId} for update`,
      );
      await insertLateMessage(tx, conversationId, "msg-tarde-v1");
    });

    const erasure = eraseClientData(getDb(), organizationId, clientId);
    await waitForLockWaiters(1);
    await commit();

    expect(await erasure).toMatchObject({ conversations: 1, messages: 3 });
    for (const value of [LATE, "msg-tarde-v1"]) {
      expect(await columnsContaining(value), value).toEqual([]);
    }
  });

  it("16. una conversación sin cliente no la alcanza, y el script lo declara (R-1)", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    const orphan = await getDb().execute<{ id: string }>(
      sql`insert into conversations (organization_id, client_id, channel, status, started_at)
          values (${organizationId}, null, 'whatsapp', 'open', '2026-09-01T12:00:00Z')
          returning id`,
    );
    await getDb().execute(
      sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
          values (${organizationId}, ${orphan.rows[0]!.id}, 'inbound', '2026-09-01T12:00:00Z',
                  'Soy Ana, antes de tener ficha')`,
    );

    await eraseClientData(getDb(), organizationId, clientId);

    expect(await columnsContaining("Soy Ana, antes de tener ficha")).toEqual([
      "messages.body_text",
    ]);
    expect(NOT_REACHED.join(" ")).toContain("conversaciones sin cliente");
  });
});

describe("etiquetas del cliente (brief-16.1, D-10, AC-9)", () => {
  it("17. FR-CLI-09: la exportación incluye sus etiquetas actuales y no las de otro cliente", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await tagClient(clientId, "Reclamo");
    const other = await insertClient("Otra Persona", "+5491155552222", "x");
    await tagClient(other, "Interesado");

    const data = await exportClientData(getDb(), organizationId, clientId);

    expect(data.client_tags).toHaveLength(1);
    expect(data.client_tags[0]).toMatchObject({
      name: "Reclamo",
      color: "red",
      is_active: true,
    });
    expect(data.client_tags[0]!.assigned_at).toBeTruthy();
  });

  it("18. el informe cuenta sus etiquetas", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await tagClient(clientId, "Reclamo");
    await tagClient(clientId, "Quiere señar");

    const report = await reportClientData(getDb(), organizationId, clientId);
    expect(report.tags).toBe(2);
  });

  it("19. el vaciado quita sus etiquetas y no las de otro cliente", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    await tagClient(clientId, "Reclamo");
    const other = await insertClient("Otra Persona", "+5491155552222", "x");
    await tagClient(other, "Reclamo");

    const result = await eraseClientData(getDb(), organizationId, clientId);

    expect(result.tags).toBe(1);
    expect(await assignmentCount(clientId)).toBe(0);
    expect(await assignmentCount(other)).toBe(1);
    // El catálogo no es de la persona: la etiqueta sigue existiendo.
    const catalog = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from client_tags
          where organization_id = ${organizationId}`,
    );
    expect(catalog.rows[0]!.count).toBe(1);
  });

  it("20. borrar la ficha se lleva sus etiquetas, por la clave en cascada", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await tagClient(clientId, "Reclamo");

    expect(await deleteClientRow(getDb(), organizationId, clientId)).toBe(true);

    expect(await assignmentCount(clientId)).toBe(0);
  });
});

describe("notas de la conversación (brief-16.4, D-5, AC-5)", () => {
  const NOTE = "Ana pidió que la llamen al fijo";

  it("21. FR-CONV-07: la exportación incluye las notas de sus conversaciones y no las de otro cliente", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    const conversation = await insertConversationWithMessage(clientId, BODY);
    await noteOn(conversation, NOTE);
    const other = await insertClient("Otra Persona", "+5491155552222", "x");
    await noteOn(
      await insertConversationWithMessage(other, "Ajeno"),
      "Nota ajena",
    );

    const data = await exportClientData(getDb(), organizationId, clientId);

    expect(data.conversation_notes.map((note) => note.body_text)).toEqual([
      NOTE,
    ]);
    expect(data.conversation_notes[0]).toMatchObject({
      conversation_id: conversation,
    });
  });

  it("22. el informe cuenta sus notas y dice qué queda de ellas", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    const conversation = await insertConversationWithMessage(clientId, BODY);
    await noteOn(conversation, NOTE);
    await noteOn(conversation, "Otra nota");

    const report = await reportClientData(getDb(), organizationId, clientId);
    expect(report.notes).toBe(2);
    expect(describeRetained(report).join(" ")).toContain("conversation_notes");
  });

  it("23. el vaciado deja sin texto sus notas, y no las de otro cliente ni las de otra organización", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await noteOn(await insertConversationWithMessage(clientId, BODY), NOTE);
    const other = await insertClient("Otra Persona", "+5491155552222", "x");
    await noteOn(
      await insertConversationWithMessage(other, "Ajeno"),
      "Nota de otro cliente",
    );
    const foreign = await getDb().execute<{ id: string }>(
      sql`insert into organizations (name) values ('Otro Negocio') returning id`,
    );
    const foreignOrg = foreign.rows[0]!.id;
    const foreignConversation = await getDb().execute<{ id: string }>(
      sql`insert into conversations (organization_id, channel, status, started_at)
          values (${foreignOrg}, 'whatsapp', 'open', '2026-09-01T12:00:00Z')
          returning id`,
    );
    await noteOn(
      foreignConversation.rows[0]!.id,
      "Nota de otra organización",
      foreignOrg,
    );

    // Control: antes del vaciado, el barrido la encuentra.
    expect(await columnsContaining(NOTE)).toEqual([
      "conversation_notes.body_text",
    ]);

    const result = await eraseClientData(getDb(), organizationId, clientId);

    expect(result.notes).toBe(1);
    expect(await columnsContaining(NOTE)).toEqual([]);
    // La nota de otra organización no discrimina el filtro por organización del UPDATE: la clave
    // foránea compuesta ya impide que una conversación de este cliente tenga notas de otra
    // organización (revisión de la 16.4, R-3). Queda como control de que el vaciado no la toca.
    for (const kept of ["Nota de otro cliente", "Nota de otra organización"]) {
      expect(await columnsContaining(kept), kept).toEqual([
        "conversation_notes.body_text",
      ]);
    }
    // La nota queda, sin texto.
    expect(
      (await reportClientData(getDb(), organizationId, clientId)).notes,
    ).toBe(1);
    expect(
      (await eraseClientData(getDb(), organizationId, clientId)).notes,
    ).toBe(0);
  });

  it("24. la nota de una conversación sin cliente no la alcanza, y el script lo declara", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    const orphan = await getDb().execute<{ id: string }>(
      sql`insert into conversations (organization_id, client_id, channel, status, started_at)
          values (${organizationId}, null, 'whatsapp', 'open', '2026-09-01T12:00:00Z')
          returning id`,
    );
    await noteOn(orphan.rows[0]!.id, "Ana escribió desde otro número");

    await eraseClientData(getDb(), organizationId, clientId);

    expect(await columnsContaining("Ana escribió desde otro número")).toEqual([
      "conversation_notes.body_text",
    ]);
    expect(NOT_REACHED.join(" ")).toContain("sus notas conservan el texto");
  });

  // Como addConversationNote: la clave foránea retiene la conversación con un bloqueo compartido,
  // y el vaciado, que la bloquea para actualizar, espera a que la nota se confirme (revisión de la
  // 16.4, R-1).
  it("25. la nota que se confirma durante el vaciado también queda sin texto", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    const conversationId = await insertConversationWithMessage(clientId, BODY);
    const user = await getDb().execute<{ id: string }>(
      sql`insert into users (email, password_hash, name, must_change_password)
          values ('nota-tarde@example.com', 'x', 'Vendedora', false)
          returning id`,
    );
    const commit = await holdIngestion(async (tx) => {
      await tx.execute(
        sql`insert into conversation_notes (organization_id, conversation_id, actor_user_id, body_text)
            values (${organizationId}, ${conversationId}, ${user.rows[0]!.id}, ${LATE})`,
      );
    });

    const erasure = eraseClientData(getDb(), organizationId, clientId);
    await waitForLockWaiters(1);
    await commit();

    expect(await erasure).toMatchObject({ notes: 1 });
    expect(await columnsContaining(LATE)).toEqual([]);
  });

  // El otro orden: una nota que llega después del vaciado conserva su texto hasta que se repite el
  // vaciado, como un mensaje que llega después (runbook de datos de un cliente).
  it("26. la nota escrita después del vaciado conserva el texto, y un vaciado repetido la alcanza", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    const conversationId = await insertConversationWithMessage(clientId, BODY);
    await eraseClientData(getDb(), organizationId, clientId);
    await noteOn(conversationId, NOTE);

    expect(await columnsContaining(NOTE)).toEqual([
      "conversation_notes.body_text",
    ]);
    expect(
      (await eraseClientData(getDb(), organizationId, clientId)).notes,
    ).toBe(1);
    expect(await columnsContaining(NOTE)).toEqual([]);
  });
});
