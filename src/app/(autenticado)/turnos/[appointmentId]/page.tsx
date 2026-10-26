import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  appointmentsAllowed,
  getAppointment,
  listAppointmentAudit,
  type AppointmentDetail,
  type AppointmentTarget,
} from "@/modules/appointments";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getCredentialSources } from "@/modules/ingestion";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { formatDayDate } from "@/app/(autenticado)/informacion/horario/messages";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { linkClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import {
  appointmentOriginLabel,
  auditActionLabel,
  describeAuditDiff,
  formatRange,
  noticeMessage,
} from "../messages";
import { AppointmentStatusBadge } from "../sub-nav";
import { AppointmentStatusForm } from "./forms";

export const metadata: Metadata = {
  title: "Turno — AI WhatsApp Agent CRM",
};

type SearchParams = Record<string, string | string[] | undefined>;

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Lo que un admin puede hacer con el turno ahora (D-2): confirmar el pedido; marcar atendido o ausente
// el confirmado que ya empezó; cancelar los dos.
function targetsOf(appointment: AppointmentDetail): AppointmentTarget[] {
  if (appointment.status === "requested") return ["confirmed", "cancelled"];
  if (appointment.status !== "confirmed") return [];
  return appointment.started
    ? ["attended", "no_show", "cancelled"]
    : ["cancelled"];
}

// El detalle de un turno (brief-29.10, D-5): el cliente, el motivo, el horario, la referencia, la nota,
// las fechas de cada paso y su historia, para los dos roles; las acciones, solo para un admin. Sin la
// capacidad appointments, 404.
export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await appointmentsAllowed(context))) notFound();
  const { appointmentId } = await params;
  const query = await searchParams;
  const found = await getAppointment(context, appointmentId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return (
        <PageNotice
          title="Turno"
          message="No tenés permiso para ver esta página."
        />
      );
    }
    notFound();
  }
  const { appointment, timezone } = found;
  const href = `/turnos/${appointment.id}`;
  const audit = await listAppointmentAudit(
    context,
    appointment.id,
    page(query.historial),
  );
  const actorLabel = audit.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  // El emisor de la credencial del agente, como en la historia (brief-29.10.2, D-5).
  const { createdByCredentialId } = appointment;
  const origin = appointmentOriginLabel(
    createdByCredentialId,
    createdByCredentialId === null
      ? new Map()
      : await getCredentialSources(context.organizationId, [
          createdByCredentialId,
        ]),
  );
  const notice = noticeMessage(query.aviso);
  const targets = context.role === "admin" ? targetsOf(appointment) : [];
  const steps: [string, Date | null][] = [
    ["Dado", appointment.createdAt],
    ["Confirmado", appointment.confirmedAt],
    ["Cancelado", appointment.cancelledAt],
    ["Atendido", appointment.attendedAt],
    ["Ausente", appointment.noShowAt],
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink
        href={`/turnos?fecha=${appointment.date}&vista=dia`}
        label="Volver al calendario"
      />
      <DetailHeader
        title={`Turno del ${formatDayDate(appointment.date)}`}
        leading={<HeaderIcon name="calendar" />}
        badges={<AppointmentStatusBadge status={appointment.status} />}
        subtitle={
          <p>
            {formatRange(appointment.start, appointment.end)} ·{" "}
            {appointment.clientName}
          </p>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <SectionCard
        id="turno-titulo"
        title="El turno"
        icon="calendar"
        className="mt-6"
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Cliente</dt>
            <dd>
              <Link
                href={`/clientes/${appointment.clientId}`}
                className={linkClass}
              >
                {appointment.clientName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Motivo</dt>
            <dd>{appointment.reasonName}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Origen</dt>
            <dd>{origin}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Horario</dt>
            <dd>
              {formatDayDate(appointment.date)},{" "}
              {formatRange(appointment.start, appointment.end)}
            </dd>
          </div>
          {appointment.reference ? (
            <div>
              <dt className="text-sm text-muted">
                {appointment.reference.kind === "unit"
                  ? "Equipo (IMEI)"
                  : "Producto"}
              </dt>
              <dd
                className={
                  appointment.reference.kind === "unit"
                    ? "font-mono"
                    : undefined
                }
              >
                {appointment.reference.label}
              </dd>
            </div>
          ) : null}
          {appointment.note ? (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">Nota</dt>
              <dd className="whitespace-pre-line">{appointment.note}</dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted">Fechas</dt>
            <dd>
              <ul className="flex flex-col gap-1 text-sm">
                {steps.flatMap(([label, value]) =>
                  value
                    ? [
                        <li key={label}>
                          {label}: {formatShortDateTime(value, timezone)}
                          {label === "Dado" && appointment.createdByName
                            ? ` por ${appointment.createdByName}`
                            : ""}
                        </li>,
                      ]
                    : [],
                )}
              </ul>
            </dd>
          </div>
        </dl>
      </SectionCard>

      {targets.length > 0 ? (
        <SectionCard
          id="acciones-titulo"
          title="Siguiente paso"
          icon="check"
          className="mt-6"
        >
          {appointment.status === "confirmed" && !appointment.started ? (
            <p className="mb-3 text-sm text-muted">
              Se marca atendido o ausente desde su hora.
            </p>
          ) : null}
          <AppointmentStatusForm
            appointmentId={appointment.id}
            targets={targets}
          />
        </SectionCard>
      ) : null}

      {audit.ok ? (
        <AuditCard
          caption={`Historia del turno del ${formatDayDate(appointment.date)}`}
          rows={audit.entries.map((entry) => ({
            id: entry.id,
            when: formatShortDateTime(entry.createdAt, timezone),
            actor: actorLabel?.(entry.actor),
            action: auditActionLabel(entry),
            change: describeAuditDiff(entry),
          }))}
          page={audit.page}
          pageCount={audit.pageCount}
          pageSize={AUDIT_PAGE_SIZE}
          total={audit.total}
          hrefFor={(target) =>
            target > 1 ? `${href}?historial=${target}` : href
          }
        />
      ) : null}

      <p className="mt-6 text-sm text-muted">Horas en {timezone}.</p>
    </main>
  );
}
