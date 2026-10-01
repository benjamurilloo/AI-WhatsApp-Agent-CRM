import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El vaciado de una sola dirección de messages y audit_logs, contra PostgreSQL real (brief-13.4,
// AC-2 a AC-4; ADR 0015). Los tests corren con el dueño, que es el rol del operador: el trigger
// es la defensa que decide. Cada regla tiene su caso rechazado, que es la mutación de esa regla.

const ERASED = `'{"before": null, "after": null, "vaciado": true}'::jsonb`;

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgCode(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code ?? "sin código";
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

type Seed = {
  organizationId: string;
  conversationId: string;
  messageId: string;
  userId: string;
};

async function seed(): Promise<Seed> {
  const db = getDb();
  const org = await db.execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio Vaciado') returning id`,
  );
  const organizationId = org.rows[0]!.id;
  const conversation = await db.execute<{ id: string }>(
    sql`insert into conversations (organization_id, channel, status, started_at, last_message_at, external_ref)
        values (${organizationId}, 'whatsapp', 'open', '2026-09-10T12:00:00Z', '2026-09-10T12:01:00Z', 'conv-ref-1')
        returning id`,
  );
  const conversationId = conversation.rows[0]!.id;
  const message = await db.execute<{ id: string }>(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text, external_ref, kind, sent_by)
        values (${organizationId}, ${conversationId}, 'outbound', '2026-09-10T12:01:00Z', 'Texto privado', 'msg-ref-1', 'text', 'agent')
        returning id`,
  );
  const user = await db.execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values ('operador@example.com', 'x', 'Operador', false) returning id`,
  );
  return {
    organizationId,
    conversationId,
    messageId: message.rows[0]!.id,
    userId: user.rows[0]!.id,
  };
}

async function insertAudit(
  s: Seed,
  entityType: "client" | "product",
): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
        values (${s.organizationId}, ${s.userId}, ${entityType}, gen_random_uuid(), 'update',
                '{"before": {"phoneE164": "+5491155550001"}, "after": {"phoneE164": "+5491155550002"}}'::jsonb)
        returning id`,
  );
  return result.rows[0]!.id;
}

async function messageRow(id: string) {
  const result = await getDb().execute<Record<string, unknown>>(
    sql`select * from messages where id = ${id}`,
  );
  return result.rows[0];
}

async function auditRow(id: string) {
  const result = await getDb().execute<Record<string, unknown>>(
    sql`select * from audit_logs where id = ${id}`,
  );
  return result.rows[0];
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("messages: el único UPDATE admitido es el vaciado (AC-2)", () => {
  it("1. el vaciado pasa y conserva el resto de la fila", async () => {
    const s = await seed();
    const before = await messageRow(s.messageId);

    await getDb().execute(
      sql`update messages set body_text = null, external_ref = null where id = ${s.messageId}`,
    );

    expect(await messageRow(s.messageId)).toEqual({
      ...before,
      body_text: null,
      external_ref: null,
    });
  });

  it("2. un mensaje ya vaciado admite el mismo vaciado otra vez, sin cambio", async () => {
    const s = await seed();
    const vaciar = sql`update messages set body_text = null, external_ref = null where id = ${s.messageId}`;
    await getDb().execute(vaciar);
    await getDb().execute(vaciar);
    expect(await messageRow(s.messageId)).toMatchObject({ body_text: null });
  });

  // Cada caso es una mutación de la regla: el vaciado más un cambio que no es vaciar.
  const rejected: [string, string][] = [
    ["el texto cambiado por otro", "body_text = 'Otro texto'"],
    ["el texto vaciado sin vaciar la referencia", "body_text = null"],
    ["la referencia vaciada sin vaciar el texto", "external_ref = null"],
    [
      "el vaciado con la fecha cambiada",
      "body_text = null, external_ref = null, sent_at = sent_at + interval '1 minute'",
    ],
    [
      "el vaciado con la dirección cambiada",
      "body_text = null, external_ref = null, direction = 'inbound', sent_by = null",
    ],
    [
      "el vaciado con el tipo cambiado",
      "body_text = null, external_ref = null, kind = 'audio'",
    ],
    [
      "el vaciado con el autor cambiado",
      "body_text = null, external_ref = null, sent_by = 'person'",
    ],
    [
      "el vaciado con la fecha de creación cambiada",
      "body_text = null, external_ref = null, created_at = created_at - interval '1 day'",
    ],
    [
      "el vaciado con el id cambiado",
      "body_text = null, external_ref = null, id = gen_random_uuid()",
    ],
  ];

  for (const [name, assignment] of rejected) {
    it(`3. rechaza ${name}: P0001, y la fila no cambia`, async () => {
      const s = await seed();
      const before = await messageRow(s.messageId);
      expect(
        await pgCode(
          getDb().execute(
            sql`update messages set ${sql.raw(assignment)} where id = ${s.messageId}`,
          ),
        ),
      ).toBe("P0001");
      expect(await messageRow(s.messageId)).toEqual(before);
    });
  }

  it("4. rechaza el vaciado que mueve el mensaje a otra conversación", async () => {
    const s = await seed();
    const other = await getDb().execute<{ id: string }>(
      sql`insert into conversations (organization_id, channel, status, started_at)
          values (${s.organizationId}, 'whatsapp', 'open', '2026-09-10T12:00:00Z') returning id`,
    );
    expect(
      await pgCode(
        getDb().execute(
          sql`update messages set body_text = null, external_ref = null,
                conversation_id = ${other.rows[0]!.id} where id = ${s.messageId}`,
        ),
      ),
    ).toBe("P0001");
  });

  it("5. un mensaje vaciado no recupera su texto", async () => {
    const s = await seed();
    await getDb().execute(
      sql`update messages set body_text = null, external_ref = null where id = ${s.messageId}`,
    );
    expect(
      await pgCode(
        getDb().execute(
          sql`update messages set body_text = 'Texto privado' where id = ${s.messageId}`,
        ),
      ),
    ).toBe("P0001");
  });

  it("6. DELETE sigue rechazado: P0001", async () => {
    const s = await seed();
    const before = await messageRow(s.messageId);
    expect(
      await pgCode(
        getDb().execute(sql`delete from messages where id = ${s.messageId}`),
      ),
    ).toBe("P0001");
    expect(await messageRow(s.messageId)).toEqual(before);
  });
});

describe("audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3)", () => {
  it("7. el vaciado de una entrada de cliente pasa y conserva el resto de la fila", async () => {
    const s = await seed();
    const id = await insertAudit(s, "client");
    const before = await auditRow(id);

    await getDb().execute(
      sql`update audit_logs set diff = ${sql.raw(ERASED)} where id = ${id}`,
    );

    expect(await auditRow(id)).toEqual({
      ...before,
      diff: { before: null, after: null, vaciado: true },
    });
  });

  it("8. rechaza el mismo vaciado en una entrada de producto: P0001", async () => {
    const s = await seed();
    const id = await insertAudit(s, "product");
    const before = await auditRow(id);
    expect(
      await pgCode(
        getDb().execute(
          sql`update audit_logs set diff = ${sql.raw(ERASED)} where id = ${id}`,
        ),
      ),
    ).toBe("P0001");
    expect(await auditRow(id)).toEqual(before);
  });

  const rejected: [string, string][] = [
    ["un diff distinto del marcador", `diff = '{}'::jsonb`],
    [
      "el marcador con otra clave",
      `diff = '{"before": null, "after": null, "vaciado": true, "x": 1}'::jsonb`,
    ],
    [
      "el vaciado con la acción cambiada",
      `diff = ${ERASED}, action = 'create'`,
    ],
    [
      "el vaciado con la fecha cambiada",
      `diff = ${ERASED}, created_at = created_at - interval '1 day'`,
    ],
    [
      "el vaciado con la entidad cambiada",
      `diff = ${ERASED}, entity_id = gen_random_uuid()`,
    ],
    [
      "el vaciado que la convierte en entrada de producto",
      `diff = ${ERASED}, entity_type = 'product'`,
    ],
  ];

  for (const [name, assignment] of rejected) {
    it(`9. rechaza ${name}: P0001, y la fila no cambia`, async () => {
      const s = await seed();
      const id = await insertAudit(s, "client");
      const before = await auditRow(id);
      expect(
        await pgCode(
          getDb().execute(
            sql`update audit_logs set ${sql.raw(assignment)} where id = ${id}`,
          ),
        ),
      ).toBe("P0001");
      expect(await auditRow(id)).toEqual(before);
    });
  }

  it("10. DELETE sigue rechazado, también en una entrada de cliente: P0001", async () => {
    const s = await seed();
    const id = await insertAudit(s, "client");
    const before = await auditRow(id);
    expect(
      await pgCode(
        getDb().execute(sql`delete from audit_logs where id = ${id}`),
      ),
    ).toBe("P0001");
    expect(await auditRow(id)).toEqual(before);
  });
});

describe("crm_app no puede vaciar (AC-4)", () => {
  it("11. el vaciado de un mensaje como crm_app: 42501", async () => {
    const s = await seed();
    expect(
      await pgCode(
        asAppRole((tx) =>
          tx.execute(
            sql`update messages set body_text = null, external_ref = null where id = ${s.messageId}`,
          ),
        ),
      ),
    ).toBe("42501");
    expect(await messageRow(s.messageId)).toMatchObject({
      body_text: "Texto privado",
    });
  });

  it("12. el vaciado de una entrada de cliente como crm_app: 42501", async () => {
    const s = await seed();
    const id = await insertAudit(s, "client");
    const before = await auditRow(id);
    expect(
      await pgCode(
        asAppRole((tx) =>
          tx.execute(
            sql`update audit_logs set diff = ${sql.raw(ERASED)} where id = ${id}`,
          ),
        ),
      ),
    ).toBe("42501");
    expect(await auditRow(id)).toEqual(before);
  });
});
