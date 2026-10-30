import Link from "next/link";
import type { AuthContext } from "@/modules/organizations";
import { Icon } from "@/app/_components/icons";
import { secondaryLinkClass } from "@/app/_components/form-styles";
import { SectionCard } from "@/app/_components/section-card";
import {
  calendarDayIn,
  formatFullDateTime,
  formatTime,
} from "@/app/_format/date-time";
import { readClientActivityEvents } from "./activity-data";
import { ACTIVITY_EVENTS_MAX, ACTIVITY_EVENTS_STEP } from "./activity-events";
import { localDateKey } from "./operations-rows";

// La cronología de Actividad (brief-24.4.3, D-5; panel 05 de 08): compone lo que da cada módulo, sin
// JOIN, y dice qué fuente no se pudo leer. Enlaces y nada más: funciona sin JavaScript.

function whenText(at: Date, today: string, timeZone: string): string {
  return localDateKey(at, timeZone).startsWith(today)
    ? `Hoy ${formatTime(at, timeZone)}`
    : formatFullDateTime(at, timeZone);
}

export async function ActivityCard({
  context,
  clientId,
  timeZone,
  limit,
  moreHref,
}: {
  context: AuthContext;
  clientId: string;
  timeZone: string;
  limit: number;
  moreHref: (limit: number) => string;
}) {
  const { events, failed } = await readClientActivityEvents(context, clientId);
  const today = calendarDayIn(timeZone);
  const shown = events.slice(0, limit);
  const canShowMore =
    events.length > shown.length && limit < ACTIVITY_EVENTS_MAX;

  return (
    <SectionCard
      id="actividad-titulo"
      title="Actividad"
      icon="history"
      className="mt-6"
    >
      {failed.length > 0 ? (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-on-warning-soft"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          <span>
            No se pudo leer: {failed.join(", ")}. Esa actividad no aparece acá.
          </span>
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          {failed.length > 0
            ? "No hay actividad para mostrar de lo que se pudo leer."
            : "Este cliente todavía no tiene actividad."}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {shown.map((event) => (
            <li key={event.key}>
              <Link
                href={event.href}
                className="group flex min-h-11 items-start gap-3 rounded-lg py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"
                >
                  <Icon name={event.icon} className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1 gap-x-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                  <span className="text-sm whitespace-nowrap text-muted">
                    {whenText(event.at, today, timeZone)}
                  </span>
                  <span className="min-w-0 break-words">
                    <span className="font-semibold group-hover:underline">
                      {event.title}
                    </span>
                    {event.source ? (
                      <span className="text-muted"> · {event.source}</span>
                    ) : null}
                    {event.detail ? (
                      <span className="block text-sm text-muted tabular-nums">
                        {event.detail}
                      </span>
                    ) : null}
                  </span>
                </span>
                <Icon
                  name="chevronRight"
                  className="mt-1 size-4 shrink-0 text-muted"
                />
              </Link>
            </li>
          ))}
        </ol>
      )}
      {canShowMore ? (
        <p className="mt-3">
          <Link
            href={moreHref(limit + ACTIVITY_EVENTS_STEP)}
            className={`${secondaryLinkClass} w-full`}
          >
            Ver más actividad
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}
