import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  appointmentsAllowed,
  getAppointmentCalendar,
  type CalendarDay,
} from "@/modules/appointments";
import { getOrganizationTimezone } from "@/modules/organizations";
import { formatDayDate } from "@/app/(autenticado)/informacion/horario/messages";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  cardClass,
  inactiveBadgeClass,
  linkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { calendarDayIn, shiftDays } from "@/app/_format/date-time";
import { isCalendarDate } from "@/shared/calendar";
import {
  AGENT_REQUEST_LABEL,
  CALENDAR_TITLE,
  FORBIDDEN_ACTION_MESSAGE,
  formatRange,
  NO_HOURS_MESSAGE,
  NO_SETTINGS_MESSAGE,
  noticeMessage,
} from "./messages";
import { AppointmentsSubNav, AppointmentStatusBadge } from "./sub-nav";

export const metadata: Metadata = {
  title: "Turnos — AI WhatsApp Agent CRM",
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// El lunes de la semana de una fecha de calendario.
function mondayOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  return shiftDays(date, -((weekday + 6) % 7));
}

// El calendario de turnos (brief-29.10, D-5): por semana, de lunes a domingo, o por día
// (?vista=dia), desde ?fecha=AAAA-MM-DD. Cada franja dice si está libre, ocupada o sobre el cupo, y cada
// turno, su cliente, su motivo y su estado, con las marcas de U-5. Los dos roles; un admin da un turno
// desde una franja libre. Sin la capacidad appointments, 404.
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await appointmentsAllowed(context))) notFound();
  const query = await searchParams;
  const isAdmin = context.role === "admin";
  const timezone = await getOrganizationTimezone(context);
  const today = calendarDayIn(timezone);
  const requested = single(query.fecha);
  // Una fecha cuya semana, la anterior o la siguiente se salen del calendario (9999-12-31) cae en hoy.
  const date =
    isCalendarDate(requested) &&
    isCalendarDate(shiftDays(requested, -14)) &&
    isCalendarDate(shiftDays(requested, 14))
      ? requested
      : today;
  const byDay = single(query.vista) === "dia";
  const from = byDay ? date : mondayOf(date);
  const span = byDay ? 1 : 7;
  const result = await getAppointmentCalendar(context, {
    from,
    days: span,
  });
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <PageNotice title={CALENDAR_TITLE} message={FORBIDDEN_ACTION_MESSAGE} />
    );
  }
  const { calendar } = result;
  const notice = noticeMessage(query.aviso);
  const view = byDay ? "dia" : "semana";
  const href = (target: string, targetView = view) =>
    `/turnos?fecha=${target}${targetView === "dia" ? "&vista=dia" : ""}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title={CALENDAR_TITLE}
        subtitle="Los turnos para visitar el local, sobre el horario del local."
        action={
          isAdmin ? { href: "/turnos/nuevo", label: "+ Nuevo turno" } : null
        }
      />
      <AppointmentsSubNav current="calendario" isAdmin={isAdmin} />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {!calendar.hoursConfigured ? (
        <p className="mt-4 text-sm text-muted">{NO_HOURS_MESSAGE}</p>
      ) : null}
      {!calendar.settings ? (
        <p className="mt-4 text-sm text-muted">{NO_SETTINGS_MESSAGE}</p>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Franjas de {calendar.settings.slotMinutes} minutos,{" "}
          {calendar.settings.capacity === 1
            ? "un turno por franja"
            : `${calendar.settings.capacity} turnos por franja`}
          .
        </p>
      )}

      <nav
        aria-label="Fechas del calendario"
        className="mt-4 flex flex-wrap items-center gap-3"
      >
        <Link
          href={href(shiftDays(from, -span))}
          className={secondaryLinkClass}
        >
          {byDay ? "Día anterior" : "Semana anterior"}
        </Link>
        <Link href={href(today)} className={secondaryLinkClass}>
          Hoy
        </Link>
        <Link href={href(shiftDays(from, span))} className={secondaryLinkClass}>
          {byDay ? "Día siguiente" : "Semana siguiente"}
        </Link>
        <Link href={href(date, byDay ? "semana" : "dia")} className={linkClass}>
          {byDay ? "Ver la semana" : "Ver solo este día"}
        </Link>
      </nav>

      <div className="mt-6 flex flex-col gap-4">
        {calendar.days.map((day) => (
          <DayCard
            key={day.date}
            day={day}
            isToday={day.date === calendar.today}
            isAdmin={isAdmin}
            capacity={calendar.settings?.capacity ?? 0}
          />
        ))}
      </div>

      <p className="mt-6 text-sm text-muted">Horas en {calendar.timezone}.</p>
    </main>
  );
}

function slotStatus(
  slot: CalendarDay["slots"][number],
  capacity: number,
): string {
  if (slot.overCapacity)
    return `Sobre el cupo: ${slot.occupied} de ${capacity}`;
  if (slot.free) {
    return slot.occupied === 0
      ? "Libre"
      : `Con lugar: ${slot.occupied} de ${capacity}`;
  }
  if (slot.occupied >= capacity)
    return `Completa: ${slot.occupied} de ${capacity}`;
  return "Ya pasó";
}

function DayCard({
  day,
  isToday,
  isAdmin,
  capacity,
}: {
  day: CalendarDay;
  isToday: boolean;
  isAdmin: boolean;
  capacity: number;
}) {
  const titleId = `dia-${day.date}`;
  return (
    <section aria-labelledby={titleId} className={`${cardClass} p-4 sm:p-5`}>
      <h2
        id={titleId}
        className="flex flex-wrap items-center gap-2 font-semibold"
      >
        {formatDayDate(day.date)}
        {isToday ? <span className={inactiveBadgeClass}>Hoy</span> : null}
        {day.specialReason ? (
          <span className="text-sm font-normal text-muted">
            · {day.specialReason}
          </span>
        ) : null}
      </h2>
      {!day.open ? (
        <p className="mt-2 text-sm text-muted">Cerrado.</p>
      ) : (
        <ul
          aria-label={`Franjas del ${formatDayDate(day.date)}`}
          className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {day.slots.map((slot) => (
            <li
              key={slot.start}
              className={`rounded-lg border px-3 py-2 text-sm ${
                slot.overCapacity
                  ? "border-danger"
                  : slot.free
                    ? "border-success"
                    : "border-border text-muted"
              }`}
            >
              <span className="font-semibold">
                {formatRange(slot.start, slot.end)}
              </span>
              <span className="block">{slotStatus(slot, capacity)}</span>
              {isAdmin && slot.free ? (
                <Link
                  href={`/turnos/nuevo?fecha=${day.date}&franja=${slot.start}`}
                  className={linkClass}
                >
                  Dar un turno
                  <span className="sr-only">
                    {" "}
                    el {formatDayDate(day.date)} a las {slot.start}
                  </span>
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {day.appointments.length > 0 ? (
        <ul
          aria-label={`Turnos del ${formatDayDate(day.date)}`}
          className="mt-4 flex flex-col gap-2"
        >
          {day.appointments.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-sm"
            >
              <Link href={`/turnos/${item.id}`} className={linkClass}>
                {formatRange(item.start, item.end)} · {item.clientName}
              </Link>
              <span className="text-muted">{item.reasonName}</span>
              <AppointmentStatusBadge status={item.status} />
              {item.byAgent ? (
                <span className="text-muted">{AGENT_REQUEST_LABEL}</span>
              ) : null}
              {item.outsideHours ? (
                <span className="font-semibold text-danger">
                  Fuera de horario
                </span>
              ) : null}
              {item.overCapacity ? (
                <span className="font-semibold text-danger">Sobre el cupo</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
