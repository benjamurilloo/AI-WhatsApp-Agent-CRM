import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  recordIngestionEvent,
  type IngestionContext,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Los dos bordes de concurrencia que la revisión de la 12.2 dejó registrados sin demostrar (R-8),
// contra PostgreSQL real (brief-13.2, D-5 y AC-7). Estos casos **describen lo que pasa hoy**: no
// fijan que esté bien. Qué se hace con cada uno lo decide el usuario con el resultado a la vista.
//
// Cómo se fuerza cada borde sin depender del azar: una conexión aparte retiene un bloqueo sobre
// algo que la resolución necesita **después** de bloquear al cliente. Así la resolución queda
// detenida a mitad de su transacción, con el bloqueo del cliente tomado por el código real, y se
// mira en `pg_stat_activity` quién espera a quién antes de soltar (convención de la 4.3.2).
//
// Lo que estos casos no son: una prueba de carga. Son tres conexiones, en un orden fijado.

const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v1");
const TEST_TIMEOUT = 20000;
const HOUR_MS = 60 * 60 * 1000;

function fixture(name: string) {
  const data = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return { payload: data.payload, receivedAt: new Date(data.received_at) };
}

const resolved = fixture("valid-conversation-resolved.json");
const recorded = fixture("valid-inbound-with-client.json");
const RECEIVED_AT = resolved.receivedAt;
const PHONE: string = resolved.payload.conversation.client_phone;
const SENT_AT = new Date(resolved.payload.message.sent_at);

function send(context: IngestionContext, payload: unknown) {
  return recordIngestionEvent(context, JSON.stringify(payload), RECEIVED_AT);
}

// conversation.resolved del cliente, con su propia referencia propuesta.
function resolution(n: number) {
  const payload = structuredClone(resolved.payload);
  payload.event_id = `evt-r8-resuelta-${n}`;
  payload.conversation.external_ref = `conv-r8-propuesta-${n}`;
  payload.message.external_ref = `msg-r8-resuelta-${n}`;
  return payload;
}

// message.recorded del mismo teléfono hacia una conversación que no existe: la crea, con el
// cliente, y por eso necesita la fila del cliente para su clave foránea.
function recording(n: number) {
  const payload = structuredClone(recorded.payload);
  payload.event_id = `evt-r8-registrado-${n}`;
  payload.conversation.external_ref = `conv-r8-registrada-${n}`;
  payload.conversation.client_phone = PHONE;
  payload.message.external_ref = `msg-r8-registrado-${n}`;
  return payload;
}

async function organizationWithCredential() {
  const organization = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${"Negocio R-8"}) returning id`,
  );
  const organizationId = organization.rows[0]!.id;
  const credential = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${organizationId}, ${"emisor-r8"}, 'ingest', ${randomUUID()}) returning id`,
  );
  return {
    organizationId,
    source: "emisor-r8",
    credentialId: credential.rows[0]!.id,
  } satisfies IngestionContext;
}

async function insertClient(organizationId: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${organizationId}, ${"María"}, ${PHONE}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertConversation(
  organizationId: string,
  clientId: string,
  externalRef: string,
  lastMessageAt: Date,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, external_ref, status, started_at, last_message_at)
        values (${organizationId}, ${clientId}, 'whatsapp', ${externalRef}, 'open',
          ${lastMessageAt}, ${lastMessageAt})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function conversationsOf(organizationId: string) {
  const result = await getDb().execute<{
    external_ref: string;
    status: string;
    messages: number;
  }>(
    sql`select c.external_ref, c.status::text as status,
               (select count(*)::int from messages m where m.conversation_id = c.id) as messages
          from conversations c where c.organization_id = ${organizationId}
         order by c.external_ref`,
  );
  return result.rows;
}

// Una conexión aparte corre `statement` dentro de una transacción y la retiene hasta que se
// llame a la función que devuelve.
async function hold(statement: ReturnType<typeof sql>) {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await tx.execute(statement);
    taken();
    await released;
  });
  await lockTaken;
  return async () => {
    release();
    await holder;
  };
}

type Waiter = { pid: number; query: string; blockedBy: number[] };

// Las conexiones que esperan un bloqueo, con lo que corren y quién las bloquea.
async function waiters(count: number, timeoutMs = 5000): Promise<Waiter[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: Waiter[] = [];
  while (Date.now() < deadline) {
    const result = await getDb().execute<{
      pid: number;
      query: string;
      blocked_by: number[];
    }>(
      sql`select pid, query, pg_blocking_pids(pid) as blocked_by
            from pg_stat_activity
           where datname = current_database() and wait_event_type = ${"Lock"}
           order by query_start`,
    );
    rows = result.rows.map((row) => ({
      pid: row.pid,
      query: row.query,
      blockedBy: row.blocked_by,
    }));
    if (rows.length === count) return rows;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${count} conexiones en un bloqueo y hay ${rows.length}`,
  );
}

// Cuánto se espera para afirmar que algo **no** quedó bloqueado. Un bloqueo aparece en decenas de
// milisegundos; medio segundo sin verlo alcanza para los casos de acá.
async function settlesWithin<T>(promise: Promise<T>, ms = 3000) {
  return Promise.race([
    promise.then((value) => ({ settled: true as const, value })),
    new Promise<{ settled: false }>((resolve) =>
      setTimeout(() => resolve({ settled: false }), ms),
    ),
  ]);
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("R-8, borde 1: el bloqueo del cliente y una conversación nueva del mismo cliente", () => {
  // La resolución bloquea al cliente con FOR UPDATE. Crear una conversación con ese cliente toma
  // FOR KEY SHARE sobre su fila, por la clave foránea, y FOR UPDATE es el único modo de fila que
  // choca con FOR KEY SHARE. Con FOR NO KEY UPDATE, el registro no esperaría.
  it(
    "hoy, un message.recorded que crea una conversación del mismo cliente espera a la resolución en curso",
    async () => {
      const context = await organizationWithCredential();
      const clientId = await insertClient(context.organizationId);
      const vigente = await insertConversation(
        context.organizationId,
        clientId,
        "conv-r8-vigente",
        new Date(SENT_AT.getTime() - HOUR_MS),
      );

      // La candidata retenida detiene a la resolución después de que bloqueó al cliente.
      const release = await hold(
        sql`select id from conversations where id = ${vigente} for update`,
      );
      const resolving = send(context, resolution(1));
      const [resolver] = await waiters(1);
      expect(resolver!.query).toMatch(/from conversations/i);
      expect(resolver!.query).toMatch(/for update/i);

      const recordingResult = send(context, recording(1));
      const both = await waiters(2);
      const recorder = both.find((w) => w.pid !== resolver!.pid)!;
      // Lo que espera es el alta de la conversación, y a quien espera es a la resolución.
      expect(recorder.query).toMatch(/insert into "?conversations"?/i);
      expect(recorder.blockedBy).toEqual([resolver!.pid]);

      await release();
      const [resolution1, recording1] = await Promise.all([
        resolving,
        recordingResult,
      ]);

      // Nadie pierde nada: los dos terminan bien, cada mensaje en su conversación.
      expect(resolution1).toMatchObject({ ok: true, result: "accepted" });
      expect(recording1).toMatchObject({ ok: true, result: "accepted" });
      expect(await conversationsOf(context.organizationId)).toEqual([
        { external_ref: "conv-r8-registrada-1", status: "open", messages: 1 },
        { external_ref: "conv-r8-vigente", status: "open", messages: 1 },
      ]);
    },
    TEST_TIMEOUT,
  );

  // El control del caso anterior: que lo que hace esperar al registro es el **modo** del bloqueo y
  // no otra cosa. Con el cliente retenido en FOR NO KEY UPDATE, el mismo registro termina sin
  // esperar. La sentencia del que retiene es una copia, no el código: acá no hay otra forma de
  // probar un modo que el código no usa.
  it(
    "con el cliente retenido en FOR NO KEY UPDATE, el mismo message.recorded no espera",
    async () => {
      const context = await organizationWithCredential();
      const clientId = await insertClient(context.organizationId);
      const release = await hold(
        sql`select id from clients where id = ${clientId} for no key update`,
      );

      const outcome = await settlesWithin(send(context, recording(1)));
      await release();

      expect(outcome.settled).toBe(true);
      expect(outcome).toMatchObject({
        value: { ok: true, result: "accepted" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "y retenido en FOR UPDATE, que es el modo de hoy, sí espera",
    async () => {
      const context = await organizationWithCredential();
      const clientId = await insertClient(context.organizationId);
      const release = await hold(
        sql`select id from clients where id = ${clientId} for update`,
      );

      const pending = send(context, recording(1));
      const [waiting] = await waiters(1);
      expect(waiting!.query).toMatch(/insert into "?conversations"?/i);
      await release();

      expect(await pending).toMatchObject({ ok: true, result: "accepted" });
    },
    TEST_TIMEOUT,
  );
});

describe("R-8, borde 2: un admin cierra la candidata mientras la resolución la espera", () => {
  // El cierre es una copia de lo que hace `changeConversationStatus`, que es un UPDATE del estado:
  // el servicio real no se puede detener a mitad de su transacción.
  it(
    "con una sola candidata, el mensaje abre una conversación nueva",
    async () => {
      const context = await organizationWithCredential();
      const clientId = await insertClient(context.organizationId);
      const vigente = await insertConversation(
        context.organizationId,
        clientId,
        "conv-r8-vigente",
        new Date(SENT_AT.getTime() - HOUR_MS),
      );

      const commitClose = await hold(
        sql`update conversations set status = 'closed' where id = ${vigente}`,
      );
      const resolving = send(context, resolution(1));
      await waiters(1);
      await commitClose();

      expect(await resolving).toMatchObject({
        ok: true,
        result: "accepted",
        conversation: { externalRef: "conv-r8-propuesta-1" },
      });
      // Una conversación cerrada no es vigente: abrir otra es lo que corresponde.
      expect(await conversationsOf(context.organizationId)).toEqual([
        { external_ref: "conv-r8-propuesta-1", status: "open", messages: 1 },
        { external_ref: "conv-r8-vigente", status: "closed", messages: 0 },
      ]);
    },
    TEST_TIMEOUT,
  );

  // El caso que R-8 temía: hay **otra** conversación vigente, más lejana. Si `limit 1 for update`
  // devolviera cero filas al descartar la candidata cerrada, el mensaje abriría una tercera
  // conversación teniendo una vigente a mano.
  it(
    "con dos candidatas, al cerrarse la más cercana el mensaje va a la otra",
    async () => {
      const context = await organizationWithCredential();
      const clientId = await insertClient(context.organizationId);
      const cercana = await insertConversation(
        context.organizationId,
        clientId,
        "conv-r8-cercana",
        new Date(SENT_AT.getTime() - HOUR_MS),
      );
      await insertConversation(
        context.organizationId,
        clientId,
        "conv-r8-lejana",
        new Date(SENT_AT.getTime() - 10 * HOUR_MS),
      );

      const commitClose = await hold(
        sql`update conversations set status = 'closed' where id = ${cercana}`,
      );
      const resolving = send(context, resolution(1));
      await waiters(1);
      await commitClose();

      const result = await resolving;
      expect(result).toMatchObject({ ok: true, result: "accepted" });
      expect(await conversationsOf(context.organizationId)).toEqual([
        { external_ref: "conv-r8-cercana", status: "closed", messages: 0 },
        { external_ref: "conv-r8-lejana", status: "open", messages: 1 },
      ]);
    },
    TEST_TIMEOUT,
  );
});
