import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getActiveConversations,
  getFirstResponseTime,
  getRespondedConversations,
  getResponseCoverage,
  getStatusDistribution,
  type MetricsPeriodInput,
} from "@/modules/analytics";
import { getDb } from "@/shared/db";
import {
  addUser,
  contextFor,
  createOrganization,
  inbound,
  insertClient,
  insertConversation,
  outbound,
  preparePasswordHash,
  SECRET_BODY,
  users,
  valueOf,
} from "./analytics-helpers";
import { resetDatabase } from "./reset-database";

// Métricas de respuesta y estado contra PostgreSQL real (brief-7.2): valores calculados a mano,
// invariantes de MetricsCatalog, empates de timestamp, respuestas posteriores al fin del intervalo,
// bordes de zona horaria, aislamiento y autorización. Fixture propio: el de la 7.1 no se toca (D-5).

// Fixture principal, en America/Argentina/Buenos_Aires (UTC−3, sin horario de verano en 2026).
// Período I = 01/09 a 03/09 locales = [2026-09-01T03:00Z, 2026-09-04T03:00Z).
//
// | Conv. | Estado   | Mensajes (UTC)                                   | 7  | A_in | Población 9 y delta |
// |-------|----------|--------------------------------------------------|----|------|---------------------|
// | R1    | open     | in 01/09 13:00 · out 01/09 13:30                 | sí | sí   | sí, 30 min          |
// | R2    | pending  | in 02/09 10:00 · out 02/09 10:00 (empate)        | no | sí   | sí, sin respuesta   |
// | R3    | open     | in 03/09 22:00 · out 04/09 05:00 (fuera de I)    | no | sí   | sí, 420 min         |
// | R4    | closed   | out 01/09 09:00 · in 01/09 10:00 (proactivo)     | no | sí   | sí, sin respuesta   |
// | R5    | open     | out 02/09 12:00 · out 02/09 12:05                | no | no   | no (sin entrantes)  |
// | R6    | open     | in 31/08 12:00 · in 02/09 14:00 · out 02/09 14:10| sí | sí   | no (1.er in < I)    |
// | R7    | closed   | in 02/09 16:00 · out 02/09 16:10                 | sí | sí   | sí, 10 min          |
// | R8    | pending  | in 02/09 02:30 (23:30 local) · out 02/09 03:30   | sí | sí   | sí, 60 min          |
//
// Métrica 7: R1, R6, R7 y R8 = 4. R2 empata, R3 responde fuera de I, R4 responde antes del entrante.
// Métrica 8: |A_in| = R1, R2, R3, R4, R6, R7, R8 = 7 (R5 solo tiene salientes) → 4 / 7 = 57,14… %.
// Métrica 9: población = R1, R2, R3, R4, R7, R8 = 6 (R6 tiene su primer entrante antes de I).
//   Con respuesta: 30, 420, 10 y 60 → mediana de una cantidad par = (30 + 60) / 2 = 45 min.
//   Sin primera respuesta: R2 (empate) y R4 (saliente anterior) = 2.
// Métrica 11: |A| = 8 → open R1, R3, R5, R6 = 4; pending R2, R8 = 2; closed R4, R7 = 2.
//   R7 se cerró después de I: la métrica usa el estado actual.
// La organización B tiene conversaciones respondidas dentro de I y no cambia ningún valor de A.
async function mainFixture(orgA: string, orgB: string) {
  const ana = await insertClient(orgA, "Ana Secreta", "+5491155550001");
  await insertConversation(orgA, {
    clientId: ana,
    messages: [
      inbound("2026-09-01T13:00:00Z"),
      outbound("2026-09-01T13:30:00Z"),
    ],
  });
  await insertConversation(orgA, {
    status: "pending",
    messages: [
      inbound("2026-09-02T10:00:00Z"),
      outbound("2026-09-02T10:00:00Z"),
    ],
  });
  await insertConversation(orgA, {
    clientId: ana,
    messages: [
      inbound("2026-09-03T22:00:00Z"),
      outbound("2026-09-04T05:00:00Z"),
    ],
  });
  await insertConversation(orgA, {
    status: "closed",
    messages: [
      outbound("2026-09-01T09:00:00Z"),
      inbound("2026-09-01T10:00:00Z"),
    ],
  });
  await insertConversation(orgA, {
    messages: [
      outbound("2026-09-02T12:00:00Z"),
      outbound("2026-09-02T12:05:00Z"),
    ],
  });
  await insertConversation(orgA, {
    clientId: ana,
    messages: [
      inbound("2026-08-31T12:00:00Z"),
      inbound("2026-09-02T14:00:00Z"),
      outbound("2026-09-02T14:10:00Z"),
    ],
  });
  await insertConversation(orgA, {
    status: "closed",
    messages: [
      inbound("2026-09-02T16:00:00Z"),
      outbound("2026-09-02T16:10:00Z"),
    ],
  });
  await insertConversation(orgA, {
    status: "pending",
    messages: [
      inbound("2026-09-02T02:30:00Z"),
      outbound("2026-09-02T03:30:00Z"),
    ],
  });

  for (let index = 0; index < 3; index++) {
    await insertConversation(orgB, {
      status: "closed",
      messages: [
        inbound(`2026-09-0${index + 1}T12:00:00Z`),
        outbound(`2026-09-0${index + 1}T12:30:00Z`),
      ],
    });
  }
}

const PERIOD: MetricsPeriodInput = { from: "2026-09-01", to: "2026-09-03" };

beforeAll(async () => {
  await preparePasswordHash();
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("métricas de respuesta: valores calculados a mano", () => {
  it("métrica 7: exige el entrante y el saliente posterior dentro de I", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    expect(valueOf(await getRespondedConversations(adminA, PERIOD))).toBe(4);
  });

  it("métrica 7: un empate de timestamps no es una respuesta", async () => {
    const { orgA, adminA } = await users();
    await insertConversation(orgA, {
      messages: [
        inbound("2026-09-02T10:00:00Z"),
        outbound("2026-09-02T10:00:00Z"),
      ],
    });

    expect(valueOf(await getRespondedConversations(adminA, PERIOD))).toBe(0);
    // Un segundo después sí cuenta: la diferencia es la desigualdad estricta.
    await insertConversation(orgA, {
      messages: [
        inbound("2026-09-02T11:00:00Z"),
        outbound("2026-09-02T11:00:01Z"),
      ],
    });
    expect(valueOf(await getRespondedConversations(adminA, PERIOD))).toBe(1);
  });

  it("métrica 8: divide por A_in, sin las conversaciones que solo tienen salientes", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    const coverage = valueOf(await getResponseCoverage(adminA, PERIOD));
    expect(coverage).toEqual({
      status: "value",
      responded: 4,
      withInbound: 7,
      percentage: (4 * 100) / 7,
    });
  });

  it("métrica 9: mediana en minutos con una cantidad par, y las que no tienen respuesta aparte", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    const first = valueOf(await getFirstResponseTime(adminA, PERIOD));
    expect(first).toEqual({
      population: 6,
      withoutResponse: 2,
      median: { status: "value", minutes: 45 },
    });
  });

  it("métrica 9: con una cantidad impar de deltas, la mediana es el valor central", async () => {
    const { orgA, adminA } = await users();
    for (const [index, minutes] of [10, 30, 200].entries()) {
      await insertConversation(orgA, {
        messages: [
          inbound(`2026-09-02T1${index}:00:00Z`),
          outbound(
            new Date(
              Date.parse(`2026-09-02T1${index}:00:00Z`) + minutes * 60_000,
            ).toISOString(),
          ),
        ],
      });
    }

    const first = valueOf(await getFirstResponseTime(adminA, PERIOD));
    expect(first).toEqual({
      population: 3,
      withoutResponse: 0,
      median: { status: "value", minutes: 30 },
    });
  });

  it("métrica 9: ignora los salientes anteriores al primer entrante y toma el primero posterior", async () => {
    const { orgA, adminA } = await users();
    await insertConversation(orgA, {
      messages: [
        outbound("2026-09-02T09:00:00Z"),
        inbound("2026-09-02T10:00:00Z"),
        outbound("2026-09-02T10:15:00Z"),
        outbound("2026-09-02T10:45:00Z"),
      ],
    });

    const first = valueOf(await getFirstResponseTime(adminA, PERIOD));
    expect(first).toEqual({
      population: 1,
      withoutResponse: 0,
      median: { status: "value", minutes: 15 },
    });
  });

  it("métrica 11: los tres estados, con 0 explícito en los que no tienen conversaciones", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);
    expect(valueOf(await getStatusDistribution(adminA, PERIOD))).toEqual({
      open: 4,
      pending: 2,
      closed: 2,
    });

    const { orgA: soloAbierta, adminA: adminSolo } = await usersFor("Otra");
    await insertConversation(soloAbierta, {
      messages: [inbound("2026-09-02T10:00:00Z")],
    });
    expect(valueOf(await getStatusDistribution(adminSolo, PERIOD))).toEqual({
      open: 1,
      pending: 0,
      closed: 0,
    });
  });
});

// Organización aparte, para los casos que necesitan datos propios sin el fixture principal.
async function usersFor(name: string) {
  const orgA = await createOrganization(`Negocio ${name}`);
  const email = `admin-${name.toLowerCase()}@example.com`;
  await addUser(orgA, email, "admin");
  return { orgA, adminA: await contextFor(email) };
}

describe("métricas de respuesta: invariantes de MetricsCatalog", () => {
  it("cumplen las validaciones del catálogo sobre el mismo período", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    const active = valueOf(await getActiveConversations(adminA, PERIOD));
    const responded = valueOf(await getRespondedConversations(adminA, PERIOD));
    const coverage = valueOf(await getResponseCoverage(adminA, PERIOD));
    const first = valueOf(await getFirstResponseTime(adminA, PERIOD));
    const statuses = valueOf(await getStatusDistribution(adminA, PERIOD));
    if (coverage.status !== "value") throw new Error("esperaba un valor");

    // La métrica 7 nunca supera |A_in|, y la cobertura es su cociente, entre 0 y 100 %.
    expect(responded).toBeLessThanOrEqual(coverage.withInbound);
    expect(coverage.percentage).toBeGreaterThanOrEqual(0);
    expect(coverage.percentage).toBeLessThanOrEqual(100);
    expect(coverage.percentage).toBeCloseTo(
      (responded * 100) / coverage.withInbound,
      10,
    );
    expect(coverage.responded).toBe(responded);
    // La suma de los grupos de la métrica 11 es igual a |A|.
    expect(statuses.open + statuses.pending + statuses.closed).toBe(active);
    // La población de la 9 no supera |A_in| y se reparte entre con y sin respuesta.
    expect(first.population).toBeLessThanOrEqual(coverage.withInbound);
    expect(first.withoutResponse).toBeLessThanOrEqual(first.population);
  });

  it("sin entrantes en I: sin datos en la cobertura y en la mediana, nunca 0", async () => {
    const { orgA, adminA } = await users();
    await insertConversation(orgA, {
      messages: [
        outbound("2026-09-02T12:00:00Z"),
        outbound("2026-09-02T12:05:00Z"),
      ],
    });

    expect(valueOf(await getRespondedConversations(adminA, PERIOD))).toBe(0);
    expect(valueOf(await getResponseCoverage(adminA, PERIOD))).toEqual({
      status: "no_data",
    });
    expect(valueOf(await getFirstResponseTime(adminA, PERIOD))).toEqual({
      population: 0,
      withoutResponse: 0,
      median: { status: "no_data" },
    });
    // La conversación está en A, así que sí aparece en la métrica 11.
    expect(valueOf(await getStatusDistribution(adminA, PERIOD))).toEqual({
      open: 1,
      pending: 0,
      closed: 0,
    });
  });

  it("una población sin ninguna respuesta informa cuántas quedaron sin responder", async () => {
    const { orgA, adminA } = await users();
    await insertConversation(orgA, {
      messages: [inbound("2026-09-02T10:00:00Z")],
    });
    await insertConversation(orgA, {
      messages: [inbound("2026-09-02T11:00:00Z")],
    });

    expect(valueOf(await getFirstResponseTime(adminA, PERIOD))).toEqual({
      population: 2,
      withoutResponse: 2,
      median: { status: "no_data" },
    });
    expect(valueOf(await getResponseCoverage(adminA, PERIOD))).toEqual({
      status: "value",
      responded: 0,
      withInbound: 2,
      percentage: 0,
    });
  });
});

describe("métricas de respuesta: zona horaria", () => {
  // El 19/10/2008 de Buenos Aires dura 23 horas: I = [2008-10-19T03:00Z, 2008-10-20T02:00Z),
  // confirmado en la base de zonas de PostgreSQL.
  it("respeta los bordes del día de 23 horas", async () => {
    const { orgA, adminA } = await users();
    // Entrante en el inicio exacto de I, con su respuesta dentro: cuenta en la métrica 7.
    await insertConversation(orgA, {
      messages: [
        inbound("2008-10-19T03:00:00Z"),
        outbound("2008-10-19T03:20:00Z"),
      ],
    });
    // Respuesta en el fin exacto de I: fuera del intervalo, así que no cuenta en la 7, pero sí
    // aporta su delta a la 9, que admite respuestas posteriores.
    await insertConversation(orgA, {
      messages: [
        inbound("2008-10-19T04:00:00Z"),
        outbound("2008-10-20T02:00:00Z"),
      ],
    });
    const period = { from: "2008-10-19", to: "2008-10-19" };

    expect(valueOf(await getRespondedConversations(adminA, period))).toBe(1);
    expect(valueOf(await getFirstResponseTime(adminA, period))).toEqual({
      population: 2,
      withoutResponse: 0,
      // Deltas de 20 y 1320 minutos (22 horas) → mediana 670.
      median: { status: "value", minutes: 670 },
    });
  });

  // El 14/03/2009 dura 25 horas: 01:30Z y 02:30Z del 15/03 son las dos 23:30 locales del 14/03.
  it("mide el tiempo transcurrido, no la diferencia del reloj, en el día de 25 horas", async () => {
    const { orgA, adminA } = await users();
    await insertConversation(orgA, {
      messages: [
        inbound("2009-03-15T01:30:00Z"),
        outbound("2009-03-15T02:30:00Z"),
      ],
    });
    const period = { from: "2009-03-14", to: "2009-03-14" };

    // Los dos mensajes caen en el mismo horario local, y pasó una hora real.
    expect(valueOf(await getFirstResponseTime(adminA, period))).toEqual({
      population: 1,
      withoutResponse: 0,
      median: { status: "value", minutes: 60 },
    });
    expect(valueOf(await getRespondedConversations(adminA, period))).toBe(1);
  });

  it("usa la zona de la organización para decidir si el primer entrante cae en I", async () => {
    const orgUtc = await createOrganization("Negocio UTC", "UTC");
    await addUser(orgUtc, "admin-utc@example.com", "admin");
    const adminUtc = await contextFor("admin-utc@example.com");
    // 02/09 02:30Z es el 01/09 23:30 en Buenos Aires y el 02/09 en UTC.
    await insertConversation(orgUtc, {
      messages: [
        inbound("2026-09-02T02:30:00Z"),
        outbound("2026-09-02T03:30:00Z"),
      ],
    });

    const enUtc = valueOf(
      await getFirstResponseTime(adminUtc, {
        from: "2026-09-02",
        to: "2026-09-02",
      }),
    );
    expect(enUtc.population).toBe(1);
    const diaAnterior = valueOf(
      await getFirstResponseTime(adminUtc, {
        from: "2026-09-01",
        to: "2026-09-01",
      }),
    );
    expect(diaAnterior.population).toBe(0);
  });
});

describe("métricas de respuesta: autorización, aislamiento y contenido", () => {
  it("viewer lee lo mismo que admin; con la contraseña pendiente, FORBIDDEN", async () => {
    const { orgA, orgB, adminA, viewerA, pendingA } = await users();
    await mainFixture(orgA, orgB);

    expect(await getRespondedConversations(viewerA, PERIOD)).toEqual(
      await getRespondedConversations(adminA, PERIOD),
    );
    expect(await getResponseCoverage(viewerA, PERIOD)).toEqual(
      await getResponseCoverage(adminA, PERIOD),
    );
    expect(await getFirstResponseTime(viewerA, PERIOD)).toEqual(
      await getFirstResponseTime(adminA, PERIOD),
    );
    expect(await getStatusDistribution(viewerA, PERIOD)).toEqual(
      await getStatusDistribution(adminA, PERIOD),
    );

    for (const result of [
      await getRespondedConversations(pendingA, PERIOD),
      await getResponseCoverage(pendingA, PERIOD),
      await getFirstResponseTime(pendingA, PERIOD),
      await getStatusDistribution(pendingA, PERIOD),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("rechaza un período inválido con sus campos, como el resto de las métricas", async () => {
    const { adminA } = await users();
    const result = await getResponseCoverage(adminA, {
      from: "2026-09-10",
      to: "2026-09-01",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION_ERROR");
      if (result.code === "VALIDATION_ERROR") {
        expect(result.fields).toEqual(["from", "to"]);
      }
    }
  });

  it("cada organización ve solo sus datos", async () => {
    const { orgA, orgB, adminA, adminB } = await users();
    await mainFixture(orgA, orgB);

    // Los valores de A son los del cálculo a mano, con B cargada en el mismo período.
    expect(valueOf(await getRespondedConversations(adminA, PERIOD))).toBe(4);
    expect(valueOf(await getStatusDistribution(adminA, PERIOD))).toEqual({
      open: 4,
      pending: 2,
      closed: 2,
    });
    // B solo ve sus tres conversaciones respondidas y cerradas.
    expect(valueOf(await getRespondedConversations(adminB, PERIOD))).toBe(3);
    expect(valueOf(await getStatusDistribution(adminB, PERIOD))).toEqual({
      open: 0,
      pending: 0,
      closed: 3,
    });
    expect(valueOf(await getFirstResponseTime(adminB, PERIOD))).toEqual({
      population: 3,
      withoutResponse: 0,
      median: { status: "value", minutes: 30 },
    });
  });

  it("ninguna respuesta contiene cuerpos de mensajes, teléfonos ni nombres de clientes", async () => {
    const { orgA, orgB, adminA } = await users();
    await mainFixture(orgA, orgB);

    const serialized = JSON.stringify([
      await getRespondedConversations(adminA, PERIOD),
      await getResponseCoverage(adminA, PERIOD),
      await getFirstResponseTime(adminA, PERIOD),
      await getStatusDistribution(adminA, PERIOD),
    ]);

    expect(serialized).not.toContain(SECRET_BODY);
    expect(serialized).not.toContain("Ana Secreta");
    expect(serialized).not.toContain("5491155550001");
  });
});
