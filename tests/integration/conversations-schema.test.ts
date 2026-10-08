import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de conversaciones, mensajes e ingestión de la 6.1 contra PostgreSQL real, con SQL directo.
// Cada invariante se prueba intentando violarlo y comprobando el SQLSTATE y la constraint.

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; constraint: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      constraint: e.cause?.constraint ?? e.constraint ?? "",
    };
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

function rejection(query: SQL, executor: Db | DbTransaction = getDb()) {
  return pgError(executor.execute(query));
}

// Ejecuta como crm_app, el rol restringido que la aplicación usará al conectarse con él (ADR 0013).
function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

// Un error propio para revertir una transacción a propósito y reconocerlo afuera.
class IntentionalRollback extends Error {}

async function seed() {
  const organizations = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio A'), ('Negocio B') returning id`,
  );
  const orgA = organizations.rows[0]!.id;
  const orgB = organizations.rows[1]!.id;
  const clients = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name)
        values (${orgA}, 'Ana Pérez'), (${orgB}, 'Beto Gómez') returning id`,
  );
  return {
    orgA,
    orgB,
    clientA: clients.rows[0]!.id,
    clientB: clients.rows[1]!.id,
  };
}

async function createConversation(
  executor: Db | DbTransaction,
  organizationId: string,
  options: { clientId?: string | null; externalRef?: string | null } = {},
) {
  const result = await executor.execute<{ id: string }>(
    sql`insert into conversations (organization_id, client_id, channel, external_ref, started_at)
        values (${organizationId}, ${options.clientId ?? null}, 'whatsapp',
                ${options.externalRef ?? null}, '2026-09-01T10:00:00Z')
        returning id`,
  );
  return result.rows[0]!.id;
}

async function createMessage(
  executor: Db | DbTransaction,
  organizationId: string,
  conversationId: string,
  externalRef: string | null = null,
) {
  const result = await executor.execute<{ id: string }>(
    sql`insert into messages (organization_id, conversation_id, direction, external_ref, sent_at, body_text)
        values (${organizationId}, ${conversationId}, 'inbound', ${externalRef},
                '2026-09-01T10:00:00Z', 'Hola')
        returning id`,
  );
  return result.rows[0]!.id;
}

async function createEvent(
  executor: Db | DbTransaction,
  organizationId: string,
  source = "sintetico",
  externalRef = "evt-1",
) {
  const result = await executor.execute<{ id: string }>(
    sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash)
        values (${organizationId}, ${source}, ${externalRef}, 'message.received', 'hash-1')
        returning id`,
  );
  return result.rows[0]!.id;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("clients: destino de la clave compuesta", () => {
  it("tiene UNIQUE(organization_id, id)", async () => {
    const result = await getDb().execute<{ definition: string }>(
      sql`select pg_get_constraintdef(oid) as definition from pg_constraint
          where conname = 'clients_organization_id_id_unique'`,
    );
    expect(result.rows.map((row) => row.definition)).toEqual([
      "UNIQUE (organization_id, id)",
    ]);
  });
});

describe("conversations: esquema", () => {
  it("aplica los defaults y admite cliente, referencia y último mensaje nulos", async () => {
    const s = await seed();
    // now() es la hora de la transacción: se compara en la misma sentencia que inserta.
    const result = await getDb().execute<{
      status: string;
      client_id: string | null;
      external_ref: string | null;
      last_message_at: string | null;
      agent_paused_at: string | null;
      timestamps_now: boolean;
    }>(
      sql`insert into conversations (organization_id, channel, started_at)
          values (${s.orgA}, 'whatsapp', now())
          returning status, client_id, external_ref, last_message_at, agent_paused_at,
                    created_at = now() and updated_at = now() as timestamps_now`,
    );
    // Sin pausa: el agente está activo (brief-16.3, D-1).
    expect(result.rows[0]).toEqual({
      status: "open",
      client_id: null,
      external_ref: null,
      last_message_at: null,
      agent_paused_at: null,
      timestamps_now: true,
    });
  });

  it("rechaza columnas obligatorias en NULL y valores fuera de los enums", async () => {
    const s = await seed();
    for (const query of [
      sql`insert into conversations (organization_id, channel, started_at) values (null, 'whatsapp', now())`,
      sql`insert into conversations (organization_id, channel, started_at) values (${s.orgA}, null, now())`,
      sql`insert into conversations (organization_id, channel, started_at) values (${s.orgA}, 'whatsapp', null)`,
      sql`insert into conversations (organization_id, channel, status, started_at) values (${s.orgA}, 'whatsapp', null, now())`,
    ]) {
      expect((await rejection(query)).code).toBe("23502");
    }
    for (const query of [
      sql`insert into conversations (organization_id, channel, started_at) values (${s.orgA}, 'telegram', now())`,
      sql`insert into conversations (organization_id, channel, status, started_at) values (${s.orgA}, 'whatsapp', 'archived', now())`,
    ]) {
      expect((await rejection(query)).code).toBe("22P02");
    }
  });

  it("rechaza una referencia externa repetida en la organización y el canal", async () => {
    const s = await seed();
    await createConversation(getDb(), s.orgA, { externalRef: "conv-1" });
    expect(
      await pgError(
        createConversation(getDb(), s.orgA, { externalRef: "conv-1" }),
      ),
    ).toEqual({
      code: "23505",
      constraint: "conversations_organization_channel_external_ref_unique",
    });
  });

  it("acepta la misma referencia en otra organización y varias conversaciones sin referencia", async () => {
    const s = await seed();
    await createConversation(getDb(), s.orgA, { externalRef: "conv-1" });
    await createConversation(getDb(), s.orgB, { externalRef: "conv-1" });
    await createConversation(getDb(), s.orgA);
    await createConversation(getDb(), s.orgA);
    const count = await getDb().execute<{ n: number }>(
      sql`select count(*)::int as n from conversations`,
    );
    expect(count.rows[0]?.n).toBe(4);
  });

  it("rechaza una referencia externa vacía (D-2)", async () => {
    const s = await seed();
    for (const externalRef of ["", "   "]) {
      expect(
        await pgError(createConversation(getDb(), s.orgA, { externalRef })),
      ).toEqual({
        code: "23514",
        constraint: "conversations_external_ref_not_blank",
      });
    }
  });

  it("rechaza un último mensaje anterior al inicio, al insertar y al actualizar (D-2)", async () => {
    const s = await seed();
    expect(
      await rejection(
        sql`insert into conversations (organization_id, channel, started_at, last_message_at)
            values (${s.orgA}, 'whatsapp', '2026-09-01T10:00:00Z', '2026-09-01T09:59:59Z')`,
      ),
    ).toEqual({
      code: "23514",
      constraint: "conversations_last_message_after_start",
    });

    const id = await createConversation(getDb(), s.orgA);
    await getDb().execute(
      sql`update conversations set last_message_at = started_at where id = ${id}`,
    );
    expect(
      await rejection(
        sql`update conversations set last_message_at = started_at - interval '1 second' where id = ${id}`,
      ),
    ).toEqual({
      code: "23514",
      constraint: "conversations_last_message_after_start",
    });
  });
});

describe("conversations: aislamiento y borrado", () => {
  it("rechaza el cliente de otra organización o inexistente, y acepta una conversación sin cliente", async () => {
    const s = await seed();
    expect(
      await pgError(
        createConversation(getDb(), s.orgA, { clientId: s.clientB }),
      ),
    ).toEqual({ code: "23503", constraint: "conversations_client_fk" });
    expect(
      await pgError(
        createConversation(getDb(), s.orgA, {
          clientId: "00000000-0000-4000-8000-000000000000",
        }),
      ),
    ).toEqual({ code: "23503", constraint: "conversations_client_fk" });

    await createConversation(getDb(), s.orgA, { clientId: s.clientA });
    await createConversation(getDb(), s.orgA, { clientId: null });
  });

  it("rechaza mover una conversación al cliente de otra organización", async () => {
    const s = await seed();
    const id = await createConversation(getDb(), s.orgA, {
      clientId: s.clientA,
    });
    expect(
      await rejection(
        sql`update conversations set client_id = ${s.clientB} where id = ${id}`,
      ),
    ).toEqual({ code: "23503", constraint: "conversations_client_fk" });
  });

  it("no deja borrar un cliente ni una organización con conversaciones", async () => {
    const s = await seed();
    await createConversation(getDb(), s.orgA, { clientId: s.clientA });
    expect(
      await rejection(sql`delete from clients where id = ${s.clientA}`),
    ).toEqual({ code: "23001", constraint: "conversations_client_fk" });
    expect(
      await rejection(sql`delete from organizations where id = ${s.orgA}`),
    ).toMatchObject({ code: "23001" });
  });

  it("crm_app lee, inserta, actualiza y borra conversaciones", async () => {
    const s = await seed();
    await asAppRole(async (tx) => {
      const id = await createConversation(tx, s.orgA);
      await tx.execute(
        sql`update conversations set status = 'closed' where id = ${id}`,
      );
      // La pausa del agente (brief-16.3) usa el mismo UPDATE de tabla, sin grant nuevo.
      await tx.execute(
        sql`update conversations set agent_paused_at = now() where id = ${id}`,
      );
      const read = await tx.execute<{ status: string; paused: boolean }>(
        sql`select status, agent_paused_at is not null as paused from conversations where id = ${id}`,
      );
      expect(read.rows[0]).toEqual({ status: "closed", paused: true });
      await tx.execute(sql`delete from conversations where id = ${id}`);
    });
  });
});

describe("messages: esquema", () => {
  it("aplica los defaults y admite cuerpo y referencia nulos", async () => {
    const s = await seed();
    const conversation = await createConversation(getDb(), s.orgA);
    const result = await getDb().execute<{ id: string; created_now: boolean }>(
      sql`insert into messages (organization_id, conversation_id, direction, sent_at)
          values (${s.orgA}, ${conversation}, 'outbound', now())
          returning id, created_at = now() as created_now`,
    );
    expect(result.rows[0]?.created_now).toBe(true);
    const row = await getDb().execute<{
      body_text: string | null;
      external_ref: string | null;
    }>(
      sql`select body_text, external_ref from messages where id = ${result.rows[0]!.id}`,
    );
    expect(row.rows[0]).toEqual({ body_text: null, external_ref: null });
  });

  it("rechaza columnas obligatorias en NULL y una dirección fuera del enum", async () => {
    const s = await seed();
    const c = await createConversation(getDb(), s.orgA);
    for (const query of [
      sql`insert into messages (organization_id, conversation_id, direction, sent_at) values (null, ${c}, 'inbound', now())`,
      sql`insert into messages (organization_id, conversation_id, direction, sent_at) values (${s.orgA}, null, 'inbound', now())`,
      sql`insert into messages (organization_id, conversation_id, direction, sent_at) values (${s.orgA}, ${c}, null, now())`,
      sql`insert into messages (organization_id, conversation_id, direction, sent_at) values (${s.orgA}, ${c}, 'inbound', null)`,
    ]) {
      expect((await rejection(query)).code).toBe("23502");
    }
    expect(
      (
        await rejection(
          sql`insert into messages (organization_id, conversation_id, direction, sent_at) values (${s.orgA}, ${c}, 'sideways', now())`,
        )
      ).code,
    ).toBe("22P02");
  });

  it("rechaza la conversación de otra organización o inexistente", async () => {
    const s = await seed();
    const conversationB = await createConversation(getDb(), s.orgB);
    expect(
      await pgError(createMessage(getDb(), s.orgA, conversationB)),
    ).toEqual({ code: "23503", constraint: "messages_conversation_fk" });
    expect(
      await pgError(
        createMessage(getDb(), s.orgA, "00000000-0000-4000-8000-000000000000"),
      ),
    ).toEqual({ code: "23503", constraint: "messages_conversation_fk" });
  });

  it("rechaza una referencia repetida en la conversación y la acepta en otra", async () => {
    const s = await seed();
    const first = await createConversation(getDb(), s.orgA);
    const second = await createConversation(getDb(), s.orgA);
    await createMessage(getDb(), s.orgA, first, "msg-1");
    expect(
      await pgError(createMessage(getDb(), s.orgA, first, "msg-1")),
    ).toEqual({
      code: "23505",
      constraint: "messages_organization_conversation_external_ref_unique",
    });
    await createMessage(getDb(), s.orgA, second, "msg-1");
    await createMessage(getDb(), s.orgA, first);
    await createMessage(getDb(), s.orgA, first);
  });

  it("rechaza una referencia externa vacía (D-2)", async () => {
    const s = await seed();
    const c = await createConversation(getDb(), s.orgA);
    for (const externalRef of ["", "   "]) {
      expect(
        await pgError(createMessage(getDb(), s.orgA, c, externalRef)),
      ).toEqual({
        code: "23514",
        constraint: "messages_external_ref_not_blank",
      });
    }
  });

  it("no deja borrar una conversación ni una organización con mensajes", async () => {
    const s = await seed();
    const c = await createConversation(getDb(), s.orgA);
    await createMessage(getDb(), s.orgA, c);
    // El trigger de messages no interviene: el rechazo viene del borrado de la conversación.
    expect(
      await rejection(sql`delete from conversations where id = ${c}`),
    ).toEqual({ code: "23001", constraint: "messages_conversation_fk" });
    expect(
      (await rejection(sql`delete from organizations where id = ${s.orgA}`))
        .code,
    ).toBe("23001");
  });
});

describe("messages: solo inserción (D-3)", () => {
  it("crm_app lee e inserta, pero no puede actualizar ni borrar: 42501", async () => {
    const s = await seed();
    const c = await createConversation(getDb(), s.orgA);
    const id = await asAppRole(async (tx) => {
      const inserted = await createMessage(tx, s.orgA, c);
      const read = await tx.execute(
        sql`select id from messages where id = ${inserted}`,
      );
      expect(read.rows).toHaveLength(1);
      return inserted;
    });
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(
              sql`update messages set body_text = 'otro' where id = ${id}`,
            ),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(sql`delete from messages where id = ${id}`),
          ),
        )
      ).code,
    ).toBe("42501");
  });

  it("el trigger rechaza UPDATE y DELETE también para el rol dueño: P0001", async () => {
    const s = await seed();
    const c = await createConversation(getDb(), s.orgA);
    const id = await createMessage(getDb(), s.orgA, c);
    expect(
      (
        await rejection(
          sql`update messages set body_text = 'otro' where id = ${id}`,
        )
      ).code,
    ).toBe("P0001");
    expect(
      (await rejection(sql`delete from messages where id = ${id}`)).code,
    ).toBe("P0001");
  });

  it("sin el trigger, el rol dueño podría cambiar y borrar mensajes", async () => {
    const s = await seed();
    const c = await createConversation(getDb(), s.orgA);
    const id = await createMessage(getDb(), s.orgA, c);
    await expect(
      getDb().transaction(async (tx) => {
        await tx.execute(sql`drop trigger messages_insert_only on messages`);
        await tx.execute(
          sql`update messages set body_text = 'otro' where id = ${id}`,
        );
        const removed = await tx.execute(
          sql`delete from messages where id = ${id} returning id`,
        );
        expect(removed.rows).toHaveLength(1);
        throw new IntentionalRollback();
      }),
    ).rejects.toBeInstanceOf(IntentionalRollback);
    const kept = await getDb().execute<{ body_text: string }>(
      sql`select body_text from messages where id = ${id}`,
    );
    expect(kept.rows[0]?.body_text).toBe("Hola");
  });
});

// Notas de la conversación (brief-16.4, D-1; FR-CONV-07): solo inserción, con el vaciado del texto
// como único UPDATE (ADR 0015).
async function createUser(executor: Db | DbTransaction, email: string) {
  const result = await executor.execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, 'hash', 'Persona') returning id`,
  );
  return result.rows[0]!.id;
}

async function createNote(
  executor: Db | DbTransaction,
  organizationId: string,
  conversationId: string,
  userId: string,
  body: string | null = "Llamó por teléfono",
) {
  const result = await executor.execute<{ id: string }>(
    sql`insert into conversation_notes (organization_id, conversation_id, actor_user_id, body_text)
        values (${organizationId}, ${conversationId}, ${userId}, ${body})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function noteRow(id: string) {
  const result = await getDb().execute<Record<string, unknown>>(
    sql`select * from conversation_notes where id = ${id}`,
  );
  return result.rows[0];
}

describe("conversation_notes: esquema (brief-16.4)", () => {
  it("aplica los defaults y rechaza la conversación de otra organización", async () => {
    const s = await seed();
    const user = await createUser(getDb(), "a@example.com");
    const c = await createConversation(getDb(), s.orgA);
    const id = await createNote(getDb(), s.orgA, c, user);
    expect(await noteRow(id)).toMatchObject({
      organization_id: s.orgA,
      conversation_id: c,
      actor_user_id: user,
      body_text: "Llamó por teléfono",
    });
    expect(
      await rejection(
        sql`insert into conversation_notes (organization_id, conversation_id, actor_user_id, body_text)
            values (${s.orgB}, ${c}, ${user}, 'Ajena')`,
      ),
    ).toEqual({
      code: "23503",
      constraint: "conversation_notes_conversation_fk",
    });
  });

  it("rechaza un texto vacío, sin recortar o de más de 1000 caracteres (D-3)", async () => {
    const s = await seed();
    const user = await createUser(getDb(), "a@example.com");
    const c = await createConversation(getDb(), s.orgA);
    for (const body of ["", " nota", "nota ", "n".repeat(1001)]) {
      expect(await pgError(createNote(getDb(), s.orgA, c, user, body))).toEqual(
        { code: "23514", constraint: "conversation_notes_body_text_valid" },
      );
    }
    await createNote(getDb(), s.orgA, c, user, "n".repeat(1000));
  });

  it("no deja borrar una conversación con notas", async () => {
    const s = await seed();
    const user = await createUser(getDb(), "a@example.com");
    const c = await createConversation(getDb(), s.orgA);
    await createNote(getDb(), s.orgA, c, user);
    expect(
      await rejection(sql`delete from conversations where id = ${c}`),
    ).toEqual({
      code: "23001",
      constraint: "conversation_notes_conversation_fk",
    });
  });
});

describe("conversation_notes: solo inserción (D-1, AC-4)", () => {
  it("crm_app lee e inserta, pero no puede actualizar ni borrar, ni siquiera vaciar: 42501", async () => {
    const s = await seed();
    const user = await createUser(getDb(), "a@example.com");
    const c = await createConversation(getDb(), s.orgA);
    const id = await asAppRole(async (tx) => {
      const inserted = await createNote(tx, s.orgA, c, user);
      const read = await tx.execute(
        sql`select id from conversation_notes where id = ${inserted}`,
      );
      expect(read.rows).toHaveLength(1);
      return inserted;
    });
    for (const query of [
      sql`update conversation_notes set body_text = 'otro' where id = ${id}`,
      sql`update conversation_notes set body_text = null where id = ${id}`,
      sql`delete from conversation_notes where id = ${id}`,
    ]) {
      expect((await pgError(asAppRole((tx) => tx.execute(query)))).code).toBe(
        "42501",
      );
    }
  });

  it("el trigger rechaza todo UPDATE y DELETE del dueño salvo el vaciado: P0001", async () => {
    const s = await seed();
    const user = await createUser(getDb(), "a@example.com");
    const other = await createUser(getDb(), "b@example.com");
    const c = await createConversation(getDb(), s.orgA);
    const c2 = await createConversation(getDb(), s.orgA);
    const id = await createNote(getDb(), s.orgA, c, user);
    for (const query of [
      sql`update conversation_notes set body_text = 'otro' where id = ${id}`,
      sql`update conversation_notes set actor_user_id = ${other} where id = ${id}`,
      sql`update conversation_notes set conversation_id = ${c2} where id = ${id}`,
      sql`update conversation_notes set created_at = now() - interval '1 day' where id = ${id}`,
      // Vaciar y además cambiar otra columna tampoco es el vaciado.
      sql`update conversation_notes set body_text = null, actor_user_id = ${other} where id = ${id}`,
      sql`delete from conversation_notes where id = ${id}`,
    ]) {
      expect((await rejection(query)).code).toBe("P0001");
    }
    expect((await noteRow(id))?.body_text).toBe("Llamó por teléfono");
  });

  it("el vaciado deja la fila igual sin el texto, se puede repetir y no se deshace", async () => {
    const s = await seed();
    const user = await createUser(getDb(), "a@example.com");
    const c = await createConversation(getDb(), s.orgA);
    const id = await createNote(getDb(), s.orgA, c, user);
    const before = await noteRow(id);
    await getDb().execute(
      sql`update conversation_notes set body_text = null where id = ${id}`,
    );
    expect(await noteRow(id)).toEqual({ ...before, body_text: null });
    await getDb().execute(
      sql`update conversation_notes set body_text = null where id = ${id}`,
    );
    expect(
      (
        await rejection(
          sql`update conversation_notes set body_text = 'de vuelta' where id = ${id}`,
        )
      ).code,
    ).toBe("P0001");
    expect(await noteRow(id)).toEqual({ ...before, body_text: null });
  });

  it("sin el trigger, el rol dueño podría cambiar y borrar notas", async () => {
    const s = await seed();
    const user = await createUser(getDb(), "a@example.com");
    const c = await createConversation(getDb(), s.orgA);
    const id = await createNote(getDb(), s.orgA, c, user);
    await expect(
      getDb().transaction(async (tx) => {
        await tx.execute(
          sql`drop trigger conversation_notes_insert_only on conversation_notes`,
        );
        await tx.execute(
          sql`update conversation_notes set body_text = 'otro' where id = ${id}`,
        );
        const removed = await tx.execute(
          sql`delete from conversation_notes where id = ${id} returning id`,
        );
        expect(removed.rows).toHaveLength(1);
        throw new IntentionalRollback();
      }),
    ).rejects.toBeInstanceOf(IntentionalRollback);
    expect((await noteRow(id))?.body_text).toBe("Llamó por teléfono");
  });
});

describe("ingestion_events: esquema", () => {
  it("aplica los defaults", async () => {
    const s = await seed();
    const result = await getDb().execute<{
      status: string;
      error_code: string | null;
      processed_at: string | null;
      received_now: boolean;
    }>(
      sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash)
          values (${s.orgA}, 'sintetico', 'evt-1', 'message.received', 'hash-1')
          returning status, error_code, processed_at, received_at = now() as received_now`,
    );
    expect(result.rows[0]).toEqual({
      status: "received",
      error_code: null,
      processed_at: null,
      received_now: true,
    });
  });

  it("rechaza columnas obligatorias en NULL y un estado fuera del enum", async () => {
    const s = await seed();
    for (const query of [
      sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash) values (null, 's', 'e', 't', 'h')`,
      sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash) values (${s.orgA}, null, 'e', 't', 'h')`,
      sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash) values (${s.orgA}, 's', null, 't', 'h')`,
      sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash) values (${s.orgA}, 's', 'e', null, 'h')`,
      sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash) values (${s.orgA}, 's', 'e', 't', null)`,
    ]) {
      expect((await rejection(query)).code).toBe("23502");
    }
    expect(
      (
        await rejection(
          sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash, status)
              values (${s.orgA}, 's', 'e', 't', 'h', 'pending')`,
        )
      ).code,
    ).toBe("22P02");
  });

  it("rechaza un evento repetido y acepta la misma referencia con otro origen o en otra organización", async () => {
    const s = await seed();
    await createEvent(getDb(), s.orgA, "sintetico", "evt-1");
    expect(
      await pgError(createEvent(getDb(), s.orgA, "sintetico", "evt-1")),
    ).toEqual({
      code: "23505",
      constraint: "ingestion_events_organization_source_external_ref_unique",
    });
    await createEvent(getDb(), s.orgA, "otro-origen", "evt-1");
    await createEvent(getDb(), s.orgB, "sintetico", "evt-1");
  });

  it("ON CONFLICT sobre la constraint no inserta el reenvío", async () => {
    const s = await seed();
    await createEvent(getDb(), s.orgA);
    const result = await getDb().execute(
      sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash)
          values (${s.orgA}, 'sintetico', 'evt-1', 'message.received', 'hash-2')
          on conflict on constraint ingestion_events_organization_source_external_ref_unique do nothing
          returning id`,
    );
    expect(result.rows).toHaveLength(0);
    const stored = await getDb().execute<{ payload_hash: string }>(
      sql`select payload_hash from ingestion_events`,
    );
    expect(stored.rows).toEqual([{ payload_hash: "hash-1" }]);
  });

  it("rechaza identidades vacías (D-2)", async () => {
    const s = await seed();
    for (const [source, externalRef, eventType, payloadHash] of [
      ["", "e", "t", "h"],
      ["s", " ", "t", "h"],
      ["s", "e", "", "h"],
      ["s", "e", "t", "  "],
    ]) {
      expect(
        await rejection(
          sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash)
              values (${s.orgA}, ${source}, ${externalRef}, ${eventType}, ${payloadHash})`,
        ),
      ).toEqual({
        code: "23514",
        constraint: "ingestion_events_identity_not_blank",
      });
    }
  });

  it("exige que la fecha de proceso y el código de error coincidan con el estado (D-2)", async () => {
    const s = await seed();
    const insert = (
      status: string,
      processedAt: string | null,
      errorCode: string | null,
    ) =>
      rejection(
        sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash, status, processed_at, error_code)
            values (${s.orgA}, 's', ${`${status}-${processedAt}-${errorCode}`}, 't', 'h',
                    ${status}, ${processedAt}, ${errorCode})`,
      );
    expect(await insert("received", "2026-09-01T10:00:00Z", null)).toEqual({
      code: "23514",
      constraint: "ingestion_events_processed_at_matches_status",
    });
    expect(await insert("processed", null, null)).toEqual({
      code: "23514",
      constraint: "ingestion_events_processed_at_matches_status",
    });
    expect(await insert("failed", "2026-09-01T10:00:00Z", null)).toEqual({
      code: "23514",
      constraint: "ingestion_events_error_code_matches_status",
    });
    expect(
      await insert("processed", "2026-09-01T10:00:00Z", "INTERNAL_ERROR"),
    ).toEqual({
      code: "23514",
      constraint: "ingestion_events_error_code_matches_status",
    });
    expect(await insert("received", null, "INTERNAL_ERROR")).toEqual({
      code: "23514",
      constraint: "ingestion_events_error_code_matches_status",
    });
  });

  it("acepta pasar de recibido a procesado o fallido con sus columnas", async () => {
    const s = await seed();
    const processed = await createEvent(getDb(), s.orgA, "s", "evt-ok");
    const failed = await createEvent(getDb(), s.orgA, "s", "evt-ko");
    await getDb().execute(
      sql`update ingestion_events set status = 'processed', processed_at = now() where id = ${processed}`,
    );
    await getDb().execute(
      sql`update ingestion_events set status = 'failed', processed_at = now(), error_code = 'VALIDATION_ERROR'
          where id = ${failed}`,
    );
    const rows = await getDb().execute<{ status: string }>(
      sql`select status from ingestion_events order by status`,
    );
    expect(rows.rows.map((row) => row.status)).toEqual(["processed", "failed"]);
  });

  it("no deja borrar una organización con eventos", async () => {
    // Sin clientes: el rechazo tiene que venir de ingestion_events.
    const orphan = await getDb().execute<{ id: string }>(
      sql`insert into organizations (name) values ('Solo eventos') returning id`,
    );
    await createEvent(getDb(), orphan.rows[0]!.id);
    expect(
      await rejection(
        sql`delete from organizations where id = ${orphan.rows[0]!.id}`,
      ),
    ).toEqual({
      code: "23001",
      constraint: "ingestion_events_organization_id_organizations_id_fk",
    });
  });
});

describe("ingestion_events: identidad inmutable y sin borrado (D-3)", () => {
  const identityChanges = [
    sql`organization_id = (select id from organizations where name = 'Negocio B')`,
    sql`source = 'otro'`,
    sql`external_ref = 'evt-2'`,
    sql`event_type = 'otro.tipo'`,
    sql`payload_hash = 'hash-2'`,
    sql`received_at = received_at - interval '1 hour'`,
    sql`id = gen_random_uuid()`,
  ];

  it("el trigger rechaza cambiar la identidad y borrar, también para el rol dueño: P0001", async () => {
    const s = await seed();
    const id = await createEvent(getDb(), s.orgA);
    for (const change of identityChanges) {
      expect(
        (
          await rejection(
            sql`update ingestion_events set ${change} where id = ${id}`,
          )
        ).code,
      ).toBe("P0001");
    }
    expect(
      (await rejection(sql`delete from ingestion_events where id = ${id}`))
        .code,
    ).toBe("P0001");
  });

  it("crm_app lee, inserta y actualiza el estado; no puede borrar ni cambiar la identidad", async () => {
    const s = await seed();
    const id = await asAppRole(async (tx) => {
      const inserted = await createEvent(tx, s.orgA);
      await tx.execute(
        sql`update ingestion_events set status = 'processed', processed_at = now() where id = ${inserted}`,
      );
      const read = await tx.execute<{ status: string }>(
        sql`select status from ingestion_events where id = ${inserted}`,
      );
      expect(read.rows[0]?.status).toBe("processed");
      return inserted;
    });
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(sql`delete from ingestion_events where id = ${id}`),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(
              sql`update ingestion_events set payload_hash = 'hash-2' where id = ${id}`,
            ),
          ),
        )
      ).code,
    ).toBe("P0001");
  });

  it("sin el trigger, el rol dueño podría cambiar la identidad y borrar", async () => {
    const s = await seed();
    const id = await createEvent(getDb(), s.orgA);
    await expect(
      getDb().transaction(async (tx) => {
        await tx.execute(
          sql`drop trigger ingestion_events_identity_immutable on ingestion_events`,
        );
        for (const change of identityChanges) {
          await tx.execute(sql`update ingestion_events set ${change}`);
        }
        const removed = await tx.execute(
          sql`delete from ingestion_events returning id`,
        );
        expect(removed.rows).toHaveLength(1);
        throw new IntentionalRollback();
      }),
    ).rejects.toBeInstanceOf(IntentionalRollback);
    const kept = await getDb().execute<{ id: string; payload_hash: string }>(
      sql`select id, payload_hash from ingestion_events`,
    );
    expect(kept.rows).toEqual([{ id, payload_hash: "hash-1" }]);
  });
});
