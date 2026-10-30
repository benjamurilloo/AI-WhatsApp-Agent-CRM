import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import {
  getActiveProductForService,
  getProductsByIds,
} from "@/modules/catalog";
import {
  getClientsByIds,
  lockClientForOrder,
  lockClientForOrderByPhone,
} from "@/modules/crm";
import { getUnitSummaries } from "@/modules/inventory";
import {
  getEffectiveBusinessDays,
  type EffectiveBusinessDay,
} from "@/modules/knowledge";
import {
  getMemberSummaries,
  getOrganizationTimezone,
  getOrganizationTimezoneForService,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import { isCalendarDate } from "@/shared/calendar";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";
import {
  AGENT_BOOKING_HORIZON_DAYS,
  AGENT_BOOKING_LEAD_MINUTES,
  AGENT_SLOT_DAYS_MAX,
  APPOINTMENT_NOTE_MAX_LENGTH,
  BOOKING_HORIZON_DAYS,
} from "./schema";
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

export {
  addDays,
  AGENT_BOOKING_HORIZON_DAYS,
  AGENT_BOOKING_LEAD_MINUTES,
  AGENT_SLOT_DAYS_MAX,
  APPOINTMENT_NOTE_MAX_LENGTH,
  BOOKING_HORIZON_DAYS,
};

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
  // Lo pidió el agente (brief-29.10.2, D-5).
  byAgent: boolean;
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
          byAgent: row.createdByCredentialId !== null,
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

// Las reglas de la franja, compartidas por el alta de la app y el pedido del agente (brief-29.10.2,
// D-5), en este orden: la franja de la grilla vigente y que exista en la hora local, que no haya
// empezado, la anticipación (solo el agente), el horizonte y el cupo. Se llama bajo el bloqueo de los
// valores de la organización (D-3 de la 29.10).
type SlotRule =
  "outside_hours" | "in_the_past" | "too_soon" | "too_far" | "slot_full";

async function placeInSlot(
  tx: DbTransaction,
  input: {
    organizationId: string;
    timezone: string;
    date: string;
    start: string;
    spans: OpeningSpan[];
    settings: { slotMinutes: number; capacity: number };
    horizonDays: number;
    leadMinutes: number | null;
  },
): Promise<{ ok: true; slot: BookingSlot } | { ok: false; rule: SlotRule }> {
  const { organizationId, timezone, date } = input;
  const slot = buildBookingSlots(input.spans, input.settings.slotMinutes).find(
    (candidate) => candidate.start === input.start,
  );
  if (!slot) return { ok: false, rule: "outside_hours" };
  if (!(await repository.slotExists(tx, { date, ...slot, timezone }))) {
    return { ok: false, rule: "outside_hours" };
  }
  const now = await repository.findLocalNow(timezone, tx);
  if (hasStarted(date, slot.start, now)) {
    return { ok: false, rule: "in_the_past" };
  }
  if (
    input.leadMinutes !== null &&
    (await repository.startsWithin(
      tx,
      { date, start: slot.start, timezone },
      input.leadMinutes,
    ))
  ) {
    return { ok: false, rule: "too_soon" };
  }
  if (date > addDays(now.date, input.horizonDays)) {
    return { ok: false, rule: "too_far" };
  }
  const taken = await repository.countOccupying(tx, organizationId, {
    date,
    start: slot.start,
    end: slot.end,
    timezone,
  });
  if (taken >= input.settings.capacity) return { ok: false, rule: "slot_full" };
  return { ok: true, slot };
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
      const placed = await placeInSlot(tx, {
        organizationId,
        timezone,
        date: input.date,
        start: input.start,
        spans,
        settings,
        horizonDays: BOOKING_HORIZON_DAYS,
        leadMinutes: null,
      });
      if (!placed.ok) {
        if (placed.rule === "too_soon") {
          throw new Error("El alta de la app no tiene anticipación.");
        }
        return rejected(placed.rule);
      }
      const { slot } = placed;
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
        creator: { createdBy: userId },
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
    // El turno que pidió el agente no tiene persona: la página compone el emisor de la credencial.
    row.createdBy ? getMemberSummaries(organizationId, [row.createdBy]) : [],
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

// Cuántos turnos pendientes desde hoy tiene cada uno de unos clientes, para «En curso» de la lista de
// clientes (brief-24.4.2, D-3 y H-4). Sin la capacidad, ninguno.
export async function countUpcomingAppointmentsByClient(
  context: AuthContext,
  clientIds: string[],
): Promise<
  | { ok: true; counts: Map<string, number> }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireAppointments(context);
  if (!allowed.ok) return allowed;
  if (!clientIds.every((id) => idSchema.safeParse(id).success)) {
    return failure("VALIDATION_ERROR");
  }
  if (clientIds.length === 0) return { ok: true, counts: new Map() };
  const timezone = await getOrganizationTimezone(context);
  const rows = await repository.countUpcomingByClient(
    context.organizationId,
    clientIds.map((id) => id.toLowerCase()),
    timezone,
  );
  return {
    ok: true,
    counts: new Map(rows.map((row) => [row.clientId, row.total])),
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

// Los turnos del agente (brief-29.10.2). Las funciones …ForService y …FromIngestion reciben la
// organización de la credencial y no pasan por authorize, como las demás de la lectura y la ingestión.

// Un instante con el desplazamiento de la zona en esa fecha, como lo lee el agente (H-7):
// 2026-10-29T15:00:00-03:00.
function instantText(date: string, time: string, offsetMinutes: number) {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${date}T${time}:00${sign}${hours}:${minutes}`;
}

export type FreeSlot = { startsAt: string; endsAt: string };

export type FreeSlots = {
  today: string;
  slotMinutes: number | null;
  reasons: { id: string; name: string }[];
  days: { date: string; slots: FreeSlot[] }[];
};

// Las franjas que el agente puede pedir (D-2): con lugar, que existen en la hora local, después de la
// anticipación y dentro del horizonte (U-2). Sin la capacidad o sin valores, ninguna; sin horario,
// ningún día. Un from anterior a hoy es un error del que lee; un rango que pasa el horizonte se recorta.
export async function listFreeSlotsForService(
  organizationId: string,
  input: { from: string | null; days: number },
): Promise<{ ok: true; slots: FreeSlots } | { ok: false; field: "from" }> {
  const timezone = await getOrganizationTimezoneForService(organizationId);
  const now = await repository.findLocalNow(timezone);
  const from = input.from ?? now.date;
  if (!isCalendarDate(from) || from < now.date) {
    return { ok: false, field: "from" };
  }
  const [allowed, settings] = await Promise.all([
    hasCapability(organizationId, "appointments"),
    repository.findAppointmentSettings(organizationId),
  ]);
  if (!allowed || !settings) {
    return {
      ok: true,
      slots: { today: now.date, slotMinutes: null, reasons: [], days: [] },
    };
  }
  const reasons = (await repository.findReasons(organizationId))
    .filter((reason) => reason.isActive)
    .map((reason) => ({ id: reason.id, name: reason.name }));
  const last = addDays(now.date, AGENT_BOOKING_HORIZON_DAYS);
  const wanted = addDays(
    from,
    Math.min(Math.max(input.days, 1), AGENT_SLOT_DAYS_MAX) - 1,
  );
  const to = wanted < last ? wanted : last;
  const base = { today: now.date, slotMinutes: settings.slotMinutes, reasons };
  if (from > to) return { ok: true, slots: { ...base, days: [] } };
  const [effective, rows] = await Promise.all([
    getEffectiveBusinessDays(organizationId, from, to),
    repository.findAppointmentsBetween(organizationId, timezone, from, to),
  ]);
  const candidates = (effective?.days ?? []).flatMap((day) => {
    const grid = buildBookingSlots(spansOf(day), settings.slotMinutes);
    const dayRows = rows.filter((row) => row.date === day.date);
    return occupancy(grid, dayRows)
      .filter((slot) => slot.occupied < settings.capacity)
      .map(({ start, end }) => ({ date: day.date, start, end }));
  });
  const described = await repository.describeSlots(
    timezone,
    candidates,
    AGENT_BOOKING_LEAD_MINUTES,
  );
  const days = new Map<string, FreeSlot[]>();
  for (const slot of described) {
    if (!slot.bookable) continue;
    const list = days.get(slot.date) ?? [];
    list.push({
      startsAt: instantText(slot.date, slot.start, slot.startOffset),
      endsAt: instantText(slot.date, slot.end, slot.endOffset),
    });
    days.set(slot.date, list);
  }
  return {
    ok: true,
    slots: {
      ...base,
      days: [...days].map(([date, slots]) => ({ date, slots })),
    },
  };
}

// Las reglas del turno pedido (D-3), en su orden de precedencia.
export const AGENT_APPOINTMENT_RULES = [
  "not_offered",
  "client_not_found",
  "client_inactive",
  "reason_not_found",
  "reference_not_found",
  "client_has_pending_request",
  "outside_hours",
  "in_the_past",
  "too_soon",
  "too_far",
  "slot_full",
] as const;

export type AgentAppointmentRule = (typeof AGENT_APPOINTMENT_RULES)[number];

export type RequestedAppointment = { startsAt: string; endsAt: string };

export type RequestAppointmentResult =
  | { ok: true; appointment: RequestedAppointment }
  | { ok: false; rule: AgentAppointmentRule };

// La franja guardada de un turno, con el desplazamiento de cada borde.
async function requestedSlotOf(
  tx: DbTransaction,
  timezone: string,
  row: { date: string; start: string; end: string },
): Promise<RequestedAppointment> {
  const [slot] = await repository.describeSlots(timezone, [row], 0, tx);
  return {
    startsAt: instantText(row.date, row.start, slot!.startOffset),
    endsAt: instantText(row.date, row.end, slot!.endOffset),
  };
}

// El turno que pide el agente (D-3 a D-5): recibe la transacción de la ingestión, nace pedido, con la
// credencial como autor y el evento que lo creó, y lo audita la credencial. El orden de bloqueo es el del
// alta de la app: el cliente en modo compartido y después los valores FOR UPDATE, bajo los que se cuentan
// el pedido pendiente del cliente y el cupo. El horario se lee después del bloqueo y en la transacción.
// La zona, el producto y la unidad, que el bloqueo no protege, se leen antes: bajo el bloqueo ninguna
// lectura pide otra conexión del pool. Sus reglas se aplican igual en su precedencia. Un rechazo no
// escribe.
export async function requestAppointmentFromIngestion(
  tx: DbTransaction,
  input: {
    organizationId: string;
    credentialId: string;
    ingestionEventId: string;
    phoneE164: string;
    reasonId: string;
    // En UTC, como lo normaliza el contrato.
    startsAt: string;
    productId: string | null;
    unitId: string | null;
  },
): Promise<RequestAppointmentResult> {
  const { organizationId } = input;
  const reject = (rule: AgentAppointmentRule): RequestAppointmentResult => ({
    ok: false,
    rule,
  });
  // Los valores no se borran: si existen ahora, existen bajo el bloqueo de abajo.
  const [allowed, configured] = await Promise.all([
    hasCapability(organizationId, "appointments", tx),
    repository.findAppointmentSettings(organizationId, tx),
  ]);
  if (!allowed || !configured) return reject("not_offered");
  const productId = input.productId?.toLowerCase() ?? null;
  const unitId = input.unitId?.toLowerCase() ?? null;
  const [timezone, product, unit] = await Promise.all([
    getOrganizationTimezoneForService(organizationId),
    productId
      ? getActiveProductForService(organizationId, productId, {
          includeUsed: true,
        })
      : null,
    unitId
      ? getUnitSummaries(organizationId, [unitId]).then((units) =>
          units.get(unitId),
        )
      : undefined,
  ]);
  const client = await lockClientForOrderByPhone(
    tx,
    organizationId,
    input.phoneE164,
  );
  if (client.status === "not_found") return reject("client_not_found");
  if (client.status === "inactive") return reject("client_inactive");
  const settings = await repository.findAppointmentSettings(
    organizationId,
    tx,
    { forUpdate: true },
  );
  const reasonId = input.reasonId.toLowerCase();
  const reason = await repository.findReason(organizationId, reasonId, tx);
  if (!reason?.isActive) return reject("reason_not_found");
  if (productId && !product) return reject("reference_not_found");
  if (unitId && (!unit || unit.status === "written_off")) {
    return reject("reference_not_found");
  }
  if (await repository.hasPendingRequest(tx, organizationId, client.clientId)) {
    return reject("client_has_pending_request");
  }
  const local = await repository.findLocalOf(tx, input.startsAt, timezone);
  if (!local.exact) return reject("outside_hours");
  const effective = await getEffectiveBusinessDays(
    organizationId,
    local.date,
    local.date,
    tx,
  );
  const placed = await placeInSlot(tx, {
    organizationId,
    timezone,
    date: local.date,
    start: local.time,
    spans: spansOf(effective?.days[0]),
    settings: settings!,
    horizonDays: AGENT_BOOKING_HORIZON_DAYS,
    leadMinutes: AGENT_BOOKING_LEAD_MINUTES,
  });
  if (!placed.ok) return reject(placed.rule);
  const { slot } = placed;
  const appointmentId = await repository.insertAppointment(tx, organizationId, {
    clientId: client.clientId,
    reasonId,
    productId,
    unitId,
    note: null,
    date: local.date,
    start: slot.start,
    end: slot.end,
    timezone,
    status: "requested",
    creator: {
      createdByCredentialId: input.credentialId,
      ingestionEventId: input.ingestionEventId,
    },
  });
  await recordAudit(tx, {
    organizationId,
    actorCredentialId: input.credentialId,
    entityType: "appointment",
    entityId: appointmentId,
    action: "create",
    diff: {
      before: null,
      after: {
        clientId: client.clientId,
        reasonId,
        date: local.date,
        start: slot.start,
        end: slot.end,
        status: "requested",
        ...(productId ? { productId } : {}),
        ...(unitId ? { unitId } : {}),
      },
    },
  });
  return {
    ok: true,
    appointment: await requestedSlotOf(tx, timezone, {
      date: local.date,
      ...slot,
    }),
  };
}

// La franja del turno que pidió un evento, para responder su reenvío sin escribir. Null si el evento no
// creó ninguno, que no debería pasar con un evento procesado.
export async function findAppointmentRequestedByIngestion(
  tx: DbTransaction,
  organizationId: string,
  ingestionEventId: string,
): Promise<RequestedAppointment | null> {
  const timezone = await getOrganizationTimezoneForService(organizationId);
  const row = await repository.findAppointmentByIngestionEvent(
    tx,
    organizationId,
    ingestionEventId,
    timezone,
  );
  return row ? requestedSlotOf(tx, timezone, row) : null;
}
