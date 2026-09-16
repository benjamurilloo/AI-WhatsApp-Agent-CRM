import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { login } from "@/modules/auth";
import { createDb, getDb } from "@/shared/db";
import { SEED_ORGANIZATION_ID, seedBasic } from "../../seeds/basic";
import {
  MARKUP_BODY,
  SEED_CLIENTS,
  SEED_CONVERSATIONS,
  seedClientId,
  seedConversationId,
  seedConversations,
} from "../../seeds/conversations";
import {
  seedVolume,
  VOLUME_ORGANIZATION_ID,
  VOLUME_USER,
} from "../../seeds/volume";
import { resetDatabase } from "./reset-database";
import { maintenanceUrl } from "./test-database";

// Seeds de conversaciones y de volumen contra PostgreSQL real (brief-6.2), con fecha fija.

const PASSWORD = "contraseña-del-seed-larga";
const REFERENCE_DATE = "2026-09-16";
const VOLUME_SIZE = 60;

const totalSeedMessages = SEED_CONVERSATIONS.reduce(
  (sum, conversation) => sum + conversation.messages.length,
  0,
);

async function countIn(table: string, organizationId: string) {
  const result = await getDb().execute<{ count: number }>(
    sql`select count(*)::int as count from ${sql.identifier(table)}
        where organization_id = ${organizationId}`,
  );
  return result.rows[0]!.count;
}

// Conversaciones cuyo inicio o último mensaje no coinciden con sus mensajes, o que no tienen ninguno.
async function brokenConversations() {
  const result = await getDb().execute<{ id: string }>(
    sql`select c.id from conversations c
        left join lateral (
          select min(m.sent_at) as first_at, max(m.sent_at) as last_at, count(*) as total
          from messages m where m.conversation_id = c.id
        ) s on true
        where s.total = 0
           or c.started_at <> s.first_at
           or c.last_message_at is distinct from s.last_at
        order by c.id`,
  );
  return result.rows.map((row) => row.id);
}

// Huella de las filas de una organización, para comparar dos corridas.
async function fingerprint(organizationId: string) {
  const result = await getDb().execute<{ digest: string }>(
    sql`select md5(concat_ws('|',
          (select string_agg(concat_ws(',', id, display_name, phone_e164, is_active), ';' order by id)
             from clients where organization_id = ${organizationId}),
          (select string_agg(concat_ws(',', id, client_id, status, started_at, last_message_at), ';' order by id)
             from conversations where organization_id = ${organizationId}),
          (select string_agg(concat_ws(',', id, conversation_id, direction, sent_at, body_text), ';' order by id)
             from messages where organization_id = ${organizationId})
        )) as digest`,
  );
  return result.rows[0]!.digest;
}

async function seedAll() {
  await seedBasic(getDb(), PASSWORD);
  await seedConversations(getDb(), { referenceDate: REFERENCE_DATE });
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("seed de conversaciones", () => {
  it("crea los clientes, las conversaciones y los mensajes de ejemplo en la organización del seed", async () => {
    await seedAll();
    expect(await countIn("clients", SEED_ORGANIZATION_ID)).toBe(
      SEED_CLIENTS.length,
    );
    expect(await countIn("conversations", SEED_ORGANIZATION_ID)).toBe(
      SEED_CONVERSATIONS.length,
    );
    expect(await countIn("messages", SEED_ORGANIZATION_ID)).toBe(
      totalSeedMessages,
    );
    const summary = await getDb().execute<{
      status: string;
      without_client: number;
      total: number;
    }>(
      sql`select status, count(*) filter (where client_id is null)::int as without_client,
                 count(*)::int as total
          from conversations group by status order by status`,
    );
    expect(summary.rows).toEqual([
      { status: "open", without_client: 1, total: 4 },
      { status: "pending", without_client: 0, total: 2 },
      { status: "closed", without_client: 1, total: 4 },
    ]);
    const inactive = await getDb().execute<{ id: string }>(
      sql`select c.id from conversations c join clients k on k.id = c.client_id
          where not k.is_active`,
    );
    expect(inactive.rows).toHaveLength(1);
  });

  it("cumple los invariantes de inicio y último mensaje", async () => {
    await seedAll();
    expect(await brokenConversations()).toEqual([]);
  });

  it("la verificación de invariantes detecta un inicio corrido", async () => {
    await seedAll();
    await getDb().execute(
      sql`update conversations set started_at = started_at - interval '1 minute'
          where id = ${seedConversationId(0)}`,
    );
    expect(await brokenConversations()).toEqual([seedConversationId(0)]);
  });

  it("siembra los bordes de zona horaria", async () => {
    await seedAll();
    // Un mensaje de las 22:45 locales cae en UTC al día siguiente.
    const night = await getDb().execute<{ local_day: string; utc_day: string }>(
      sql`select (sent_at at time zone 'America/Argentina/Buenos_Aires')::date::text as local_day,
                 (sent_at at time zone 'UTC')::date::text as utc_day
          from messages where body_text like 'Mensaje nocturno%'`,
    );
    expect(night.rows).toEqual([
      { local_day: "2026-09-10", utc_day: "2026-09-11" },
    ]);
    // El 19/10/2008 de Buenos Aires duró 23 horas, y la conversación tiene mensajes ese día.
    const dst = await getDb().execute<{ hours: number; messages: number }>(
      sql`select extract(epoch from (
                   ('2008-10-20'::timestamp at time zone 'America/Argentina/Buenos_Aires')
                 - ('2008-10-19'::timestamp at time zone 'America/Argentina/Buenos_Aires')
                 ))::int / 3600 as hours,
                 (select count(*)::int from messages
                  where sent_at >= '2008-10-19'::timestamp at time zone 'America/Argentina/Buenos_Aires'
                    and sent_at < '2008-10-20'::timestamp at time zone 'America/Argentina/Buenos_Aires') as messages`,
    );
    expect(dst.rows).toEqual([{ hours: 23, messages: 2 }]);
    // Una conversación cruza la medianoche local.
    const crossing = await getDb().execute<{ days: number }>(
      sql`select count(distinct (sent_at at time zone 'America/Argentina/Buenos_Aires')::date)::int as days
          from messages where conversation_id = ${seedConversationId(5)}`,
    );
    expect(crossing.rows).toEqual([{ days: 2 }]);
  });

  it("guarda tal cual los cuerpos con marcado, nulos, largos y con emojis", async () => {
    await seedAll();
    const bodies = await getDb().execute<{ body_text: string | null }>(
      sql`select body_text from messages where conversation_id = ${seedConversationId(7)}
          order by sent_at`,
    );
    const values = bodies.rows.map((row) => row.body_text);
    expect(values[0]).toBe(MARKUP_BODY);
    expect(values[2]).toBeNull();
    expect(values[3]!.length).toBeGreaterThan(1000);
    expect(values[4]).toContain("😊");
  });

  it("es idempotente: repone el estado y los clientes y no agrega filas", async () => {
    await seedAll();
    const before = await fingerprint(SEED_ORGANIZATION_ID);
    await getDb().execute(
      sql`update conversations set status = 'closed' where id = ${seedConversationId(0)}`,
    );
    await getDb().execute(
      sql`update clients set display_name = 'Otro', is_active = false where id = ${seedClientId(0)}`,
    );
    await seedConversations(getDb(), { referenceDate: REFERENCE_DATE });
    expect(await fingerprint(SEED_ORGANIZATION_ID)).toBe(before);
  });

  it("con otra fecha de referencia no mueve mensajes ni fechas (D-2)", async () => {
    await seedAll();
    const before = await fingerprint(SEED_ORGANIZATION_ID);
    await seedConversations(getDb(), { referenceDate: "2026-12-01" });
    expect(await fingerprint(SEED_ORGANIZATION_ID)).toBe(before);
    expect(await brokenConversations()).toEqual([]);
  });

  it("sin el seed básico falla sin escribir nada", async () => {
    await expect(
      seedConversations(getDb(), { referenceDate: REFERENCE_DATE }),
    ).rejects.toThrow("seedBasic");
    expect(await countIn("clients", SEED_ORGANIZATION_ID)).toBe(0);
  });
});

describe("seed de volumen", () => {
  it("crea su organización, su admin y los datos del tamaño pedido, con los invariantes", async () => {
    const counts = await seedVolume(getDb(), PASSWORD, {
      size: VOLUME_SIZE,
      referenceDate: REFERENCE_DATE,
    });
    expect(counts.clients).toBe(VOLUME_SIZE);
    expect(counts.conversations).toBe(VOLUME_SIZE);
    expect(counts.messages).toBeGreaterThanOrEqual(VOLUME_SIZE);
    expect(counts.messages).toBeLessThanOrEqual(VOLUME_SIZE * 12);
    expect(await brokenConversations()).toEqual([]);

    const spread = await getDb().execute<{
      without_client: number;
      statuses: number;
      before_reference: boolean;
    }>(
      sql`select count(*) filter (where client_id is null)::int as without_client,
                 count(distinct status)::int as statuses,
                 bool_and(last_message_at < '2026-09-16'::timestamp at time zone 'America/Argentina/Buenos_Aires') as before_reference
          from conversations where organization_id = ${VOLUME_ORGANIZATION_ID}`,
    );
    expect(spread.rows[0]!.without_client).toBeGreaterThan(0);
    expect(spread.rows[0]!.statuses).toBe(3);
    expect(spread.rows[0]!.before_reference).toBe(true);

    // Nada del volumen apunta a otra organización ni cae en la del seed básico.
    expect(await countIn("clients", SEED_ORGANIZATION_ID)).toBe(0);
    await expect(
      login({ email: VOLUME_USER.email, password: PASSWORD, ip: null }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("es determinista y no se pisa con el seed de conversaciones", async () => {
    const options = { size: VOLUME_SIZE, referenceDate: REFERENCE_DATE };
    await seedVolume(getDb(), PASSWORD, options);
    const first = await fingerprint(VOLUME_ORGANIZATION_ID);

    await resetDatabase(getDb());
    await seedAll();
    await seedVolume(getDb(), PASSWORD, options);
    expect(await fingerprint(VOLUME_ORGANIZATION_ID)).toBe(first);
    expect(await countIn("conversations", SEED_ORGANIZATION_ID)).toBe(
      SEED_CONVERSATIONS.length,
    );

    // Una segunda corrida, aun con otra fecha, no agrega ni cambia filas.
    await seedVolume(getDb(), PASSWORD, {
      ...options,
      referenceDate: "2026-12-01",
    });
    expect(await fingerprint(VOLUME_ORGANIZATION_ID)).toBe(first);
  });

  it("un tamaño mayor conserva las filas existentes y mantiene los invariantes", async () => {
    await seedVolume(getDb(), PASSWORD, {
      size: 20,
      referenceDate: REFERENCE_DATE,
    });
    await seedVolume(getDb(), PASSWORD, {
      size: 40,
      referenceDate: "2026-10-01",
    });
    expect(await countIn("conversations", VOLUME_ORGANIZATION_ID)).toBe(40);
    expect(await brokenConversations()).toEqual([]);
  });

  it("rechaza un tamaño inválido y una contraseña corta", async () => {
    await expect(seedVolume(getDb(), PASSWORD, { size: 0 })).rejects.toThrow(
      "entero positivo",
    );
    await expect(seedVolume(getDb(), "corta")).rejects.toThrow(
      "al menos 12 caracteres",
    );
    expect(await countIn("clients", VOLUME_ORGANIZATION_ID)).toBe(0);
  });
});

describe("seeds fuera de una base sembrable", () => {
  it("ninguno corre contra una base que no es _dev, _test ni _e2e", async () => {
    const maintenance = createDb(maintenanceUrl(process.env.DATABASE_URL!));
    try {
      await expect(seedConversations(maintenance)).rejects.toThrow(
        'no contra "postgres"',
      );
      await expect(seedVolume(maintenance, PASSWORD)).rejects.toThrow(
        'no contra "postgres"',
      );
      const tables = await maintenance.execute<{ count: number }>(
        sql`select count(*)::int as count from pg_tables
            where schemaname = 'public' and tablename in ('organizations', 'clients')`,
      );
      expect(tables.rows[0]!.count).toBe(0);
    } finally {
      await maintenance.$client.end();
    }
  });
});
