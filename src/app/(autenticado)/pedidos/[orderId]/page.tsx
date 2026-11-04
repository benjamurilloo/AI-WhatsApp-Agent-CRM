import type { Metadata } from "next";
import Link from "next/link";
import { getOrderReceipts, getOrderReceiptForm } from "@/modules/cash";
import { getCredentialSources } from "@/modules/ingestion";
import { getOrder, listOrderAudit } from "@/modules/orders";
import { getOrganizationTimezone } from "@/modules/organizations";
import { getSaleForOrder } from "@/modules/sales";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";
import { NO_ACTIVE_METHODS_MESSAGE } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import { ActionNotice } from "@/app/_components/action-notice";
// Desde la 24.6.2-d, ReceiptForm vive en _components y ya no en una ruta de ventas: lo comparten
// la seña de un pedido y el cobro de una venta (brief-24.6.2-d, D-1, opción c). Solo cambia de dónde
// se importa: la pantalla de la seña no cambia (AC-12).
import { ReceiptForm } from "@/app/_components/receipt-form";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { Icon } from "@/app/_components/icons";
import {
  linkClass,
  primaryLinkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import {
  moreActionDangerClass,
  moreActionItemClass,
} from "@/app/_components/more-action-styles";
import { MoreActions } from "@/app/_components/more-actions";
import { PageNotice } from "@/app/_components/page-notice";
import { SubNav } from "@/app/_components/sub-nav";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import type { SearchParams } from "../filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  ORDER_NOT_FOUND_MESSAGE,
  orderNoticeMessage,
  orderOriginLabel,
  type OrderTransitionName,
  UNKNOWN_CLIENT_TEXT,
} from "../messages";
import { OrderStatusBadge } from "../status-badge";
import { createOrderReceiptAction } from "./senar/actions";
import {
  DEPOSIT_COMPLETE_MESSAGE,
  orderNotOpenMessage,
} from "./senar/messages";
import { ActivityTab } from "./activity-tab";
import { DepositsTab } from "./deposits-tab";
import { IssueSaleConfirm } from "./issue-sale";
import { SummaryTab } from "./summary-tab";
import {
  ORDER_TAB_LABEL,
  ORDER_TABS,
  orderTabHref,
  parseOrderTab,
  TAB_PARAM,
} from "./tabs";
import { OrderTransitionForm } from "./transition-form";

export const metadata: Metadata = {
  title: "Pedido — AI WhatsApp Agent CRM",
};

const TITLE = "Pedido";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Los paneles de las operaciones (brief-24.6.1, D-5). Van en **un solo parámetro** y no en uno por
// operación: así es imposible pedir dos a la vez, que con `?confirmar=1&entregar=1` habría que
// resolver a mano. `?confirmar=venta` se conserva porque es la dirección que la 20.2 viene
// generando desde octubre y puede estar guardada en un favorito.
const PANELS = [
  "confirmar",
  "senar",
  "entregar",
  "cancelar",
  "emitir",
] as const;
type Panel = (typeof PANELS)[number];

// Qué transición corresponde a un panel, **y solo si el estado la permite**. Pedir
// `?panel=entregar` sobre un pendiente no entrega nada: el panel dice que la operación ya no está
// disponible. La guarda real sigue estando en el servicio, que rechaza una transición inválida;
// esto evita además dibujar un botón que iba a fallar.
function transitionOf(
  panel: Panel | null,
  status: string,
): OrderTransitionName | null {
  if (panel === "confirmar" && status === "pending") return "confirm";
  if (panel === "entregar" && status === "confirmed") return "deliver";
  if (panel === "cancelar" && (status === "pending" || status === "confirmed"))
    return "cancel";
  return null;
}

function parsePanel(query: SearchParams): Panel | null {
  const raw = Array.isArray(query.panel) ? query.panel[0] : query.panel;
  const legacy = Array.isArray(query.confirmar)
    ? query.confirmar[0]
    : query.confirmar;
  if (legacy === "venta") return "emitir";
  return PANELS.find((name) => name === raw) ?? null;
}

// Pantalla 16: el detalle de un pedido (brief-19.2; ADR 0020, puntos 3 y 8). Desde la 24.6.1
// (brief-24.6.1; láminas 03 a 07 de la v2) tiene **tres pestañas** —Resumen, Señas y Actividad—,
// el siguiente paso en el encabezado según el estado, y las operaciones en **paneles que abren y
// cierran por la URL**, con el cuerpo de la página `inert` y el disparador deshabilitado mientras
// el panel está abierto.
//
// Cada pestaña pide **solo sus lecturas**: Actividad no pide los recibos y Resumen no pide la
// auditoría. Las transiciones y la historia siguen siendo solo de `admin` (D-12; 19.3, D-8), y
// ningún costo ni margen aparece en ninguna.
//
// Lo que **no** cambió: ninguna regla del pedido. Entregar no exige haber cobrado, cancelar no
// devuelve dinero y emitir no descuenta stock otra vez. La pantalla lo dice mejor; los ADR 0020,
// 0021 y 0022 mandan igual.
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { orderId } = await params;
  const query = await searchParams;
  const found = await getOrder(context, orderId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={ORDER_NOT_FOUND_MESSAGE}
        back={{ href: "/pedidos", label: "Volver a pedidos" }}
      />
    );
  }
  const order = found.order;
  const isAdmin = context.role === "admin";
  const tab = parseOrderTab(query[TAB_PARAM]);
  const panel = isAdmin ? parsePanel(query) : null;
  const timeZone = await getOrganizationTimezone(context);

  // Las señas las compone la página con cash: orders no depende de cash (brief-21.4, D-8). Hacen
  // falta en Resumen y en Señas, por las tres tarjetas; en Actividad, no.
  //
  // Con un panel abierto se piden **siempre**, incluso en Actividad: «Falta por cobrar» y
  // «Faltará cobrar» son parte del efecto que el panel tiene que decir antes del cambio (AC-8), y
  // los paneles se abren conservando la pestaña. Sin esta segunda condición, entregar, cancelar o
  // emitir desde Actividad perdían el bloque de dinero **en silencio** (revisión independiente,
  // F-1). AC-5 se mantiene: Actividad sin panel sigue sin pedirlos.
  const needsReceipts = tab !== "actividad" || panel !== null;
  const receiptsFound = needsReceipts
    ? await getOrderReceipts(context, order.id)
    : null;
  const receipts = receiptsFound?.ok ? receiptsFound.order : null;

  // La auditoría solo se pide para un admin y solo en su pestaña: el servidor no se la entrega a
  // un viewer (brief-24.4.1, D-1, el mismo criterio de la ficha del cliente).
  const audit =
    isAdmin && tab === "actividad"
      ? await listOrderAudit(context, order.id, page(query.historial))
      : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;

  // El emisor de la credencial del agente, como en la historia (brief-19.4, D-11).
  const origin = orderOriginLabel(
    order.createdByCredentialId,
    order.createdByCredentialId === null
      ? new Map()
      : await getCredentialSources(context.organizationId, [
          order.createdByCredentialId,
        ]),
  );

  // La venta del pedido la compone la página (ADR 0021, punto 9): orders no lee sales. Solo un
  // entregado puede tenerla (brief-20.2).
  const saleFound =
    order.status === "delivered"
      ? await getSaleForOrder(context, order.id)
      : null;
  const sale = saleFound?.ok ? saleFound.sale : null;
  const canIssue =
    isAdmin && order.status === "delivered" && saleFound?.ok === true && !sale;

  const depositParam = Array.isArray(query.sena) ? query.sena[0] : query.sena;
  const newDeposit =
    receipts && depositParam
      ? receipts.receipts.find((row) => row.id === depositParam)
      : undefined;
  const notice = orderNoticeMessage(query.aviso);
  const open = panel !== null;
  const selfHref = orderTabHref(order.id, tab);
  const panelHref = (name: Panel) =>
    `${selfHref}${selfHref.includes("?") ? "&" : "?"}panel=${name}`;
  // Qué decide el botón «Registrar seña» del encabezado: **el estado del pedido**, no los
  // recibos. Dos razones, y la segunda es la que manda: el encabezado no puede cambiar de una
  // pestaña a otra, y Actividad no pide los recibos (AC-5), así que con la regla anterior
  // —`receipts.open`— el botón desaparecía justo en esa pestaña. La tabla de acciones del README
  // dice «Registrar seña si corresponde» para pendiente y confirmado, que es esto. Si ya no queda
  // nada por cubrir, lo dice el panel, que sí lee los recibos.
  const canDeposit =
    isAdmin && (order.status === "pending" || order.status === "confirmed");

  // El formulario de la seña solo se pide cuando su panel está abierto (brief-24.6.1, D-5): trae
  // los medios de pago, la sesión de caja y la oferta de cambio, y nada de eso hace falta para
  // mirar el pedido. La página de `/senar` queda redirigiendo acá.
  const depositForm =
    panel === "senar" ? await getOrderReceiptForm(context, order.id) : null;
  const depositExchange =
    depositForm?.ok === true
      ? receiptExchange({
          offer: depositForm.exchange,
          targetCurrency: depositForm.order.currency,
          outstanding: depositForm.outstanding,
          outstandingInput: depositForm.outstandingInput,
          chosen:
            typeof query.moneda === "string"
              ? query.moneda.toUpperCase()
              : undefined,
          basePath: panelHref("senar"),
          timezone: timeZone,
        })
      : null;
  // Por qué el panel no puede ofrecer el formulario, si no puede. El orden importa: primero el
  // estado del pedido, después lo que ya está cubierto y al final la configuración de la caja.
  const depositBlocked =
    depositForm?.ok !== true
      ? null
      : depositForm.order.status !== "pending" &&
          depositForm.order.status !== "confirmed"
        ? orderNotOpenMessage(depositForm.order.status)
        : depositForm.outstanding === "0.00"
          ? DEPOSIT_COMPLETE_MESSAGE
          : depositForm.paymentMethods.length === 0
            ? NO_ACTIVE_METHODS_MESSAGE
            : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="lg:flex lg:items-start lg:gap-8">
        {/* El cuerpo queda inerte mientras hay un panel abierto, como en la 24.5.3. `inert` cubre
            el cuerpo de la pantalla y **no** el marco de la aplicación, así que el panel no se
            declara `aria-modal`: diría que atrapa un foco que no atrapa. */}
        <div
          className={`min-w-0 flex-1 ${open ? "opacity-60" : ""}`}
          inert={open ? true : undefined}
        >
          <BackLink href="/pedidos" label="Volver a pedidos" />
          <DetailHeader
            title={`Pedido ${order.displayNumber}`}
            leading={<HeaderIcon name="list" />}
            badges={<OrderStatusBadge status={order.status} />}
            subtitle={
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="user" className="size-4" />
                  {order.client ? (
                    <Link
                      href={`/clientes/${order.client.id}`}
                      className={linkClass}
                    >
                      {order.client.displayName}
                    </Link>
                  ) : (
                    UNKNOWN_CLIENT_TEXT
                  )}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="calendar" className="size-4" />
                  {formatShortDateTime(order.createdAt, timeZone)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="bot" className="size-4" />
                  Origen: {origin}
                </span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatMoney(order.total, order.currency)}
                </span>
              </p>
            }
            actions={
              isAdmin ? (
                <OrderActions
                  order={order}
                  canDeposit={canDeposit}
                  canIssue={canIssue}
                  sale={sale}
                  panel={panel}
                  panelHref={panelHref}
                />
              ) : null
            }
          />

          <div role="status" className="mt-4 empty:hidden">
            {notice ? <ActionNotice>{notice}</ActionNotice> : null}
            {newDeposit ? (
              <ActionNotice>
                Se registró la seña{" "}
                <Link
                  href={`/cobros/${newDeposit.id}`}
                  className={`${linkClass} font-mono`}
                >
                  {newDeposit.displayNumber}
                </Link>
                .
              </ActionNotice>
            ) : null}
          </div>

          <SubNav
            label={`Secciones del pedido ${order.displayNumber}`}
            scroll
            items={ORDER_TABS.map((item) => ({
              href: orderTabHref(order.id, item),
              label: ORDER_TAB_LABEL[item],
              current: item === tab,
            }))}
          />

          {tab === "resumen" ? (
            <SummaryTab
              order={order}
              receipts={receipts}
              sale={sale}
              origin={origin}
              timeZone={timeZone}
            />
          ) : tab === "senas" ? (
            <DepositsTab
              order={order}
              receipts={receipts}
              canDeposit={isAdmin}
              depositHref={panelHref("senar")}
              depositOpen={panel === "senar"}
              timeZone={timeZone}
            />
          ) : (
            <ActivityTab
              order={order}
              audit={audit?.ok ? audit : null}
              actorLabel={actorLabel}
              timeZone={timeZone}
            />
          )}

          <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
        </div>

        {panel ? (
          <aside
            aria-labelledby="panel-titulo"
            role="dialog"
            className="mt-6 w-full shrink-0 rounded-2xl border border-border bg-surface p-5 sm:p-6 lg:mt-0 lg:w-96"
          >
            {panel === "senar" ? (
              <>
                <h2
                  id="panel-titulo"
                  className="text-lg font-bold tracking-tight"
                >
                  Registrar seña
                </h2>
                {depositForm?.ok !== true ? (
                  <p className="mt-4 text-sm">
                    No pudimos preparar la seña de este pedido.{" "}
                    <Link href={selfHref} className={linkClass}>
                      Volver
                    </Link>
                  </p>
                ) : depositBlocked ? (
                  <p className="mt-4 text-sm">
                    {depositBlocked}{" "}
                    <Link
                      href={
                        depositForm.paymentMethods.length === 0
                          ? "/caja/medios-de-pago"
                          : selfHref
                      }
                      className={linkClass}
                    >
                      {depositForm.paymentMethods.length === 0
                        ? "Ir a los medios de pago"
                        : "Volver"}
                    </Link>
                  </p>
                ) : (
                  <div className="mt-4">
                    <ReceiptForm
                      action={createOrderReceiptAction}
                      target={{ field: "orderId", id: order.id }}
                      cancelHref={selfHref}
                      submitLabel="Registrar seña"
                      currency={depositForm.order.currency}
                      outstanding={depositForm.outstandingInput}
                      paymentMethods={depositForm.paymentMethods}
                      hasOpenSession={depositForm.openSession !== null}
                      exchange={depositExchange!}
                    />
                  </div>
                )}
              </>
            ) : panel === "emitir" && canIssue ? (
              <IssueSaleConfirm
                orderId={order.id}
                displayNumber={order.displayNumber}
                total={formatMoney(order.total, order.currency)}
                deposited={
                  receipts
                    ? formatMoney(receipts.deposited, receipts.currency)
                    : null
                }
                outstanding={
                  receipts
                    ? formatMoney(receipts.outstanding, receipts.currency)
                    : null
                }
                cancelHref={selfHref}
              />
            ) : transitionOf(panel, order.status) ? (
              <OrderTransitionForm
                orderId={order.id}
                displayNumber={order.displayNumber}
                transition={transitionOf(panel, order.status)!}
                units={order.lines.flatMap((line) => line.units)}
                currency={order.currency}
                outstanding={
                  receipts
                    ? formatMoney(receipts.outstanding, receipts.currency)
                    : null
                }
                cancelHref={selfHref}
                stockHref={orderTabHref(order.id, "resumen")}
                releasesStock={order.status === "confirmed"}
              />
            ) : (
              <p className="text-sm">
                Esta operación ya no está disponible para este pedido.{" "}
                <Link href={selfHref} className={linkClass}>
                  Volver
                </Link>
              </p>
            )}
          </aside>
        ) : null}
      </div>
    </main>
  );
}

// El siguiente paso en el encabezado, con la tabla de acciones de la v2: una sola acción
// principal por estado, la seña como complementaria, y cancelar dentro de «Más acciones», en
// rojo. Un pedido cancelado no ofrece nada: es final.
//
// Mientras un panel está abierto, el botón que lo abrió aparece **deshabilitado**, que es lo que
// dibujan las láminas 03 y 06: no pueden quedar dos controles activos que ejecuten la misma
// transición.
function OrderActions({
  order,
  canDeposit,
  canIssue,
  sale,
  panel,
  panelHref,
}: {
  order: { id: string; status: string; displayNumber: string };
  canDeposit: boolean;
  canIssue: boolean;
  sale: { id: string; displayNumber: string } | null;
  panel: Panel | null;
  panelHref: (name: Panel) => string;
}) {
  const disabled = "pointer-events-none opacity-50";
  const primary =
    order.status === "pending" ? (
      <Link
        href={panelHref("confirmar")}
        aria-disabled={panel === "confirmar" || undefined}
        className={`${primaryLinkClass} ${panel === "confirmar" ? disabled : ""}`}
      >
        <Icon name="circleCheck" className="size-4" />
        Confirmar pedido
      </Link>
    ) : order.status === "confirmed" ? (
      <Link
        href={panelHref("entregar")}
        aria-disabled={panel === "entregar" || undefined}
        className={`${primaryLinkClass} ${panel === "entregar" ? disabled : ""}`}
      >
        <Icon name="truck" className="size-4" />
        Marcar entregado
      </Link>
    ) : canIssue ? (
      <Link
        href={panelHref("emitir")}
        aria-disabled={panel === "emitir" || undefined}
        className={`${primaryLinkClass} ${panel === "emitir" ? disabled : ""}`}
      >
        <Icon name="receipt" className="size-4" />
        Emitir venta
      </Link>
    ) : sale ? (
      <Link href={`/ventas/${sale.id}`} className={secondaryLinkClass}>
        <Icon name="receipt" className="size-4" />
        Ver venta {sale.displayNumber}
      </Link>
    ) : null;

  const cancellable =
    order.status === "pending" || order.status === "confirmed";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {primary}
      {canDeposit ? (
        <Link
          href={panelHref("senar")}
          aria-disabled={panel === "senar" || undefined}
          className={`${secondaryLinkClass} ${panel === "senar" ? disabled : ""}`}
        >
          <Icon name="creditCard" className="size-4" />
          Registrar seña
        </Link>
      ) : null}
      {cancellable ? (
        <MoreActions id="acciones-pedido" label="Más acciones del pedido">
          <li>
            <Link
              href={panelHref("cancelar")}
              className={`${moreActionItemClass} ${moreActionDangerClass}`}
            >
              <Icon name="circleX" className="size-4" />
              Cancelar pedido
            </Link>
          </li>
        </MoreActions>
      ) : null}
    </div>
  );
}
