import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import { getProductsByIds } from "@/modules/catalog";
import { getClientsByIds, lockClientForOrder } from "@/modules/crm";
import { getUnitSummaries } from "@/modules/inventory";
import {
  getEffectiveBusinessDays,
  type EffectiveBusinessDay,
} from "@/modules/knowledge";
import {
  getMemberSummaries,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { isCalendarDate } from "@/shared/calendar";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";
import { APPOINTMENT_NOTE_MAX_LENGTH, BOOKING_HORIZON_DAYS } from "./schema";
import { requireAppointments } from "./settings";
import {
  addDays,
  buildBookingSlots,
  canTransition,
  isInsideHours,
  needsStarted,
  occupancy,
  OCCUPYING_STATUSES,
  overlaps,
  type BookingSlot,
  type OpeningSpan,
} from "./slots";

// Los turnos para visitar el local (ADR 0024, punto 12; brief-29.10, D-2 a D-5). El calendario sale del
// horario del local (knowledge), con la duración y el cupo de la organización. Un admin da un turno,
// que nace confirmado, y lo confirma, cancela o marca atendido o ausente; un viewer ve el calendario,
// los turnos y su historia. Cada escritura se audita como appointment.

export { addDays, APPOINTMENT_NOTE_MAX_LENGTH, BOOKING_HORIZON_DAYS };

export type AppointmentStatus = repository.AppointmentStatus;

const idSchema = z.uuid();
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function spansOf(day: EffectiveBusinessDay | undefined): OpeningSpan[] {
  return (day?.slots ?? []).map((slot) => ({
    opens: slot.opens,
    closes: slot.closes,
  }));
}

// Una franja ya empezó si su fecha es anterior a hoy, o es hoy y su inicio no es posterior a ahora.
function hasStarted(
  date: string,
  start: string,
  now: { date: string; time: string },
): boolean {
  return date < now.date || (date === now.date && start <= now.time);
}

// El calendario (D-5).

export type CalendarSlot = BookingSlot & {
  occupied: number;
  free: boolean;
  started: boolean;
  overCapacity: boolean;
};

export type CalendarAppointment = BookingSlot & {
  id: string;
  status: AppointmentStatus;
  clientName: string;
  reasonName: string;
  // U-5: un turno que ocupa su franja y quedó fuera del horario vigente, o sobre el cupo.
  outsideHours: boolean;
  overCapacity: boolean;
};

export type CalendarDay = {
  date: string;
  weekday: number;
  // El motivo del día especial del horario, si lo hay.
  specialReason: string | null;
  open: boolean;
  slots: CalendarSlot[];
  appointments: CalendarAppointment[];
};

export type AppointmentCalendar = {
  today: string;
  timezone: string;
  hoursConfigured: boolean;
  settings: { slotMinutes: number; capacity: number } | null;
  days: CalendarDay[];
};

export const CALENDAR_SPANS = [1, 7] as const;

export async function getAppointmentCalendar(
  context: AuthContext,
  input: { from: string; days: number },
): Promise<
  | { ok: true; calendar: AppointmentCalendar }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireAppointments(context);
  if (!allowed.ok) return allowed;
  if (
    !isCalendarDate(input.from) ||
    !(CALENDAR_SPANS as readonly number[]).includes(input.days)
  ) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const to = addDays(input.from, input.days - 1);
  // Al final del calendario (9999-12-31), el rango se sale de las fechas que PostgreSQL lee.
  if (!isCalendarDate(to)) return failure("VALIDATION_ERROR");
  const timezone = await getOrganizationTimezone(context);
  const [settings, effective, now, rows, reasons] = await Promise.all([
    repository.findAppointmentSettings(organizationId),
    getEffectiveBusinessDays(organizationId, input.from, to),
    repository.findLocalNow(timezone),
    repository.findAppointmentsBetween(
      organizationId,
      timezone,
      input.from,
      to,
    ),
    repository.findReasons(organizationId),
  ]);
  const clients = await clientNames(
    context,
    rows.map((row) => row.clientId),
  );
  const reasonNames = new Map(
    reasons.map((reason) => [reason.id, reason.name]),
  );
  const days = (effective?.days ?? []).map((day): CalendarDay => {
    const spans = spansOf(day);
    const grid = settings ? buildBookingSlots(spans, settings.slotMinutes) : [];
    const dayRows = rows.filter((row) => row.date === day.date);
    const capacity = settings?.capacity ?? 0;
    const occupied = occupancy(grid, dayRows);
    const slots = occupied.map((slot) => {
      const started = hasStarted(day.date, slot.start, now);
      return {
        ...slot,
        started,
        free: !started && slot.occupied < capacity,
        overCapacity: slot.occupied > capacity,
      };
    });
    return {
      date: day.date,
      weekday: day.weekday,
      specialReason: day.reason,
      open: spans.length > 0,
      slots,
      appointments: dayRows.map((row) => {
        const occupying = OCCUPYING_STATUSES.includes(row.status);
        return {
          id: row.id,
          start: row.start,
          end: row.end,
          status: row.status,
          clientName: clients.get(row.clientId) ?? "",
          reasonName: reasonNames.get(row.reasonId) ?? "",
          outsideHours: occupying && !isInsideHours(row, spans),
          overCapacity:
            occupying &&
            slots.some((slot) => slot.overCapacity && overlaps(slot, row)),
        };
      }),
    };
  });
  return {
    ok: true,
    calendar: {
      today: now.date,
      timezone,
      hoursConfigured: effective?.configured ?? false,
      settings: settings
        ? { slotMinutes: settings.slotMinutes, capacity: settings.capacity }
        : null,
      days,
    },
  };
}

async function clientNames(
  context: AuthContext,
  clientIds: string[],
): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map();
  const found = await getClientsByIds(context, clientIds);
  return new Map(
    found.ok
      ? found.clients.map((client) => [client.id, client.displayName])
      : [],
  );
}

// El formulario de un turno nuevo (D-5): los motivos activos y las franjas libres de una fecha.

export type AppointmentReference =
  | { kind: "product"; id: string; label: string }
  | { kind: "unit"; id: string; label: string };

export type AppointmentForm = {
  today: string;
  maxDate: string;
  date: string;
  hoursConfigured: boolean;
  configured: boolean;
  reasons: { id: string; name: string }[];
  freeSlots: BookingSlot[];
  client: { id: string; name: string } | null;
  reference: AppointmentReference | null;
};

export async function getAppointmentForm(
  context: AuthContext,
  input: {
    date?: string;
    clientId?: string;
    productId?: string;
    unitId?: string;
  },
): Promise<
  { ok: true; form: AppointmentForm } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  const { organizationId } = context;
  const timezone = await getOrganizationTimezone(context);
  const [settings, reasons, now] = await Promise.all([
    repository.findAppointmentSettings(organizationId),
    repository.findReasons(organizationId),
    repository.findLocalNow(timezone),
  ]);
  const maxDate = addDays(now.date, BOOKING_HORIZON_DAYS);
  const date =
    input.date && isCalendarDate(input.date) && input.date >= now.date
      ? input.date <= maxDate
        ? input.date
        : maxDate
      : now.date;
  const effective = await getEffectiveBusinessDays(organizationId, date, date);
  const freeSlots = settings
    ? await freeSlotsOf(
        organizationId,
        timezone,
        date,
        effective?.days[0],
        settings,
        now,
      )
    : [];
  const client = await formClient(context, input.clientId);
  const reference = await formReference(context, input);
  return {
    ok: true,
    form: {
      today: now.date,
      maxDate,
      date,
      hoursConfigured: effective?.configured ?? false,
      configured: settings !== undefined,
      reasons: reasons
        .filter((reason) => reason.isActive)
        .map((reason) => ({ id: reason.id, name: reason.name })),
      freeSlots,
      client,
      reference,
    },
  };
}

async function freeSlotsOf(
  organizationId: string,
  timezone: string,
  date: string,
  day: EffectiveBusinessDay | undefined,
  settings: { slotMinutes: number; capacity: number },
  now: { date: string; time: string },
): Promise<BookingSlot[]> {
  const rows = await repository.findAppointmentsBetween(
    organizationId,
    timezone,
    date,
    date,
  );
  const grid = buildBookingSlots(spansOf(day), settings.slotMinutes);
  return occupancy(grid, rows)
    .filter(
      (slot) =>
        !hasStarted(date, slot.start, now) && slot.occupied < settings.capacity,
    )
    .map(({ start, end }) => ({ start, end }));
}

async function formClient(
  context: AuthContext,
  clientId: string | undefined,
): Promise<{ id: string; name: string } | null> {
  if (!clientId || !idSchema.safeParse(clientId).success) return null;
  const found = await getClientsByIds(context, [clientId.toLowerCase()]);
  const client = found.ok ? found.clients[0] : undefined;
  return client?.isActive ? { id: client.id, name: client.displayName } : null;
}

async function formReference(
  context: AuthContext,
  input: { productId?: string; unitId?: string },
): Promise<AppointmentReference | null> {
  if (input.unitId && idSchema.safeParse(input.unitId).success) {
    const unit = await findReferenceUnit(context, input.unitId.toLowerCase());
    if (unit) return { kind: "unit", id: unit.id, label: unit.serial };
  }
  if (input.productId && idSchema.safeParse(input.productId).success) {
    const product = await findReferenceProduct(
      context,
      input.productId.toLowerCase(),
    );
    if (product) {
      return { kind: "product", id: product.id, label: product.name };
    }
  }
  return null;
}

// La referencia de un turno: un producto activo, o una unidad que no está dada de baja.
async function findReferenceProduct(context: AuthContext, productId: string) {
  const found = await getProductsByIds(context, [productId]);
  const product = found.ok ? found.products[0] : undefined;
  return product?.isActive ? product : null;
}

async function findReferenceUnit(context: AuthContext, unitId: string) {
  const units = await getUnitSummaries(context.organizationId, [unitId]);
  const unit = units.get(unitId);
  return unit && unit.status !== "written_off" ? { id: unitId, ...unit } : null;
}

// El alta (D-3 y D-4): un turno que da una persona nace confirmado.

export type AppointmentInput = {
  clientId: string;
  reasonId: string;
  date: string;
  start: string;
  productId?: string;
  unitId?: string;
  note: string;
};

export type AppointmentField =
  "client" | "reason" | "date" | "start" | "note" | "reference";

export type AppointmentRule =
  | "not_configured"
  | "client_inactive"
  | "outside_hours"
  | "slot_full"
  | "in_the_past"
  | "too_far";

export type CreateAppointmentResult =
  | { ok: true; appointmentId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<"VALIDATION_ERROR", { fields: AppointmentField[] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: AppointmentRule }>;

function rejected(rule: AppointmentRule): CreateAppointmentResult {
  return { ok: false, code: "BUSINESS_RULE_VIOLATION", rule };
}

function invalid(...fields: AppointmentField[]): CreateAppointmentResult {
  return { ok: false, code: "VALIDATION_ERROR", fields };
}

export async function createAppointment(
  context: AuthContext,
  input: AppointmentInput,
): Promise<CreateAppointmentResult> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  const fields: AppointmentField[] = [];
  if (!idSchema.safeParse(input.clientId).success) fields.push("client");
  if (!idSchema.safeParse(input.reasonId).success) fields.push("reason");
  if (!isCalendarDate(input.date)) fields.push("date");
  if (!TIME_PATTERN.test(input.start)) fields.push("start");
  const noteText = input.note.trim();
  if (noteText.length > APPOINTMENT_NOTE_MAX_LENGTH) fields.push("note");
  const productId = input.productId?.trim().toLowerCase() || null;
  const unitId = input.unitId?.trim().toLowerCase() || null;
  if (
    (productId && !idSchema.safeParse(productId).success) ||
    (unitId && !idSchema.safeParse(unitId).success) ||
    (productId && unitId)
  ) {
    fields.push("reference");
  }
  if (fields.length > 0) return invalid(...fields);
  if (productId && !(await findReferenceProduct(context, productId))) {
    return invalid("reference");
  }
  if (unitId && !(await findReferenceUnit(context, unitId))) {
    return invalid("reference");
  }
  const { organizationId, userId } = context;
  const clientId = input.clientId.toLowerCase();
  const reasonId = input.reasonId.toLowerCase();
  const timezone = await getOrganizationTimezone(context);
  const days = await getEffectiveBusinessDays(
    organizationId,
    input.date,
    input.date,
  );
  const spans = spansOf(days?.days[0]);
  return repository.withTransaction(
    async (tx): Promise<CreateAppointmentResult> => {
      // La ficha en modo compartido, como un pedido: el vaciado de un cliente la toma FOR UPDATE.
      const client = await lockClientForOrder(tx, organizationId, clientId);
      if (client === "not_found") return invalid("client");
      if (client === "inactive") return rejected("client_inactive");
      // Los valores FOR UPDATE: las altas de la organización se ordenan, y el cupo se cuenta bajo este
      // bloqueo (H-4).
      const settings = await repository.findAppointmentSettings(
        organizationId,
        tx,
        {
          forUpdate: true,
        },
      );
      if (!settings) return rejected("not_configured");
      const reason = await repository.findReason(organizationId, reasonId, tx);
      if (!reason?.isActive) return invalid("reason");
      const slot = buildBookingSlots(spans, settings.slotMinutes).find(
        (candidate) => candidate.start === input.start,
      );
      if (!slot) return rejected("outside_hours");
      if (
        !(await repository.slotExists(tx, {
          date: input.date,
          ...slot,
          timezone,
        }))
      ) {
        return rejected("outside_hours");
      }
      const now = await repository.findLocalNow(timezone, tx);
      if (hasStarted(input.date, slot.start, now)) {
        return rejected("in_the_past");
      }
      if (input.date > addDays(now.date, BOOKING_HORIZON_DAYS)) {
        return rejected("too_far");
      }
      const taken = await repository.countOccupying(tx, organizationId, {
        date: input.date,
        start: slot.start,
        end: slot.end,
        timezone,
      });
      if (taken >= settings.capacity) return rejected("slot_full");
      const values = {
        clientId,
        reasonId,
        productId,
        unitId,
        note: noteText === "" ? null : noteText,
        date: input.date,
        start: slot.start,
        end: slot.end,
        timezone,
        status: "confirmed" as const,
        createdBy: userId,
      };
      const appointmentId = await repository.insertAppointment(
        tx,
        organizationId,
        values,
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "appointment",
        entityId: appointmentId,
        action: "create",
        diff: {
          before: null,
          after: {
            clientId,
            reasonId,
            date: input.date,
            start: slot.start,
            end: slot.end,
            status: "confirmed",
            ...(productId ? { productId } : {}),
            ...(unitId ? { unitId } : {}),
          },
        },
      });
      return { ok: true, appointmentId };
    },
  );
}

// Los cambios de estado (D-2 y D-4).

export type AppointmentTarget =
  "confirmed" | "cancelled" | "attended" | "no_show";

export const APPOINTMENT_TARGETS: readonly AppointmentTarget[] = [
  "confirmed",
  "cancelled",
  "attended",
  "no_show",
];

export type ChangeAppointmentResult =
  | { ok: true }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "transition_not_allowed" | "not_started" }
    >;

export async function changeAppointmentStatus(
  context: AuthContext,
  appointmentId: string,
  to: AppointmentTarget,
): Promise<ChangeAppointmentResult> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  if (
    !idSchema.safeParse(appointmentId).success ||
    !APPOINTMENT_TARGETS.includes(to)
  ) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId, userId } = context;
  const timezone = await getOrganizationTimezone(context);
  return repository.withTransaction(
    async (tx): Promise<ChangeAppointmentResult> => {
      const current = await repository.findAppointment(
        organizationId,
        appointmentId.toLowerCase(),
        timezone,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (!canTransition(current.status, to)) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "transition_not_allowed",
        };
      }
      if (needsStarted(to) && !current.started) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "not_started",
        };
      }
      await repository.updateAppointmentStatus(
        tx,
        organizationId,
        current.id,
        to,
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "appointment",
        entityId: current.id,
        action: "status_change",
        diff: { before: { status: current.status }, after: { status: to } },
      });
      return { ok: true };
    },
  );
}

// El detalle (D-5): los dos roles.

export type AppointmentDetail = repository.AppointmentRow & {
  clientName: string;
  reasonName: string;
  reference: AppointmentReference | null;
  createdByName: string | null;
};

export async function getAppointment(
  context: AuthContext,
  appointmentId: string,
): Promise<
  | { ok: true; appointment: AppointmentDetail; timezone: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireAppointments(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(appointmentId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const timezone = await getOrganizationTimezone(context);
  const row = await repository.findAppointment(
    organizationId,
    appointmentId.toLowerCase(),
    timezone,
  );
  if (!row) return failure("NOT_FOUND");
  const [clients, reason, members, reference] = await Promise.all([
    clientNames(context, [row.clientId]),
    repository.findReason(organizationId, row.reasonId),
    getMemberSummaries(organizationId, [row.createdBy]),
    storedReference(context, row),
  ]);
  return {
    ok: true,
    timezone,
    appointment: {
      ...row,
      clientName: clients.get(row.clientId) ?? "",
      reasonName: reason?.name ?? "",
      reference,
      createdByName: members[0]?.name ?? null,
    },
  };
}

// La referencia guardada se muestra aunque hoy el producto esté inactivo o la unidad dada de baja.
async function storedReference(
  context: AuthContext,
  row: repository.AppointmentRow,
): Promise<AppointmentReference | null> {
  if (row.unitId) {
    const units = await getUnitSummaries(context.organizationId, [row.unitId]);
    const unit = units.get(row.unitId);
    return unit ? { kind: "unit", id: row.unitId, label: unit.serial } : null;
  }
  if (row.productId) {
    const found = await getProductsByIds(context, [row.productId]);
    const product = found.ok ? found.products[0] : undefined;
    return product
      ? { kind: "product", id: product.id, label: product.name }
      : null;
  }
  return null;
}

export type AppointmentAuditEntry = NamedAuditLogEntry;

export async function listAppointmentAudit(
  context: AuthContext,
  appointmentId: string,
  page: number,
): Promise<
  | {
      ok: true;
      entries: AppointmentAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireAppointments(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(appointmentId).success) {
    return failure("VALIDATION_ERROR");
  }
  const timezone = await getOrganizationTimezone(context);
  const row = await repository.findAppointment(
    context.organizationId,
    appointmentId.toLowerCase(),
    timezone,
  );
  if (!row) return failure("NOT_FOUND");
  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["appointment"],
    entityId: row.id,
    page,
  });
  const names = new Map(
    (
      await getMemberSummaries(
        context.organizationId,
        auditUserIds(found.entries),
      )
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: nameAuditActors(found.entries, names),
    total: found.total,
    page: found.page,
    pageCount: found.pageCount,
  };
}

// Los turnos de un cliente, para su ficha (D-5): los dos roles, los más nuevos primero.
export const CLIENT_APPOINTMENTS_LIMIT = 20;

export type ClientAppointment = {
  id: string;
  date: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  reasonName: string;
};

export async function listClientAppointments(
  context: AuthContext,
  clientId: string,
): Promise<
  | { ok: true; appointments: ClientAppointment[] }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireAppointments(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(clientId).success) return failure("VALIDATION_ERROR");
  const { organizationId } = context;
  const timezone = await getOrganizationTimezone(context);
  const [rows, reasons] = await Promise.all([
    repository.findClientAppointments(
      organizationId,
      clientId.toLowerCase(),
      timezone,
      CLIENT_APPOINTMENTS_LIMIT,
    ),
    repository.findReasons(organizationId),
  ]);
  const names = new Map(reasons.map((reason) => [reason.id, reason.name]));
  return {
    ok: true,
    appointments: rows.map((row) => ({
      id: row.id,
      date: row.date,
      start: row.start,
      end: row.end,
      status: row.status,
      reasonName: names.get(row.reasonId) ?? "",
    })),
  };
}
