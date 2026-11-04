import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import {
  getSaleReceiptForm,
  getSaleReceipts,
  getSalesStanding,
  getSaleVoidMoneyPreview,
  type SaleStandingSummary,
} from "@/modules/cash";
import { getOrder } from "@/modules/orders";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getSale, listSaleAudit } from "@/modules/sales";
import { getSaleOrigins } from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";
import { PhoneText } from "@/app/(autenticado)/clientes/phone-text";
import { ActionNotice } from "@/app/_components/action-notice";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { DetailList } from "@/app/_components/detail-list";
import {
  cardClass,
  dangerOutlineLinkClass,
  linkClass,
  primaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { ReceiptForm } from "@/app/_components/receipt-form";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import { SubNav } from "@/app/_components/sub-nav";
import {
  formatDate,
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { saleFiltersHref, type SearchParams } from "../filters";
import {
  CONSUMER_TEXT,
  COUNTER_SALE_PRICES_NOTE,
  CURRENT_BADGE_TEXT,
  CURRENT_PRODUCT_NAME_NOTE,
  FORBIDDEN_PAGE_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  SALE_NOT_FOUND_MESSAGE,
  SALE_PAYMENT_LABEL,
  saleNoticeMessage,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
  voidMoneyEffect,
  VOID_MONEY_SNAPSHOT_NOTE,
  VOID_MONEY_UNAVAILABLE,
  VOID_REASON_LABEL,
  VOIDED_BADGE_TEXT,
  voidStockEffect,
  type SalePaymentState,
  type VoidOrigin,
} from "../messages";
import { LineUnitList, lineUnitPriceText } from "../../pedidos/line-unit-list";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { createSaleReceiptAction } from "./cobrar/actions";
import {
  NO_ACTIVE_METHODS_MESSAGE,
  RECEIPT_COLLECTED_MESSAGE,
  RECEIPT_FORM_UNAVAILABLE_MESSAGE,
  RECEIPT_PANEL_TITLE,
  RECEIPT_SALE_VOIDED_MESSAGE,
} from "./cobrar/messages";
import { SaleReceiptsSection } from "./cobrar/sale-receipts-section";
import { PrintButton } from "./print-button";
import { VoidSaleConfirm } from "./void-sale";

export const metadata: Metadata = {
  title: "Venta — AI WhatsApp Agent CRM",
};

const TITLE = "Venta";

// Las tres pestañas de la lámina 03, por URL, como la ficha del pedido de la 24.6.1 y la del cliente
// de la 24.4.1 (brief-24.6.2-b, D-4). Viven acá y no en un archivo aparte porque la lista cerrada de
// la subfase no lo incluye, y nadie fuera de esta pantalla las necesita.
const SALE_TABS = ["resumen", "cobros", "actividad"] as const;

type SaleTab = (typeof SALE_TABS)[number];

const SALE_TAB_LABEL: Record<SaleTab, string> = {
  resumen: "Resumen",
  cobros: "Cobros",
  actividad: "Actividad",
};

const TAB_PARAM = "pestana";

function parseSaleTab(value: string | string[] | undefined): SaleTab {
  const key = Array.isArray(value) ? value[0] : value;
  return SALE_TABS.find((tab) => tab === key) ?? "resumen";
}

function saleTabHref(saleId: string, tab: SaleTab): string {
  return tab === "resumen"
    ? `/ventas/${saleId}`
    : `/ventas/${saleId}?${TAB_PARAM}=${tab}`;
}

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Un monto de la base («300.00») en centavos, para comparar sin redondeos. Venía de la página de
// /cobrar, que desde la 24.6.2-d solo redirige acá.
function cents(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole! + fraction.padEnd(2, "0").slice(0, 2));
}

// Pantalla 18: el detalle de una venta, que es también su comprobante imprimible (brief-20.2,
// D-5; ADR 0021, punto 8). El comprobante lleva la organización, el número, la fecha, el nombre del
// cliente, el pedido, las líneas, el total y la leyenda; al imprimir queda solo él (print:hidden y
// las reglas @media print de globals.css). El contacto del cliente se ve en pantalla solo si crm lo
// entrega para el rol, y nunca se imprime (D-9). La historia, solo admin. Ningún costo ni margen.
// Desde la 20.4 (brief-20.4, D-7): una venta anulada lo dice arriba y en el comprobante, que se
// sigue imprimiendo con la marca; admin anula una vigente en el paso ?confirmar=anular; y la cadena
// de las ventas de un pedido enlaza la venta reemplazada y la que la reemplazó. Desde la 21.3
// (brief-21.3, D-8), la sección «Cobros», compuesta con cash: lo cobrado, lo que falta y los
// recibos.
//
// Desde la 24.6.2-b (lámina 03 de V2-09): la ficha tiene **tres pestañas por URL** —Resumen, Cobros
// y Actividad—, que son enlaces y andan sin JavaScript. **Cada pestaña pide solo sus lecturas**:
// Resumen no pide los recibos ni la historia, Cobros no pide el pedido, y Actividad no pide
// ninguno de los dos.
//
// **Con qué decide el encabezado, que es la lección de la 24.6.1 aplicada** (D-4): un control del
// encabezado no puede depender de una lectura que solo una pestaña hace, o desaparece al cambiar de
// pestaña. Acá el estado de cobro y «Registrar cobro» los decide `getSalesStanding` **con un solo
// id**, la misma lectura por lote del listado, que corre en las tres pestañas y cuesta un número
// fijo de consultas. `getSaleReceipts`, que es la lectura completa con sus listas, la pide solo la
// pestaña Cobros. No se usa el estado de la venta: `SaleDetail` **no tiene** estado de cobro, solo
// sabe si está anulada.
export default async function SalePage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { saleId } = await params;
  const query = await searchParams;
  const found = await getSale(context, saleId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={SALE_NOT_FOUND_MESSAGE}
        back={{ href: "/ventas", label: "Volver a ventas" }}
      />
    );
  }
  const sale = found.sale;
  const isAdmin = context.role === "admin";
  const saleVoid = sale.saleVoid;
  const receiptParam = Array.isArray(query.cobro)
    ? query.cobro[0]
    : query.cobro;
  // La vuelta de /cobrar trae `?cobro=<id>` y **abre la pestaña «Cobros»**: es donde está el dinero
  // y donde el recibo recién registrado se destaca entre los de la venta (brief-21.3, D-8). Una
  // pestaña pedida en la URL manda igual, así que un enlace a otra sigue valiendo.
  //
  // *Corregido el 2026-11-03*: la primera versión dejaba el aviso en «Resumen» y pedía los recibos
  // igual, solo para nombrar el que volvía. Pagaba una lectura que no mostraba —lo que D-4 prohíbe—
  // y dejaba el detalle del cobro una pestaña más allá. Dos casos de `tests/e2e/exchange.spec.ts`
  // lo afirmaban desde antes de esta subfase, y la batería completa los puso en rojo.
  //
  // **Desde la 24.6.2-d** el panel de cobro hace lo mismo: vive en «Cobros» (D-2), así que pedirlo
  // sin nombrar una pestaña abre la suya. Nombrar una sigue mandando.
  const panelRequested = isAdmin && first(query.panel) === "cobro";
  const tab =
    query[TAB_PARAM] === undefined && (Boolean(receiptParam) || panelRequested)
      ? "cobros"
      : parseSaleTab(query[TAB_PARAM]);
  const wantsReceipts = tab === "cobros";
  // **El panel vive en «Cobros», y el código lo hace cumplir** (D-2). Ningún enlace de la
  // aplicación produce otra cosa, pero una dirección escrita a mano —`?pestana=resumen&panel=cobro`—
  // dibujaba el panel en otra pestaña, y ahí la vista previa no existe porque los cobros de la
  // venta no se leen: un formulario de cobro sin su previsión, que es justo lo que la lámina 03
  // pone en el centro. De paso pagaba la lectura del formulario en una pestaña que M-2 declara sin
  // costo extra. *Corregido el 2026-11-04, por la revisión independiente (NOTA-1).*
  const collecting = panelRequested && wantsReceipts;
  const selfHref = saleTabHref(sale.id, tab);
  const panelHref = `${selfHref}${selfHref.includes("?") ? "&" : "?"}panel=cobro`;
  // El encabezado y la organización los compone la página, por la interfaz de cada módulo
  // (ADR 0021, punto 9).
  const [timeZone, frame, standing] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    getSalesStanding(context, [
      {
        id: sale.id,
        clientId: sale.clientId,
        orderId: sale.orderId,
        currency: sale.currency,
        total: sale.total,
        voided: saleVoid !== null,
      },
    ]),
  ]);
  const payment = standing.ok ? standing.standing.get(sale.id) : undefined;
  const order =
    tab === "resumen" && sale.orderId !== null
      ? await getOrder(context, sale.orderId)
      : null;
  const orderNumber = order?.ok ? order.order.displayNumber : null;
  const receipts = wantsReceipts
    ? await getSaleReceipts(context, sale.id)
    : null;
  const audit =
    isAdmin && tab === "actividad"
      ? await listSaleAudit(context, sale.id, page(query.historial))
      : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = saleNoticeMessage(query.aviso);
  // El cobro recién registrado, entre los de la venta (brief-21.3, D-8).
  const newReceipt =
    receipts?.ok && receiptParam
      ? receipts.sale.receipts.find((row) => row.id === receiptParam)
      : undefined;
  const voiding = isAdmin && saleVoid === null && query.confirmar === "anular";

  // **Lo que cuesta cada paso, y por qué se pide donde se pide** (D-4 de la 24.6.2-b y M-2 de esta
  // subfase): ninguna de estas tres lecturas corre si su paso está cerrado, así que una pestaña sin
  // panel y sin diálogo sigue costando exactamente lo que costaba antes de esta subfase.
  //
  // El formulario del cobro trae los medios activos, la sesión de caja, la oferta de cambio y los
  // usados del cliente para la permuta. Nada de eso hace falta para mirar la venta.
  const receiptForm = collecting
    ? await getSaleReceiptForm(context, sale.id)
    : null;
  // Las dos mitades del efecto de la anulación (D-6 y H-3). El origen de la venta cuesta **cero
  // consultas** sin la capacidad `repairs`, y una con ella; el efecto en dinero corre la regla de
  // imputación de `cash`, que es la lectura nueva de la subfase.
  const [voidOrigins, voidMoney] = voiding
    ? await Promise.all([
        getSaleOrigins(context, [sale.id]),
        getSaleVoidMoneyPreview(context, sale.id),
      ])
    : [null, null];
  // De dónde salió la venta, para los tres textos de stock de la tabla del README (D-6). Sin la
  // capacidad `repairs` el mapa viene vacío sin ejecutar una consulta, y la venta es de mostrador
  // o de un pedido, como hasta la 24.6.2-c.
  const saleOrigin: VoidOrigin = voidOrigins?.has(sale.id)
    ? "service"
    : sale.orderId !== null
      ? "order"
      : "counter";

  // Lo que el panel arma con el formulario, y que venía de la página de /cobrar: el usado elegido
  // por ?usado= con lo propuesto —el menor entre lo que queda del usado y lo que falta de la venta
  // (brief-29.7.2, D-6)—, la fecha de cada usado en la zona de la organización y la oferta de
  // cambio, que ahora apunta al panel y no a la ruta.
  const chosenTradeIn =
    receiptForm?.ok === true
      ? (receiptForm.permuta?.tradeIns.find(
          (tradeIn) => tradeIn.id === first(query.usado),
        ) ?? null)
      : null;
  const chosenPermuta =
    chosenTradeIn && receiptForm?.ok === true
      ? {
          tradeInId: chosenTradeIn.id,
          amount:
            cents(chosenTradeIn.available) < cents(receiptForm.outstanding)
              ? chosenTradeIn.availableInput
              : receiptForm.outstandingInput,
        }
      : null;
  const permuta =
    receiptForm?.ok === true && receiptForm.permuta
      ? {
          ...receiptForm.permuta,
          tradeIns: receiptForm.permuta.tradeIns.map((tradeIn) => ({
            ...tradeIn,
            received: formatDate(tradeIn.createdAt, timeZone),
          })),
        }
      : null;
  const collectExchange =
    receiptForm?.ok === true
      ? receiptExchange({
          offer: receiptForm.exchange,
          targetCurrency: receiptForm.sale.currency,
          outstanding: receiptForm.outstanding,
          outstandingInput: receiptForm.outstandingInput,
          chosen: chosenPermuta
            ? receiptForm.sale.currency
            : first(query.moneda)?.toUpperCase(),
          basePath: panelHref,
          timezone: timeZone,
        })
      : null;
  // Por qué el panel no puede ofrecer el formulario, si no puede. El orden importa: primero la
  // vigencia de la venta, después lo que ya está cobrado y al final la configuración de la caja.
  const collectBlocked =
    receiptForm?.ok !== true
      ? null
      : receiptForm.voided
        ? RECEIPT_SALE_VOIDED_MESSAGE
        : receiptForm.outstanding === "0.00"
          ? RECEIPT_COLLECTED_MESSAGE
          : receiptForm.paymentMethods.length === 0 &&
              receiptForm.permuta === null
            ? NO_ACTIVE_METHODS_MESSAGE
            : null;
  const noMethods =
    receiptForm?.ok === true &&
    receiptForm.paymentMethods.length === 0 &&
    !receiptForm.voided;

  const client = sale.client;
  // Sin cliente, «Consumidor final» (brief-20.3, D-7).
  const clientName =
    sale.clientId === null
      ? CONSUMER_TEXT
      : (client?.displayName ?? UNKNOWN_CLIENT_TEXT);
  // «Registrar cobro» solo si la venta vigente admite más importe (AC-7): una cobrada no ofrece un
  // cobro innecesario, y una anulada tampoco.
  const canCollect =
    isAdmin && saleVoid === null && payment?.status === "pending";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="lg:flex lg:items-start lg:gap-8 print:block">
        {/* El cuerpo queda inerte mientras el panel de cobro está abierto, como la ficha del pedido
            desde la 24.6.1. `inert` cubre el cuerpo de la pantalla y **no** el marco de la
            aplicación, así que el panel no se declara `aria-modal`: diría que atrapa un foco que
            no atrapa. El diálogo de la anulación sí lo atrapa, pero porque lo hace el elemento
            nativo, no porque lo digamos. */}
        <div
          className={`min-w-0 flex-1 print:opacity-100 ${collecting ? "opacity-60" : ""}`}
          inert={collecting ? true : undefined}
        >
          <div className="print:hidden">
            <BackLink href="/ventas" label="Volver a ventas" />
            <DetailHeader
              title={`Venta ${sale.displayNumber}`}
              leading={<HeaderIcon name="receipt" />}
              subtitle={
                // `data-estado-venta` acota las dos insignias del encabezado. Sin un asa, un caso que
                // quiera afirmar «Cobrada» del encabezado solo puede pedir el primero del documento, y
                // `.first()` sigue en verde si el badge desaparece y queda la fila «Falta» de la tabla
                // de dinero, que dice la misma palabra: la aserción pasaría por la razón contraria a la
                // que afirma. *Agregado el 2026-11-03*, por la revisión independiente (MAYOR-3).
                <p
                  className="flex flex-wrap items-center gap-2"
                  data-estado-venta
                >
                  <span>
                    Total:{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatMoney(sale.total, sale.currency)}
                    </span>
                  </span>
                  <VigencyBadge voidedBy={saleVoid?.displayNumber ?? null} />
                  <PaymentBadge payment={payment} />
                </p>
              }
              primary={
                canCollect ? (
                  <Link
                    // El panel de la pestaña «Cobros» (D-2 y D-3), no la ruta aparte: desde la 24.6.2-d
                    // /cobrar solo redirige acá.
                    href={`/ventas/${sale.id}?${TAB_PARAM}=cobros&panel=cobro`}
                    // min-h-11: el objetivo táctil del README de la v2 es 44 px y se mide (AC-14).
                    // primaryLinkClass da 40, y cambiarlo tocaría todas las pantallas: queda
                    // declarado y se corrige acá, en la única que esta subfase abre.
                    className={`${primaryLinkClass} min-h-11`}
                  >
                    <Icon name="plus" className="size-4" />
                    Registrar cobro
                  </Link>
                ) : null
              }
              // «Imprimir o guardar PDF» solo en «Resumen», que es donde vive el comprobante
              // (AC-8). *Corregido el 2026-11-03*, por la revisión independiente (MAYOR-2): el botón
              // se dibujaba en las tres pestañas, y los cuerpos de «Cobros» y «Actividad» son
              // `print:hidden`, así que imprimir desde ellas sacaba **una hoja en blanco**. Lo
              // introdujo este rediseño: antes el botón y el comprobante vivían en la única vista que
              // había. Ofrecer el botón donde no hay nada que imprimir es la forma de D-4 —un control
              // que no corresponde a lo que la vista muestra—, acá del lado de la acción.
              actions={tab === "resumen" ? <PrintButton /> : null}
              more={
                isAdmin && saleVoid === null ? (
                  // «Anular» queda en «Más» (AC-7). Es un <details>, así que abre y cierra sin
                  // JavaScript, igual que las pestañas son enlaces y no botones.
                  <details className="relative">
                    <summary
                      className={`${linkClass} inline-flex min-h-11 cursor-pointer list-none items-center px-3`}
                    >
                      Más
                    </summary>
                    <div
                      className={`${cardClass} absolute right-0 z-10 mt-2 w-max max-w-[min(16rem,calc(100vw-2rem))] p-3`}
                    >
                      <Link
                        // Conserva la pestaña: desde la 24.6.2-d el diálogo vive en la página y no
                        // dentro de «Resumen», así que anular desde «Cobros» ya no cambia de pestaña.
                        href={`${selfHref}${selfHref.includes("?") ? "&" : "?"}confirmar=anular`}
                        className={dangerOutlineLinkClass}
                      >
                        <Icon name="close" className="size-4" />
                        Anular venta
                      </Link>
                    </div>
                  </details>
                ) : null
              }
            />

            <div role="status" className="mt-4 empty:hidden">
              {notice ? <ActionNotice>{notice}</ActionNotice> : null}
              {newReceipt ? (
                <ActionNotice>
                  Se registró el cobro{" "}
                  <Link
                    href={`/cobros/${newReceipt.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {newReceipt.displayNumber}
                  </Link>
                  .
                </ActionNotice>
              ) : null}
            </div>
            {saleVoid ? (
              <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
                Anulada por{" "}
                <Link
                  href={`/ventas/${sale.id}/anulacion`}
                  className={`${linkClass} font-mono`}
                >
                  {saleVoid.displayNumber}
                </Link>{" "}
                el {formatShortDateTime(saleVoid.createdAt, timeZone)}:{" "}
                {VOID_REASON_LABEL[saleVoid.reason]}.
              </p>
            ) : null}

            <SubNav
              label={`Secciones de la venta ${sale.displayNumber}`}
              items={SALE_TABS.filter(
                (item) => item !== "actividad" || isAdmin,
              ).map((item) => ({
                href: saleTabHref(sale.id, item),
                label: SALE_TAB_LABEL[item],
                current: tab === item,
              }))}
            />
          </div>

          {tab === "resumen" ? (
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-3 print:mt-0 print:block">
              <article
                data-comprobante
                aria-labelledby="comprobante-titulo"
                // `min-w-0`: el comprobante es un ítem de grilla, y el ancho mínimo automático de
                // un ítem es el de su contenido, así que sin esto la tabla de líneas no lo deja
                // encoger y la ficha desborda **140 px a 320 px de ancho**. Venía así desde la 20.2 y
                // lo encontró la medición de AC-13 de la 24.6.2-b, no la vista.
                className={`${cardClass} min-w-0 p-5 sm:p-6 lg:col-span-2 print:border-0 print:p-0 print:shadow-none`}
              >
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                  <div>
                    <p className="text-lg font-semibold">
                      {frame.organizationName}
                    </p>
                    <p className="text-sm text-muted">
                      {NOT_AN_INVOICE_LEGEND}
                    </p>
                  </div>
                  <div className="text-right">
                    <h2
                      id="comprobante-titulo"
                      className="text-lg font-semibold"
                    >
                      Venta{" "}
                      <span className="font-mono">{sale.displayNumber}</span>
                    </h2>
                    {saleVoid ? (
                      <p className="font-semibold uppercase">
                        {VOIDED_BADGE_TEXT} por{" "}
                        <span className="font-mono">
                          {saleVoid.displayNumber}
                        </span>
                      </p>
                    ) : null}
                    <p className="text-sm">
                      {formatFullDateTime(sale.createdAt, timeZone)}
                    </p>
                  </div>
                </header>

                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Cliente</dt>
                    <dd className="font-semibold">{clientName}</dd>
                  </div>
                  {sale.orderId !== null ? (
                    <div>
                      <dt className="text-muted">Pedido</dt>
                      <dd className="font-mono">
                        <Link
                          href={`/pedidos/${sale.orderId}`}
                          className={`${linkClass} print:no-underline`}
                        >
                          {orderNumber ?? "Ver pedido"}
                        </Link>
                      </dd>
                    </div>
                  ) : null}
                  {sale.replaces ? (
                    <div>
                      <dt className="text-muted">Reemplaza a</dt>
                      <dd className="font-mono">
                        <Link
                          href={`/ventas/${sale.replaces.id}`}
                          className={`${linkClass} print:no-underline`}
                        >
                          {sale.replaces.displayNumber}
                        </Link>
                      </dd>
                    </div>
                  ) : null}
                  {sale.replacedBy ? (
                    <div>
                      <dt className="text-muted">Reemplazada por</dt>
                      <dd className="font-mono">
                        <Link
                          href={`/ventas/${sale.replacedBy.id}`}
                          className={`${linkClass} print:no-underline`}
                        >
                          {sale.replacedBy.displayNumber}
                        </Link>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div
                  className="-mx-5 mt-4 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
                  tabIndex={0}
                  role="region"
                  aria-label={`Líneas de la venta ${sale.displayNumber}`}
                >
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Líneas de la venta {sale.displayNumber}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className={tableHeadCellClass}>
                          Producto
                        </th>
                        <th
                          scope="col"
                          className={`${tableHeadCellClass} text-right`}
                        >
                          Cantidad
                        </th>
                        <th
                          scope="col"
                          className={`${tableHeadCellClass} text-right`}
                        >
                          Precio unitario
                        </th>
                        <th
                          scope="col"
                          className={`${tableHeadCellClass} text-right`}
                        >
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.lines.map((line) => (
                        <tr key={line.position}>
                          <td className={tableCellClass}>
                            {line.product ? (
                              <>
                                {line.product.name}
                                <span className="block font-mono text-xs text-muted">
                                  {line.product.sku}
                                </span>
                              </>
                            ) : (
                              UNKNOWN_PRODUCT_TEXT
                            )}
                            <LineUnitList
                              units={line.units}
                              currency={line.currency}
                            />
                          </td>
                          <td
                            className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                          >
                            {formatQuantity(line.quantity)}
                            {line.product ? (
                              <span className="text-muted">
                                {" "}
                                {line.product.unit}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                          >
                            {lineUnitPriceText(line)}
                          </td>
                          <td
                            className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                          >
                            {formatMoney(line.lineTotal, line.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th
                          scope="row"
                          colSpan={3}
                          className={`${tableCellClass} text-right font-semibold`}
                        >
                          Total
                        </th>
                        <td
                          className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                        >
                          {formatMoney(sale.total, sale.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <p className="mt-6 text-center text-sm font-semibold uppercase">
                  {NOT_AN_INVOICE_LEGEND}
                </p>
                <p className="mt-4 text-sm text-muted print:hidden">
                  {sale.orderId === null
                    ? COUNTER_SALE_PRICES_NOTE
                    : CURRENT_PRODUCT_NAME_NOTE}
                </p>
              </article>

              <div className="flex flex-col gap-6 print:hidden">
                <SectionCard id="cliente-titulo" title="Cliente" icon="user">
                  <DetailList
                    items={[
                      {
                        label: "Nombre",
                        icon: "user",
                        value: client ? (
                          <Link
                            href={`/clientes/${client.id}`}
                            className={linkClass}
                          >
                            {client.displayName}
                          </Link>
                        ) : (
                          clientName
                        ),
                      },
                      ...(client
                        ? [
                            {
                              label: "Teléfono",
                              icon: "phone" as const,
                              value: (
                                <PhoneText
                                  phone={client.phone}
                                  emptyText="Sin teléfono"
                                />
                              ),
                            },
                          ]
                        : []),
                      ...(client?.contact?.email
                        ? [
                            {
                              label: "Email",
                              icon: "mail" as const,
                              value: client.contact.email,
                            },
                          ]
                        : []),
                    ]}
                  />
                  {sale.clientId !== null ? (
                    <p className="mt-4 text-sm">
                      <Link
                        href={saleFiltersHref({
                          number: "",
                          from: "",
                          to: "",
                          clientId: sale.clientId,
                          status: "all",
                          page: 1,
                        })}
                        className={linkClass}
                      >
                        Ver las ventas de este cliente
                      </Link>
                    </p>
                  ) : null}
                </SectionCard>

                <SectionCard
                  id="anulacion-titulo"
                  title="Anulación"
                  icon="close"
                >
                  {saleVoid ? (
                    <>
                      <p className="text-sm">
                        Anulación{" "}
                        <span className="font-mono">
                          {saleVoid.displayNumber}
                        </span>{" "}
                        · {VOID_REASON_LABEL[saleVoid.reason]}
                      </p>
                      <p className="mt-4 text-sm">
                        <Link
                          href={`/ventas/${sale.id}/anulacion`}
                          className={linkClass}
                        >
                          Ver el comprobante de la anulación
                        </Link>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      Esta venta está vigente.
                    </p>
                  )}
                </SectionCard>
              </div>
            </div>
          ) : null}

          {tab === "cobros" ? (
            <div className="mt-6 print:hidden">
              {receipts?.ok ? (
                <SaleReceiptsSection
                  saleId={sale.id}
                  displayNumber={sale.displayNumber}
                  receipts={receipts.sale}
                  canCollect={isAdmin}
                  timeZone={timeZone}
                />
              ) : (
                <p className="text-sm text-muted">
                  No se pudieron leer los cobros de esta venta.
                </p>
              )}
            </div>
          ) : null}

          {tab === "actividad" && audit?.ok ? (
            <div className="print:hidden">
              <AuditCard
                caption={`Historia de la venta ${sale.displayNumber}`}
                rows={audit.entries.map((entry) => ({
                  id: entry.id,
                  when: formatShortDateTime(entry.createdAt, timeZone),
                  actor: actorLabel?.(entry.actor),
                  action: auditActionLabel(entry),
                  change: describeAuditDiff(entry),
                }))}
                page={audit.page}
                pageCount={audit.pageCount}
                pageSize={AUDIT_PAGE_SIZE}
                total={audit.total}
                hrefFor={(target) =>
                  target > 1
                    ? `/ventas/${sale.id}?${TAB_PARAM}=actividad&historial=${target}`
                    : saleTabHref(sale.id, "actividad")
                }
              />
            </div>
          ) : null}

          <p className="mt-6 text-sm text-muted print:hidden">
            Fechas en {timeZone}.
          </p>
        </div>

        {/* El panel de cobro de la lámina 03, al costado de la ficha y abierto por la dirección
            (D-3, opción a). Lo abre un enlace y lo cierra un enlace, así que anda sin JavaScript,
            se puede recargar y se puede compartir: un formulario largo que el usuario quiere mirar
            contra la ficha merece su propia dirección. */}
        {collecting ? (
          <aside
            aria-labelledby="panel-cobro-titulo"
            role="dialog"
            className="mt-6 w-full shrink-0 rounded-2xl border border-border bg-surface p-5 sm:p-6 lg:mt-0 lg:w-96 print:hidden"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="panel-cobro-titulo"
                className="text-lg font-bold tracking-tight"
              >
                {RECEIPT_PANEL_TITLE}
              </h2>
              {/* La cruz de la lámina 03. Es un enlace, como el que abre el panel. */}
              <Link
                href={selfHref}
                aria-label={`Cerrar el panel de cobro de la venta ${sale.displayNumber}`}
                className={linkClass}
              >
                <Icon name="close" className="size-5" />
              </Link>
            </div>
            <p className="mt-1 text-sm text-muted">
              Venta <span className="font-mono">{sale.displayNumber}</span>
              <span className="block">{clientName}</span>
            </p>
            {receiptForm?.ok !== true ? (
              <p className="mt-4 text-sm">
                {RECEIPT_FORM_UNAVAILABLE_MESSAGE}{" "}
                <Link href={selfHref} className={linkClass}>
                  Volver
                </Link>
              </p>
            ) : collectBlocked ? (
              <p className="mt-4 text-sm">
                {collectBlocked}{" "}
                <Link
                  href={noMethods ? "/caja/medios-de-pago" : selfHref}
                  className={linkClass}
                >
                  {noMethods ? "Ir a los medios de pago" : "Volver"}
                </Link>
              </p>
            ) : (
              <div className="mt-4">
                <ReceiptForm
                  // Elegir un usado vuelve a montar el formulario: sin esto, después de un rechazo
                  // quedaría lo enviado y no lo propuesto.
                  key={chosenPermuta?.tradeInId ?? "sin-usado"}
                  action={createSaleReceiptAction}
                  target={{ field: "saleId", id: sale.id }}
                  cancelHref={selfHref}
                  submitLabel="Registrar cobro"
                  currency={receiptForm.sale.currency}
                  outstanding={receiptForm.outstandingInput}
                  paymentMethods={receiptForm.paymentMethods}
                  hasOpenSession={receiptForm.openSession !== null}
                  exchange={collectExchange}
                  permuta={permuta}
                  chosenPermuta={chosenPermuta}
                  permutaPath={panelHref}
                  // La previsión usa **los dos números que la pestaña ya muestra arriba**, para que
                  // no puedan decir cosas distintas: lo cobrado de `getSaleReceipts` y lo que falta
                  // del formulario, que es el que calcula la regla de imputación.
                  preview={
                    receipts?.ok
                      ? {
                          collected: receipts.sale.collected,
                          outstanding: receiptForm.outstanding,
                        }
                      : null
                  }
                />
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {/* El diálogo de la anulación (lámina 04). Vive acá y no dentro de «Resumen», que es donde
          estaba hasta la 24.6.2-c: se abre desde «Más», que se ve en las tres pestañas, y un
          diálogo que existiera en una sola se perdería al cambiar de pestaña. */}
      {voiding ? (
        <VoidSaleConfirm
          saleId={sale.id}
          displayNumber={sale.displayNumber}
          cancelHref={selfHref}
          stock={voidStockEffect(
            saleOrigin,
            sale.lines.map((line) => ({
              quantity: line.quantity,
              unit: line.product?.unit ?? null,
              units: line.units.length,
            })),
          )}
          money={
            voidMoney === null
              ? null
              : voidMoney.ok
                ? voidMoneyEffect(voidMoney.preview, (amount) =>
                    formatMoney(amount, voidMoney.preview.currency),
                  )
                : VOID_MONEY_UNAVAILABLE
          }
          // La advertencia de D-5 acompaña **solo a un importe calculado**: si la lectura falló no
          // hay cifra de la que avisar que puede cambiar.
          moneyNote={voidMoney?.ok ? VOID_MONEY_SNAPSHOT_NOTE : null}
        />
      ) : null}
    </main>
  );
}

// Vigente o anulada: pertenece al comprobante, no al cobro (README del lote V2-09).
function VigencyBadge({ voidedBy }: { voidedBy: string | null }) {
  return voidedBy ? (
    <StatusBadge
      tone="neutral"
      icon="circleMinus"
      title={`Anulada por ${voidedBy}`}
    >
      {VOIDED_BADGE_TEXT}
    </StatusBadge>
  ) : (
    <StatusBadge tone="success" icon="circleCheck">
      {CURRENT_BADGE_TEXT}
    </StatusBadge>
  );
}

// El estado de cobro del encabezado, igual en las tres pestañas porque sale de la lectura por lote
// y no de la pestaña Cobros (D-4). Una anulada no es un estado de cobro: no se muestra como tal.
function PaymentBadge({
  payment,
}: {
  payment: SaleStandingSummary | undefined;
}) {
  if (!payment || payment.status === "voided") return null;
  const state: SalePaymentState =
    payment.status === "collected"
      ? "collected"
      : Number(payment.collected) > 0
        ? "partial"
        : "pending";
  return (
    <StatusBadge
      tone={
        state === "collected"
          ? "success"
          : state === "partial"
            ? "warning"
            : "info"
      }
      icon={state === "collected" ? "circleCheck" : "clock"}
    >
      {SALE_PAYMENT_LABEL[state]}
    </StatusBadge>
  );
}
