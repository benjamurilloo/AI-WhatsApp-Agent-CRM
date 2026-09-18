import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/shared/db";
import { exportClientData } from "../../scripts/client-data-export";
import {
  deleteClientRow,
  describeRetained,
  minimizeClientData,
  minimizedName,
  reportClientData,
} from "../../scripts/client-data-delete";
import { resetDatabase } from "./reset-database";

// Exportación y minimización de los datos de un cliente, contra PostgreSQL real (brief-8.2,
// D-2 a D-4). Los dos casos del hallazgo 7 se prueban por separado, porque son distintos:
// un cliente con conversaciones no se puede borrar, uno sin conversaciones sí.

const PHONE = "+5491155551111";
const NAME = "Ana Kumquat";
const NOTES = "Departamento 7B";
const BODY = "Hola, ¿tenés stock?";

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
  const conversation = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, status, started_at, last_message_at)
        values (${organizationId}, ${clientId}, 'whatsapp', 'open', ${at}, ${at})
        returning id`,
  );
  const conversationId = conversation.rows[0]!.id;
  await getDb().execute(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
        values (${organizationId}, ${conversationId}, 'inbound', ${at}, ${body})`,
  );
  return conversationId;
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
          ${sql.raw(`'${JSON.stringify({ phone: { from: PHONE, to: PHONE } })}'::jsonb`)})`,
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
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0]).toMatchObject({ body_text: BODY });
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

describe("cliente con conversaciones: se minimiza, no se borra", () => {
  it("4. el informe dice que no es borrable y qué queda retenido", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    await insertAuditEntry(clientId);

    const report = await reportClientData(getDb(), organizationId, clientId);
    expect(report).toMatchObject({
      exists: true,
      conversations: 1,
      messages: 1,
      auditEntries: 1,
      deletable: false,
    });

    const retained = describeRetained(report);
    expect(retained.join(" ")).toContain("messages");
    expect(retained.join(" ")).toContain("audit_logs");
  });

  it("5. la minimización vacía teléfono y notas y deja mensajes y auditoría intactos", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);
    await insertAuditEntry(clientId);

    expect(await minimizeClientData(getDb(), organizationId, clientId)).toBe(
      true,
    );

    expect(await clientRow(clientId)).toMatchObject({
      display_name: minimizedName(clientId),
      phone_e164: null,
      notes: null,
    });

    // Lo retenido sigue ahí: el procedimiento no miente sobre lo que no puede borrar.
    const after = await exportClientData(getDb(), organizationId, clientId);
    expect(after.messages).toHaveLength(1);
    expect(after.messages[0]).toMatchObject({ body_text: BODY });
    expect(after.audit_logs).toHaveLength(1);
  });

  it("6. borrar la ficha de un cliente con conversaciones lo rechaza la base", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);

    // ON DELETE RESTRICT de conversations hacia clients (23001).
    await expect(
      deleteClientRow(getDb(), organizationId, clientId),
    ).rejects.toThrow();

    expect(await clientRow(clientId)).toMatchObject({ phone_e164: PHONE });
  });

  it("7. la minimización no escribe en audit_logs, que reintroduciría el teléfono", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertConversationWithMessage(clientId, BODY);

    const before = await reportClientData(getDb(), organizationId, clientId);
    await minimizeClientData(getDb(), organizationId, clientId);
    const after = await reportClientData(getDb(), organizationId, clientId);

    expect(after.auditEntries).toBe(before.auditEntries);
  });
});

describe("cliente sin conversaciones: se borra de verdad", () => {
  it("8. el informe lo marca borrable y sin nada retenido", async () => {
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

  it("9. la ficha se borra y no queda rastro de la persona", async () => {
    const clientId = await insertClient(NAME, PHONE, NOTES);

    expect(await deleteClientRow(getDb(), organizationId, clientId)).toBe(true);

    expect(await clientRow(clientId)).toBeUndefined();
    const after = await reportClientData(getDb(), organizationId, clientId);
    expect(after.exists).toBe(false);
  });

  it("10. un cliente sin conversaciones pero con auditoría no queda del todo limpio", async () => {
    // La ficha se va; las entradas de auditoría con el teléfono anterior no, porque
    // audit_logs es de solo inserción. Es el límite que el runbook tiene que declarar.
    const clientId = await insertClient(NAME, PHONE, NOTES);
    await insertAuditEntry(clientId);

    const report = await reportClientData(getDb(), organizationId, clientId);
    expect(report.deletable).toBe(true);
    expect(describeRetained(report).join(" ")).toContain("audit_logs");

    await deleteClientRow(getDb(), organizationId, clientId);

    const remaining = await getDb().execute<{ count: string }>(
      sql`select count(*)::text as count from audit_logs
          where organization_id = ${organizationId} and entity_id = ${clientId}`,
    );
    expect(remaining.rows[0]!.count).toBe("1");
  });
});
