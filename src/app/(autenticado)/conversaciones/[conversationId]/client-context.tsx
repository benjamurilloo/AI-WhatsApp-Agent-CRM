import Link from "next/link";
import { listClientAppointments } from "@/modules/appointments";
import { getClient } from "@/modules/crm";
import { hasCapability, type AuthContext } from "@/modules/organizations";
import { listClientServiceOrders } from "@/modules/service";
import { formatDayDate } from "@/app/(autenticado)/informacion/horario/messages";
import { UNKNOWN_MODEL_TEXT } from "@/app/(autenticado)/reparaciones/messages";
import { ServiceOrderStatusBadge } from "@/app/(autenticado)/reparaciones/sub-nav";
import { formatRange } from "@/app/(autenticado)/turnos/messages";
import { AppointmentStatusBadge } from "@/app/(autenticado)/turnos/sub-nav";
import { linkClass, secondaryLinkClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { TagChip } from "@/app/_components/tag-chip";
import { calendarDayIn } from "@/app/_format/date-time";
import {
  CONTEXT_TITLE,
  NO_CLIENT_CONTEXT_TEXT,
  NO_CONTEXT_DATA_TEXT,
} from "../messages";
import {
  pickNextAppointment,
  pickOpenServiceOrder,
} from "./client-context-pick";

// «Contexto del cliente» de la pantalla 9 (brief-24.3, D-6), para los dos roles: la reparación
// abierta más reciente, el próximo turno y las etiquetas, cada bloque solo si hay dato, y los dos
// primeros solo con su capacidad: sin ella, su lectura no se pide. Para un admin, además, «Acciones
// relacionadas» con el cliente ya elegido. Compone en la aplicación las lecturas de service,
// appointments y crm que ya usa la ficha, sin JOIN entre módulos. Es un componente de servidor:
// al navegador llegan solo el número, el modelo, la fecha, el motivo y los estados, nunca un
// importe ni un dato de contacto.

const blockTitleClass = "text-sm font-semibold text-muted";

export async function ClientContext({
  context,
  clientId,
  timeZone,
}: {
  context: AuthContext;
  clientId: string | null;
  timeZone: string;
}) {
  if (clientId === null) {
    return (
      <SectionCard id="contexto-titulo" title={CONTEXT_TITLE} icon="user">
        <p className="text-sm text-muted">{NO_CLIENT_CONTEXT_TEXT}</p>
      </SectionCard>
    );
  }

  const [client, repairs, appointments] = await Promise.all([
    getClient(context, clientId),
    hasCapability(context.organizationId, "repairs"),
    hasCapability(context.organizationId, "appointments"),
  ]);
  const [orders, clientAppointments] = await Promise.all([
    repairs ? listClientServiceOrders(context, clientId) : null,
    appointments ? listClientAppointments(context, clientId) : null,
  ]);
  const order = orders?.ok ? pickOpenServiceOrder(orders.orders) : null;
  const appointment = clientAppointments?.ok
    ? pickNextAppointment(
        clientAppointments.appointments,
        calendarDayIn(timeZone),
      )
    : null;
  const tags = client.ok ? client.client.tags : [];
  const canCreate =
    context.role === "admin" && client.ok && client.client.isActive;

  return (
    <SectionCard id="contexto-titulo" title={CONTEXT_TITLE} icon="user">
      <div className="flex flex-col gap-5">
        <p>
          <Link href={`/clientes/${clientId}`} className={linkClass}>
            Ver ficha
          </Link>
        </p>

        {order ? (
          <section aria-labelledby="contexto-reparacion">
            <h3 id="contexto-reparacion" className={blockTitleClass}>
              Reparación
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold">
                {order.displayNumber}
              </span>
              <ServiceOrderStatusBadge status={order.status} />
            </p>
            <p className="text-sm text-muted">
              {order.modelName ?? UNKNOWN_MODEL_TEXT}
            </p>
            <p className="mt-1">
              <Link href={`/reparaciones/${order.id}`} className={linkClass}>
                Ver reparación
              </Link>
            </p>
          </section>
        ) : null}

        {appointment ? (
          <section aria-labelledby="contexto-turno">
            <h3 id="contexto-turno" className={blockTitleClass}>
              Próximo turno
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {formatDayDate(appointment.date)},{" "}
                {formatRange(appointment.start, appointment.end)}
              </span>
              <AppointmentStatusBadge status={appointment.status} />
            </p>
            {appointment.reasonName ? (
              <p className="text-sm text-muted">{appointment.reasonName}</p>
            ) : null}
            <p className="mt-1">
              <Link href={`/turnos/${appointment.id}`} className={linkClass}>
                Ver turno
              </Link>
            </p>
          </section>
        ) : null}

        {tags.length > 0 ? (
          <section aria-labelledby="contexto-etiquetas">
            <h3 id="contexto-etiquetas" className={blockTitleClass}>
              Etiquetas
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <TagChip
                    name={tag.name}
                    color={tag.color}
                    isActive={tag.isActive}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!order && !appointment && tags.length === 0 ? (
          <p className="text-sm text-muted">{NO_CONTEXT_DATA_TEXT}</p>
        ) : null}

        {canCreate ? (
          <section aria-labelledby="contexto-acciones">
            <h3 id="contexto-acciones" className={blockTitleClass}>
              Acciones relacionadas
            </h3>
            <p className="mt-2 flex flex-wrap gap-2">
              {appointments ? (
                <Link
                  href={`/turnos/nuevo?cliente=${clientId}`}
                  className={secondaryLinkClass}
                >
                  <Icon name="calendar" className="size-4" />
                  Crear turno
                </Link>
              ) : null}
              <Link
                href={`/pedidos/nuevo?cliente=${clientId}`}
                className={secondaryLinkClass}
              >
                <Icon name="package" className="size-4" />
                Crear pedido
              </Link>
            </p>
          </section>
        ) : null}
      </div>
    </SectionCard>
  );
}
