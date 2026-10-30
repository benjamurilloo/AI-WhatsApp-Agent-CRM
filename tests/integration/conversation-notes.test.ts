import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  addConversationNote,
  listClientConversationEvents,
  listConversationNotes,
  NOTES_PAGE_SIZE,
} from "@/modules/conversations";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Notas de la conversación contra PostgreSQL real (brief-16.4; FR-CONV-07): agregar solo como admin
// y en su organización, en cualquier estado, auditado como note_added sin el texto; leer para los
// dos roles, de la más reciente a la más vieja y de a 25.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 20000;
let storedHash: string;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  role: "admin" | "viewer",
  mustChangePassword = false,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${`Persona ${email}`}, ${mustChangePassword}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function seed() {
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

async function insertConversation(
  organizationId: string,
  status: "open" | "pending" | "closed" = "open",
) {
  const at = new Date("2026-10-07T14:00:00.000Z");
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations (organization_id, channel, status, started_at, last_message_at)
        values (${organizationId}, 'whatsapp', ${status}, ${at}, ${at})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function notesOf(conversationId: string) {
  const result = await getDb().execute<{
    id: string;
    actor_user_id: string;
    body_text: string | null;
  }>(
    sql`select id, actor_user_id, body_text from conversation_notes
        where conversation_id = ${conversationId} order by created_at, id`,
  );
  return result.rows;
}

async function noteAudit(organizationId: string) {
  const result = await getDb().execute<{
    entity_type: string;
    entity_id: string;
    actor_user_id: string | null;
    actor_credential_id: string | null;
    diff: unknown;
  }>(
    sql`select entity_type, entity_id, actor_user_id, actor_credential_id, diff
        from audit_logs
        where organization_id = ${organizationId} and action = 'note_added'
        order by created_at, id`,
  );
  return result.rows;
}

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("addConversationNote (FR-CONV-07)", { timeout: TEST_TIMEOUT }, () => {
  it("AC-1 y AC-2: un admin agrega notas en open, pending y closed, recortadas, con su autor y auditadas sin el texto", async () => {
    const s = await seed();
    for (const status of ["open", "pending", "closed"] as const) {
      const id = await insertConversation(s.orgA, status);
      const body = `  Le prometimos el envío el viernes (${status}).\nConfirmar.  `;
      const result = await addConversationNote(s.adminA, {
        conversationId: id,
        body,
      });
      if (!result.ok) throw new Error(result.code);

      expect(await notesOf(id)).toEqual([
        {
          id: result.noteId,
          actor_user_id: s.adminA.userId,
          body_text: body.trim(),
        },
      ]);
      const audit = (await noteAudit(s.orgA)).filter(
        (row) => row.entity_id === id,
      );
      expect(audit).toEqual([
        {
          entity_type: "conversation",
          entity_id: id,
          actor_user_id: s.adminA.userId,
          actor_credential_id: null,
          diff: {
            before: { noteId: null },
            after: { noteId: result.noteId },
          },
        },
      ]);
    }

    // AC-7: el texto no está en ninguna entrada de auditoría.
    const leaked = await getDb().execute(
      sql`select 1 from audit_logs where diff::text like '%prometimos%'`,
    );
    expect(leaked.rows).toEqual([]);
  });

  it("AC-1: un texto vacío o de más de 1000 caracteres se rechaza sin escribir; 1000 se acepta", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA);
    for (const body of ["", "   \n  ", "n".repeat(1001)]) {
      expect(
        await addConversationNote(s.adminA, { conversationId: id, body }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["body"] });
    }
    expect(await notesOf(id)).toEqual([]);
    expect(await noteAudit(s.orgA)).toEqual([]);

    const accepted = await addConversationNote(s.adminA, {
      conversationId: id,
      body: ` ${"n".repeat(1000)} `,
    });
    expect(accepted.ok).toBe(true);
  });

  it("AC-3: viewer y contraseña pendiente dan FORBIDDEN; otra organización, el mismo NOT_FOUND que una inexistente", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA);
    for (const context of [s.viewerA, s.pendingA]) {
      expect(
        await addConversationNote(context, {
          conversationId: id,
          body: "Nota",
        }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
    }
    for (const conversationId of [id, crypto.randomUUID()]) {
      expect(
        await addConversationNote(s.adminB, { conversationId, body: "Nota" }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
    }
    expect(
      await addConversationNote(s.adminA, { conversationId: "x", body: "N" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    expect(await notesOf(id)).toEqual([]);
    expect(await noteAudit(s.orgA)).toEqual([]);
    expect(await noteAudit(s.orgB)).toEqual([]);
  });

  it("AC-2: si falla la auditoría, la nota no queda", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA);
    // Un trigger de prueba rechaza la entrada note_added, después del INSERT de la nota.
    await getDb().execute(
      sql.raw(`create function test_reject_note_audit() returns trigger
               language plpgsql as $$
               begin
                 if new.action = 'note_added' then raise exception 'auditoría rechazada'; end if;
                 return new;
               end $$`),
    );
    await getDb().execute(
      sql.raw(`create trigger test_reject_note_audit before insert on audit_logs
               for each row execute function test_reject_note_audit()`),
    );
    try {
      await expect(
        addConversationNote(s.adminA, { conversationId: id, body: "Nota" }),
      ).rejects.toThrow();
    } finally {
      await getDb().execute(
        sql.raw(`drop trigger test_reject_note_audit on audit_logs;
                 drop function test_reject_note_audit()`),
      );
    }
    expect(await notesOf(id)).toEqual([]);
  });
});

describe(
  "listConversationNotes (FR-CONV-07)",
  { timeout: TEST_TIMEOUT },
  () => {
    it("AC-3: el viewer lee las notas con su autor; otra organización da NOT_FOUND", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA);
      await addConversationNote(s.adminA, { conversationId: id, body: "Uno" });
      await addConversationNote(s.adminA, { conversationId: id, body: "Dos" });

      const read = await listConversationNotes(s.viewerA, id, { before: "" });
      if (!read.ok) throw new Error(read.code);
      expect(
        read.notes.map((note) => [note.body, note.author.name, note.author.id]),
      ).toEqual([
        ["Dos", "Persona admin-a@example.com", s.adminA.userId],
        ["Uno", "Persona admin-a@example.com", s.adminA.userId],
      ]);
      expect(read.before).toBeNull();

      for (const conversationId of [id, crypto.randomUUID()]) {
        expect(
          await listConversationNotes(s.adminB, conversationId, { before: "" }),
        ).toEqual({ ok: false, code: "NOT_FOUND" });
      }
      // Sin notas: lista vacía.
      const empty = await insertConversation(s.orgA);
      expect(
        await listConversationNotes(s.viewerA, empty, { before: "" }),
      ).toMatchObject({ ok: true, notes: [], before: null });
    });

    it("D-3: pagina de a 25, de la más reciente a la más vieja, con el cursor; un cursor inválido se rechaza", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA);
      // Una nota de otra conversación no entra en la página.
      const other = await insertConversation(s.orgA);
      await addConversationNote(s.adminA, {
        conversationId: other,
        body: "Ajena",
      });
      const total = NOTES_PAGE_SIZE + 2;
      for (let index = 1; index <= total; index++) {
        await addConversationNote(s.adminA, {
          conversationId: id,
          body: `Nota ${index}`,
        });
      }

      const first = await listConversationNotes(s.viewerA, id, { before: "" });
      if (!first.ok) throw new Error(first.code);
      expect(first.notes.map((note) => note.body)).toEqual(
        Array.from({ length: NOTES_PAGE_SIZE }, (_, i) => `Nota ${total - i}`),
      );
      expect(first.before).not.toBeNull();

      const second = await listConversationNotes(s.viewerA, id, {
        before: first.before!,
      });
      if (!second.ok) throw new Error(second.code);
      expect(second.notes.map((note) => note.body)).toEqual([
        "Nota 2",
        "Nota 1",
      ]);
      expect(second.before).toBeNull();

      expect(
        await listConversationNotes(s.viewerA, id, {
          before: "no-es-un-cursor",
        }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    });

    it("D-5: una nota vaciada se lee sin texto, con su autor y su fecha", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA);
      await addConversationNote(s.adminA, { conversationId: id, body: "Ana" });
      await getDb().execute(
        sql`update conversation_notes set body_text = null where conversation_id = ${id}`,
      );
      const read = await listConversationNotes(s.viewerA, id, { before: "" });
      if (!read.ok) throw new Error(read.code);
      expect(read.notes).toMatchObject([
        { body: null, author: { id: s.adminA.userId } },
      ]);
    });
  },
);

// La cronología de la ficha del cliente (brief-24.4.3, D-5).
describe(
  "los eventos de conversación de la ficha",
  { timeout: TEST_TIMEOUT },
  () => {
    async function clientWithConversation(organizationId: string) {
      const conversationId = await insertConversation(organizationId);
      const client = await getDb().execute<{ id: string }>(
        sql`insert into clients (organization_id, display_name)
          values (${organizationId}, 'Lucía') returning id`,
      );
      const clientId = client.rows[0]!.id;
      await getDb().execute(
        sql`update conversations set client_id = ${clientId} where id = ${conversationId}`,
      );
      return { conversationId, clientId };
    }

    it("una fila por conversación y las notas con su autor, nunca el texto, para los dos roles", async () => {
      const s = await seed();
      const { conversationId, clientId } = await clientWithConversation(s.orgA);
      const noted = await addConversationNote(s.adminA, {
        conversationId,
        body: "TEXTO-PRIVADO",
      });
      expect(noted.ok).toBe(true);

      for (const context of [s.adminA, s.viewerA]) {
        const events = await listClientConversationEvents(context, clientId);
        if (!events.ok) throw new Error(events.code);
        expect(events.conversations).toMatchObject([
          { id: conversationId, channel: "whatsapp" },
        ]);
        expect(events.notes).toMatchObject([{ conversationId }]);
        expect(events.notes[0]?.author).not.toBe("");
        expect(JSON.stringify(events)).not.toContain("TEXTO-PRIVADO");
      }
    });

    it("no cruza la organización y un cliente sin conversaciones no da eventos", async () => {
      const s = await seed();
      const { clientId } = await clientWithConversation(s.orgA);
      expect((await listClientConversationEvents(s.adminB, clientId)).ok).toBe(
        false,
      );
      const other = await getDb().execute<{ id: string }>(
        sql`insert into clients (organization_id, display_name)
          values (${s.orgA}, 'Mario') returning id`,
      );
      expect(
        await listClientConversationEvents(s.adminA, other.rows[0]!.id),
      ).toEqual({ ok: true, conversations: [], notes: [] });
    });
  },
);
