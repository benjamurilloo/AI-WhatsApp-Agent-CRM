import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  changeAgentPause,
  changeConversationStatus,
  getConversation,
  listConversations,
} from "@/modules/conversations";
import {
  recordIngestionEventV2,
  type IngestionContext,
} from "@/modules/ingestion";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Pausa del agente contra PostgreSQL real (brief-16.3; FR-CONV-06): pausar y reanudar solo como
// admin y en su organización, auditado como agent_pause_change; una cerrada no se pausa; repetir no
// escribe; la pausa no toca el estado y la derivación ni el cambio de estado tocan la pausa; y un
// mensaje del agente en una conversación pausada se registra igual (D-7). Los eventos salen de los
// fixtures de ingestión v2, con forma asumida.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 20000;
const PAUSED_AT = new Date("2026-09-16T14:30:00.000Z");
const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v2");
let storedHash: string;

function fixture(name: string) {
  const data = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return {
    payload: data.payload as { conversation: { external_ref: string } },
    receivedAt: new Date(data.received_at),
  };
}

const escalated = fixture("valid-conversation-escalated.json");
const agentMessage = fixture("valid-message-recorded-agent.json");
const REF = escalated.payload.conversation.external_ref;

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

async function ingestCredential(organizationId: string) {
  const credential = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${organizationId}, 'agente-whatsapp', 'ingest', ${randomUUID()}) returning id`,
  );
  return {
    organizationId,
    source: "agente-whatsapp",
    credentialId: credential.rows[0]!.id,
  } satisfies IngestionContext;
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

// Conversación con la referencia del emisor: fixture sintético por SQL.
async function insertConversation(
  organizationId: string,
  status: "open" | "pending" | "closed" = "open",
  externalRef: string = REF,
) {
  const at = new Date("2026-09-16T14:00:00.000Z");
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, channel, external_ref, status, started_at, last_message_at)
        values (${organizationId}, 'whatsapp', ${externalRef}, ${status}, ${at}, ${at})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function stateOf(conversationId: string) {
  const result = await getDb().execute<{
    status: string;
    agent_paused_at: Date | null;
  }>(
    sql`select status, agent_paused_at from conversations where id = ${conversationId}`,
  );
  const row = result.rows[0]!;
  return {
    status: row.status,
    pausedAt:
      row.agent_paused_at === null
        ? null
        : new Date(row.agent_paused_at).toISOString(),
  };
}

async function pauseAudit(organizationId: string) {
  const result = await getDb().execute<{
    entity_type: string;
    entity_id: string;
    actor_user_id: string | null;
    actor_credential_id: string | null;
    diff: unknown;
  }>(
    sql`select entity_type, entity_id, actor_user_id, actor_credential_id, diff
        from audit_logs
        where organization_id = ${organizationId} and action = 'agent_pause_change'
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

describe("changeAgentPause (FR-CONV-06)", { timeout: TEST_TIMEOUT }, () => {
  it("AC-1 y AC-2: un admin pausa y reanuda una open y una pending, sin tocar el estado, auditado con su diff; repetir no escribe", async () => {
    const s = await seed();
    for (const status of ["open", "pending"] as const) {
      const id = await insertConversation(s.orgA, status, `conv-${status}`);

      expect(
        await changeAgentPause(
          s.adminA,
          { conversationId: id, action: "pause" },
          PAUSED_AT,
        ),
      ).toEqual({ ok: true, changed: true });
      expect(await stateOf(id)).toEqual({
        status,
        pausedAt: PAUSED_AT.toISOString(),
      });

      // Repetir conserva la hora original y no audita.
      expect(
        await changeAgentPause(
          s.adminA,
          { conversationId: id, action: "pause" },
          new Date("2026-09-16T18:00:00.000Z"),
        ),
      ).toEqual({ ok: true, changed: false });
      expect((await stateOf(id)).pausedAt).toBe(PAUSED_AT.toISOString());

      expect(
        await changeAgentPause(s.adminA, {
          conversationId: id,
          action: "resume",
        }),
      ).toEqual({ ok: true, changed: true });
      expect(
        await changeAgentPause(s.adminA, {
          conversationId: id,
          action: "resume",
        }),
      ).toEqual({ ok: true, changed: false });
      expect(await stateOf(id)).toEqual({ status, pausedAt: null });
    }

    const audit = await pauseAudit(s.orgA);
    expect(audit).toHaveLength(4);
    for (const [index, row] of audit.entries()) {
      const pause = index % 2 === 0;
      expect(row).toMatchObject({
        entity_type: "conversation",
        actor_user_id: s.adminA.userId,
        actor_credential_id: null,
        diff: {
          before: { agentPaused: !pause },
          after: { agentPaused: pause },
        },
      });
    }
  });

  it("AC-1 (D-5): pausar una cerrada se rechaza sin escribir; reanudar una cerrada pausada se puede", async () => {
    const s = await seed();
    const closed = await insertConversation(s.orgA, "closed", "conv-cerrada");
    expect(
      await changeAgentPause(s.adminA, {
        conversationId: closed,
        action: "pause",
      }),
    ).toEqual({ ok: false, code: "BUSINESS_RULE_VIOLATION" });
    expect(await stateOf(closed)).toEqual({
      status: "closed",
      pausedAt: null,
    });
    expect(await pauseAudit(s.orgA)).toEqual([]);

    // Cerrar una pausada no quita la marca, y reanudarla después se puede.
    const id = await insertConversation(s.orgA, "open");
    await changeAgentPause(
      s.adminA,
      { conversationId: id, action: "pause" },
      PAUSED_AT,
    );
    await changeConversationStatus(s.adminA, {
      conversationId: id,
      status: "closed",
    });
    expect(await stateOf(id)).toEqual({
      status: "closed",
      pausedAt: PAUSED_AT.toISOString(),
    });
    expect(
      await changeAgentPause(s.adminA, {
        conversationId: id,
        action: "resume",
      }),
    ).toEqual({ ok: true, changed: true });
    expect(await stateOf(id)).toEqual({ status: "closed", pausedAt: null });

    // Pausar una cerrada que ya estaba pausada es una repetición: no escribe, no audita y no se
    // rechaza (revisión independiente, R-4).
    const pausedClosed = await insertConversation(
      s.orgA,
      "open",
      "conv-pausada-cerrada",
    );
    await changeAgentPause(
      s.adminA,
      { conversationId: pausedClosed, action: "pause" },
      PAUSED_AT,
    );
    await changeConversationStatus(s.adminA, {
      conversationId: pausedClosed,
      status: "closed",
    });
    const audited = (await pauseAudit(s.orgA)).length;
    expect(
      await changeAgentPause(s.adminA, {
        conversationId: pausedClosed,
        action: "pause",
      }),
    ).toEqual({ ok: true, changed: false });
    expect(await stateOf(pausedClosed)).toEqual({
      status: "closed",
      pausedAt: PAUSED_AT.toISOString(),
    });
    expect(await pauseAudit(s.orgA)).toHaveLength(audited);
  });

  it("AC-3: viewer y contraseña pendiente dan FORBIDDEN; otra organización, NOT_FOUND; nada se escribe", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA);
    for (const action of ["pause", "resume"]) {
      for (const context of [s.viewerA, s.pendingA]) {
        expect(
          await changeAgentPause(context, { conversationId: id, action }),
        ).toEqual({ ok: false, code: "FORBIDDEN" });
      }
      expect(
        await changeAgentPause(s.adminB, { conversationId: id, action }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
    }
    expect(await stateOf(id)).toEqual({ status: "open", pausedAt: null });
    expect(await pauseAudit(s.orgA)).toEqual([]);
    expect(await pauseAudit(s.orgB)).toEqual([]);
  });

  it("AC-3: la marca solo se ve en la organización de la conversación, y la ve también un viewer", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA);
    await insertConversation(s.orgB, "open", "conv-de-b");
    await changeAgentPause(
      s.adminA,
      { conversationId: id, action: "pause" },
      PAUSED_AT,
    );

    const detail = await getConversation(s.viewerA, id);
    if (!detail.ok) throw new Error(detail.code);
    expect(detail.conversation.agentPausedAt?.toISOString()).toBe(
      PAUSED_AT.toISOString(),
    );
    expect(await getConversation(s.adminB, id)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });

    const listA = await listConversations(s.viewerA, {
      from: "",
      to: "",
      status: "all",
      channel: "all",
      clientId: "",
      page: 1,
    });
    if (!listA.ok) throw new Error(listA.code);
    expect(
      listA.conversations.map((c) => [c.id, c.agentPausedAt?.toISOString()]),
    ).toEqual([[id, PAUSED_AT.toISOString()]]);
    const listB = await listConversations(s.adminB, {
      from: "",
      to: "",
      status: "all",
      channel: "all",
      clientId: "",
      page: 1,
    });
    if (!listB.ok) throw new Error(listB.code);
    expect(listB.conversations.map((c) => c.agentPausedAt)).toEqual([null]);
  });

  it("rechaza una acción desconocida y un id inválido", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA);
    expect(
      await changeAgentPause(s.adminA, { conversationId: id, action: "stop" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["action"] });
    expect(
      await changeAgentPause(s.adminA, {
        conversationId: "x",
        action: "pause",
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("si falla la auditoría, la marca no cambia", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA);
    // Un actor inexistente hace fallar la clave foránea de audit_logs después del UPDATE.
    const ghost: AuthContext = { ...s.adminA, userId: randomUUID() };
    await expect(
      changeAgentPause(ghost, { conversationId: id, action: "pause" }),
    ).rejects.toThrow();
    expect(await stateOf(id)).toEqual({ status: "open", pausedAt: null });
  });
});

describe(
  "la pausa y el estado son independientes (invariante 1)",
  { timeout: TEST_TIMEOUT },
  () => {
    it("AC-4: conversation.escalated pasa una pausada a pending y la deja pausada", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA, "open");
      await changeAgentPause(
        s.adminA,
        { conversationId: id, action: "pause" },
        PAUSED_AT,
      );
      const credential = await ingestCredential(s.orgA);

      const result = await recordIngestionEventV2(
        credential,
        JSON.stringify(escalated.payload),
        escalated.receivedAt,
      );
      expect(result).toMatchObject({
        ok: true,
        result: "accepted",
        conversation: { externalRef: REF, status: "pending" },
      });
      expect(await stateOf(id)).toEqual({
        status: "pending",
        pausedAt: PAUSED_AT.toISOString(),
      });
    });

    it("AC-4: cambiar el estado desde la pantalla 9 no toca la marca, en ningún sentido", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA, "open");
      await changeAgentPause(
        s.adminA,
        { conversationId: id, action: "pause" },
        PAUSED_AT,
      );
      for (const status of ["pending", "open", "closed", "open"]) {
        await changeConversationStatus(s.adminA, {
          conversationId: id,
          status,
        });
        expect(await stateOf(id)).toEqual({
          status,
          pausedAt: PAUSED_AT.toISOString(),
        });
      }
      // Y una activa sigue activa al cambiar de estado.
      const active = await insertConversation(s.orgA, "open", "conv-activa");
      await changeConversationStatus(s.adminA, {
        conversationId: active,
        status: "pending",
      });
      expect(await stateOf(active)).toEqual({
        status: "pending",
        pausedAt: null,
      });
    });

    it("D-7: un mensaje del agente en una conversación pausada se registra igual y la marca sigue", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA, "open");
      await changeAgentPause(
        s.adminA,
        { conversationId: id, action: "pause" },
        PAUSED_AT,
      );
      const credential = await ingestCredential(s.orgA);

      const result = await recordIngestionEventV2(
        credential,
        JSON.stringify(agentMessage.payload),
        agentMessage.receivedAt,
      );
      expect(result).toMatchObject({ ok: true, result: "accepted" });
      const recorded = await getDb().execute<{ sent_by: string }>(
        sql`select sent_by from messages where conversation_id = ${id}`,
      );
      expect(recorded.rows).toEqual([{ sent_by: "agent" }]);
      expect(await stateOf(id)).toEqual({
        status: "open",
        pausedAt: PAUSED_AT.toISOString(),
      });
    });
  },
);
