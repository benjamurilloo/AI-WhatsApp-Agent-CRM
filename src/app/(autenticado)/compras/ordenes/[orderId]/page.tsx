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
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  dangerOutlineLinkClass,
  linkClass,
  noticeClass,
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
  NOT_AN_INVOICE_LEGEND,
  PURCHASE_ORDER_NOT_FOUND_MESSAGE,
  purchaseOrderNoticeMessage,
  UNKNOWN_PRODUCT_TEXT,
  UNKNOWN_SUPPLIER_TEXT,
} from "../messages";
import { PurchaseOrderStatusBadge } from "../status-badge";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { CancelPurchaseOrderConfirm } from "./cancel-confirm";
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
  const confirming = isOpen && query.confirmar === "cancelar";
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
              {isOpen && !confirming ? (
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
          {notice ? <p className={noticeClass}>{notice}</p> : null}
        </div>

        {confirming ? (
          <div className="mt-6">
            <CancelPurchaseOrderConfirm
              orderId={order.id}
              displayNumber={order.displayNumber}
            />
          </div>
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
