import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  appointmentsAllowed,
  getAppointmentSettings,
  listAppointmentReasons,
  MAX_APPOINTMENT_CAPACITY,
  REASON_NAME_MAX_LENGTH,
  SLOT_MINUTES,
} from "@/modules/appointments";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  roleBadgeClass,
  secondaryLinkClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import {
  ADMIN_ONLY_MESSAGE,
  EXAMPLE_VALUES_TEXT,
  FORBIDDEN_ACTION_MESSAGE,
  noticeMessage,
  SETTINGS_TITLE,
} from "../messages";
import { AppointmentsSubNav } from "../sub-nav";
import {
  AppointmentSettingsForm,
  ReasonActiveForm,
  ReasonForm,
  ReasonMoveForm,
} from "./forms";

export const metadata: Metadata = {
  title: "Configuración de los turnos — AI WhatsApp Agent CRM",
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// La configuración de los turnos (brief-29.10, D-2, D-4 y D-5): la duración de una franja, el cupo y los
// motivos, en su orden. Solo admin. Un motivo no se borra: se desactiva, y sus turnos lo conservan.
// ?editar=<id> abre el renombre de un motivo. Sin la capacidad appointments, 404.
export default async function AppointmentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await appointmentsAllowed(context))) notFound();
  if (context.role !== "admin") {
    return <PageNotice title={SETTINGS_TITLE} message={ADMIN_ONLY_MESSAGE} />;
  }
  const query = await searchParams;
  const [settings, reasons] = await Promise.all([
    getAppointmentSettings(context),
    listAppointmentReasons(context),
  ]);
  if (!settings.ok || !reasons.ok) {
    return (
      <PageNotice title={SETTINGS_TITLE} message={FORBIDDEN_ACTION_MESSAGE} />
    );
  }
  const editingId = single(query.editar);
  const notice = noticeMessage(query.aviso);
  const values = settings.settings;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title={SETTINGS_TITLE}
        subtitle="Cuánto dura una franja, cuántos turnos caben en ella y los motivos para pedir uno. Las franjas salen del horario del local."
      />
      <AppointmentsSubNav current="configuracion" isAdmin />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <section aria-labelledby="valores-titulo" className="mt-6">
        <h2 id="valores-titulo" className={sectionTitleClass}>
          Duración y cupo
        </h2>
        {values?.isExample ? (
          <p className="mt-2 text-sm text-muted">{EXAMPLE_VALUES_TEXT}</p>
        ) : null}
        <div className={`mt-4 ${cardClass} p-5 sm:p-6`}>
          <AppointmentSettingsForm
            slotMinutes={values?.slotMinutes ?? null}
            capacity={values?.capacity ?? null}
            options={SLOT_MINUTES}
            maxCapacity={MAX_APPOINTMENT_CAPACITY}
          />
        </div>
      </section>

      <section aria-labelledby="motivos-titulo" className="mt-8">
        <h2 id="motivos-titulo" className={sectionTitleClass}>
          Motivos
        </h2>
        {reasons.reasons.length === 0 ? (
          <EmptyState
            icon="list"
            title="Todavía no hay motivos."
            description="Un motivo dice para qué viene la persona, como «Retirar un equipo»."
            className="mt-4"
          />
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {reasons.reasons.map((reason, index) => (
              <li key={reason.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{reason.name}</span>
                  {reason.isExample ? (
                    <span className={roleBadgeClass}>Del perfil</span>
                  ) : null}
                  <span
                    className={
                      reason.isActive ? activeBadgeClass : inactiveBadgeClass
                    }
                  >
                    {reason.isActive ? "Activo" : "Inactivo"}
                  </span>
                </p>
                {editingId === reason.id ? (
                  <div className="mt-3">
                    <ReasonForm
                      mode="editar"
                      reasonId={reason.id}
                      name={reason.name}
                      maxLength={REASON_NAME_MAX_LENGTH}
                    />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <Link
                      href={`/turnos/configuracion?editar=${reason.id}`}
                      className={secondaryLinkClass}
                    >
                      <Icon name="pencil" className="size-4" />
                      Renombrar
                      <span className="sr-only"> el motivo {reason.name}</span>
                    </Link>
                    <ReasonActiveForm
                      reasonId={reason.id}
                      name={reason.name}
                      isActive={reason.isActive}
                    />
                    <ReasonMoveForm
                      reasonId={reason.id}
                      name={reason.name}
                      first={index === 0}
                      last={index === reasons.reasons.length - 1}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
          <h3 className="text-base font-semibold">Nuevo motivo</h3>
          <div className="mt-3">
            <ReasonForm mode="crear" maxLength={REASON_NAME_MAX_LENGTH} />
          </div>
        </div>
      </section>
    </main>
  );
}
