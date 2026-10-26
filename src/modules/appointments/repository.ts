import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  appointmentReasons,
  appointments,
  appointmentSettings,
  appointmentStatus,
} from "./schema";

// Acceso a las tablas de appointments (brief-29.10, D-2 y D-3). Toda consulta filtra por organization_id
// en SQL, también las escrituras por id. Toda cuenta con la hora la hace PostgreSQL en la zona de la
// organización: el servicio trabaja con fechas y horas locales en texto. Las escrituras son las de
// tests/guards/appointments-dependencies.test.ts: cada una con su función y su llamador.

type Executor = Db | DbTransaction;

export type AppointmentStatus = (typeof appointmentStatus.enumValues)[number];

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

function uniqueViolationOf(error: unknown, constraint: string): boolean {
  for (
    let current: unknown = error;
    current;
    current = (current as { cause?: unknown }).cause
  ) {
    const candidate = current as { code?: string; constraint?: string };
    if (candidate.code === "23505" && candidate.constraint === constraint) {
      return true;
    }
  }
  return false;
}

// La fecha y la hora locales de ahora, en la zona de la organización.
export async function findLocalNow(
  timezone: string,
  executor: Executor = getDb(),
): Promise<{ date: string; time: string }> {
  const result = await executor.execute<{ date: string; time: string }>(
    sql`select to_char(now() at time zone ${timezone}, 'YYYY-MM-DD') as date,
               to_char(now() at time zone ${timezone}, 'HH24:MI') as time`,
  );
  return result.rows[0]!;
}

// Los valores sueltos (D-2).

export type SettingsRow = {
  id: string;
  slotMinutes: number;
  capacity: number;
  isExample: boolean;
};

export type SettingsValues = Omit<SettingsRow, "id">;

const SETTINGS_UNIQUE = "appointment_settings_organization_unique";

// forUpdate serializa las altas de turnos de la organización: el cupo se cuenta bajo este bloqueo (D-3).
export async function findAppointmentSettings(
  organizationId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<SettingsRow | undefined> {
  const query = executor
    .select({
      id: appointmentSettings.id,
      slotMinutes: appointmentSettings.slotMinutes,
      capacity: appointmentSettings.capacity,
      isExample: appointmentSettings.isExample,
    })
    .from(appointmentSettings)
    .where(eq(appointmentSettings.organizationId, organizationId))
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

export async function insertAppointmentSettings(
  tx: DbTransaction,
  organizationId: string,
  values: SettingsValues,
): Promise<string | "taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(appointmentSettings)
        .values({ organizationId, ...values })
        .returning({ id: appointmentSettings.id });
      return rows[0]!.id;
    });
  } catch (error) {
    if (uniqueViolationOf(error, SETTINGS_UNIQUE)) return "taken";
    throw error;
  }
}

export async function updateAppointmentSettings(
  tx: DbTransaction,
  organizationId: string,
  values: SettingsValues,
): Promise<void> {
  const rows = await tx
    .update(appointmentSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(appointmentSettings.organizationId, organizationId))
    .returning({ id: appointmentSettings.id });
  if (rows.length === 0) {
    throw new Error(
      "updateAppointmentSettings: la organización no tiene valores",
    );
  }
}

// Los motivos (D-2).

export type ReasonRow = {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  isExample: boolean;
};

const reasonColumns = {
  id: appointmentReasons.id,
  name: appointmentReasons.name,
  position: appointmentReasons.position,
  isActive: appointmentReasons.isActive,
  isExample: appointmentReasons.isExample,
};

// En su orden, y el id para desempatar. lock: "update" bloquea la lista entera: dos altas o dos
// movimientos se ordenan.
export async function findReasons(
  organizationId: string,
  executor: Executor = getDb(),
  options: { lock?: "update" } = {},
): Promise<ReasonRow[]> {
  const query = executor
    .select(reasonColumns)
    .from(appointmentReasons)
    .where(eq(appointmentReasons.organizationId, organizationId))
    .orderBy(asc(appointmentReasons.position), asc(appointmentReasons.id));
  return options.lock ? query.for(options.lock) : query;
}

export async function findReason(
  organizationId: string,
  reasonId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<ReasonRow | undefined> {
  const query = executor
    .select(reasonColumns)
    .from(appointmentReasons)
    .where(
      and(
        eq(appointmentReasons.organizationId, organizationId),
        eq(appointmentReasons.id, reasonId),
      ),
    )
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

const REASON_NAME_UNIQUE = "appointment_reasons_organization_name_lower_unique";

// Corre en un savepoint: un nombre repetido deshace solo esta escritura.
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | "name_taken"> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    if (uniqueViolationOf(error, REASON_NAME_UNIQUE)) return "name_taken";
    throw error;
  }
}

export type ReasonValues = Omit<ReasonRow, "id">;

export function insertReason(
  tx: DbTransaction,
  organizationId: string,
  values: ReasonValues,
): Promise<string | "name_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(appointmentReasons)
      .values({ organizationId, ...values })
      .returning({ id: appointmentReasons.id });
    return rows[0]!.id;
  });
}

export function updateReason(
  tx: DbTransaction,
  organizationId: string,
  reasonId: string,
  values: Partial<Pick<ReasonRow, "name" | "position" | "isActive">>,
): Promise<void | "name_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(appointmentReasons)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(appointmentReasons.organizationId, organizationId),
          eq(appointmentReasons.id, reasonId),
        ),
      )
      .returning({ id: appointmentReasons.id });
    if (rows.length === 0) {
      throw new Error("updateReason: el motivo no existe");
    }
  });
}

// Los turnos (D-2 y D-3).

export type AppointmentRow = {
  id: string;
  clientId: string;
  reasonId: string;
  productId: string | null;
  unitId: string | null;
  note: string | null;
  status: AppointmentStatus;
  // La fecha y las horas locales, en la zona que se pidió.
  date: string;
  start: string;
  end: string;
  // Si ya empezó, según now() de PostgreSQL.
  started: boolean;
  createdBy: string;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  attendedAt: Date | null;
  noShowAt: Date | null;
};

function appointmentColumns(timezone: string) {
  return {
    id: appointments.id,
    clientId: appointments.clientId,
    reasonId: appointments.reasonId,
    productId: appointments.productId,
    unitId: appointments.unitId,
    note: appointments.note,
    status: appointments.status,
    date: sql<string>`to_char(${appointments.startsAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
    start: sql<string>`to_char(${appointments.startsAt} at time zone ${timezone}, 'HH24:MI')`,
    end: sql<string>`to_char(${appointments.endsAt} at time zone ${timezone}, 'HH24:MI')`,
    started: sql<boolean>`${appointments.startsAt} <= now()`,
    createdBy: appointments.createdBy,
    createdAt: appointments.createdAt,
    confirmedAt: appointments.confirmedAt,
    cancelledAt: appointments.cancelledAt,
    attendedAt: appointments.attendedAt,
    noShowAt: appointments.noShowAt,
  };
}

// El instante de una fecha y una hora locales de la organización.
function localInstant(date: string, time: string, timezone: string) {
  return sql`((${date}::date + ${time}::time) at time zone ${timezone})`;
}

// Los turnos que empiezan entre dos fechas locales, las dos incluidas, por su inicio y, a igual
// inicio, en el orden en que se dieron.
export async function findAppointmentsBetween(
  organizationId: string,
  timezone: string,
  from: string,
  to: string,
  executor: Executor = getDb(),
): Promise<AppointmentRow[]> {
  return executor
    .select(appointmentColumns(timezone))
    .from(appointments)
    .where(
      and(
        eq(appointments.organizationId, organizationId),
        sql`${appointments.startsAt} >= ${localInstant(from, "00:00", timezone)}`,
        sql`${appointments.startsAt} < (((${to}::date + 1)::timestamp) at time zone ${timezone})`,
      ),
    )
    .orderBy(
      asc(appointments.startsAt),
      asc(appointments.createdAt),
      asc(appointments.id),
    );
}

export async function findAppointment(
  organizationId: string,
  appointmentId: string,
  timezone: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<AppointmentRow | undefined> {
  const query = executor
    .select(appointmentColumns(timezone))
    .from(appointments)
    .where(
      and(
        eq(appointments.organizationId, organizationId),
        eq(appointments.id, appointmentId),
      ),
    )
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

// Los turnos de un cliente, del más nuevo al más viejo.
export async function findClientAppointments(
  organizationId: string,
  clientId: string,
  timezone: string,
  limit: number,
): Promise<AppointmentRow[]> {
  return getDb()
    .select(appointmentColumns(timezone))
    .from(appointments)
    .where(
      and(
        eq(appointments.organizationId, organizationId),
        eq(appointments.clientId, clientId),
      ),
    )
    .orderBy(desc(appointments.startsAt), desc(appointments.id))
    .limit(limit);
}

// Cuántos turnos que ocupan su franja se superponen a una franja local (D-3). Se llama bajo el bloqueo
// de los valores de la organización.
export async function countOccupying(
  tx: DbTransaction,
  organizationId: string,
  slot: { date: string; start: string; end: string; timezone: string },
): Promise<number> {
  const result = await tx.execute<{ taken: number }>(
    sql`select count(*)::int as taken from ${appointments}
        where organization_id = ${organizationId}
          and status::text in ('requested', 'confirmed')
          and starts_at < ${localInstant(slot.date, slot.end, slot.timezone)}
          and ${localInstant(slot.date, slot.start, slot.timezone)} < ends_at`,
  );
  return result.rows[0]!.taken;
}

// Si el inicio y el fin de una franja local existen ese día en la zona (D-7). El día que empieza el
// horario de verano falta una hora, y PostgreSQL corre hacia adelante la hora que no existe: el turno se
// guardaría a otra hora que la elegida.
export async function slotExists(
  executor: Executor,
  slot: { date: string; start: string; end: string; timezone: string },
): Promise<boolean> {
  const exists = (time: string) =>
    sql`(${localInstant(slot.date, time, slot.timezone)} at time zone ${slot.timezone})
          = (${slot.date}::date + ${time}::time)`;
  const result = await executor.execute<{ exists: boolean }>(
    sql`select ${exists(slot.start)} and ${exists(slot.end)} as exists`,
  );
  return result.rows[0]!.exists;
}

export type NewAppointment = {
  clientId: string;
  reasonId: string;
  productId: string | null;
  unitId: string | null;
  note: string | null;
  date: string;
  start: string;
  end: string;
  timezone: string;
  status: "requested" | "confirmed";
  createdBy: string;
};

export async function insertAppointment(
  tx: DbTransaction,
  organizationId: string,
  values: NewAppointment,
): Promise<string> {
  const { date, start, end, timezone, status, ...rest } = values;
  const rows = await tx
    .insert(appointments)
    .values({
      organizationId,
      ...rest,
      status,
      startsAt: localInstant(date, start, timezone),
      endsAt: localInstant(date, end, timezone),
      confirmedAt: status === "confirmed" ? sql`now()` : null,
    })
    .returning({ id: appointments.id });
  return rows[0]!.id;
}

const STATUS_DATE = {
  confirmed: "confirmedAt",
  cancelled: "cancelledAt",
  attended: "attendedAt",
  no_show: "noShowAt",
} as const;

// Un cambio de estado fija la fecha de su paso (D-2). El trigger rechaza una transición que no está en
// la lista o que cambie otra columna.
export async function updateAppointmentStatus(
  tx: DbTransaction,
  organizationId: string,
  appointmentId: string,
  status: Exclude<AppointmentStatus, "requested">,
): Promise<void> {
  const rows = await tx
    .update(appointments)
    .set({ status, [STATUS_DATE[status]]: sql`now()`, updatedAt: new Date() })
    .where(
      and(
        eq(appointments.organizationId, organizationId),
        eq(appointments.id, appointmentId),
      ),
    )
    .returning({ id: appointments.id });
  if (rows.length === 0) {
    throw new Error("updateAppointmentStatus: el turno no existe");
  }
}
