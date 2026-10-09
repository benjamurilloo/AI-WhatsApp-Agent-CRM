import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  addBusinessHourException,
  createKnowledgeEntry,
  getBusinessHours,
  getBusinessHoursForService,
  getBusinessHoursStatusAt,
  listBusinessHoursAudit,
  removeBusinessHourException,
  saveBusinessWeek,
  type DaySlotsInput,
  type ExceptionInput,
  type WeekInput,
} from "@/modules/knowledge";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Horario de atención contra PostgreSQL real (brief-17.4): el esquema y sus privilegios (AC-1),
// el semanal y las excepciones (AC-2, AC-3), el cálculo de si está abierto en la zona de la
// organización (AC-4), la auditoría (AC-5) y el aislamiento entre organizaciones (invariante 4).

const PASSWORD = "contraseña-correcta-larga";
let storedHash: string;

async function createOrganization(name: string, timezone?: string) {
  const result = await getDb().execute<{ id: string }>(
    timezone
      ? sql`insert into organizations (name, timezone) values (${name}, ${timezone}) returning id`
      : sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  role: "admin" | "viewer",
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, 'Persona') returning id`,
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

// A en Buenos Aires (UTC-3 todo el año), B en Buenos Aires y T en Tokio (UTC+9), cada una con
// su admin; A además con un viewer.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const orgT = await createOrganization("Negocio T", "Asia/Tokyo");
  await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgB, "admin-b@example.com", "admin");
  await addUser(orgT, "admin-t@example.com", "admin");
  return {
    orgA,
    orgB,
    orgT,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
    adminT: await contextFor("admin-t@example.com"),
  };
}

const CLOSED: DaySlotsInput = {
  opens1: "",
  closes1: "",
  opens2: "",
  closes2: "",
};
const SPLIT: DaySlotsInput = {
  opens1: "09:00",
  closes1: "13:00",
  opens2: "16:00",
  closes2: "20:00",
};
const MORNING: DaySlotsInput = {
  opens1: "09:00",
  closes1: "13:00",
  opens2: "",
  closes2: "",
};

// Lunes a viernes cortado, sábado a la mañana, domingo cerrado.
const WEEK: WeekInput = {
  1: SPLIT,
  2: SPLIT,
  3: SPLIT,
  4: SPLIT,
  5: SPLIT,
  6: MORNING,
  7: CLOSED,
};

async function saveWeek(context: AuthContext, week: WeekInput = WEEK) {
  const result = await saveBusinessWeek(context, week);
  if (!result.ok) throw new Error(`semana rechazada: ${result.code}`);
  return result;
}

async function dayIn(timezone: string, offset = 0): Promise<string> {
  const result = await getDb().execute<{ day: string }>(
    sql`select ((now() at time zone ${timezone})::date + ${offset}::int)::text as day`,
  );
  return result.rows[0]!.day;
}

function exception(input: Partial<ExceptionInput>): ExceptionInput {
  return { ...CLOSED, date: "", reason: "", ...input };
}

async function auditRows() {
  const result = await getDb().execute<{
    entity_type: string;
    entity_id: string;
    action: string;
    diff: { before: Record<string, unknown>; after: Record<string, unknown> };
  }>(
    sql`select entity_type, entity_id, action, diff from audit_logs order by created_at`,
  );
  return result.rows;
}

async function pgError(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code ?? "sin código";
  }
  return "sin error";
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

describe("esquema del horario (brief-17.4, AC-1)", () => {
  it("AC-1: crm_app escribe el semanal sin borrarlo, y crea y quita excepciones sin editarlas", async () => {
    const result = await getDb().execute<{ table: string; privilege: string }>(
      sql`select table_name as table, privilege_type as privilege
          from information_schema.role_table_grants
          where grantee = 'crm_app'
            and table_name in ('business_hours', 'business_hour_exceptions')
          order by table_name, privilege_type`,
    );
    expect(result.rows).toEqual([
      { table: "business_hour_exceptions", privilege: "DELETE" },
      { table: "business_hour_exceptions", privilege: "INSERT" },
      { table: "business_hour_exceptions", privilege: "SELECT" },
      { table: "business_hours", privilege: "INSERT" },
      { table: "business_hours", privilege: "SELECT" },
      { table: "business_hours", privilege: "UPDATE" },
    ]);
  });

  it("AC-1: los CHECK y los índices únicos de las dos tablas", async () => {
    const checks = await getDb().execute<{ name: string }>(
      sql`select conname as name from pg_constraint
          where contype = 'c'
            and conrelid in ('business_hours'::regclass, 'business_hour_exceptions'::regclass)
          order by conname`,
    );
    expect(checks.rows.map((row) => row.name)).toEqual([
      "business_hour_exceptions_reason_length",
      "business_hour_exceptions_slot_1_complete",
      "business_hour_exceptions_slot_1_order",
      "business_hour_exceptions_slot_2_after_1",
      "business_hour_exceptions_slot_2_complete",
      "business_hour_exceptions_slot_2_order",
      "business_hour_exceptions_whole_minutes",
      "business_hours_slot_1_complete",
      "business_hours_slot_1_order",
      "business_hours_slot_2_after_1",
      "business_hours_slot_2_complete",
      "business_hours_slot_2_order",
      "business_hours_weekday_range",
      "business_hours_whole_minutes",
    ]);
    const indexes = await getDb().execute<{ name: string; definition: string }>(
      sql`select indexname as name, indexdef as definition from pg_indexes
          where tablename in ('business_hours', 'business_hour_exceptions')
          order by indexname`,
    );
    expect(indexes.rows.map((row) => row.name)).toEqual([
      "business_hour_exceptions_organization_date_unique",
      "business_hour_exceptions_pkey",
      "business_hours_organization_weekday_unique",
      "business_hours_pkey",
    ]);
  });

  it("invariante 5: la base rechaza un tramo invertido, un segundo tramo solo o que pisa al primero, segundos y un día fuera de rango: 23514", async () => {
    const { orgA } = await seed();
    const insert = (values: string) =>
      getDb().execute(
        sql.raw(
          `insert into business_hours (organization_id, weekday, opens_1, closes_1, opens_2, closes_2) values ('${orgA}', ${values})`,
        ),
      );
    expect(await pgError(insert("1, '13:00', '09:00', null, null"))).toBe(
      "23514",
    );
    expect(await pgError(insert("1, '09:00', null, null, null"))).toBe("23514");
    expect(await pgError(insert("1, null, null, '16:00', '20:00'"))).toBe(
      "23514",
    );
    expect(await pgError(insert("1, '09:00', '13:00', '12:00', '20:00'"))).toBe(
      "23514",
    );
    expect(await pgError(insert("1, '09:00', '13:00', '13:00', '20:00'"))).toBe(
      "23514",
    );
    expect(await pgError(insert("1, '09:00:30', '13:00', null, null"))).toBe(
      "23514",
    );
    expect(await pgError(insert("8, null, null, null, null"))).toBe("23514");
    expect(await pgError(insert("1, '09:00', '13:00', '16:00', '20:00'"))).toBe(
      "sin error",
    );
    expect(await pgError(insert("1, null, null, null, null"))).toBe("23505");
  });

  it("crm_app no puede borrar el semanal ni editar una excepción: 42501", async () => {
    const { orgA } = await seed();
    expect(
      await pgError(
        asAppRole((tx) =>
          tx.execute(
            sql`delete from business_hours where organization_id = ${orgA}`,
          ),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgError(
        asAppRole((tx) =>
          tx.execute(
            sql`update business_hour_exceptions set reason = 'x' where organization_id = ${orgA}`,
          ),
        ),
      ),
    ).toBe("42501");
  });
});

describe("el horario semanal (FR-INFO-04, AC-2)", () => {
  it("AC-2: un admin guarda días cerrados, de un tramo y de dos, y los dos roles lo ven", async () => {
    const { adminA, viewerA } = await seed();
    const empty = await getBusinessHours(viewerA);
    expect(empty.ok && empty.configured).toBe(false);

    expect(await saveWeek(adminA)).toEqual({ ok: true, changed: true });
    const view = await getBusinessHours(viewerA);
    if (!view.ok) throw new Error("lectura rechazada");
    expect(view.configured).toBe(true);
    expect(view.week).toEqual([
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        slots: [
          { opens: "09:00", closes: "13:00" },
          { opens: "16:00", closes: "20:00" },
        ],
      })),
      { weekday: 6, slots: [{ opens: "09:00", closes: "13:00" }] },
      { weekday: 7, slots: [] },
    ]);
  });

  it("AC-2: un tramo invertido, incompleto, que pisa al otro o con hora inválida da VALIDATION_ERROR en su día; un viewer, FORBIDDEN", async () => {
    const { adminA, viewerA } = await seed();
    const result = await saveBusinessWeek(adminA, {
      ...WEEK,
      1: { ...SPLIT, opens1: "13:00", closes1: "09:00" },
      2: { ...SPLIT, closes2: "" },
      3: { ...SPLIT, opens2: "12:00" },
      4: { ...SPLIT, opens2: "13:00" },
      6: { ...MORNING, closes1: "24:00" },
    });
    expect(result).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["day1", "day2", "day3", "day4", "day6"],
    });
    expect(await saveBusinessWeek(viewerA, WEEK)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    const count = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from business_hours`,
    );
    expect(count.rows[0]!.count).toBe(0);
  });

  it("AC-5: la auditoría lleva solo los días que cambiaron, y guardar sin cambios no escribe ni audita", async () => {
    const { adminA, orgA } = await seed();
    await saveWeek(adminA);
    expect(await saveWeek(adminA)).toEqual({ ok: true, changed: false });
    await saveWeek(adminA, { ...WEEK, 6: CLOSED, 7: MORNING });

    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      entity_type: "business_hours",
      entity_id: orgA,
      action: "update",
    });
    expect(rows[0]!.diff.before).toEqual({
      day1: null,
      day2: null,
      day3: null,
      day4: null,
      day5: null,
      day6: null,
      day7: null,
    });
    expect(rows[0]!.diff.after).toMatchObject({
      day1: "09:00-13:00,16:00-20:00",
      day6: "09:00-13:00",
      day7: "",
    });
    expect(rows[1]!.diff).toEqual({
      before: { day6: "09:00-13:00", day7: "" },
      after: { day6: "", day7: "09:00-13:00" },
    });

    const audit = await listBusinessHoursAudit(adminA, 1);
    expect(audit.ok && audit.total).toBe(2);
  });
});

describe("las excepciones (FR-INFO-04, AC-3)", () => {
  it("AC-3: un admin crea una excepción cerrada y otra con tramos, en orden de fecha, y las quita", async () => {
    const { adminA, viewerA } = await seed();
    const later = await dayIn("America/Argentina/Buenos_Aires", 10);
    const sooner = await dayIn("America/Argentina/Buenos_Aires", 2);
    expect(
      await addBusinessHourException(
        adminA,
        exception({ date: later, reason: "  Feriado  " }),
      ),
    ).toEqual({ ok: true });
    expect(
      await addBusinessHourException(
        adminA,
        exception({ date: sooner, opens1: "10:00", closes1: "12:00" }),
      ),
    ).toEqual({ ok: true });

    const view = await getBusinessHours(viewerA);
    if (!view.ok) throw new Error("lectura rechazada");
    expect(
      view.exceptions.map((row) => ({
        date: row.date,
        slots: row.slots,
        reason: row.reason,
      })),
    ).toEqual([
      {
        date: sooner,
        slots: [{ opens: "10:00", closes: "12:00" }],
        reason: null,
      },
      { date: later, slots: [], reason: "Feriado" },
    ]);

    expect(
      await removeBusinessHourException(viewerA, view.exceptions[0]!.id),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      await removeBusinessHourException(adminA, view.exceptions[0]!.id),
    ).toEqual({ ok: true });
    const after = await getBusinessHours(adminA);
    expect(after.ok && after.exceptions.map((row) => row.date)).toEqual([
      later,
    ]);

    const rows = await auditRows();
    expect(rows.map((row) => row.diff)).toEqual([
      {
        before: {
          exception: null,
          exceptionHours: null,
          exceptionReason: null,
        },
        after: {
          exception: later,
          exceptionHours: "",
          exceptionReason: "Feriado",
        },
      },
      {
        before: {
          exception: null,
          exceptionHours: null,
          exceptionReason: null,
        },
        after: {
          exception: sooner,
          exceptionHours: "10:00-12:00",
          exceptionReason: null,
        },
      },
      {
        before: {
          exception: sooner,
          exceptionHours: "10:00-12:00",
          exceptionReason: null,
        },
        after: { exception: null, exceptionHours: null, exceptionReason: null },
      },
    ]);
  });

  it("AC-3: una fecha repetida da CONFLICT; una pasada, inválida o un motivo largo, VALIDATION_ERROR en su campo", async () => {
    const { adminA, adminB } = await seed();
    const day = await dayIn("America/Argentina/Buenos_Aires", 3);
    const yesterday = await dayIn("America/Argentina/Buenos_Aires", -1);
    await addBusinessHourException(adminA, exception({ date: day }));
    expect(
      await addBusinessHourException(adminA, exception({ date: day })),
    ).toEqual({ ok: false, code: "CONFLICT" });
    // La misma fecha en otra organización se acepta.
    expect(
      await addBusinessHourException(adminB, exception({ date: day })),
    ).toEqual({ ok: true });
    expect(
      await addBusinessHourException(adminA, exception({ date: yesterday })),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["date"] });
    expect(
      await addBusinessHourException(
        adminA,
        exception({
          date: "2026-02-30",
          opens1: "12:00",
          closes1: "10:00",
          reason: "x".repeat(101),
        }),
      ),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["date", "slots", "reason"],
    });
  });

  it("invariante 4: una excepción de otra organización da NOT_FOUND y sigue en su lugar", async () => {
    const { adminA, adminB } = await seed();
    const day = await dayIn("America/Argentina/Buenos_Aires", 4);
    await addBusinessHourException(adminB, exception({ date: day }));
    const theirs = await getBusinessHours(adminB);
    if (!theirs.ok) throw new Error("lectura rechazada");
    expect(
      await removeBusinessHourException(adminA, theirs.exceptions[0]!.id),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await removeBusinessHourException(adminA, "no-es-un-id")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    const still = await getBusinessHours(adminB);
    expect(still.ok && still.exceptions).toHaveLength(1);
  });

  // P-5; revisión independiente de la 17.4.1, H-3: la pantalla abierta después de la medianoche.
  it("P-5: una excepción pasada da NOT_FOUND al quitarla y sigue en su lugar", async () => {
    const { adminA, orgA } = await seed();
    const yesterday = await dayIn("America/Argentina/Buenos_Aires", -1);
    const inserted = await getDb().execute<{ id: string }>(
      sql`insert into business_hour_exceptions (organization_id, date, reason)
          values (${orgA}, ${yesterday}::date, 'Ayer') returning id`,
    );
    expect(
      await removeBusinessHourException(adminA, inserted.rows[0]!.id),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    const rows = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from business_hour_exceptions`,
    );
    expect(rows.rows[0]!.count).toBe(1);
    expect(await auditRows()).toEqual([]);
  });
});

// Las horas UTC de cada caso están calculadas a mano: Buenos Aires es UTC-3 todo el año desde
// 2009, y Tokio UTC+9. El 12 de octubre de 2026 es lunes.
describe("si está abierto ahora (FR-INFO-06, AC-4)", () => {
  async function statusAt(context: AuthContext, iso: string) {
    const result = await getBusinessHoursStatusAt(context, new Date(iso));
    if ("ok" in result) throw new Error(`estado rechazado: ${result.code}`);
    return result;
  }

  async function insertException(orgId: string, values: string) {
    await getDb().execute(
      sql.raw(
        `insert into business_hour_exceptions (organization_id, date, opens_1, closes_1, opens_2, closes_2, reason) values ('${orgId}', ${values})`,
      ),
    );
  }

  it("AC-4: antes de abrir, en la apertura, dentro del tramo, en el cierre, en el corte y después del cierre", async () => {
    const { adminA } = await seed();
    await saveWeek(adminA);
    const cases: [string, boolean, string | null, string | null][] = [
      // UTC, abierto, próximo cambio (tipo), próximo cambio (fecha y hora local)
      ["2026-10-12T11:59:00Z", false, "opens", "2026-10-12 09:00"],
      ["2026-10-12T12:00:00Z", true, "closes", "2026-10-12 13:00"],
      ["2026-10-12T15:59:00Z", true, "closes", "2026-10-12 13:00"],
      ["2026-10-12T16:00:00Z", false, "opens", "2026-10-12 16:00"],
      ["2026-10-12T17:30:00Z", false, "opens", "2026-10-12 16:00"],
      ["2026-10-12T19:00:00Z", true, "closes", "2026-10-12 20:00"],
      ["2026-10-12T23:00:00Z", false, "opens", "2026-10-13 09:00"],
    ];
    for (const [iso, open, kind, next] of cases) {
      const status = await statusAt(adminA, iso);
      expect({ iso, open: status.openNow }).toEqual({ iso, open });
      expect({
        iso,
        next: status.nextChange
          ? `${status.nextChange.kind} ${status.nextChange.date} ${status.nextChange.time}`
          : null,
      }).toEqual({ iso, next: next ? `${kind} ${next}` : null });
    }
    expect(await statusAt(adminA, "2026-10-12T11:59:00Z")).toMatchObject({
      localDate: "2026-10-12",
      localTime: "08:59",
      weekday: 1,
    });
  });

  it("AC-4: el sábado después del cierre y el domingo, el próximo cambio es el lunes", async () => {
    const { adminA } = await seed();
    await saveWeek(adminA);
    for (const iso of ["2026-10-17T16:30:00Z", "2026-10-18T13:00:00Z"]) {
      const status = await statusAt(adminA, iso);
      expect(status.openNow).toBe(false);
      expect(status.nextChange).toEqual({
        kind: "opens",
        date: "2026-10-19",
        time: "09:00",
      });
    }
  });

  it("AC-4: una excepción de cierre y una de horario especial reemplazan al semanal de su fecha", async () => {
    const { adminA, orgA } = await seed();
    await saveWeek(adminA);
    await insertException(
      orgA,
      "'2026-10-14', null, null, null, null, 'Feriado'",
    );
    await insertException(
      orgA,
      "'2026-10-15', '10:00', '12:00', null, null, null",
    );

    // Martes 20:30: el miércoles está cerrado y el jueves abre a las 10.
    expect(await statusAt(adminA, "2026-10-13T23:30:00Z")).toMatchObject({
      openNow: false,
      nextChange: { kind: "opens", date: "2026-10-15", time: "10:00" },
    });
    // Miércoles 10:00, en horario semanal, pero cerrado por la excepción.
    expect((await statusAt(adminA, "2026-10-14T13:00:00Z")).openNow).toBe(
      false,
    );
    // Jueves 09:30: el semanal abriría a las 9; la excepción, a las 10.
    expect(await statusAt(adminA, "2026-10-15T12:30:00Z")).toMatchObject({
      openNow: false,
      nextChange: { kind: "opens", date: "2026-10-15", time: "10:00" },
    });
    // Jueves 11:00: abierto hasta las 12, sin la tarde del semanal.
    expect(await statusAt(adminA, "2026-10-15T14:00:00Z")).toMatchObject({
      openNow: true,
      nextChange: { kind: "closes", date: "2026-10-15", time: "12:00" },
    });
  });

  it("AC-4: el mismo instante da resultados distintos en dos zonas (mutación: la zona del servidor)", async () => {
    const { adminA, adminT } = await seed();
    await saveWeek(adminA);
    await saveWeek(adminT);
    // 12:00 UTC del lunes: 09:00 en Buenos Aires, 21:00 en Tokio.
    const buenosAires = await statusAt(adminA, "2026-10-12T12:00:00Z");
    const tokyo = await statusAt(adminT, "2026-10-12T12:00:00Z");
    expect(buenosAires).toMatchObject({ openNow: true, localTime: "09:00" });
    expect(tokyo).toMatchObject({
      openNow: false,
      localTime: "21:00",
      nextChange: { kind: "opens", date: "2026-10-13", time: "09:00" },
    });
  });

  it("AC-4: sin horario o con la semana cerrada, no hay próximo cambio", async () => {
    const { adminA, adminB } = await seed();
    expect(await statusAt(adminB, "2026-10-12T12:00:00Z")).toMatchObject({
      openNow: false,
      nextChange: null,
    });
    await saveWeek(adminA, {
      1: CLOSED,
      2: CLOSED,
      3: CLOSED,
      4: CLOSED,
      5: CLOSED,
      6: CLOSED,
      7: CLOSED,
    });
    expect(await statusAt(adminA, "2026-10-12T12:00:00Z")).toMatchObject({
      openNow: false,
      nextChange: null,
    });
  });
});

describe("la lectura de servicio (D-6, invariante 4)", () => {
  it("devuelve el horario de su organización, sin el de otra, y configured en false sin horario", async () => {
    const { adminA, adminB, orgA, orgB } = await seed();
    await saveWeek(adminA);
    const day = await dayIn("America/Argentina/Buenos_Aires", 5);
    const far = await dayIn("America/Argentina/Buenos_Aires", 31);
    await addBusinessHourException(adminA, exception({ date: day }));
    await addBusinessHourException(adminA, exception({ date: far }));
    // Un día especial de B en otra fecha y en la misma: A no ve ninguno (H-1 de la revisión).
    const other = await dayIn("America/Argentina/Buenos_Aires", 2);
    await addBusinessHourException(adminB, exception({ date: other }));
    await addBusinessHourException(
      adminB,
      exception({ date: day, reason: "De B" }),
    );

    const mine = await getBusinessHoursForService(orgA);
    expect(mine.configured).toBe(true);
    expect(mine.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(mine.week).toHaveLength(7);
    // Solo las excepciones de los próximos 30 días.
    expect(mine.exceptions.map((row) => row.date)).toEqual([day]);
    // days: hoy y los 6 siguientes, con el día especial de A aplicado y sin los de B.
    expect(mine.days).toHaveLength(7);
    expect(mine.days[5]).toMatchObject({ date: day, slots: [], reason: null });
    expect(mine.days[2]!.date).toBe(other);
    expect(JSON.stringify(mine)).not.toContain("De B");

    // La lectura de servicio trae los días especiales de B aunque no tenga semanal; la ruta los
    // vacía con configured en false (P-7).
    const theirs = await getBusinessHoursForService(orgB);
    expect(theirs.configured).toBe(false);
    expect(theirs.exceptions.map((row) => row.date)).toEqual([other, day]);
    expect(theirs.week.every((row) => row.slots.length === 0)).toBe(true);
  });

  it("D-5: avisa si hay una entrada de texto vigente de la categoría «Horarios»", async () => {
    const { adminA } = await seed();
    const before = await getBusinessHours(adminA);
    expect(before.ok && before.hoursEntry).toBeNull();
    const created = await createKnowledgeEntry(adminA, {
      title: "Horario de atención",
      category: "horarios",
      content: "Lunes a viernes de 9 a 18.",
      validFrom: null,
      validUntil: null,
    });
    if (!created.ok) throw new Error("alta rechazada");
    const after = await getBusinessHours(adminA);
    expect(after.ok && after.hoursEntry).toEqual({
      id: created.entryId,
      title: "Horario de atención",
    });
  });
});
