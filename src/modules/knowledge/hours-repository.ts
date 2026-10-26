import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { businessHourExceptions, businessHours } from "./schema";

// Acceso al horario de atención (brief-17.4, D-2 y D-3). Toda consulta filtra por organization_id
// en SQL, y toda cuenta con la hora la hace PostgreSQL en la zona de la organización (invariante 2).

type Executor = Db | DbTransaction;

// Un tramo, en HH:MM. Un día sin tramos está cerrado.
export type Slot = { opens: string; closes: string };

export type DaySlots = {
  opens1: string | null;
  closes1: string | null;
  opens2: string | null;
  closes2: string | null;
};

export type WeekdayRow = { weekday: number } & DaySlots;

export type ExceptionRow = {
  id: string;
  date: string;
  reason: string | null;
  createdAt: Date;
} & DaySlots;

// PostgreSQL devuelve time como HH:MM:SS; el horario trabaja en minutos.
function minutes(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

function daySlots(row: DaySlots): DaySlots {
  return {
    opens1: minutes(row.opens1),
    closes1: minutes(row.closes1),
    opens2: minutes(row.opens2),
    closes2: minutes(row.closes2),
  };
}

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// Una lectura de solo lectura con una única instantánea de la base: el semanal, el cálculo y los
// días especiales de la ruta ven los mismos datos aunque un admin escriba en el medio
// (revisión independiente de la 17.4.1, H-6).
export function withSnapshot<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work, {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

// Serializa las escrituras del horario de una organización: el diff de la auditoría se calcula
// sobre lo leído, y dos administradores que guardan a la vez no pueden pisarse a medias.
export async function lockHours(
  tx: DbTransaction,
  organizationId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`business_hours:${organizationId}`}, 0))`,
  );
}

export async function findWeek(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<WeekdayRow[]> {
  const rows = await executor
    .select({
      weekday: businessHours.weekday,
      opens1: businessHours.opens1,
      closes1: businessHours.closes1,
      opens2: businessHours.opens2,
      closes2: businessHours.closes2,
    })
    .from(businessHours)
    .where(eq(businessHours.organizationId, organizationId))
    .orderBy(asc(businessHours.weekday));
  return rows.map((row) => ({ weekday: row.weekday, ...daySlots(row) }));
}

// La semana entera, una fila por día: se inserta la primera vez y se actualiza después. Nunca se
// borra una fila (D-3).
export async function saveWeek(
  tx: DbTransaction,
  organizationId: string,
  week: WeekdayRow[],
): Promise<void> {
  await tx
    .insert(businessHours)
    .values(week.map((day) => ({ organizationId, ...day })))
    .onConflictDoUpdate({
      target: [businessHours.organizationId, businessHours.weekday],
      set: {
        opens1: sql`excluded.opens_1`,
        closes1: sql`excluded.closes_1`,
        opens2: sql`excluded.opens_2`,
        closes2: sql`excluded.closes_2`,
        updatedAt: sql`now()`,
      },
    });
}

function today(timezone: string): SQL {
  return sql`(now() at time zone ${timezone})::date`;
}

const exceptionColumns = {
  id: businessHourExceptions.id,
  date: businessHourExceptions.date,
  opens1: businessHourExceptions.opens1,
  closes1: businessHourExceptions.closes1,
  opens2: businessHourExceptions.opens2,
  closes2: businessHourExceptions.closes2,
  reason: businessHourExceptions.reason,
  createdAt: businessHourExceptions.createdAt,
};

function exceptionRow(row: ExceptionRow): ExceptionRow {
  return { ...row, ...daySlots(row) };
}

// Las excepciones de hoy en adelante, en el día de la organización. Con days, solo las de los
// próximos días (la lectura del agente, D-6), contados desde from si viene: la fecha local del
// mismo cálculo que open_now, para que las dos lecturas usen el mismo día.
export async function findUpcomingExceptions(
  organizationId: string,
  timezone: string,
  days?: number,
  from?: string,
  executor: Executor = getDb(),
): Promise<ExceptionRow[]> {
  const t = from === undefined ? today(timezone) : sql`${from}::date`;
  const conditions: SQL[] = [
    eq(businessHourExceptions.organizationId, organizationId),
    sql`${businessHourExceptions.date} >= ${t}`,
  ];
  if (days !== undefined) {
    conditions.push(sql`${businessHourExceptions.date} <= ${t} + ${days}::int`);
  }
  const rows = await executor
    .select(exceptionColumns)
    .from(businessHourExceptions)
    .where(and(...conditions))
    .orderBy(asc(businessHourExceptions.date));
  return rows.map(exceptionRow);
}

export async function findException(
  tx: DbTransaction,
  organizationId: string,
  exceptionId: string,
): Promise<ExceptionRow | undefined> {
  const rows = await tx
    .select(exceptionColumns)
    .from(businessHourExceptions)
    .where(
      and(
        eq(businessHourExceptions.organizationId, organizationId),
        eq(businessHourExceptions.id, exceptionId),
      ),
    )
    .limit(1);
  return rows[0] ? exceptionRow(rows[0]) : undefined;
}

// Si la fecha es anterior al día de hoy de la organización.
export async function isPastDate(
  date: string,
  timezone: string,
  executor: Executor = getDb(),
): Promise<boolean> {
  const rows = await executor.execute<{ past: boolean }>(
    sql`select ${date}::date < ${today(timezone)} as past`,
  );
  return rows.rows[0]!.past;
}

function isDateUniqueViolation(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "business_hour_exceptions_organization_date_unique"
  );
}

// En un savepoint: una fecha repetida deshace solo esta escritura.
export async function insertException(
  tx: DbTransaction,
  organizationId: string,
  values: { date: string; reason: string | null } & DaySlots,
): Promise<string | "date_taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(businessHourExceptions)
        .values({ organizationId, ...values })
        .returning({ id: businessHourExceptions.id });
      return rows[0]!.id;
    });
  } catch (error) {
    if (isDateUniqueViolation(error)) return "date_taken";
    throw error;
  }
}

export async function deleteException(
  tx: DbTransaction,
  organizationId: string,
  exceptionId: string,
): Promise<void> {
  const rows = await tx
    .delete(businessHourExceptions)
    .where(
      and(
        eq(businessHourExceptions.organizationId, organizationId),
        eq(businessHourExceptions.id, exceptionId),
      ),
    )
    .returning({ id: businessHourExceptions.id });
  // El llamador ya la leyó en esta transacción, con el lock del horario tomado.
  if (rows.length === 0) {
    throw new Error("deleteException: la fila no existe en esta organización");
  }
}

// El estado del horario en un instante (D-6), todo en SQL: la hora local sale de la zona de la
// organización, y cada día usa su excepción si la tiene o, si no, el horario semanal de su día de
// la semana (isodow: 1 es lunes). Los tramos son intervalos de timestamp local [apertura, cierre).
// Sin `at`, el instante es now() de PostgreSQL; los tests pasan uno fijo.
//
// next_change: si está abierto, el primer cierre posterior que no empalma con otra apertura; si
// está cerrado, la primera apertura posterior. Solo dentro de los próximos 7 días.
//
// days: hoy y los 6 días siguientes, con el día especial ya aplicado (R-1 de la 17.4), del mismo
// cálculo y el mismo instante que open_now. reason es el motivo del día especial, o null.
export type EffectiveDay = {
  date: string;
  weekday: number;
  reason: string | null;
} & DaySlots;

export type HoursStatus = {
  localDate: string;
  localTime: string;
  weekday: number;
  openNow: boolean;
  nextChange: { kind: "opens" | "closes"; date: string; time: string } | null;
  days: EffectiveDay[];
};

export async function computeStatus(
  organizationId: string,
  timezone: string,
  at: Date | null = null,
  executor: Executor = getDb(),
): Promise<HoursStatus> {
  const instant =
    at === null ? sql`now()` : sql`${at.toISOString()}::timestamptz`;
  const result = await executor.execute<{
    local_date: string;
    local_time: string;
    weekday: number;
    open_now: boolean;
    next_open: string | null;
    next_close: string | null;
    days: EffectiveDay[];
  }>(sql`
    with clock as (
      select (${instant} at time zone ${timezone}) as local_now
    ),
    days as (
      select offset_days, (clock.local_now::date + offset_days)::date as day
      from clock, generate_series(0, 8) as offset_days
    ),
    effective as (
      select
        days.offset_days,
        days.day,
        e.reason,
        case when e.id is not null then e.opens_1 else w.opens_1 end as opens_1,
        case when e.id is not null then e.closes_1 else w.closes_1 end as closes_1,
        case when e.id is not null then e.opens_2 else w.opens_2 end as opens_2,
        case when e.id is not null then e.closes_2 else w.closes_2 end as closes_2
      from days
      left join ${businessHourExceptions} e
        on e.organization_id = ${organizationId} and e.date = days.day
      left join ${businessHours} w
        on w.organization_id = ${organizationId}
        and w.weekday = extract(isodow from days.day)
    ),
    slots as (
      select day + opens_1 as starts, day + closes_1 as ends
      from effective where opens_1 is not null
      union all
      select day + opens_2, day + closes_2
      from effective where opens_2 is not null
    )
    select
      to_char(clock.local_now, 'YYYY-MM-DD') as local_date,
      to_char(clock.local_now, 'HH24:MI') as local_time,
      extract(isodow from clock.local_now)::int as weekday,
      exists (
        select 1 from slots
        where slots.starts <= clock.local_now and clock.local_now < slots.ends
      ) as open_now,
      (
        select to_char(min(slots.starts), 'YYYY-MM-DD"T"HH24:MI') from slots
        where slots.starts > clock.local_now
          and slots.starts <= clock.local_now + interval '7 days'
      ) as next_open,
      (
        select to_char(min(s.ends), 'YYYY-MM-DD"T"HH24:MI') from slots s
        where s.ends > clock.local_now
          and s.ends <= clock.local_now + interval '7 days'
          and not exists (select 1 from slots s2 where s2.starts = s.ends)
      ) as next_close,
      (
        select coalesce(json_agg(json_build_object(
          'date', to_char(day, 'YYYY-MM-DD'),
          'weekday', extract(isodow from day)::int,
          'reason', reason,
          'opens1', left(opens_1::text, 5),
          'closes1', left(closes_1::text, 5),
          'opens2', left(opens_2::text, 5),
          'closes2', left(closes_2::text, 5)
        ) order by day), '[]'::json)
        from effective where offset_days < 7
      ) as days
    from clock
  `);
  const row = result.rows[0]!;
  const next = row.open_now ? row.next_close : row.next_open;
  return {
    localDate: row.local_date,
    localTime: row.local_time,
    weekday: Number(row.weekday),
    openNow: row.open_now,
    nextChange:
      next === null
        ? null
        : {
            kind: row.open_now ? "closes" : "opens",
            date: next.slice(0, 10),
            time: next.slice(11, 16),
          },
    days: row.days,
  };
}

// Los días de un rango de fechas locales, con el día especial ya aplicado, como days de computeStatus
// pero para cualquier fecha (brief-29.10, H-1): el calendario de turnos los lee. Las fechas van
// AAAA-MM-DD, from <= to, y el servicio acota el largo del rango. Con los días, cuántos días de la
// semana tienen fila: el servicio decide con eso si el horario está cargado.
export async function findEffectiveDays(
  organizationId: string,
  from: string,
  to: string,
  executor: Executor = getDb(),
): Promise<{ weekdays: number; days: EffectiveDay[] }> {
  const result = await executor.execute<{
    weekdays: number;
    days: EffectiveDay[];
  }>(sql`
    with days as (
      select day::date as day
      from generate_series(${from}::date, ${to}::date, interval '1 day') as day
    ),
    effective as (
      select
        days.day,
        e.reason,
        case when e.id is not null then e.opens_1 else w.opens_1 end as opens_1,
        case when e.id is not null then e.closes_1 else w.closes_1 end as closes_1,
        case when e.id is not null then e.opens_2 else w.opens_2 end as opens_2,
        case when e.id is not null then e.closes_2 else w.closes_2 end as closes_2
      from days
      left join ${businessHourExceptions} e
        on e.organization_id = ${organizationId} and e.date = days.day
      left join ${businessHours} w
        on w.organization_id = ${organizationId}
        and w.weekday = extract(isodow from days.day)
    )
    select coalesce(json_agg(json_build_object(
      'date', to_char(day, 'YYYY-MM-DD'),
      'weekday', extract(isodow from day)::int,
      'reason', reason,
      'opens1', left(opens_1::text, 5),
      'closes1', left(closes_1::text, 5),
      'opens2', left(opens_2::text, 5),
      'closes2', left(closes_2::text, 5)
    ) order by day), '[]'::json) as days,
    (select count(*)::int from ${businessHours}
      where organization_id = ${organizationId}) as weekdays
    from effective
  `);
  return result.rows[0]!;
}
