import Link from "next/link";
import type { ReactNode } from "react";
import { listClientAppointments } from "@/modules/appointments";
import { getClientStatement } from "@/modules/cash";
import type { ClientActivityResult } from "@/modules/conversations";
import { PROVINCES, type Client } from "@/modules/crm";
import { hasCapability, type AuthContext } from "@/modules/organizations";
import { listOpenClientServiceOrders } from "@/modules/service";
import { CopyButton } from "@/app/_components/copy-button";
import { cardClass, secondaryLinkClass } from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import { calendarDayIn, formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { CHANNEL_LABEL } from "@/app/(autenticado)/conversaciones/messages";
import {
  appointmentDayText,
  pickNextAppointment,
} from "@/app/(autenticado)/conversaciones/[conversationId]/client-context-pick";
import { UNKNOWN_MODEL_TEXT } from "@/app/(autenticado)/reparaciones/messages";
import { ServiceOrderStatusBadge } from "@/app/(autenticado)/reparaciones/sub-nav";
import { AppointmentStatusBadge } from "@/app/(autenticado)/turnos/sub-nav";
import { KIND_LABEL } from "../filters";
import { CONTACT_HIDDEN_MESSAGE } from "../messages";
import { PhoneText } from "../phone-text";
import { pickNextAttention } from "./next-attention";
import { clientTabHref } from "./tabs";

// La pestaña Resumen de la ficha (brief-24.4.1, D-3; mockups 03 y 07): los datos de contacto con las
// notas, las etiquetas, tres indicadores, lo que está en curso y la última interacción. Compone en la
// aplicación las lecturas que la ficha ya hacía, cada una con su capacidad: cash da las ventas y el
// saldo (H-5), service la reparación, appointments el turno y conversations la interacción. Sin el
// texto del último mensaje (Screens, pantalla 7). Desde la 24.4.3, «Próxima atención» arriba (D-6) y
// una sola definición de reparación abierta, la de la lista (D-7).

const tileClass = `${cardClass} flex items-start gap-3 p-4 sm:p-5`;

const iconTileClass =
  "grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary";

const arrowLinkClass =
  "mt-1 inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function Tile({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={tileClass}>
      <span aria-hidden="true" className={iconTileClass}>
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        {children}
      </div>
    </div>
  );
}

const tileValueClass = "text-2xl font-bold tracking-tight tabular-nums";

const ATTENTION_UNKNOWN_TEXT =
  "No disponible: no se pudieron leer los turnos o las reparaciones.";

// Un saldo puede traer varias monedas e importes largos: no se sale de la tarjeta angosta.
const balanceValueClass =
  "text-xl font-bold tracking-tight tabular-nums [overflow-wrap:anywhere]";

function ContactRow({
  icon,
  label,
  children,
  copy,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
  copy?: { value: string; label: string; copiedText: string };
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Icon name={icon} className="size-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="sr-only">{label}</p>
        <div className="break-words">{children}</div>
      </div>
      {copy ? (
        <CopyButton
          value={copy.value}
          label={copy.label}
          copiedText={copy.copiedText}
        />
      ) : null}
    </li>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-1.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd>{value ?? <span className="text-muted">—</span>}</dd>
    </div>
  );
}

// Lo que crm no entregó al rol se dice; lo que está vacío queda en «—», como en el resto del detalle.
function contactValue(
  client: Client,
  field:
    "email" | "addressLine" | "postalCode" | "documentNumber" | "instagram",
) {
  if (client.contact === null) {
    return <span className="text-muted">{CONTACT_HIDDEN_MESSAGE}</span>;
  }
  return client.contact[field];
}

function ContactCard({
  client,
  tradeIns,
  tags,
}: {
  client: Client;
  tradeIns: boolean;
  tags: ReactNode;
}) {
  const phone = client.phone?.kind === "full" ? client.phone.e164 : null;
  const email = client.contact?.email ?? null;
  const instagram = client.contact?.instagram;
  return (
    <section
      aria-labelledby="contacto-titulo"
      className={`${cardClass} min-w-0 p-5 sm:p-6`}
    >
      <h2
        id="contacto-titulo"
        className="flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Icon name="user" className="size-5 text-muted lg:hidden" />
        Datos de contacto
      </h2>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        <ContactRow
          icon="phone"
          label="Teléfono"
          copy={
            phone
              ? {
                  value: phone,
                  label: "Copiar teléfono",
                  copiedText: "Teléfono copiado.",
                }
              : undefined
          }
        >
          <PhoneText phone={client.phone} emptyText="Sin teléfono" />
        </ContactRow>
        <ContactRow
          icon="mail"
          label="Email"
          copy={
            email
              ? {
                  value: email,
                  label: "Copiar email",
                  copiedText: "Email copiado.",
                }
              : undefined
          }
        >
          {client.contact === null ? (
            contactValue(client, "email")
          ) : email ? (
            email
          ) : (
            <span className="text-muted">Sin email</span>
          )}
        </ContactRow>
      </ul>

      {/* «Más datos» en el teléfono, como 07; en escritorio, abierto. Sin JavaScript también. */}
      <details className="group mt-1 border-t border-border lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <Icon name="ellipsis" className="size-5 text-muted" />
          <span className="flex-1">Más datos</span>
          <Icon
            name="chevronRight"
            className="size-5 text-muted transition-transform group-open:rotate-90"
          />
        </summary>
        <MoreData client={client} tradeIns={tradeIns} instagram={instagram} />
      </details>
      <div className="max-lg:hidden">
        <MoreData client={client} tradeIns={tradeIns} instagram={instagram} />
      </div>

      <div className="mt-4 border-t border-border pt-4">{tags}</div>
    </section>
  );
}

function MoreData({
  client,
  tradeIns,
  instagram,
}: {
  client: Client;
  tradeIns: boolean;
  instagram: string | null | undefined;
}) {
  return (
    <dl className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {tradeIns ? (
        <>
          <DetailRow
            label="Documento"
            value={contactValue(client, "documentNumber")}
          />
          <DetailRow
            label="Instagram"
            value={
              instagram != null
                ? `@${instagram}`
                : contactValue(client, "instagram")
            }
          />
        </>
      ) : null}
      <DetailRow
        label="Tipo"
        value={client.kind ? KIND_LABEL[client.kind] : null}
      />
      <DetailRow label="Empresa" value={client.companyName} />
      <DetailRow label="Cargo" value={client.jobTitle} />
      <DetailRow
        label="Calle y número"
        value={contactValue(client, "addressLine")}
      />
      <DetailRow label="Localidad" value={client.city} />
      <DetailRow
        label="Provincia"
        value={client.province ? PROVINCES[client.province] : null}
      />
      <DetailRow
        label="Código postal"
        value={contactValue(client, "postalCode")}
      />
      <DetailRow label="Segmento" value={client.segment} />
      <div className="py-1.5 sm:col-span-2 lg:col-span-1 xl:col-span-2">
        <dt className="text-sm text-muted">Notas</dt>
        <dd className="whitespace-pre-wrap">
          {client.notes ?? <span className="text-muted">Sin notas</span>}
        </dd>
      </div>
    </dl>
  );
}

export async function SummaryTab({
  context,
  client,
  timeZone,
  activity,
  tags,
}: {
  context: AuthContext;
  client: Client;
  timeZone: string;
  activity: Promise<ClientActivityResult>;
  // Las etiquetas ya armadas por la página (con los formularios de un admin).
  tags: ReactNode;
}) {
  const [tradeIns, repairs, appointments] = await Promise.all([
    hasCapability(context.organizationId, "trade_ins"),
    hasCapability(context.organizationId, "repairs"),
    hasCapability(context.organizationId, "appointments"),
  ]);
  const [statement, orders, clientAppointments, lastActivity] =
    await Promise.all([
      getClientStatement(context, client.id),
      repairs ? listOpenClientServiceOrders(context, client.id) : null,
      appointments ? listClientAppointments(context, client.id) : null,
      activity,
    ]);
  const today = calendarDayIn(timeZone);
  // Las órdenes llegan de la más nueva a la más vieja, todas abiertas.
  const order = orders?.ok ? (orders.orders[0] ?? null) : null;
  const appointment = clientAppointments?.ok
    ? pickNextAppointment(clientAppointments.appointments, today)
    : null;
  const attention = pickNextAttention(
    clientAppointments?.ok ? clientAppointments.appointments : [],
    orders?.ok ? orders.orders : [],
    today,
  );
  // Un módulo que no se pudo leer no se confunde con «sin pendientes».
  const attentionUnknown =
    (orders !== null && !orders.ok) ||
    (clientAppointments !== null && !clientAppointments.ok);

  return (
    // Cinco bloques en el orden del teléfono (07): próxima atención, indicadores, contacto, en curso y
    // última interacción. En escritorio la atención ocupa todo el ancho y el contacto la columna
    // izquierda entera, como 03, y la última fila absorbe la altura que sobre.
    <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:gap-6">
      <section
        aria-labelledby="atencion-titulo"
        // Blanca en el teléfono (07) y ámbar desde sm (03).
        className={`${cardClass} min-w-0 p-5 sm:p-6 lg:col-span-2 ${attention ? "sm:border-warning-soft sm:bg-warning-soft" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span
            aria-hidden="true"
            className={`${iconTileClass} ${attention ? "sm:border sm:border-current/30 sm:bg-transparent sm:text-on-warning-soft" : ""}`}
          >
            <Icon name={attention?.kind === "repair" ? "wrench" : "calendar"} />
          </span>
          <div className="min-w-0 flex-[1_1_14rem]">
            <h2
              id="atencion-titulo"
              className="text-lg font-bold tracking-tight"
            >
              Próxima atención
            </h2>
            {attention?.kind === "appointment" ? (
              <>
                <p className="font-semibold">
                  {attention.appointment.reasonName || "Turno"} ·{" "}
                  {appointmentDayText(attention.appointment.date, today)} a las{" "}
                  {attention.appointment.start}
                </p>
                <p className="mt-1 text-sm">
                  <AppointmentStatusBadge
                    status={attention.appointment.status}
                  />
                </p>
              </>
            ) : attention?.kind === "repair" ? (
              <>
                <p className="font-semibold">
                  <span className="font-mono">
                    {attention.order.displayNumber}
                  </span>{" "}
                  · {attention.order.modelName ?? UNKNOWN_MODEL_TEXT}
                </p>
                <p className="mt-1 text-sm">
                  <ServiceOrderStatusBadge status={attention.order.status} />
                </p>
              </>
            ) : null}
            {attention && attentionUnknown ? (
              <p className="mt-1 text-sm">{ATTENTION_UNKNOWN_TEXT}</p>
            ) : null}
            {attention ? null : (
              <p className="text-sm text-muted">
                {attentionUnknown
                  ? ATTENTION_UNKNOWN_TEXT
                  : "Sin atenciones pendientes."}
              </p>
            )}
          </div>
          {attention ? (
            <div className="flex flex-wrap gap-2 max-sm:w-full">
              <Link
                href={
                  attention.kind === "appointment"
                    ? `/turnos/${attention.appointment.id}`
                    : `/reparaciones/${attention.order.id}`
                }
                className={`${secondaryLinkClass} max-sm:grow`}
              >
                {attention.kind === "appointment"
                  ? "Ver turno"
                  : "Ver reparación"}
              </Link>
              {attention.more ? (
                <Link
                  href={`${clientTabHref(client.id, "operaciones")}&estado=en_curso`}
                  className={`${secondaryLinkClass} max-sm:grow`}
                >
                  Ver todas
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div
        className={`grid min-w-0 gap-4 lg:col-start-2 lg:row-start-2 ${repairs ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <Tile icon="receipt" label="Ventas registradas">
          {statement.ok ? (
            // Las vigentes de cada moneda, que la imputación trae enteras: los comprobantes pueden
            // venir cortados (STATEMENT_DOCUMENTS_LIMIT).
            <p className={tileValueClass}>
              {statement.statement.currencies.reduce(
                (total, account) => total + account.sales.length,
                0,
              )}
            </p>
          ) : (
            <p className="font-semibold">No disponible</p>
          )}
        </Tile>
        {repairs ? (
          <Tile icon="wrench" label="Reparaciones abiertas">
            {orders?.ok ? (
              <p className={tileValueClass}>{orders.total}</p>
            ) : (
              <p className="font-semibold">No disponible</p>
            )}
          </Tile>
        ) : null}
        <BalanceTile clientId={client.id} statement={statement} />
      </div>

      <div className="min-w-0 lg:col-start-1 lg:row-span-3 lg:row-start-2">
        <ContactCard client={client} tradeIns={tradeIns} tags={tags} />
      </div>

      <section
        aria-labelledby="en-curso-titulo"
        className={`${cardClass} min-w-0 p-5 sm:p-6 lg:col-start-2 lg:row-start-3`}
      >
        <h2 id="en-curso-titulo" className="text-lg font-bold tracking-tight">
          En curso
        </h2>
        {order || appointment ? (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {order ? (
              <InProgressRow
                icon="wrench"
                title={<span className="font-mono">{order.displayNumber}</span>}
                detail={order.modelName ?? UNKNOWN_MODEL_TEXT}
                status={<ServiceOrderStatusBadge status={order.status} />}
                href={`/reparaciones/${order.id}`}
                action="Ver reparación"
              />
            ) : null}
            {appointment ? (
              <InProgressRow
                icon="calendar"
                title={`${appointmentDayText(appointment.date, today)} · ${appointment.start}`}
                detail={appointment.reasonName ?? ""}
                status={<AppointmentStatusBadge status={appointment.status} />}
                href={`/turnos/${appointment.id}`}
                action="Ver turno"
              />
            ) : null}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {attentionUnknown ? ATTENTION_UNKNOWN_TEXT : "Nada en curso."}
          </p>
        )}
      </section>

      <section
        aria-labelledby="interaccion-titulo"
        className={`${cardClass} min-w-0 p-5 sm:p-6 lg:col-start-2 lg:row-start-4`}
      >
        <h2
          id="interaccion-titulo"
          className="text-lg font-bold tracking-tight"
        >
          Última interacción
        </h2>
        {!lastActivity.ok ? (
          <p className="mt-3 text-sm text-muted">No disponible.</p>
        ) : lastActivity.lastInteraction ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-full bg-success-soft text-success"
              >
                <Icon name="messageCircle" className="size-5" />
              </span>
              <span>
                {CHANNEL_LABEL[lastActivity.lastInteraction.channel]} ·{" "}
                {formatShortDateTime(
                  lastActivity.lastInteraction.at,
                  lastActivity.timezone,
                )}
              </span>
            </p>
            {lastActivity.conversations[0] ? (
              <Link
                href={`/conversaciones/${lastActivity.conversations[0].id}`}
                className={secondaryLinkClass}
              >
                Ver conversación
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Sin interacciones.</p>
        )}
      </section>
    </div>
  );
}

function InProgressRow({
  icon,
  title,
  detail,
  status,
  href,
  action,
}: {
  icon: IconName;
  title: ReactNode;
  detail: string;
  status: ReactNode;
  href: string;
  action: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-muted text-muted"
      >
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-[1_1_10rem]">
        <p className="font-semibold">{title}</p>
        {detail ? <p className="text-sm text-muted">{detail}</p> : null}
      </div>
      <span className="text-sm">{status}</span>
      <Link href={href} className={`${secondaryLinkClass} ml-auto`}>
        {action}
      </Link>
    </li>
  );
}

// El saldo por moneda, sin sumar monedas (Invariantes): lo que debe o, si no debe, lo que tiene a
// favor. Un error se dice, nunca se muestra como cero (mockup 08, panel 06).
function BalanceTile({
  clientId,
  statement,
}: {
  clientId: string;
  statement: Awaited<ReturnType<typeof getClientStatement>>;
}) {
  if (!statement.ok) {
    return (
      <Tile icon="creditCard" label="Saldo pendiente">
        <p className="font-semibold">No disponible</p>
      </Tile>
    );
  }
  const debts = statement.statement.currencies.filter(
    (row) => row.balance.side === "debt",
  );
  const favors = statement.statement.currencies.filter(
    (row) => row.balance.side === "favor",
  );
  // La deuda primero; un saldo a favor en otra moneda se muestra debajo, rotulado, sin sumarlo.
  return (
    <Tile
      icon="creditCard"
      label={
        debts.length === 0 && favors.length > 0 ? "A favor" : "Saldo pendiente"
      }
    >
      {debts.length === 0 && favors.length === 0 ? (
        <p className={tileValueClass}>Al día</p>
      ) : null}
      {(debts.length > 0 ? debts : favors).map((row) => (
        <p key={row.currency} className={balanceValueClass}>
          {formatMoney(row.balance.amount, row.currency)}
        </p>
      ))}
      {debts.length > 0
        ? favors.map((row) => (
            <p key={row.currency} className="text-sm font-semibold">
              A favor {formatMoney(row.balance.amount, row.currency)}
            </p>
          ))
        : null}
      <Link href={clientTabHref(clientId, "cuenta")} className={arrowLinkClass}>
        Consultar cuenta corriente
        <Icon name="chevronRight" className="size-4" />
      </Link>
    </Tile>
  );
}
