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
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  dangerOutlineLinkClass,
  inactiveBadgeClass,
  linkClass,
  primaryLinkClass,
  secondaryLinkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import type { SearchParams } from "../filters";
import {
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
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { CancelPurchaseOrderConfirm } from "./cancel-confirm";
import { ClosePurchaseOrderConfirm } from "./close-confirm";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Orden de compra — AI WhatsApp Agent CRM",
};

const TITLE = "Orden de compra";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// El detalle de una orden de compra, que es también su página imprimible para mandársela al
// proveedor (brief-22.3, D-10; ADR 0023, punto 13), con el molde del detalle de la venta (H-9): la
// organización, el número, la fecha, el proveedor con sus datos de hoy, las líneas, el total y la
// leyenda. Al imprimir queda solo la orden (print:hidden y las reglas @media print de globals.css).
// Una abierta se cancela en el paso ?confirmar=cancelar. La historia, al pie. Solo admin.
//
// Desde la 22.4 (brief-22.4, D-11): por línea, lo recibido y lo que falta, que no se imprimen; sus
// recepciones; «Registrar recepción» y «Cerrar con faltante» (?confirmar=cerrar) en una abierta con
// faltante, y «Cancelar la orden» solo sin recepciones (D-9).
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
  const [timeZone, frame, audit] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    listPurchaseOrderAudit(context, order.id, page(query.historial)),
  ]);
  const actorLabel = audit.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = purchaseOrderNoticeMessage(query.aviso);
  const isOpen = order.status === "open";
  // Cuentan las recepciones vigentes (brief-22.5, D-8): una orden cuyas recepciones se anularon todas
  // se cancela, y no se cierra a mano. purchasing lo exige igual con la cabecera bloqueada.
  const hasReceipts = order.receipts.some(
    (receipt) => receipt.voidDisplayNumber === null,
  );
  const hasPending = order.lines.some((line) => line.pending !== "0.000");
  const canCancel = isOpen && !hasReceipts;
  const canClose = isOpen && hasReceipts && hasPending;
  // La confirmación sigue a la vista mientras la orden esté abierta, aunque ya no corresponda: si
  // una recepción llegó mientras se confirmaba, el rechazo de purchasing se muestra en ella. Los
  // enlaces que la abren, en cambio, solo aparecen cuando la acción corresponde.
  const confirming = isOpen && query.confirmar === "cancelar";
  const confirmingClose = isOpen && query.confirmar === "cerrar";
  const supplier = order.supplier;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href="/compras/ordenes" label="Volver a órdenes de compra" />
        <DetailHeader
          title={`Orden de compra ${order.displayNumber}`}
          leading={<HeaderIcon name="fileText" />}
          badges={<PurchaseOrderStatusBadge status={order.status} />}
          subtitle={
            <p>
              Total:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(order.total, order.currency)}
              </span>
            </p>
          }
          actions={
            <>
              <PrintButton />
              {isOpen && hasPending ? (
                <Link
                  href={`/compras/recepciones/nueva?orden=${order.id}`}
                  className={primaryLinkClass}
                >
                  <Icon name="plus" className="size-4" />
                  Registrar recepción
                </Link>
              ) : null}
              {canClose && !confirmingClose ? (
                <Link
                  href={`${href}?confirmar=cerrar`}
                  className={secondaryLinkClass}
                >
                  Cerrar con faltante
                </Link>
              ) : null}
              {canCancel && !confirming ? (
                <Link
                  href={`${href}?confirmar=cancelar`}
                  className={dangerOutlineLinkClass}
                >
                  <Icon name="close" className="size-4" />
                  Cancelar la orden
                </Link>
              ) : null}
            </>
          }
        />

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

      <article
        data-comprobante
        aria-labelledby="orden-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="orden-titulo" className="text-lg font-semibold">
              Orden de compra{" "}
              <span className="font-mono">{order.displayNumber}</span>
            </h2>
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

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Proveedor</dt>
            <dd className="font-semibold">
              {supplier ? (
                <Link
                  href={`/compras/proveedores/${supplier.id}`}
                  className={`${linkClass} print:no-underline`}
                >
                  {supplier.name}
                </Link>
              ) : (
                UNKNOWN_SUPPLIER_TEXT
              )}
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
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
                  Cantidad
                </th>
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
                  Costo unitario
                </th>
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
                  Total
                </th>
                <th
                  scope="col"
                  className={`${tableHeadCellClass} text-right print:hidden`}
                >
                  Recibido
                </th>
                <th
                  scope="col"
                  className={`${tableHeadCellClass} text-right print:hidden`}
                >
                  Falta
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
                      <span className="text-muted"> {line.product.unit}</span>
                    ) : null}
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
                  {formatMoney(order.total, order.currency)}
                </td>
                <td colSpan={2} className={`${tableCellClass} print:hidden`} />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-6 text-center text-sm font-semibold uppercase">
          {NOT_AN_INVOICE_LEGEND}
        </p>
        <p className="mt-4 text-sm text-muted print:hidden">
          {CURRENT_DATA_NOTE}
        </p>
      </article>

      <section
        aria-labelledby="recepciones-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:hidden`}
      >
        <h2 id="recepciones-titulo" className={sectionTitleClass}>
          Recepciones
        </h2>
        {order.receipts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{NO_ORDER_RECEIPTS_MESSAGE}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {order.receipts.map((receipt) => (
              <li
                key={receipt.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="flex items-center gap-2">
                  <Link
                    href={`/compras/recepciones/${receipt.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {receipt.displayNumber}
                  </Link>
                  {receipt.voidDisplayNumber ? (
                    <span
                      className={inactiveBadgeClass}
                      title={`Anulada por ${receipt.voidDisplayNumber}`}
                    >
                      {VOIDED_BADGE_TEXT}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted">
                  {formatShortDateTime(receipt.createdAt, timeZone)}
                </span>
                <span className="tabular-nums">
                  {formatMoney(receipt.total, receipt.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {audit.ok ? (
        <div className="print:hidden">
          <AuditCard
            caption={`Historia de la orden de compra ${order.displayNumber}`}
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
              target > 1 ? `${href}?historial=${target}` : href
            }
          />
        </div>
      ) : null}

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
