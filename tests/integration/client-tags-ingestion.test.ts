import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { assignClientTag, MAX_TAGS_PER_CLIENT } from "@/modules/crm";
import {
  recordIngestionEvent,
  recordIngestionEventV2,
  type IngestionContext,
} from "@/modules/ingestion";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Etiquetas puestas por el agente contra PostgreSQL real (brief-16.2): client.tag_added y
// client.tag_removed por el contrato v2 (AC-1), sus reglas de negocio terminales (AC-2), el
// resultado y los reenvíos (AC-3), la credencial como actor (AC-4), la concurrencia con la ficha
// (AC-5) y el aislamiento (invariante 1). Los eventos se arman acá, con forma asumida.

const RECEIVED_AT = new Date("2026-09-16T15:00:00.000Z");
const PHONE = "+5491155550001";
const PASSWORD = "contraseña-correcta-larga";
let storedHash: string;
let eventCounter = 0;

async function organizationWithCredential(name: string, source: string) {
  const organization = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  const organizationId = organization.rows[0]!.id;
  const credential = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${organizationId}, ${source}, 'ingest', ${randomUUID()}) returning id`,
  );
  return {
    organizationId,
    source,
    credentialId: credential.rows[0]!.id,
  } satisfies IngestionContext;
}

async function adminOf(organizationId: string, email: string) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, 'Admin') returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, 'admin')`,
  );
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context satisfies AuthContext;
}

async function insertClient(organizationId: string, phone: string | null) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${organizationId}, 'Ana', ${phone}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertTag(organizationId: string, name: string, active = true) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into client_tags (organization_id, name, is_active)
        values (${organizationId}, ${name}, ${active}) returning id`,
  );
  return result.rows[0]!.id;
}

function tagEvent(
  tagId: string,
  options: {
    removed?: boolean;
    phone?: string;
    eventId?: string;
    version?: "1" | "2";
  } = {},
) {
  return {
    contract_version: options.version ?? "2",
    event_type: options.removed ? "client.tag_removed" : "client.tag_added",
    event_id: options.eventId ?? `evt-etiqueta-${++eventCounter}`,
    occurred_at: "2026-09-16T14:59:58.000Z",
    client: { phone: options.phone ?? PHONE },
    tag: { id: tagId },
  };
}

function send(context: IngestionContext, payload: unknown) {
  return recordIngestionEventV2(context, JSON.stringify(payload), RECEIVED_AT);
}

async function tagsOf(clientId: string) {
  const result = await getDb().execute<{ name: string }>(
    sql`select t.name from client_tag_assignments a
        join client_tags t on t.id = a.tag_id
        where a.client_id = ${clientId} order by t.name`,
  );
  return result.rows.map((row) => row.name);
}

async function auditOf(organizationId: string) {
  const result = await getDb().execute<{
    entity_id: string;
    action: string;
    actor_user_id: string | null;
    actor_credential_id: string | null;
    diff: unknown;
  }>(
    sql`select entity_id, action, actor_user_id, actor_credential_id, diff
        from audit_logs where organization_id = ${organizationId}
        order by created_at, id`,
  );
  return result.rows;
}

async function eventsOf(organizationId: string) {
  const result = await getDb().execute<{
    external_ref: string;
    event_type: string;
    status: string;
    error_code: string | null;
  }>(
    sql`select external_ref, event_type, status, error_code from ingestion_events
        where organization_id = ${organizationId} order by received_at, external_ref`,
  );
  return result.rows;
}

// Una tercera conexión que retiene una transacción hasta que se la suelta (brief-12.2, D-8).
let releaseHeld: (() => Promise<void>) | null = null;

async function hold(statements: ReturnType<typeof sql>[]) {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    for (const statement of statements) await tx.execute(statement);
    taken();
    await released;
  });
  await lockTaken;
  releaseHeld = async () => {
    release();
    await holder;
    releaseHeld = null;
  };
  return releaseHeld;
}

async function waitForLockWaiters(count: number) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const waiting = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from pg_stat_activity
           where datname = current_database() and wait_event_type = ${"Lock"}`,
    );
    if (waiting.rows[0]!.count === count) return;
    if (Date.now() > deadline) {
      throw new Error(`se esperaban ${count} conexiones en un bloqueo`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterEach(async () => {
  if (releaseHeld) await releaseHeld();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("FR-CLI-11: poner y quitar por el contrato v2 (AC-1, AC-4)", () => {
  it("pone y quita la etiqueta, auditado como tag_change con la credencial como actor", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const tagId = await insertTag(agent.organizationId, "Reclamo");

    const added = await send(agent, tagEvent(tagId));
    expect(added).toMatchObject({
      ok: true,
      result: "accepted",
      eventType: "client.tag_added",
    });
    expect(await tagsOf(clientId)).toEqual(["Reclamo"]);

    const removed = await send(agent, tagEvent(tagId, { removed: true }));
    expect(removed).toMatchObject({
      ok: true,
      result: "accepted",
      eventType: "client.tag_removed",
    });
    expect(await tagsOf(clientId)).toEqual([]);

    expect(await auditOf(agent.organizationId)).toEqual([
      {
        entity_id: clientId,
        action: "tag_change",
        actor_user_id: null,
        actor_credential_id: agent.credentialId,
        diff: { before: { tag: null }, after: { tag: "Reclamo" } },
      },
      {
        entity_id: clientId,
        action: "tag_change",
        actor_user_id: null,
        actor_credential_id: agent.credentialId,
        diff: { before: { tag: "Reclamo" }, after: { tag: null } },
      },
    ]);
    expect(
      (await eventsOf(agent.organizationId)).map((row) => row.status),
    ).toEqual(["processed", "processed"]);
  });

  it("un cliente desactivado se puede etiquetar, como en la ficha (D-6)", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    await getDb().execute(
      sql`update clients set is_active = false where id = ${clientId}`,
    );
    const tagId = await insertTag(agent.organizationId, "Reclamo");

    expect(await send(agent, tagEvent(tagId))).toMatchObject({ ok: true });
    expect(await tagsOf(clientId)).toEqual(["Reclamo"]);
  });

  it("D-8: v1 no conoce los tipos nuevos y no escribe nada", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const tagId = await insertTag(agent.organizationId, "Reclamo");

    const result = await recordIngestionEvent(
      agent,
      JSON.stringify(tagEvent(tagId, { version: "1" })),
      RECEIVED_AT,
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(await tagsOf(clientId)).toEqual([]);
    expect(await eventsOf(agent.organizationId)).toEqual([]);
  });
});

describe("D-6: reglas de negocio terminales (AC-2)", () => {
  it("client_not_found: el teléfono no es de ningún cliente; nunca lo crea", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const tagId = await insertTag(agent.organizationId, "Reclamo");
    const payload = tagEvent(tagId);

    const rejected = {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "client_not_found",
      recorded: true,
    };
    expect(await send(agent, payload)).toEqual(rejected);
    const clients = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from clients`,
    );
    expect(clients.rows[0]!.count).toBe(0);

    // Terminal: aunque el cliente ya exista, el reenvío responde la misma regla.
    await insertClient(agent.organizationId, PHONE);
    expect(await send(agent, payload)).toEqual(rejected);
    expect(await eventsOf(agent.organizationId)).toEqual([
      expect.objectContaining({
        status: "failed",
        error_code: "client_not_found",
      }),
    ]);
  });

  it("tag_not_found: inexistente, de otra organización o inactiva al poner", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const other = await organizationWithCredential("Otro", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const foreign = await insertTag(other.organizationId, "Reclamo");
    const inactive = await insertTag(agent.organizationId, "Vieja", false);

    for (const tagId of [randomUUID(), foreign, inactive]) {
      expect(await send(agent, tagEvent(tagId)), tagId).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "tag_not_found",
        recorded: true,
      });
    }
    expect(await tagsOf(clientId)).toEqual([]);
    expect(await auditOf(agent.organizationId)).toEqual([]);
  });

  it("quitar una inactiva que el cliente tiene se acepta, como en la ficha", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const tagId = await insertTag(agent.organizationId, "Vieja");
    await send(agent, tagEvent(tagId));
    await getDb().execute(
      sql`update client_tags set is_active = false where id = ${tagId}`,
    );

    expect(await send(agent, tagEvent(tagId, { removed: true }))).toMatchObject(
      { ok: true, result: "accepted" },
    );
    expect(await tagsOf(clientId)).toEqual([]);
  });

  it(`client_tag_limit: el cliente ya tiene ${MAX_TAGS_PER_CLIENT}`, async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    for (let i = 0; i < MAX_TAGS_PER_CLIENT; i++) {
      const tagId = await insertTag(agent.organizationId, `Etiqueta ${i}`);
      expect(await send(agent, tagEvent(tagId))).toMatchObject({ ok: true });
    }
    const extra = await insertTag(agent.organizationId, "Una más");

    expect(await send(agent, tagEvent(extra))).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "client_tag_limit",
      recorded: true,
    });
    expect(await tagsOf(clientId)).toHaveLength(MAX_TAGS_PER_CLIENT);
  });
});

describe("D-5: resultado y reenvíos (AC-3)", () => {
  it("el estado ya cumplido es accepted sin escribir; el reenvío idéntico es duplicate", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const tagId = await insertTag(agent.organizationId, "Reclamo");

    const first = tagEvent(tagId);
    await send(agent, first);
    // Otro evento que pide lo mismo: ya se cumple.
    expect(await send(agent, tagEvent(tagId))).toMatchObject({
      ok: true,
      result: "accepted",
    });
    // Quitar una que no tiene, también.
    const other = await insertTag(agent.organizationId, "Interesado");
    expect(await send(agent, tagEvent(other, { removed: true }))).toMatchObject(
      { ok: true, result: "accepted" },
    );
    // El reenvío del primero.
    expect(await send(agent, first)).toMatchObject({
      ok: true,
      result: "duplicate",
      eventId: first.event_id,
    });

    expect(await tagsOf(clientId)).toEqual(["Reclamo"]);
    expect(await auditOf(agent.organizationId)).toHaveLength(1);
  });

  it("otro contenido bajo el mismo event_id: 409 event_payload_mismatch, sin escribir", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const reclamo = await insertTag(agent.organizationId, "Reclamo");
    const interesado = await insertTag(agent.organizationId, "Interesado");

    await send(agent, tagEvent(reclamo, { eventId: "evt-mismo" }));
    expect(
      await send(agent, tagEvent(interesado, { eventId: "evt-mismo" })),
    ).toEqual({
      ok: false,
      code: "CONFLICT",
      recorded: false,
      reason: "event_payload_mismatch",
    });
    expect(await tagsOf(clientId)).toEqual(["Reclamo"]);
  });
});

describe("invariante 1: aislamiento", () => {
  it("el teléfono de un cliente de otra organización es client_not_found", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const other = await organizationWithCredential("Otro", "agente");
    const foreignClient = await insertClient(other.organizationId, PHONE);
    const tagId = await insertTag(agent.organizationId, "Reclamo");

    expect(await send(agent, tagEvent(tagId))).toMatchObject({
      rule: "client_not_found",
    });
    expect(await tagsOf(foreignClient)).toEqual([]);
  });
});

describe("invariante 2: la concurrencia de la ficha también vale para el agente (AC-5)", () => {
  it("poner mientras un admin desactiva la etiqueta espera y termina en tag_not_found", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const tagId = await insertTag(agent.organizationId, "Reclamo");

    // Una desactivación en curso, como la de la pantalla 13.
    const release = await hold([
      sql`select id from client_tags where id = ${tagId} for update`,
      sql`update client_tags set is_active = false where id = ${tagId}`,
    ]);
    const sending = send(agent, tagEvent(tagId));
    await waitForLockWaiters(1);
    await release();

    expect(await sending).toMatchObject({ rule: "tag_not_found" });
    expect(await tagsOf(clientId)).toEqual([]);
  });

  it(`un evento y una acción de la ficha simultáneos no pasan juntos el límite de ${MAX_TAGS_PER_CLIENT}`, async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const admin = await adminOf(agent.organizationId, "admin@example.com");
    const clientId = await insertClient(agent.organizationId, PHONE);
    for (let i = 0; i < MAX_TAGS_PER_CLIENT - 1; i++) {
      const tagId = await insertTag(agent.organizationId, `Etiqueta ${i}`);
      await send(agent, tagEvent(tagId));
    }
    const fromAgent = await insertTag(agent.organizationId, "Del agente");
    const fromAdmin = await insertTag(agent.organizationId, "De la ficha");

    const release = await hold([
      sql`select id from clients where id = ${clientId} for update`,
    ]);
    const sending = send(agent, tagEvent(fromAgent));
    const assigning = assignClientTag(admin, clientId, fromAdmin);
    await waitForLockWaiters(2);
    await release();

    const results = [await sending, await assigning];
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await tagsOf(clientId)).toHaveLength(MAX_TAGS_PER_CLIENT);
  });
});

describe("revisión independiente de la 16.2.1, hallazgos 1 y 10", () => {
  // Hallazgo 1: el estado pedido ya cumplido gana sobre las reglas, como en la ficha de la 16.1
  // (D-6: asignar una que ya está no escribe nada y no es un error).
  it("poner una que el cliente ya tiene es accepted, aunque esté inactiva o tenga 10", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const tags: string[] = [];
    for (let i = 0; i < MAX_TAGS_PER_CLIENT; i++) {
      const tagId = await insertTag(agent.organizationId, `Etiqueta ${i}`);
      await send(agent, tagEvent(tagId));
      tags.push(tagId);
    }
    await getDb().execute(
      sql`update client_tags set is_active = false where id = ${tags[0]!}`,
    );

    for (const tagId of [tags[0]!, tags[1]!]) {
      expect(await send(agent, tagEvent(tagId)), tagId).toMatchObject({
        ok: true,
        result: "accepted",
      });
    }
    expect(await auditOf(agent.organizationId)).toHaveLength(
      MAX_TAGS_PER_CLIENT,
    );
    expect(await tagsOf(clientId)).toHaveLength(MAX_TAGS_PER_CLIENT);
  });

  // Hallazgo 10: el reenvío responde la misma regla también para tag_not_found y client_tag_limit,
  // aunque la causa ya no exista.
  it("el reenvío de tag_not_found y de client_tag_limit responde la misma regla", async () => {
    const agent = await organizationWithCredential("Negocio", "agente");
    const clientId = await insertClient(agent.organizationId, PHONE);
    const inactive = await insertTag(agent.organizationId, "Vieja", false);
    const notFound = tagEvent(inactive);
    expect(await send(agent, notFound)).toMatchObject({
      rule: "tag_not_found",
    });
    await getDb().execute(
      sql`update client_tags set is_active = true where id = ${inactive}`,
    );
    expect(await send(agent, notFound)).toMatchObject({
      rule: "tag_not_found",
      recorded: true,
    });

    const full: string[] = [];
    for (let i = 0; i < MAX_TAGS_PER_CLIENT; i++) {
      const tagId = await insertTag(agent.organizationId, `Etiqueta ${i}`);
      await getDb().execute(
        sql`insert into client_tag_assignments (organization_id, client_id, tag_id)
            values (${agent.organizationId}, ${clientId}, ${tagId})`,
      );
      full.push(tagId);
    }
    const extra = await insertTag(agent.organizationId, "Una más");
    const limited = tagEvent(extra);
    expect(await send(agent, limited)).toMatchObject({
      rule: "client_tag_limit",
    });
    await getDb().execute(
      sql`delete from client_tag_assignments where tag_id = ${full[0]!}`,
    );
    expect(await send(agent, limited)).toMatchObject({
      rule: "client_tag_limit",
      recorded: true,
    });
    expect(await tagsOf(clientId)).not.toContain("Una más");
  });
});
