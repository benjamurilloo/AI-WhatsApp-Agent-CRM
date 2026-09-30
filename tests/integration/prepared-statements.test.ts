import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listRecentMessagesForService } from "@/modules/conversations";
import { recordIngestionEvent } from "@/modules/ingestion";
import { searchCatalogForService } from "@/modules/inventory";
import { listCurrentEntriesForService } from "@/modules/knowledge";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Las consultas de la aplicación no dejan sentencias preparadas con nombre (brief-13.2, AC-1; O-2
// de la evaluación 10.1), comprobado por efecto contra PostgreSQL real.
//
// Por qué importa: los planes del proyecto se midieron como planes *custom*, calculados con los
// valores de cada ejecución. Una sentencia preparada **con nombre** puede pasar, después de cinco
// ejecuciones, a un plan *genérico* que no mira los valores. La lectura de `pg` y de
// `drizzle-orm` instalados dice que la aplicación no usa ninguna (brief-13.2, H-1); esto lo
// comprueba del lado del servidor, que es donde la lectura no llega.
//
// `pg_prepared_statements` es una vista **por conexión**: por eso se miran todas las conexiones
// del pool, y no una consulta suelta que cae en cualquiera.

const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v1");
// Más de cinco: es el umbral a partir del cual PostgreSQL considera el plan genérico.
const REPETICIONES = 7;

type Prepared = {
  name: string;
  generic_plans: number;
  custom_plans: number;
};

// Lo que cada conexión del pool tiene preparado. Las toma todas a la vez, para no mirar dos
// veces la misma.
async function preparedInEveryConnection(): Promise<Prepared[][]> {
  const pool = getDb().$client;
  const clients = await Promise.all(
    Array.from({ length: pool.totalCount }, () => pool.connect()),
  );
  try {
    return await Promise.all(
      clients.map(async (client) => {
        const result = await client.query<Prepared>(
          `select name, generic_plans::int as generic_plans, custom_plans::int as custom_plans
             from pg_prepared_statements order by name`,
        );
        return result.rows;
      }),
    );
  } finally {
    for (const client of clients) client.release();
  }
}

async function organization() {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${"Negocio de prueba"}) returning id`,
  );
  return result.rows[0]!.id;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("sentencias preparadas con nombre (O-2)", () => {
  it("el servidor usa el modo de plan por defecto", async () => {
    const result = await getDb().execute<{ plan_cache_mode: string }>(
      sql`show plan_cache_mode`,
    );
    expect(result.rows[0]!.plan_cache_mode).toBe("auto");
  });

  it("las lecturas y una escritura de la aplicación, repetidas, no dejan ninguna", async () => {
    const organizationId = await organization();
    const credential = await getDb().execute<{ id: string }>(
      sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
          values (${organizationId}, ${"emisor"}, 'ingest', ${randomUUID()}) returning id`,
    );
    const event = JSON.parse(
      readFileSync(
        path.join(FIXTURES, "valid-inbound-with-client.json"),
        "utf8",
      ),
    );

    for (let i = 0; i < REPETICIONES; i++) {
      await searchCatalogForService(organizationId, {
        text: "cafe molido",
        limit: 10,
      });
      await listCurrentEntriesForService(organizationId, {
        text: "horario",
        limit: 20,
      });
      await listRecentMessagesForService(organizationId, {
        channel: "whatsapp",
        conversationRef: event.payload.conversation.external_ref,
        limit: 20,
      });
      // Una escritura con su transacción, que usa una conexión tomada del pool.
      const payload = structuredClone(event.payload);
      payload.event_id = `evt-preparadas-${i}`;
      payload.message.external_ref = `msg-preparadas-${i}`;
      const written = await recordIngestionEvent(
        {
          organizationId,
          source: "emisor",
          credentialId: credential.rows[0]!.id,
        },
        JSON.stringify(payload),
        new Date(event.received_at),
      );
      expect(written).toMatchObject({ ok: true });
    }

    const porConexion = await preparedInEveryConnection();
    expect(porConexion.length).toBeGreaterThan(0);
    expect(porConexion.flat()).toEqual([]);
  });

  // El control: que la comprobación de arriba puede ver una sentencia con nombre, y que con
  // nombre el servidor sí pasa al plan genérico. Sin esto, una lista vacía no dice nada.
  it("una consulta con nombre sí queda preparada, y a la sexta ejecución usa el plan genérico", async () => {
    const pool = getDb().$client;
    const client = await pool.connect();
    let preparadas: Prepared[];
    try {
      for (let i = 0; i < 6; i++) {
        await client.query({
          name: "control_13_2",
          text: "select $1::int as n",
          values: [i],
        });
      }
      // Se mira con la conexión todavía tomada, por el mismo camino que el caso de arriba.
      client.release();
      preparadas = (await preparedInEveryConnection()).flat();
    } finally {
      // La sentencia vive en la conexión: se borra de todas para que no la herede otro caso.
      const all = await Promise.all(
        Array.from({ length: pool.totalCount }, () => pool.connect()),
      );
      for (const each of all) {
        await each.query("deallocate all");
        each.release();
      }
    }

    expect(preparadas).toEqual([
      { name: "control_13_2", generic_plans: 1, custom_plans: 5 },
    ]);
  });

  it("la misma consulta sin nombre, repetida, no queda preparada", async () => {
    const pool = getDb().$client;
    for (let i = 0; i < REPETICIONES; i++) {
      await pool.query("select $1::int as n", [i]);
    }

    expect((await preparedInEveryConnection()).flat()).toEqual([]);
  });
});
