import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import {
  getBusinessHours,
  listBusinessHoursAudit,
  WEEKDAYS,
} from "@/modules/knowledge";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  linkClass,
  noticeClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import type { SearchParams } from "../filters";
import { AddExceptionForm, RemoveExceptionForm } from "./exception-forms";
import {
  describeHoursAudit,
  FORBIDDEN_PAGE_MESSAGE,
  formatDayDate,
  formatSlots,
  NO_EXCEPTIONS_MESSAGE,
  NO_HOURS_MESSAGE,
  noticeMessage,
  WEEKDAY_LABEL,
  type WeekFormValues,
} from "./messages";
import { WeekForm } from "./week-form";

export const metadata: Metadata = {
  title: "Horario de atención — AI WhatsApp Agent CRM",
};

const TITLE = "Horario de atención";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Pantalla del horario de atención (brief-17.4, D-4), en la información del negocio: el horario
// semanal, los días especiales próximos y el historial. Todos lo ven; solo un admin lo edita y ve
// el historial (FR-INFO-04, FR-INFO-05).
export default async function BusinessHoursPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const result = await getBusinessHours(context);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const isAdmin = context.role === "admin";
  const editing = isAdmin && query.editar === "1";
  const notice = noticeMessage(query.aviso);
  const audit = isAdmin
    ? await listBusinessHoursAudit(context, page(query.auditoria))
    : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;

  const formValues: WeekFormValues = {};
  for (const day of result.week) {
    const [first, second] = day.slots;
    formValues[`d${day.weekday}o1`] = first?.opens ?? "";
    formValues[`d${day.weekday}c1`] = first?.closes ?? "";
    formValues[`d${day.weekday}o2`] = second?.opens ?? "";
    formValues[`d${day.weekday}c2`] = second?.closes ?? "";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/informacion" label="Volver a información del negocio" />

      <DetailHeader
        title={TITLE}
        leading={<HeaderIcon name="clock" />}
        subtitle={`En la zona horaria ${result.timezone}.`}
        actions={
          isAdmin && !editing ? (
            <Link
              href="/informacion/horario?editar=1"
              className={secondaryLinkClass}
            >
              <Icon name="pencil" className="size-4" />
              Editar horario
            </Link>
          ) : null
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {result.hoursEntry ? (
        <p className="mt-6 rounded-md border border-border bg-surface-muted p-4 text-sm">
          También hay una entrada de texto vigente sobre horarios:{" "}
          <Link
            href={`/informacion/${result.hoursEntry.id}`}
            className={linkClass}
          >
            {result.hoursEntry.title}
          </Link>
          . El agente puede leer las dos. Si este horario la reemplaza,
          desactivala; si la complementa, dejala.
        </p>
      ) : null}

      <SectionCard
        id="semana-titulo"
        title="Horario semanal"
        icon="calendar"
        className="mt-6"
      >
        {editing ? (
          <WeekForm values={formValues} />
        ) : result.configured ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
            {WEEKDAYS.map((weekday) => {
              const day = result.week.find((row) => row.weekday === weekday)!;
              return (
                <div key={weekday} className="contents">
                  <dt className="font-semibold">{WEEKDAY_LABEL[weekday]}</dt>
                  <dd
                    className={
                      day.slots.length === 0 ? "text-muted" : undefined
                    }
                  >
                    {formatSlots(day.slots)}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="text-muted">{NO_HOURS_MESSAGE}</p>
        )}
      </SectionCard>

      <SectionCard
        id="especiales-titulo"
        title="Días especiales"
        icon="alert"
        description="Feriados y días con otro horario. Reemplazan al horario semanal en su fecha."
        className="mt-6"
      >
        {result.exceptions.length === 0 ? (
          <p className="text-muted">{NO_EXCEPTIONS_MESSAGE}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {result.exceptions.map((exception) => {
              const label = formatDayDate(exception.date);
              return (
                <li
                  key={exception.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div>
                    <p className="font-semibold">{label}</p>
                    <p className="text-sm text-muted">
                      {formatSlots(exception.slots)}
                      {exception.reason ? ` · ${exception.reason}` : ""}
                    </p>
                  </div>
                  {isAdmin ? (
                    <RemoveExceptionForm
                      exceptionId={exception.id}
                      label={label}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {isAdmin ? (
          <div className="mt-6 border-t border-border pt-6">
            <AddExceptionForm />
          </div>
        ) : null}
      </SectionCard>

      {audit?.ok ? (
        <AuditCard
          caption="Historial del horario de atención"
          rows={audit.entries.map((log) => {
            const described = describeHoursAudit(log);
            return {
              id: log.id,
              when: formatShortDateTime(log.createdAt, result.timezone),
              actor: actorLabel?.(log.actor),
              action: described.action,
              change: described.change,
            };
          })}
          page={audit.page}
          pageCount={audit.pageCount}
          pageSize={AUDIT_PAGE_SIZE}
          total={audit.total}
          hrefFor={(target) => `/informacion/horario?auditoria=${target}`}
        />
      ) : null}
    </main>
  );
}
