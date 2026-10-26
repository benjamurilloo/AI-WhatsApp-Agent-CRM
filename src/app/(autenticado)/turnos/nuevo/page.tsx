import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  APPOINTMENT_NOTE_MAX_LENGTH,
  appointmentsAllowed,
  getAppointmentForm,
} from "@/modules/appointments";
import { formatDayDate } from "@/app/(autenticado)/informacion/horario/messages";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import {
  ADMIN_ONLY_MESSAGE,
  FORBIDDEN_ACTION_MESSAGE,
  NEW_APPOINTMENT_TITLE,
  NO_FREE_SLOTS_MESSAGE,
  NO_HOURS_MESSAGE,
  NO_REASONS_MESSAGE,
  NO_SETTINGS_MESSAGE,
} from "../messages";
import { AppointmentsSubNav } from "../sub-nav";
import { AppointmentForm } from "./appointment-form";

export const metadata: Metadata = {
  title: "Nuevo turno — AI WhatsApp Agent CRM",
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// El alta de un turno (brief-29.10, D-3 a D-5): primero la fecha, con un formulario GET que muestra sus
// franjas libres; después el cliente, el motivo, la franja y una nota. Llega con ?fecha= y ?franja=
// desde el calendario, con ?cliente= desde la ficha de un cliente, y con ?producto= o ?unidad= como
// referencia. Solo admin. Sin la capacidad appointments, 404.
export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await appointmentsAllowed(context))) notFound();
  if (context.role !== "admin") {
    return (
      <PageNotice title={NEW_APPOINTMENT_TITLE} message={ADMIN_ONLY_MESSAGE} />
    );
  }
  const query = await searchParams;
  const keep = {
    cliente: single(query.cliente),
    producto: single(query.producto),
    unidad: single(query.unidad),
  };
  const result = await getAppointmentForm(context, {
    date: single(query.fecha),
    clientId: keep.cliente,
    productId: keep.producto,
    unitId: keep.unidad,
  });
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <PageNotice
        title={NEW_APPOINTMENT_TITLE}
        message={FORBIDDEN_ACTION_MESSAGE}
      />
    );
  }
  const { form } = result;
  const blocked = !form.hoursConfigured
    ? NO_HOURS_MESSAGE
    : !form.configured
      ? NO_SETTINGS_MESSAGE
      : form.reasons.length === 0
        ? NO_REASONS_MESSAGE
        : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink
        href={form.client ? `/clientes/${form.client.id}` : "/turnos"}
        label={form.client ? "Volver al cliente" : "Volver al calendario"}
      />
      <DetailHeader
        title={NEW_APPOINTMENT_TITLE}
        leading={<HeaderIcon name="calendar" />}
        subtitle={
          <p>
            El turno queda confirmado y ocupa su franja. Se dan hasta el{" "}
            {formatDayDate(form.maxDate)}.
          </p>
        }
      />
      <AppointmentsSubNav current="nuevo" isAdmin />

      {blocked ? (
        <SectionCard
          id="sin-turnos-titulo"
          title="Todavía no se pueden dar turnos"
          icon="calendar"
          className="mt-6"
        >
          <p className="text-sm text-muted">{blocked}</p>
        </SectionCard>
      ) : (
        <>
          <SectionCard
            id="fecha-titulo"
            title="La fecha"
            icon="calendar"
            className="mt-6"
          >
            <form
              method="get"
              action="/turnos/nuevo"
              className="flex flex-wrap items-end gap-3"
            >
              {Object.entries(keep).map(([name, value]) =>
                value ? (
                  <input key={name} type="hidden" name={name} value={value} />
                ) : null,
              )}
              <div className="flex flex-col gap-1">
                <label htmlFor="fecha" className={labelClass}>
                  Fecha
                </label>
                <input
                  id="fecha"
                  name="fecha"
                  type="date"
                  required
                  min={form.today}
                  max={form.maxDate}
                  defaultValue={form.date}
                  className={inputClass}
                />
              </div>
              <button type="submit" className={secondaryButtonClass}>
                Ver las franjas libres
              </button>
            </form>
            <p className="mt-3 text-sm text-muted">
              {formatDayDate(form.date)}:{" "}
              {form.freeSlots.length === 0
                ? NO_FREE_SLOTS_MESSAGE
                : `${form.freeSlots.length} ${form.freeSlots.length === 1 ? "franja libre" : "franjas libres"}.`}
            </p>
          </SectionCard>
          {form.freeSlots.length > 0 ? (
            <SectionCard
              id="turno-titulo"
              title="El turno"
              icon="calendar"
              className="mt-6"
            >
              <AppointmentForm
                date={form.date}
                freeSlots={form.freeSlots}
                initialSlot={single(query.franja)}
                reasons={form.reasons}
                initialClient={form.client}
                reference={form.reference}
                noteMax={APPOINTMENT_NOTE_MAX_LENGTH}
              />
            </SectionCard>
          ) : null}
        </>
      )}
    </main>
  );
}
