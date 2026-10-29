import Link from "next/link";
import type { ReactNode } from "react";
import { listClientAppointments } from "@/modules/appointments";
import { getClient } from "@/modules/crm";
import { hasCapability, type AuthContext } from "@/modules/organizations";
import { listClientServiceOrders } from "@/modules/service";
import { UNKNOWN_MODEL_TEXT } from "@/app/(autenticado)/reparaciones/messages";
import { ServiceOrderStatusBadge } from "@/app/(autenticado)/reparaciones/sub-nav";
import { AppointmentStatusBadge } from "@/app/(autenticado)/turnos/sub-nav";
import { cardClass } from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import { TagChip } from "@/app/_components/tag-chip";
import { calendarDayIn } from "@/app/_format/date-time";
import {
  AGENT_ACTIVITY_TITLE,
  AGENT_REPLY_TEXT,
  CONTEXT_TITLE,
  NO_APPOINTMENT_TEXT,
  NO_CLIENT_CONTEXT_TEXT,
  NO_TAGS_TEXT,
} from "../messages";
import {
  appointmentDayText,
  pickNextAppointment,
  pickOpenServiceOrder,
} from "./client-context-pick";

// «Contexto del cliente» de la pantalla 9 (brief-24.3, D-6), para los dos roles: la reparación
// abierta más reciente, el próximo turno y las etiquetas, y los dos primeros solo con su capacidad:
// sin ella, su lectura no se pide. Para un admin, además, «Acciones relacionadas» con el cliente ya
// elegido. Compone en la aplicación las lecturas de service, appointments y crm que ya usa la
// ficha, sin JOIN entre módulos. Es un componente de servidor: al navegador llegan solo el número,
// el modelo, la fecha, el motivo y los estados, nunca un importe ni un dato de contacto. Desde la
// 24.3.1, la forma de los mockups 02 y 05 (brief-24.3.1): una tarjeta por bloque, con su ícono y su
// rótulo, «Ver ficha» arriba, «Sin turno asignado» cuando no hay (con «Crear turno» en las
// acciones, no dos veces), la hora de la última respuesta
// del agente (D-4) y las acciones como lista. Sin «Consulta de producto»: no se infiere del chat.

type OpenOrder = Extract<
  Awaited<ReturnType<typeof listClientServiceOrders>>,
  { ok: true }
>["orders"][number];

// La reparación abierta más reciente de un cliente, o null sin la capacidad o sin ninguna. La usa
// también el panel de la bandeja (brief-24.3.1, D-2).
export async function readOpenRepair(
  context: AuthContext,
  clientId: string,
): Promise<OpenOrder | null> {
  if (!(await hasCapability(context.organizationId, "repairs"))) return null;
  const orders = await listClientServiceOrders(context, clientId);
  return orders.ok ? pickOpenServiceOrder(orders.orders) : null;
}

// La reparación como renglón: el número y el modelo, y su estado. La comparten el contexto, el
// panel de la bandeja y el teléfono.
export function RepairLine({ order }: { order: OpenOrder }) {
  return (
    <>
      <p className="text-lg font-bold tracking-tight">
        <span className="font-mono">{order.displayNumber}</span> ·{" "}
        {order.modelName ?? UNKNOWN_MODEL_TEXT}
      </p>
      <p className="mt-1">
        <ServiceOrderStatusBadge status={order.status} />
      </p>
    </>
  );
}

const contextLinkClass =
  "rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const blockLabelClass =
  "flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase";

function Block({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h3 id={id} className={blockLabelClass}>
        <Icon name={icon} className="size-4 text-primary" />
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`mt-2 inline-flex items-center gap-1 ${contextLinkClass}`}
    >
      {children}
      <Icon name="chevronRight" className="size-4" />
    </Link>
  );
}

function ContextCard({
  clientId,
  children,
}: {
  clientId: string | null;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="contexto-titulo"
      className={`${cardClass} flex flex-col gap-3 p-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="contexto-titulo" className="text-lg font-bold tracking-tight">
          {CONTEXT_TITLE}
        </h2>
        {clientId ? (
          <Link
            href={`/clientes/${clientId}`}
            className={`inline-flex items-center gap-1 text-sm ${contextLinkClass}`}
          >
            Ver ficha
            <Icon name="externalLink" className="size-4" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export async function ClientContext({
  context,
  clientId,
  timeZone,
  lastAgentReplyAt,
}: {
  context: AuthContext;
  clientId: string | null;
  timeZone: string;
  // La hora de la última respuesta del agente en el hilo, ya formateada; null si no hay (D-4).
  lastAgentReplyAt: string | null;
}) {
  if (clientId === null) {
    return (
      <ContextCard clientId={null}>
        <p className="text-sm text-muted">{NO_CLIENT_CONTEXT_TEXT}</p>
      </ContextCard>
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
  const today = calendarDayIn(timeZone);
  const appointment = clientAppointments?.ok
    ? pickNextAppointment(clientAppointments.appointments, today)
    : null;
  const tags = client.ok ? client.client.tags : [];
  const canCreate =
    context.role === "admin" && client.ok && client.client.isActive;

  return (
    <ContextCard clientId={clientId}>
      {repairs && order ? (
        <Block id="contexto-reparacion" icon="wrench" title="Reparación">
          <RepairLine order={order} />
          <ArrowLink href={`/reparaciones/${order.id}`}>
            Ver reparación
          </ArrowLink>
        </Block>
      ) : null}

      {appointments ? (
        <Block id="contexto-turno" icon="calendar" title="Turno">
          {appointment ? (
            <>
              <p className="text-lg font-bold tracking-tight">
                {appointmentDayText(appointment.date, today)} ·{" "}
                {appointment.start}
              </p>
              {appointment.reasonName ? (
                <p className="text-sm text-muted">{appointment.reasonName}</p>
              ) : null}
              <p className="mt-1">
                <AppointmentStatusBadge status={appointment.status} />
              </p>
              <ArrowLink href={`/turnos/${appointment.id}`}>
                Ver turno
              </ArrowLink>
            </>
          ) : (
            <p className="font-semibold">{NO_APPOINTMENT_TEXT}</p>
          )}
        </Block>
      ) : null}

      <Block id="contexto-etiquetas" icon="tag" title="Etiquetas">
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
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
        ) : (
          <p className="text-sm text-muted">{NO_TAGS_TEXT}</p>
        )}
      </Block>

      {lastAgentReplyAt ? (
        <section
          aria-labelledby="contexto-agente"
          className="rounded-xl border border-border bg-surface p-4"
        >
          <h3
            id="contexto-agente"
            className="flex items-center gap-2 font-semibold"
          >
            <Icon name="zap" className="size-4 text-primary" />
            {AGENT_ACTIVITY_TITLE}
          </h3>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Icon name="bot" className="size-4" />
            {lastAgentReplyAt} · {AGENT_REPLY_TEXT}
          </p>
        </section>
      ) : null}

      {canCreate ? (
        <section
          aria-labelledby="contexto-acciones"
          className="rounded-xl border border-border bg-surface p-4"
        >
          <h3
            id="contexto-acciones"
            className="flex items-center gap-2 font-semibold"
          >
            <Icon name="zap" className="size-4 text-primary" />
            Acciones relacionadas
          </h3>
          <ul className="mt-2 flex flex-col">
            {appointments ? (
              <li>
                <RelatedAction
                  href={`/turnos/nuevo?cliente=${clientId}`}
                  icon="calendar"
                >
                  Crear turno
                </RelatedAction>
              </li>
            ) : null}
            <li>
              <RelatedAction
                href={`/pedidos/nuevo?cliente=${clientId}`}
                icon="fileText"
              >
                Crear pedido
              </RelatedAction>
            </li>
          </ul>
        </section>
      ) : null}
    </ContextCard>
  );
}

function RelatedAction({
  href,
  icon,
  children,
}: {
  href: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-lg px-1 font-semibold text-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Icon name={icon} className="size-4" />
      <span className="flex-1">{children}</span>
      <Icon name="chevronRight" className="size-4" />
    </Link>
  );
}
