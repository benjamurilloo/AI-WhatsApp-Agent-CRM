import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getIngestionErrors,
  type MetricsPeriodInput,
} from "@/modules/analytics";
import { getDb } from "@/shared/db";
import {
  addUser,
  contextFor,
  createOrganization,
  INGESTION_SECRET_HASH,
  INGESTION_SECRET_REF,
  insertIngestionEvent,
  preparePasswordHash,
  users,
  valueOf,
} from "./analytics-helpers";
import { resetDatabase } from "./reset-database";

// Métrica 12 contra PostgreSQL real (brief-7.3): valor calculado a mano, invariantes de
// MetricsCatalog, bordes del período, agrupación por origen y código, los tres estados, zona
// horaria, aislamiento y autorización. Fixture propio: los de la 7.1 y la 7.2 no se tocan (7.2, D-5).

// La ingestión apagada y la encendida viajan por parámetro: la métrica no lee variables globales.
const INGESTION_OFF: Record<string, string | undefined> = {};
const INGESTION_ON: Record<string, string | undefined> = {
  INGESTION_ENABLED: "true",
  INGESTION_ALLOWED_CREDENTIALS: "",
};
const INGESTION_INVALID: Record<string, string | undefined> = {
  INGESTION_ENABLED: "sí",
};

// Fixture principal, en America/Argentina/Buenos_Aires (UTC−3, sin horario de verano en 2026).
// Período I = 01/09 a 03/09 locales = [2026-09-01T03:00Z, 2026-09-04T03:00Z).
//
// | Evento | Origen    | Estado    | Código           | received_at (UTC)    | ¿En I? |
// |--------|-----------|-----------|------------------|----------------------|--------|
// | E1     | wa-cloud  | failed    | CONFLICT         | 01/09 03:00 (inicio) | sí     |
// | E2     | wa-cloud  | failed    | CONFLICT         | 02/09 12:00          | sí     |
// | E3     | wa-cloud  | failed    | CONFLICT         | 03/09 02:30 (23:30L) | sí     |
// | E4     | wa-cloud  | failed    | PAYLOAD_MISMATCH | 02/09 15:00          | sí     |
// | E5     | partner-x | failed    | CONFLICT         | 02/09 16:00          | sí     |
// | E6     | wa-cloud  | processed | —                | 02/09 17:00          | sí     |
// | E7     | partner-x | received  | —                | 03/09 01:00          | sí     |
// | E8     | wa-cloud  | failed    | CONFLICT         | 04/09 03:00 (fin)    | no     |
// | E9     | wa-cloud  | failed    | CONFLICT         | 31/08 23:00          | no     |
//
// Total del período = E1 a E7 = 7: los processed y los received cuentan en el denominador y no en
// el numerador. Fallidos = E1, E2, E3, E4, E5 = 5 → tasa = 5 / 7 = 71,428… %. E8 cae en el fin
// exacto, que está fuera del intervalo semiabierto, y E9 es anterior al inicio.
// Grupos (D-3, conteo descendente y desempate alfabético):
//   1) wa-cloud  · CONFLICT         = 3
//   2) partner-x · CONFLICT         = 1   ("partner-x" < "wa-cloud" con el mismo conteo)
//   3) wa-cloud  · PAYLOAD_MISMATCH = 1
// La organización B tiene sus propios fallidos en el mismo período y no cambia ningún valor de A.
async function mainFixture(orgA: string, orgB: string) {
  const failed = (source: string, receivedAt: string, errorCode: string) =>
    insertIngestionEvent(orgA, {
      source,
      status: "failed",
      receivedAt,
      errorCode,
    });
  await failed("wa-cloud", "2026-09-01T03:00:00Z", "CONFLICT");
  await failed("wa-cloud", "2026-09-02T12:00:00Z", "CONFLICT");
  await failed("wa-cloud", "2026-09-03T02:30:00Z", "CONFLICT");
  await failed("wa-cloud", "2026-09-02T15:00:00Z", "PAYLOAD_MISMATCH");
  await failed("partner-x", "2026-09-02T16:00:00Z", "CONFLICT");
  await insertIngestionEvent(orgA, {
    source: "wa-cloud",
    status: "processed",
    receivedAt: "2026-09-02T17:00:00Z",
  });
  await insertIngestionEvent(orgA, {
    source: "partner-x",
    status: "received",
    receivedAt: "2026-09-03T01:00:00Z",
  });
  await failed("wa-cloud", "2026-09-04T03:00:00Z", "CONFLICT");
  await failed("wa-cloud", "2026-08-31T23:00:00Z", "CONFLICT");

  await insertIngestionEvent(orgB, {
    source: "otro-emisor",
    status: "failed",
    receivedAt: "2026-09-02T12:00:00Z",
    errorCode: "CONFLICT",
  });
  await insertIngestionEvent(orgB, {
    source: "otro-emisor",
    status: "failed",
    receivedAt: "2026-09-02T13:00:00Z",
    errorCode: "OTRO_CODIGO",
  });
}

const PERIOD: MetricsPeriodInput = { from: "2026-09-01", to: "2026-09-03" };
// Período sin ningún evento, para distinguir "sin datos" de "no disponible".
const EMPTY_PERIOD: MetricsPeriodInput = {
  from: "2026-07-01",
  to: "2026-07-03",
};

describe("métrica 12: errores de ingestión (brief-7.3)", () => {
  beforeAll(preparePasswordHash);
  beforeEach(() => resetDatabase(getDb()));
  afterAll(() => getDb().$client.end());

  it("cuenta los fallidos, el total y la tasa del período", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.total).toBe(7);
    expect(value.failed).toBe(5);
    expect(value.percentage).toBeCloseTo((5 * 100) / 7, 10);
  });

  // Un client.resolved del período, processed, que sin el filtro bajaría la tasa a 5 / 8.
  it("FR-API-04: una resolución de cliente no cuenta como evento de la métrica 12", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);
    await getDb().execute(
      sql`insert into ingestion_events
            (organization_id, source, external_ref, event_type, payload_hash, status,
             received_at, processed_at)
          values (${orgA}, 'wa-cloud', 'evt-client-resuelto', 'client.resolved', 'hash-cliente',
                  'processed', '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z')`,
    );

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.total).toBe(7);
    expect(value.failed).toBe(5);
  });

  // Un conversation.resolved del período, failed: registra un mensaje, así que su fallo es un
  // mensaje perdido y cuenta. Calculado a mano: total 7 + 1 = 8, fallidos 5 + 1 = 6.
  it("FR-API-05: un conversation.resolved fallido cuenta como evento y como fallo de la métrica 12", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);
    await getDb().execute(
      sql`insert into ingestion_events
            (organization_id, source, external_ref, event_type, payload_hash, status,
             error_code, received_at, processed_at)
          values (${orgA}, 'wa-cloud', 'evt-conv-sin-cliente', 'conversation.resolved',
                  'hash-conversacion', 'failed', 'client_not_found',
                  '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z')`,
    );

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.total).toBe(8);
    expect(value.failed).toBe(6);
    expect(value.groups).toContainEqual({
      source: "wa-cloud",
      errorCode: "client_not_found",
      count: 1,
    });
  });

  // Un conversation.escalated del período, failed, y otro processed: derivar no es un mensaje, así
  // que ninguno de los dos cuenta. Calculado a mano: sigue en total 7 y fallidos 5.
  it("FR-API-06: una derivación, fallida o no, no cuenta en la métrica 12", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);
    await getDb().execute(
      sql`insert into ingestion_events
            (organization_id, source, external_ref, event_type, payload_hash, status,
             error_code, received_at, processed_at)
          values
            (${orgA}, 'wa-cloud', 'evt-escalada-fallida', 'conversation.escalated',
             'hash-escalada-1', 'failed', 'conversation_closed',
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z'),
            (${orgA}, 'wa-cloud', 'evt-escalada-ok', 'conversation.escalated',
             'hash-escalada-2', 'processed', null,
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z')`,
    );

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.total).toBe(7);
    expect(value.failed).toBe(5);
    expect(value.groups.map((group) => group.errorCode)).not.toContain(
      "conversation_closed",
    );
  });

  // Poner y quitar una etiqueta (brief-16.2, D-9), fallidos y procesados: no son mensajes, así que
  // ninguno cuenta. Calculado a mano: sigue en total 7 y fallidos 5.
  it("FR-CLI-11: poner o quitar una etiqueta, fallido o no, no cuenta en la métrica 12", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);
    await getDb().execute(
      sql`insert into ingestion_events
            (organization_id, source, external_ref, event_type, payload_hash, status,
             error_code, received_at, processed_at)
          values
            (${orgA}, 'wa-cloud', 'evt-etiqueta-fallida', 'client.tag_added',
             'hash-etiqueta-1', 'failed', 'tag_not_found',
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z'),
            (${orgA}, 'wa-cloud', 'evt-etiqueta-ok', 'client.tag_added',
             'hash-etiqueta-2', 'processed', null,
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z'),
            (${orgA}, 'wa-cloud', 'evt-etiqueta-sin-cliente', 'client.tag_removed',
             'hash-etiqueta-3', 'failed', 'client_not_found',
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z')`,
    );

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.total).toBe(7);
    expect(value.failed).toBe(5);
    expect(value.groups.map((group) => group.errorCode)).not.toContain(
      "tag_not_found",
    );
  });

  // El pedido del agente (brief-19.4, D-13), fallido o no: no es un mensaje, así que no cuenta.
  // Calculado a mano: sigue en total 7 y fallidos 5.
  it("brief-19.4: un pedido del agente, fallido o no, no cuenta en la métrica 12", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);
    await getDb().execute(
      sql`insert into ingestion_events
            (organization_id, source, external_ref, event_type, payload_hash, status,
             error_code, received_at, processed_at)
          values
            (${orgA}, 'wa-cloud', 'evt-pedido-fallido', 'order.placed',
             'hash-pedido-1', 'failed', 'product_not_found',
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z'),
            (${orgA}, 'wa-cloud', 'evt-pedido-ok', 'order.placed',
             'hash-pedido-2', 'processed', null,
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z')`,
    );

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.total).toBe(7);
    expect(value.failed).toBe(5);
    expect(value.groups.map((group) => group.errorCode)).not.toContain(
      "product_not_found",
    );
  });

  // El pedido con unidades (brief-29.8, D-7), fallido o no: tampoco es un mensaje. Calculado a mano:
  // sigue en total 7 y fallidos 5.
  it("brief-29.8: un pedido con unidades, fallido o no, no cuenta en la métrica 12", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);
    await getDb().execute(
      sql`insert into ingestion_events
            (organization_id, source, external_ref, event_type, payload_hash, status,
             error_code, received_at, processed_at)
          values
            (${orgA}, 'wa-cloud', 'evt-unidades-fallido', 'order.placed_with_units',
             'hash-unidades-1', 'failed', 'unit_not_available',
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z'),
            (${orgA}, 'wa-cloud', 'evt-unidades-ok', 'order.placed_with_units',
             'hash-unidades-2', 'processed', null,
             '2026-09-02T18:00:00Z', '2026-09-02T18:00:00Z')`,
    );

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.total).toBe(7);
    expect(value.failed).toBe(5);
    expect(value.groups.map((group) => group.errorCode)).not.toContain(
      "unit_not_available",
    );
  });

  it("agrupa por origen y código, ordenado por conteo y con desempate alfabético", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.groups).toEqual([
      { source: "wa-cloud", errorCode: "CONFLICT", count: 3 },
      { source: "partner-x", errorCode: "CONFLICT", count: 1 },
      { source: "wa-cloud", errorCode: "PAYLOAD_MISMATCH", count: 1 },
    ]);
  });

  it("respeta los invariantes del catálogo", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.failed).toBeLessThanOrEqual(value.total);
    const grouped = value.groups.reduce((sum, row) => sum + row.count, 0);
    expect(grouped).toBe(value.failed);
    expect(value.percentage).toBeCloseTo(
      (value.failed * 100) / value.total,
      10,
    );
    expect(value.percentage).toBeGreaterThanOrEqual(0);
    expect(value.percentage).toBeLessThanOrEqual(100);
  });

  it("incluye el inicio exacto del período y excluye el fin exacto", async () => {
    const { orgA, adminA } = await users();
    await insertIngestionEvent(orgA, {
      source: "wa-cloud",
      status: "failed",
      receivedAt: "2026-09-01T03:00:00Z",
      errorCode: "CONFLICT",
    });
    await insertIngestionEvent(orgA, {
      source: "wa-cloud",
      status: "failed",
      receivedAt: "2026-09-04T03:00:00Z",
      errorCode: "CONFLICT",
    });

    const value = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    expect(value).toMatchObject({ status: "value", total: 1, failed: 1 });
  });

  it("distingue los tres estados entre sí", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    // Con eventos en el período hay valor, aunque la ingestión esté apagada (D-1).
    const conEventos = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    expect(conEventos.status).toBe("value");
    // Sin eventos y con la ingestión encendida, "sin datos": nadie falló, y se sabe.
    const encendida = valueOf(
      await getIngestionErrors(adminA, EMPTY_PERIOD, INGESTION_ON),
    );
    expect(encendida).toEqual({ status: "no_data" });
    // Sin eventos y sin ingestión configurada, "no disponible": nadie estaba registrando.
    const apagada = valueOf(
      await getIngestionErrors(adminA, EMPTY_PERIOD, INGESTION_OFF),
    );
    expect(apagada).toEqual({ status: "unavailable" });
    // Una configuración inválida también apaga la ingestión (6.5.3, D-4).
    const invalida = valueOf(
      await getIngestionErrors(adminA, EMPTY_PERIOD, INGESTION_INVALID),
    );
    expect(invalida).toEqual({ status: "unavailable" });
  });

  it("interpreta el período en la zona de la organización", async () => {
    const utc = await createOrganization("Negocio UTC", "UTC");
    await addUser(utc, "admin-utc@example.com", "admin");
    const adminUtc = await contextFor("admin-utc@example.com");
    // 03/09 02:30Z es el 02/09 23:30 en Buenos Aires y el 03/09 en UTC.
    await insertIngestionEvent(utc, {
      source: "wa-cloud",
      status: "failed",
      receivedAt: "2026-09-03T02:30:00Z",
      errorCode: "CONFLICT",
    });

    const dentro = valueOf(
      await getIngestionErrors(
        adminUtc,
        { from: "2026-09-03", to: "2026-09-03" },
        INGESTION_OFF,
      ),
    );
    expect(dentro).toMatchObject({ status: "value", total: 1, failed: 1 });
    const fuera = valueOf(
      await getIngestionErrors(
        adminUtc,
        { from: "2026-09-01", to: "2026-09-02" },
        INGESTION_OFF,
      ),
    );
    expect(fuera).toEqual({ status: "unavailable" });
  });

  it("cuenta el evento cercano a la medianoche local en su día local", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    // Día local 02/09 = [2026-09-02T03:00Z, 2026-09-03T03:00Z). Dos eventos del 03/09 en UTC caen
    // en él: E3 (02:30Z = 23:30 local) y E7 (01:00Z = 22:00 local).
    // Total = E2, E3, E4, E5, E6 y E7 = 6. Fallidos = E2, E3, E4 y E5 = 4.
    const value = valueOf(
      await getIngestionErrors(
        adminA,
        { from: "2026-09-02", to: "2026-09-02" },
        INGESTION_OFF,
      ),
    );
    if (value.status !== "value") throw new Error("se esperaba un valor");
    expect(value.total).toBe(6);
    expect(value.failed).toBe(4);
    expect(value.groups).toEqual([
      { source: "wa-cloud", errorCode: "CONFLICT", count: 2 },
      { source: "partner-x", errorCode: "CONFLICT", count: 1 },
      { source: "wa-cloud", errorCode: "PAYLOAD_MISMATCH", count: 1 },
    ]);
  });

  it("aísla las organizaciones", async () => {
    const { orgA, orgB, adminA, adminB } = await users();
    await mainFixture(orgA, orgB);

    const deA = valueOf(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    if (deA.status !== "value") throw new Error("se esperaba un valor");
    expect(deA.total).toBe(7);
    expect(deA.groups.map((row) => row.source)).not.toContain("otro-emisor");

    const deB = valueOf(
      await getIngestionErrors(adminB, PERIOD, INGESTION_OFF),
    );
    if (deB.status !== "value") throw new Error("se esperaba un valor");
    expect(deB.total).toBe(2);
    expect(deB.failed).toBe(2);
    expect(deB.groups).toEqual([
      { source: "otro-emisor", errorCode: "CONFLICT", count: 1 },
      { source: "otro-emisor", errorCode: "OTRO_CODIGO", count: 1 },
    ]);
  });

  it("viewer lee lo mismo que admin, y la contraseña pendiente no lee", async () => {
    const { orgA, orgB, adminA, viewerA, pendingA } = await users();
    await mainFixture(orgA, orgB);

    const comoAdmin = await getIngestionErrors(adminA, PERIOD, INGESTION_OFF);
    const comoViewer = await getIngestionErrors(viewerA, PERIOD, INGESTION_OFF);
    expect(comoViewer).toEqual(comoAdmin);

    expect(await getIngestionErrors(pendingA, PERIOD, INGESTION_OFF)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("rechaza un período inválido", async () => {
    const { adminA } = await users();
    expect(
      await getIngestionErrors(
        adminA,
        { from: "2026-09-10", to: "2026-09-09" },
        INGESTION_OFF,
      ),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["from", "to"],
    });
  });

  it("no expone payloads, hashes ni referencias externas", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    const serialized = JSON.stringify(
      await getIngestionErrors(adminA, PERIOD, INGESTION_OFF),
    );
    expect(serialized).not.toContain(INGESTION_SECRET_REF);
    expect(serialized).not.toContain(INGESTION_SECRET_HASH);
    expect(serialized).toContain("CONFLICT");
  });
});
