import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import {
  formatCuit,
  getPurchaseOrder,
  listPurchaseOrderAudit,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  iconTileClass,
  linkClass,
  primaryLinkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import {
  moreActionDangerClass,
  moreActionItemClass,
} from "@/app/_components/more-action-styles";
import { MoreActions } from "@/app/_components/more-actions";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import {
  formatMoney,
  moneyFromDatabase,
  moneyToDatabase,
} from "@/shared/money";
import {
  formatQuantity,
  quantityFromDatabase,
  quantityToDatabase,
} from "@/shared/quantity";
import type { SearchParams } from "../filters";
import {
  byQuantity,
  CURRENT_DATA_NOTE,
  FORBIDDEN_PAGE_MESSAGE,
  NO_ORDER_RECEIPTS_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  PURCHASE_ORDER_NOT_FOUND_MESSAGE,
  purchaseOrderNoticeMessage,
  UNKNOWN_PRODUCT_TEXT,
  UNKNOWN_SUPPLIER_TEXT,
} from "../messages";
import { VOIDED_BADGE_TEXT } from "../../recepciones/messages";
import { PurchaseOrderStatusBadge } from "../status-badge";
import { purchaseOrderActivity } from "./audit-summary";
import { CancelPurchaseOrderConfirm } from "./cancel-confirm";
import { ClosePurchaseOrderConfirm } from "./close-confirm";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Orden de compra — AI WhatsApp Agent CRM",
};

const TITLE = "Orden de compra";

// La recepción vigente, la que cuenta (brief-22.5, D-8). No vive en messages.ts porque es de esta
// ficha: la lista de recepciones tiene su propio filtro con sus propias palabras.
const CURRENT_RECEIPT_TEXT = "Vigente";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

function sumQuantity(values: string[]): string {
  return quantityToDatabase(
    values.reduce((total, value) => total + quantityFromDatabase(value), 0n),
  );
}

// El detalle de una orden de compra, que es también su página imprimible para mandársela al
// proveedor (brief-22.3, D-10; ADR 0023, punto 13): la organización, el número, la fecha, el
// proveedor con sus datos de hoy, las líneas, el total y la leyenda. Al imprimir queda solo la
// orden (print:hidden y las reglas @media print de globals.css). Una abierta se cancela en el paso
// ?confirmar=cancelar. Solo admin.
//
// Desde la 22.4 (brief-22.4, D-11): por línea, lo recibido y lo que falta, que no se imprimen; sus
// recepciones; «Recibir mercadería» y «Cerrar con faltante» (?confirmar=cerrar) en una abierta con
// faltante, y «Cancelar la orden» solo sin recepciones (D-9).
//
// Desde la 24.8.1 tiene la forma de la lámina 03 del lote V2-11: la fila de proveedor, fecha y
// «Creada por» bajo el título (V-12), «Recibir mercadería» como única acción principal y el resto
// en «Más acciones» —nunca cancelar y cerrar a la vez (D-4), e «Imprimir» una sola vez (H-8)—, la
// barra de recepción (V-11), «Productos» con Pedidas / Recibidas / Pendientes, «Recepciones» con
// su estado y su costo (V-13), el «Resumen de la orden» a la derecha y la «Actividad» narrada en
// oraciones (D-6).
//
// **Lo que la lámina no dibuja y la ficha conserva**: el encabezado del comprobante —el nombre de
// la organización, la leyenda, el CUIT, el teléfono y el correo del proveedor y la moneda— queda
// `hidden print:block`. Es lo que se imprime y se le manda al proveedor (AC-10), y en pantalla
// estorbaría la forma de la lámina; el nombre del proveedor y la fecha, que eran lo único de ese
// bloque que se miraba en pantalla, ahora están arriba, y sus datos de contacto, a un clic en su
// ficha.
export default async function PurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { orderId } = await params;
  const query = await searchParams;
  const found = await getPurchaseOrder(context, orderId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={PURCHASE_ORDER_NOT_FOUND_MESSAGE}
        back={{ href: "/compras/ordenes", label: "Volver a órdenes de compra" }}
      />
    );
  }
  const order = found.order;
  const href = `/compras/ordenes/${order.id}`;
  const historial = page(query.historial);
  const [timeZone, frame, audit] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    listPurchaseOrderAudit(context, order.id, historial),
  ]);
  const actorLabel = audit.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = purchaseOrderNoticeMessage(query.aviso);
  const isOpen = order.status === "open";
  // Cuentan las recepciones vigentes (brief-22.5, D-8): una orden cuyas recepciones se anularon todas
  // se cancela, y no se cierra a mano. purchasing lo exige igual con la cabecera bloqueada.
  const currentReceipts = order.receipts.filter(
    (receipt) => receipt.voidDisplayNumber === null,
  );
  const hasReceipts = currentReceipts.length > 0;
  const hasPending = order.lines.some((line) => line.pending !== "0.000");
  const canCancel = isOpen && !hasReceipts;
  const canClose = isOpen && hasReceipts && hasPending;
  // La confirmación sigue a la vista mientras la orden esté abierta, aunque ya no corresponda: si
  // una recepción llegó mientras se confirmaba, el rechazo de purchasing se muestra en ella. Los
  // enlaces que la abren, en cambio, solo aparecen cuando la acción corresponde.
  const confirming = isOpen && query.confirmar === "cancelar";
  const confirmingClose = isOpen && query.confirmar === "cerrar";
  const supplier = order.supplier;

  // La barra de recepción y el resumen (V-11): todo sale de las líneas, que ya traen lo pedido, lo
  // recibido y lo que falta. Ninguna lectura nueva.
  const ordered = sumQuantity(order.lines.map((line) => line.quantity));
  const received = sumQuantity(order.lines.map((line) => line.received));
  const pending = sumQuantity(order.lines.map((line) => line.pending));
  const orderedUnits = quantityFromDatabase(ordered);
  const receivedPercent =
    orderedUnits === 0n
      ? 0
      : Number((quantityFromDatabase(received) * 100n) / orderedUnits);
  const receivedTotal = moneyToDatabase(
    currentReceipts.reduce(
      (total, receipt) => total + moneyFromDatabase(receipt.total),
      0n,
    ),
  );

  // «Creada por» (V-12): el autor del alta, que la página ya tiene porque resuelve los nombres de la
  // historia. *Corrige a H-5, que lo llamaba «la primera entrada»*: `listEntityAuditLogs` ordena de
  // la más nueva a la más vieja, así que el alta es la **última** y, con más de una página, puede no
  // estar en la que se está mirando. Se busca por acción y, si no está, la fila no se dibuja.
  const createdEntry = audit.ok
    ? audit.entries.find((entry) => entry.action === "create")
    : undefined;
  const createdBy =
    createdEntry && actorLabel ? actorLabel(createdEntry.actor) : null;

  // La cronología mezcla la auditoría de la página con las recepciones, que no dejan entrada en la
  // auditoría de la orden salvo cuando la cierran (ver audit-summary.ts). Las recepciones son todas
  // las de la orden y la auditoría viene paginada, así que solo se suman en la primera página: la
  // auditoría de una orden nunca pasa de dos entradas —el alta y una transición final—, de modo que
  // una segunda página no existe hoy, y si algún día existiera, no repetiría las recepciones.
  const activity =
    audit.ok && actorLabel
      ? purchaseOrderActivity({
          entries: audit.entries,
          actorName: (entry) => actorLabel(entry.actor),
          receipts: audit.page === 1 ? order.receipts : [],
        })
      : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href="/compras/ordenes" label="Volver a órdenes de compra" />
        <DetailHeader
          title={`Orden de compra ${order.displayNumber}`}
          leading={<HeaderIcon name="fileText" />}
          badges={
            <PurchaseOrderStatusBadge
              status={order.status}
              hasPending={hasPending}
            />
          }
          primary={
            isOpen && hasPending ? (
              <Link
                href={`/compras/recepciones/nueva?orden=${order.id}`}
                // min-h-11: el objetivo táctil del README de la v2 es 44 px y primaryLinkClass da
                // 40, como en la ficha de la venta.
                className={`${primaryLinkClass} min-h-11`}
              >
                <Icon name="package" className="size-4" />
                Recibir mercadería
              </Link>
            ) : null
          }
          actions={<PrintButton />}
          // «Imprimir» **no** se repite acá dentro (H-8, AC-7), y cancelar y cerrar nunca conviven:
          // una orden con recepciones vigentes se cierra con faltante y no se cancela, y una sin
          // ellas se cancela y no se cierra. Es la regla de negocio de hoy, que no cambia (D-4).
          more={
            (canClose && !confirmingClose) || (canCancel && !confirming) ? (
              <MoreActions
                id="mas-acciones-orden"
                label="Más acciones de la orden de compra"
                iconOnly
              >
                {canClose && !confirmingClose ? (
                  <li>
                    <Link
                      href={`${href}?confirmar=cerrar`}
                      className={moreActionItemClass}
                    >
                      <Icon name="fileText" className="size-4" />
                      Cerrar con faltante
                    </Link>
                  </li>
                ) : null}
                {canCancel && !confirming ? (
                  <li>
                    <Link
                      href={`${href}?confirmar=cancelar`}
                      className={`${moreActionItemClass} ${moreActionDangerClass}`}
                    >
                      <Icon name="close" className="size-4" />
                      Cancelar la orden
                    </Link>
                  </li>
                ) : null}
              </MoreActions>
            ) : null
          }
        />

        {/* La fila de la lámina: proveedor, fecha de creación y quién la creó.
            **No es un `<dl>`**: la baldosa del icono obliga a anidar el rótulo y el valor dos
            niveles debajo de la lista, y ahí `dt` y `dd` dejan de ser hijos de un `div` hijo del
            `dl`. Escrito así, axe marcó `definition-list` y `dlitem` en esta misma fila, y lo
            encontró la corrida de Playwright. Se copia la baldosa de `clientes/[clientId]`
            (`summary-tab.tsx:43`), que es el precedente del proyecto para esta forma exacta y
            tampoco usa una lista de definiciones. Los dos `<dl>` que sí quedan en esta página
            —los datos del comprobante y el resumen— tienen sus `dt` y `dd` donde corresponde. */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className={iconTileClass}>
              <Icon name="building" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-muted">Proveedor</p>
              <p className="font-semibold">
                {supplier ? (
                  <Link
                    href={`/compras/proveedores/${supplier.id}`}
                    className={linkClass}
                  >
                    {supplier.name}
                  </Link>
                ) : (
                  UNKNOWN_SUPPLIER_TEXT
                )}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className={iconTileClass}>
              <Icon name="calendar" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-muted">Fecha de creación</p>
              <p className="font-semibold">
                {formatFullDateTime(order.createdAt, timeZone)}
              </p>
            </div>
          </div>
          {createdBy ? (
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className={iconTileClass}>
                <Icon name="user" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted">Creada por</p>
                <p className="font-semibold">{createdBy}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div role="status" className="mt-4 empty:hidden">
          {notice ? <ActionNotice>{notice}</ActionNotice> : null}
        </div>

        {confirming ? (
          <div className="mt-6">
            <CancelPurchaseOrderConfirm
              orderId={order.id}
              displayNumber={order.displayNumber}
            />
          </div>
        ) : null}

        {confirmingClose ? (
          <div className="mt-6">
            <ClosePurchaseOrderConfirm
              orderId={order.id}
              displayNumber={order.displayNumber}
              received={received}
              pending={pending}
              ordered={ordered}
            />
          </div>
        ) : null}

        {order.closedAt ? (
          <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            Cerrada el {formatShortDateTime(order.closedAt, timeZone)}.
          </p>
        ) : null}

        {order.cancelledAt ? (
          <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            Cancelada el {formatShortDateTime(order.cancelledAt, timeZone)}.
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] print:mt-0 print:block">
        <div className="flex min-w-0 flex-col gap-6">
          {/* La barra de recepción (V-11). Una orden cancelada no la lleva: lo que falta ya no va a
              recibirse, y dibujar «Falta recibir 1» sugeriría que todavía puede pasar. */}
          {order.status === "cancelled" ? null : (
            <section
              aria-labelledby="recepcion-titulo"
              className={`${cardClass} min-w-0 p-5 sm:p-6 print:hidden`}
            >
              <h2 id="recepcion-titulo" className={sectionTitleClass}>
                Recepción de mercadería
              </h2>
              {/* La barra es decorativa: lo que dice está en el texto de abajo, que es el que leen
                  los lectores de pantalla y el que se ve sin color. */}
              <div
                aria-hidden
                className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${receivedPercent}%` }}
                />
              </div>
              <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="tabular-nums">
                  {formatQuantity(received)} de {formatQuantity(ordered)}{" "}
                  {byQuantity(ordered, "unidad recibida", "unidades recibidas")}
                </span>
                {hasPending ? (
                  <span className="font-semibold tabular-nums">
                    Falta recibir {formatQuantity(pending)}
                  </span>
                ) : (
                  <span className="font-semibold">Todo recibido</span>
                )}
              </p>
            </section>
          )}

          <article
            data-comprobante
            aria-labelledby="orden-titulo"
            // `min-w-0`: el comprobante es un ítem de grilla y el ancho mínimo automático de un
            // ítem es el de su contenido, así que sin esto la tabla de líneas no lo deja encoger.
            className={`${cardClass} min-w-0 p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
          >
            {/* El encabezado del comprobante: solo al imprimir (ver el comentario de arriba). */}
            <header className="hidden flex-wrap items-start justify-between gap-4 border-b border-border pb-4 print:flex">
              <div>
                <p className="text-lg font-semibold">
                  {frame.organizationName}
                </p>
                <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">
                  Orden de compra{" "}
                  <span className="font-mono">{order.displayNumber}</span>
                </p>
                {order.status === "cancelled" ? (
                  <p className="font-semibold uppercase">Cancelada</p>
                ) : null}
                {order.status === "closed" ? (
                  <p className="font-semibold uppercase">Cerrada</p>
                ) : null}
                <p className="text-sm">
                  {formatFullDateTime(order.createdAt, timeZone)}
                </p>
              </div>
            </header>

            <div className="flex min-w-0 items-center gap-3">
              <span className={iconTileClass}>
                <Icon name="package" />
              </span>
              <h2 id="orden-titulo" className={sectionTitleClass}>
                Productos
              </h2>
            </div>

            {/* Los datos del proveedor que van en el papel y no en la pantalla. */}
            <dl className="mt-4 hidden gap-x-6 gap-y-2 text-sm print:grid sm:grid-cols-2">
              <div>
                <dt className="text-muted">Proveedor</dt>
                <dd className="font-semibold">
                  {supplier ? supplier.name : UNKNOWN_SUPPLIER_TEXT}
                </dd>
              </div>
              {supplier?.cuit ? (
                <div>
                  <dt className="text-muted">CUIT</dt>
                  <dd>{formatCuit(supplier.cuit)}</dd>
                </div>
              ) : null}
              {supplier?.phone ? (
                <div>
                  <dt className="text-muted">Teléfono</dt>
                  <dd>{supplier.phone}</dd>
                </div>
              ) : null}
              {supplier?.email ? (
                <div>
                  <dt className="text-muted">Email</dt>
                  <dd>{supplier.email}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">Moneda</dt>
                <dd>{order.currency}</dd>
              </div>
            </dl>

            <div
              className="-mx-5 mt-4 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
              tabIndex={0}
              role="region"
              aria-label={`Líneas de la orden de compra ${order.displayNumber}`}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Líneas de la orden de compra {order.displayNumber}
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
                      Pedidas
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right print:hidden`}
                    >
                      Recibidas
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right print:hidden`}
                    >
                      Pendientes
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Costo esperado ({order.currency})
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Total esperado ({order.currency})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
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
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums print:hidden`}
                      >
                        {formatQuantity(line.received)}
                      </td>
                      <td
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums print:hidden`}
                      >
                        {formatQuantity(line.pending)}
                      </td>
                      <td
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                      >
                        {formatMoney(line.unitCost, order.currency)}
                      </td>
                      <td
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                      >
                        {formatMoney(line.lineTotal, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Dos totales, uno por medio. La lámina pone «Recibidas» y «Pendientes» en el
                    medio y esas dos columnas no se imprimen, así que la fila del total abarca cinco
                    celdas en pantalla y tres en el papel. Con una sola, el total quedaría corrido
                    en uno de los dos. */}
                <tfoot>
                  <tr className="print:hidden">
                    <th
                      scope="row"
                      colSpan={5}
                      className={`${tableCellClass} text-right font-semibold`}
                    >
                      Total
                    </th>
                    <td
                      className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(order.total, order.currency)}
                    </td>
                  </tr>
                  <tr className="hidden print:table-row">
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
                      {formatMoney(order.total, order.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-6 hidden text-center text-sm font-semibold uppercase print:block">
              {NOT_AN_INVOICE_LEGEND}
            </p>
            <p className="mt-4 text-sm text-muted print:hidden">
              {CURRENT_DATA_NOTE}
            </p>
          </article>

          <SectionCard
            id="recepciones-titulo"
            title="Recepciones"
            icon="truck"
            className="print:hidden"
          >
            {order.receipts.length === 0 ? (
              <p className="text-sm text-muted">{NO_ORDER_RECEIPTS_MESSAGE}</p>
            ) : (
              <div
                className="-mx-5 overflow-x-auto sm:-mx-6"
                tabIndex={0}
                role="region"
                aria-label={`Recepciones de la orden de compra ${order.displayNumber}`}
              >
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Recepciones de la orden de compra {order.displayNumber}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className={tableHeadCellClass}>
                        Nº de recepción
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Fecha
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Estado
                      </th>
                      {/* La lámina dice «Unidades». `GoodsReceiptSummary` trae las líneas, no las
                          unidades: ese recuento es la lectura que D-1 mandó a la 24.8.1-b.
                          Declarado en el brief como corrección de V-13. */}
                      <th
                        scope="col"
                        className={`${tableHeadCellClass} text-right`}
                      >
                        Líneas
                      </th>
                      <th
                        scope="col"
                        className={`${tableHeadCellClass} text-right`}
                      >
                        Costo recibido ({order.currency})
                      </th>
                      <th
                        scope="col"
                        className={`${tableHeadCellClass} text-right`}
                      >
                        <span className="sr-only">Ver la recepción</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.receipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td
                          className={`${tableCellClass} font-mono whitespace-nowrap`}
                        >
                          <Link
                            href={`/compras/recepciones/${receipt.id}`}
                            className={linkClass}
                          >
                            {receipt.displayNumber}
                          </Link>
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {formatFullDateTime(receipt.createdAt, timeZone)}
                        </td>
                        <td className={tableCellClass}>
                          {receipt.voidDisplayNumber ? (
                            <StatusBadge
                              tone="neutral"
                              icon="circleMinus"
                              title={`Anulada por ${receipt.voidDisplayNumber}`}
                            >
                              {VOIDED_BADGE_TEXT}
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="success" icon="circleCheck">
                              {CURRENT_RECEIPT_TEXT}
                            </StatusBadge>
                          )}
                        </td>
                        <td
                          className={`${tableCellClass} text-right tabular-nums`}
                        >
                          {receipt.lineCount}
                        </td>
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                        >
                          {formatMoney(receipt.total, receipt.currency)}
                        </td>
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap`}
                        >
                          <Link
                            href={`/compras/recepciones/${receipt.id}`}
                            className={`${linkClass} inline-flex items-center gap-1`}
                          >
                            Ver recepción
                            <span className="sr-only">
                              {" "}
                              {receipt.displayNumber}
                            </span>
                            <Icon name="chevronRight" className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-muted">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              <span>
                El costo recibido puede diferir del esperado. El pago se
                registra desde la recepción o la cuenta del proveedor.
              </span>
            </p>
          </SectionCard>

          {audit.ok ? (
            <SectionCard
              id="actividad-titulo"
              title="Actividad"
              icon="history"
              className="print:hidden"
            >
              {activity.length === 0 ? (
                <p className="text-sm text-muted">
                  Sin movimientos registrados todavía.
                </p>
              ) : (
                <ol className="flex flex-col">
                  {activity.map((row, index) => (
                    <li key={row.id} className="flex gap-3">
                      {/* El hilo del hito, decorativo: lo que ordena la lista es el documento. */}
                      <span
                        aria-hidden
                        className="flex flex-col items-center pt-1.5"
                      >
                        <span className="size-2.5 shrink-0 rounded-full border-2 border-primary bg-surface" />
                        {index < activity.length - 1 ? (
                          <span className="w-0.5 flex-1 bg-border" />
                        ) : null}
                      </span>
                      <div className="min-w-0 pb-4 last:pb-0 sm:flex sm:min-w-0 sm:gap-4">
                        <p className="font-semibold sm:w-40 sm:shrink-0">
                          {row.label}
                        </p>
                        <p className="text-sm text-muted sm:w-40 sm:shrink-0">
                          {formatFullDateTime(row.at, timeZone)}
                        </p>
                        <p className="min-w-0 text-sm">{row.sentence}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <Pagination
                page={audit.page}
                pageCount={audit.pageCount}
                rangeText={shownRangeText({
                  page: audit.page,
                  pageSize: AUDIT_PAGE_SIZE,
                  shown: audit.entries.length,
                  total: audit.total,
                  singular: "cambio",
                  plural: "cambios",
                })}
                hrefFor={(target) =>
                  target > 1 ? `${href}?historial=${target}` : href
                }
              />
            </SectionCard>
          ) : null}

          <p className="text-sm text-muted print:hidden">
            Fechas en {timeZone}.
          </p>
        </div>

        <aside
          aria-labelledby="resumen-titulo"
          className={`${cardClass} min-w-0 p-5 sm:p-6 print:hidden`}
        >
          <h2 id="resumen-titulo" className={sectionTitleClass}>
            Resumen de la orden
          </h2>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-2 text-muted">
                <Icon name="fileText" className="size-4 shrink-0" />
                Total ordenado
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(order.total, order.currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-2 text-muted">
                <Icon name="package" className="size-4 shrink-0" />
                Total recibido
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(receivedTotal, order.currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-2 text-muted">
                <Icon name="truck" className="size-4 shrink-0" />
                Pendiente de recepción
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatQuantity(pending)}{" "}
                {byQuantity(pending, "unidad", "unidades")}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
