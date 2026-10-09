import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import {
  authorize,
  getMemberSummaries,
  getOrganizationTimezone,
  getOrganizationTimezoneForService,
  type AuthContext,
} from "@/modules/organizations";
import { isCalendarDate } from "@/shared/calendar";
import { failure, type Failure } from "@/shared/errors";
import * as hours from "./hours-repository";
import * as repository from "./repository";

// Horario de atención (brief-17.4): FR-INFO-04 (el semanal y las excepciones, escritos por un
// admin y auditados en la misma transacción), FR-INFO-05 (lo ven todos los roles) y FR-INFO-06
// (si está abierto ahora, calculado por PostgreSQL en la zona de la organización).

export type Slot = hours.Slot;
export type HoursStatus = hours.HoursStatus;

// 1 es lunes y 7 es domingo (ISO 8601), como isodow de PostgreSQL.
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type BusinessDay = { weekday: Weekday; slots: Slot[] };
export type BusinessException = {
  id: string;
  date: string;
  slots: Slot[];
  reason: string | null;
};

// Lo que llega de un formulario: HH:MM o vacío.
export type DaySlotsInput = {
  opens1: string;
  closes1: string;
  opens2: string;
  closes2: string;
};

export type WeekInput = Record<Weekday, DaySlotsInput>;
export type WeekField = `day${Weekday}`;

export type ExceptionInput = DaySlotsInput & { date: string; reason: string };
export type ExceptionField = "date" | "slots" | "reason";

// Minutos enteros de 00:00 a 23:59: ningún tramo cruza la medianoche (D-2).
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function optionalTime(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return TIME.test(trimmed) ? trimmed : undefined;
}

// Las mismas reglas que los CHECK de la base: cada tramo completo y en orden, el segundo solo con
// el primero y después de él, sin tocarlo. undefined: el día es inválido. HH:MM se compara como
// texto en el orden del reloj.
export function validateDaySlots(
  input: DaySlotsInput,
): hours.DaySlots | undefined {
  const opens1 = optionalTime(input.opens1);
  const closes1 = optionalTime(input.closes1);
  const opens2 = optionalTime(input.opens2);
  const closes2 = optionalTime(input.closes2);
  if (
    opens1 === undefined ||
    closes1 === undefined ||
    opens2 === undefined ||
    closes2 === undefined
  ) {
    return undefined;
  }
  if ((opens1 === null) !== (closes1 === null)) return undefined;
  if ((opens2 === null) !== (closes2 === null)) return undefined;
  if (opens1 !== null && closes1 !== null && opens1 >= closes1) {
    return undefined;
  }
  if (opens2 !== null && closes2 !== null) {
    if (opens1 === null || closes1 === null) return undefined;
    if (opens2 >= closes2 || opens2 <= closes1) return undefined;
  }
  return { opens1, closes1, opens2, closes2 };
}

export function toSlots(day: hours.DaySlots): Slot[] {
  const slots: Slot[] = [];
  if (day.opens1 !== null && day.closes1 !== null) {
    slots.push({ opens: day.opens1, closes: day.closes1 });
  }
  if (day.opens2 !== null && day.closes2 !== null) {
    slots.push({ opens: day.opens2, closes: day.closes2 });
  }
  return slots;
}

export function validateWeekInput(
  input: WeekInput,
):
  | { ok: true; week: hours.WeekdayRow[] }
  | Failure<"VALIDATION_ERROR", { fields: WeekField[] }> {
  const week: hours.WeekdayRow[] = [];
  const fields: WeekField[] = [];
  for (const weekday of WEEKDAYS) {
    const day = validateDaySlots(input[weekday]);
    if (day === undefined) fields.push(`day${weekday}`);
    else week.push({ weekday, ...day });
  }
  if (fields.length > 0) return { ok: false, code: "VALIDATION_ERROR", fields };
  return { ok: true, week };
}

const reasonSchema = z
  .string()
  .trim()
  .max(100)
  .transform((value) => (value === "" ? null : value));

export function validateExceptionInput(input: ExceptionInput):
  | {
      ok: true;
      values: { date: string; reason: string | null } & hours.DaySlots;
    }
  | Failure<"VALIDATION_ERROR", { fields: ExceptionField[] }> {
  const fields: ExceptionField[] = [];
  const date = input.date.trim();
  if (!isCalendarDate(date)) fields.push("date");
  const day = validateDaySlots(input);
  if (day === undefined) fields.push("slots");
  const reason = reasonSchema.safeParse(input.reason);
  if (!reason.success) fields.push("reason");
  if (fields.length > 0 || day === undefined || !reason.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }
  return { ok: true, values: { date, reason: reason.data, ...day } };
}

// Lectura de la pantalla: admin y viewer (FR-INFO-05). Sin horario cargado, los siete días salen
// cerrados y configured es false. hoursEntry es una entrada de texto vigente de la categoría
// «Horarios», para avisar que conviven (D-5).
export type BusinessHoursView = {
  ok: true;
  configured: boolean;
  week: BusinessDay[];
  exceptions: BusinessException[];
  timezone: string;
  hoursEntry: { id: string; title: string } | null;
};

function weekView(rows: hours.WeekdayRow[]): BusinessDay[] {
  return WEEKDAYS.map((weekday) => {
    const row = rows.find((candidate) => candidate.weekday === weekday);
    return { weekday, slots: row ? toSlots(row) : [] };
  });
}

function exceptionView(row: hours.ExceptionRow): BusinessException {
  return {
    id: row.id,
    date: row.date,
    slots: toSlots(row),
    reason: row.reason,
  };
}

export async function getBusinessHours(
  context: AuthContext,
): Promise<BusinessHoursView | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const timezone = await getOrganizationTimezone(context);
  const [rows, exceptions, hoursEntry] = await Promise.all([
    hours.findWeek(context.organizationId),
    hours.findUpcomingExceptions(context.organizationId, timezone),
    repository.findCurrentEntryInCategories(context.organizationId, timezone, [
      "horario",
      "horarios",
    ]),
  ]);
  return {
    ok: true,
    configured: rows.length === WEEKDAYS.length,
    week: weekView(rows),
    exceptions: exceptions.map(exceptionView),
    timezone,
    hoursEntry: hoursEntry ?? null,
  };
}

// Escrituras: solo admin. La semana se guarda entera (D-4); la auditoría lleva solo los días que
// cambiaron. Todo cambio del horario se audita como update de la entidad business_hours, con el
// id de la organización.

// La auditoría guarda valores simples: un día es «09:00-13:00,16:00-20:00», vacío si está cerrado
// y null si el horario no estaba cargado.
export function slotsText(day: hours.DaySlots): string {
  return toSlots(day)
    .map((slot) => `${slot.opens}-${slot.closes}`)
    .join(",");
}

function auditDay(day: hours.DaySlots | undefined): string | null {
  return day ? slotsText(day) : null;
}

function sameDay(a: hours.DaySlots | undefined, b: hours.DaySlots): boolean {
  return (
    a !== undefined &&
    a.opens1 === b.opens1 &&
    a.closes1 === b.closes1 &&
    a.opens2 === b.opens2 &&
    a.closes2 === b.closes2
  );
}

export type SaveWeekResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR", { fields: WeekField[] }>;

export async function saveBusinessWeek(
  context: AuthContext,
  input: WeekInput,
): Promise<SaveWeekResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateWeekInput(input);
  if (!validated.ok) return validated;
  const { week } = validated;

  return hours.withTransaction(async (tx): Promise<SaveWeekResult> => {
    await hours.lockHours(tx, context.organizationId);
    const current = await hours.findWeek(context.organizationId, tx);
    const changed = week.filter(
      (day) =>
        !sameDay(
          current.find((row) => row.weekday === day.weekday),
          day,
        ),
    );
    if (changed.length === 0) return { ok: true, changed: false };

    await hours.saveWeek(tx, context.organizationId, week);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "business_hours",
      entityId: context.organizationId,
      action: "update",
      diff: {
        before: Object.fromEntries(
          changed.map((day) => [
            `day${day.weekday}`,
            auditDay(current.find((row) => row.weekday === day.weekday)),
          ]),
        ),
        after: Object.fromEntries(
          changed.map((day) => [`day${day.weekday}`, auditDay(day)]),
        ),
      },
    });
    return { ok: true, changed: true };
  });
}

export type AddExceptionResult =
  | { ok: true }
  | Failure<"FORBIDDEN" | "CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: ExceptionField[] }>;

// Una fecha anterior al día de hoy de la organización no se acepta: una excepción pasada no
// cambia nada. Una fecha que ya tiene excepción da CONFLICT.
export async function addBusinessHourException(
  context: AuthContext,
  input: ExceptionInput,
): Promise<AddExceptionResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateExceptionInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const timezone = await getOrganizationTimezone(context);

  return hours.withTransaction(async (tx): Promise<AddExceptionResult> => {
    if (await hours.isPastDate(values.date, timezone, tx)) {
      return { ok: false, code: "VALIDATION_ERROR", fields: ["date"] };
    }
    await hours.lockHours(tx, context.organizationId);
    const id = await hours.insertException(tx, context.organizationId, values);
    if (id === "date_taken") return failure("CONFLICT");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "business_hours",
      entityId: context.organizationId,
      action: "update",
      diff: {
        before: {
          exception: null,
          exceptionHours: null,
          exceptionReason: null,
        },
        after: {
          exception: values.date,
          exceptionHours: slotsText(values),
          exceptionReason: values.reason,
        },
      },
    });
    return { ok: true };
  });
}

const exceptionIdSchema = z.uuid();

export type RemoveExceptionResult =
  { ok: true } | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function removeBusinessHourException(
  context: AuthContext,
  exceptionId: string,
): Promise<RemoveExceptionResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!exceptionIdSchema.safeParse(exceptionId).success) {
    return failure("VALIDATION_ERROR");
  }
  const timezone = await getOrganizationTimezone(context);

  return hours.withTransaction(async (tx): Promise<RemoveExceptionResult> => {
    await hours.lockHours(tx, context.organizationId);
    const current = await hours.findException(
      tx,
      context.organizationId,
      exceptionId,
    );
    if (!current) return failure("NOT_FOUND");
    // Uno pasado no se muestra ni se borra (P-5): para quien lo pide, ya no existe. Pasa si la
    // pantalla quedó abierta después de la medianoche (revisión independiente de la 17.4.1, H-3).
    if (await hours.isPastDate(current.date, timezone, tx)) {
      return failure("NOT_FOUND");
    }
    await hours.deleteException(tx, context.organizationId, current.id);
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "business_hours",
      entityId: context.organizationId,
      action: "update",
      diff: {
        before: {
          exception: current.date,
          exceptionHours: slotsText(current),
          exceptionReason: current.reason,
        },
        after: { exception: null, exceptionHours: null, exceptionReason: null },
      },
    });
    return { ok: true };
  });
}

// Historial del horario (FR-AUD-02), solo para admin, como el de una entrada.
export type BusinessHoursAuditResult =
  | {
      ok: true;
      entries: NamedAuditLogEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN">;

export async function listBusinessHoursAudit(
  context: AuthContext,
  page: number,
): Promise<BusinessHoursAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const logs = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["business_hours"],
    entityId: context.organizationId,
    page,
  });
  const names = new Map(
    (
      await getMemberSummaries(
        context.organizationId,
        auditUserIds(logs.entries),
      )
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: nameAuditActors(logs.entries, names),
    total: logs.total,
    page: logs.page,
    pageCount: logs.pageCount,
  };
}

// Lectura de servicio (D-6; FR-API-10). La llama la API de lectura con la organización de una
// credencial de alcance `read`, sin persona ni rol. at: solo para los tests; en producción, el
// instante es now() de PostgreSQL.
export const NEXT_CHANGE_DAYS = 7;
export const EXCEPTION_DAYS = 30;

// days: hoy y los 6 días siguientes, con el día especial ya aplicado (R-1 de la 17.4).
export type EffectiveBusinessDay = {
  date: string;
  weekday: Weekday;
  slots: Slot[];
  reason: string | null;
};

export type BusinessHoursForService = {
  configured: boolean;
  timezone: string;
  status: HoursStatus;
  week: BusinessDay[];
  exceptions: BusinessException[];
  days: EffectiveBusinessDay[];
};

export async function getBusinessHoursForService(
  organizationId: string,
  at: Date | null = null,
): Promise<BusinessHoursForService> {
  const timezone = await getOrganizationTimezoneForService(organizationId);
  // Las tres lecturas, en una instantánea: now() de PostgreSQL es el inicio de la transacción, y
  // los días especiales se cuentan desde la fecha local del cálculo.
  const { rows, status, exceptions } = await hours.withSnapshot(async (tx) => {
    const rows = await hours.findWeek(organizationId, tx);
    const status = await hours.computeStatus(organizationId, timezone, at, tx);
    const exceptions = await hours.findUpcomingExceptions(
      organizationId,
      timezone,
      EXCEPTION_DAYS,
      status.localDate,
      tx,
    );
    return { rows, status, exceptions };
  });
  return {
    configured: rows.length === WEEKDAYS.length,
    timezone,
    status,
    week: weekView(rows),
    exceptions: exceptions.map(exceptionView),
    days: status.days.map((day) => ({
      date: day.date,
      weekday: day.weekday as Weekday,
      slots: toSlots(day),
      reason: day.reason,
    })),
  };
}

// Para los tests de integración del cálculo (AC-4), con la zona de la organización.
export async function getBusinessHoursStatusAt(
  context: AuthContext,
  at: Date,
): Promise<HoursStatus | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const timezone = await getOrganizationTimezone(context);
  return hours.computeStatus(context.organizationId, timezone, at);
}
