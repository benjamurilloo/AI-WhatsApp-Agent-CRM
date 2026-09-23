import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/shared/db";
import {
  seedVolume,
  seedVolumeDistribution,
  volumeMemberEmail,
  volumeOrganizationId,
  volumeUser,
  type VolumeShape,
} from "../../seeds/volume";
import { resetDatabase } from "./reset-database";

// Distribución de volumen en varias organizaciones (9.3, D-1), contra PostgreSQL real.
//
// Lo que estos casos comprueban y la guarda no puede: el **contenido de las filas escritas**.
// La guarda `tests/guards/volume-seed-identity.test.ts` fija los identificadores, que son
// funciones puras; acá se mira lo que quedó en la base.

const PASSWORD = "contraseña-del-seed-larga";
const REFERENCE_DATE = "2026-09-16";

// Una distribución chica con la misma **forma** que la de D-1: una que domina, una mediana y una
// minúscula. Los tamaños de producción tardarían minutos y no agregan ninguna propiedad nueva.
const GRANDE: VolumeShape = {
  ordinal: 0,
  size: 40,
  heavyProducts: 20,
  members: 500,
  ingestionEvents: 30,
};
const MEDIANA: VolumeShape = {
  ordinal: 1,
  size: 12,
  heavyProducts: 2,
  members: 6,
  ingestionEvents: 10,
};
const CHICA: VolumeShape = {
  ordinal: 2,
  size: 3,
  heavyProducts: 0,
  members: 3,
  ingestionEvents: 4,
};
const FORMA = [GRANDE, MEDIANA, CHICA];

async function countIn(table: string, organizationId: string) {
  const result = await getDb().execute<{ count: number }>(
    sql`select count(*)::int as count from ${sql.identifier(table)}
        where organization_id = ${organizationId}`,
  );
  return result.rows[0]!.count;
}

// La misma huella que usa el test del seed de una sola organización: clientes, conversaciones y
// mensajes con sus columnas de contenido, ordenados por id. No incluye `ingestion_events`, y por
// eso sirve para comparar una corrida que los siembra contra una que no.
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

describe("seedVolumeDistribution", () => {
  beforeEach(async () => {
    await resetDatabase(getDb());
  });

  it("siembra cada organización con el tamaño que declara", async () => {
    const { byOrganization } = await seedVolumeDistribution(getDb(), PASSWORD, {
      shapes: FORMA,
      referenceDate: REFERENCE_DATE,
    });

    expect(byOrganization.map((row) => row.ordinal)).toEqual([0, 1, 2]);
    for (const [i, shape] of FORMA.entries()) {
      const row = byOrganization[i]!;
      expect(row.clients).toBe(shape.size);
      expect(row.conversations).toBe(shape.size);
      expect(row.products).toBe(shape.size);
      // El admin más los miembros sintéticos.
      expect(row.members).toBe(shape.members + 1);
      expect(row.ingestionEvents).toBe(shape.ingestionEvents);
      expect(row.messages).toBeGreaterThanOrEqual(shape.size);
    }
  });

  // El caso que sostiene la calibración de D-3: la organización histórica tiene que quedar
  // idéntica a como queda con el seed de una sola organización. Si esto dejara de valer, la
  // comparación contra los números de la 8.5 mediría dos cosas a la vez y no lo diría.
  it("la organización 0 queda igual que con el seed de una sola organización", async () => {
    await seedVolume(getDb(), PASSWORD, {
      size: GRANDE.size,
      referenceDate: REFERENCE_DATE,
    });
    const sola = await fingerprint(volumeOrganizationId(0));

    await resetDatabase(getDb());
    await seedVolumeDistribution(getDb(), PASSWORD, {
      shapes: FORMA,
      referenceDate: REFERENCE_DATE,
    });

    expect(await fingerprint(volumeOrganizationId(0))).toBe(sola);
  });

  // Control negativo del caso anterior: una organización que no es la 0 tiene otra huella. Sin
  // esto, la igualdad de arriba podría venir de una huella que no discrimina nada.
  it("otra organización del mismo tamaño no tiene la misma huella", async () => {
    const mismoTamaño: VolumeShape[] = [
      { ...GRANDE, size: 12 },
      { ...MEDIANA, size: 12 },
    ];
    await seedVolumeDistribution(getDb(), PASSWORD, {
      shapes: mismoTamaño,
      referenceDate: REFERENCE_DATE,
    });

    expect(await fingerprint(volumeOrganizationId(1))).not.toBe(
      await fingerprint(volumeOrganizationId(0)),
    );
  });

  it("es idempotente: la segunda corrida no cambia ninguna fila", async () => {
    const options = { shapes: FORMA, referenceDate: REFERENCE_DATE };
    await seedVolumeDistribution(getDb(), PASSWORD, options);
    const huellas = await Promise.all(
      FORMA.map((shape) => fingerprint(volumeOrganizationId(shape.ordinal))),
    );

    await seedVolumeDistribution(getDb(), PASSWORD, options);

    for (const [i, shape] of FORMA.entries()) {
      expect(await fingerprint(volumeOrganizationId(shape.ordinal))).toBe(
        huellas[i],
      );
      expect(
        await countIn("clients", volumeOrganizationId(shape.ordinal)),
      ).toBe(shape.size);
    }
  });

  // `users.email` es único en toda la tabla y no por organización. Con una sola organización esta
  // restricción nunca se ejercitaba; con veinte es la primera que se rompe si el correo no lleva
  // el ordinal, y se rompe a mitad de la carga.
  it("los correos de las tres organizaciones conviven en users", async () => {
    await seedVolumeDistribution(getDb(), PASSWORD, {
      shapes: FORMA,
      referenceDate: REFERENCE_DATE,
    });

    const esperados = FORMA.flatMap((shape) => [
      volumeUser(shape.ordinal).email,
      ...Array.from({ length: shape.members }, (_, i) =>
        volumeMemberEmail(shape.ordinal, i),
      ),
    ]);
    // Se leen todos los usuarios y se comparan conjuntos, no un recuento: así el caso falla
    // tanto si falta un correo como si sobra uno que el seed no debería haber escrito.
    const result = await getDb().execute<{ email: string }>(
      sql`select email from users`,
    );
    const encontrados = result.rows.map((row) => row.email);
    expect(encontrados).toHaveLength(esperados.length);
    expect(new Set(encontrados)).toEqual(new Set(esperados));
  });

  it("ninguna conversación referencia un cliente de otra organización", async () => {
    await seedVolumeDistribution(getDb(), PASSWORD, {
      shapes: FORMA,
      referenceDate: REFERENCE_DATE,
    });

    // La clave foránea compuesta ya lo impediría; el caso existe para que el seed no dependa de
    // que la base lo atrape, que es lo que pasaría si alguna vez se relajara esa restricción.
    const result = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count
            from conversations c
            join clients cl on cl.id = c.client_id
           where c.client_id is not null
             and cl.organization_id <> c.organization_id`,
    );
    expect(result.rows[0]!.count).toBe(0);
  });

  // Los tres CHECK de ingestion_events acoplan `status` con `processed_at` y con `error_code`.
  // Que el insert no explote ya los prueba; esto comprueba además que hay eventos de las tres
  // clases, porque una muestra con un solo estado no ejercitaría la métrica 12.
  it("los eventos de ingestión cubren los tres estados y respetan sus CHECK", async () => {
    await seedVolumeDistribution(getDb(), PASSWORD, {
      shapes: [{ ...GRANDE, ingestionEvents: 400 }],
      referenceDate: REFERENCE_DATE,
    });

    const result = await getDb().execute<{ status: string; count: number }>(
      sql`select status::text as status, count(*)::int as count
            from ingestion_events
           where organization_id = ${volumeOrganizationId(0)}
           group by status order by status`,
    );
    expect(result.rows.map((row) => row.status).sort()).toEqual([
      "failed",
      "processed",
      "received",
    ]);

    const incoherentes = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from ingestion_events
           where (status = 'received') <> (processed_at is null)
              or (status = 'failed') <> (error_code is not null)`,
    );
    expect(incoherentes.rows[0]!.count).toBe(0);
  });

  it("rechaza una base que no es seedeable, antes de escribir nada", async () => {
    await expect(
      seedVolumeDistribution(getDb(), "corta", { shapes: [CHICA] }),
    ).rejects.toThrow(/contraseña del seed/);
    expect(await countIn("clients", volumeOrganizationId(2))).toBe(0);
  });
});
