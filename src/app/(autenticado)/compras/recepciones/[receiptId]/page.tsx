import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import {
  formatCuit,
  getGoodsReceipt,
  listGoodsReceiptAudit,
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
  linkClass,
  noticeClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { PrintButton } from "../../ordenes/[orderId]/print-button";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  UNKNOWN_PRODUCT_TEXT,
  UNKNOWN_SUPPLIER_TEXT,
} from "../../ordenes/messages";
import type { SearchParams } from "../filters";
import {
  CURRENT_DATA_NOTE,
  GOODS_RECEIPT_NOT_FOUND_MESSAGE,
  goodsReceiptNoticeMessage,
} from "../messages";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

export const metadata: Metadata = {
  title: "Recepción — AI WhatsApp Agent CRM",
};

const TITLE = "Recepción";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// El detalle de una recepción, que es también su página imprimible (brief-22.4, D-11; ADR 0023,
// punto 13), con el molde del detalle de la orden de compra: la organización, el número, la fecha,
// el proveedor con sus datos de hoy, la orden, la referencia del proveedor, las líneas, el total y
// la leyenda. Al imprimir queda solo el comprobante. La historia, al pie. Solo admin.
export default async function GoodsReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { receiptId } = await params;
  const query = await searchParams;
  const found = await getGoodsReceipt(context, receiptId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={GOODS_RECEIPT_NOT_FOUND_MESSAGE}
        back={{ href: "/compras/recepciones", label: "Volver a recepciones" }}
      />
    );
  }
  const receipt = found.receipt;
  const href = `/compras/recepciones/${receipt.id}`;
  const [timeZone, frame, audit] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    listGoodsReceiptAudit(context, receipt.id, page(query.historial)),
  ]);
  const actorLabel = audit.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = goodsReceiptNoticeMessage(query.aviso);
  const supplier = receipt.supplier;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href="/compras/recepciones" label="Volver a recepciones" />
        <DetailHeader
          title={`Recepción ${receipt.displayNumber}`}
          leading={<HeaderIcon name="package" />}
          subtitle={
            <p>
              Total:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(receipt.total, receipt.currency)}
              </span>
            </p>
          }
          actions={<PrintButton />}
        />

        <div role="status" className="mt-4 empty:hidden">
          {notice ? <p className={noticeClass}>{notice}</p> : null}
        </div>
      </div>

      <article
        data-comprobante
        aria-labelledby="recepcion-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="recepcion-titulo" className="text-lg font-semibold">
              Recepción{" "}
              <span className="font-mono">{receipt.displayNumber}</span>
            </h2>
            <p className="text-sm">
              {formatFullDateTime(receipt.createdAt, timeZone)}
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
          <div>
            <dt className="text-muted">Orden de compra</dt>
            <dd className="font-mono">
              {receipt.purchaseOrder ? (
                <Link
                  href={`/compras/ordenes/${receipt.purchaseOrder.id}`}
                  className={`${linkClass} print:no-underline`}
                >
                  {receipt.purchaseOrder.displayNumber}
                </Link>
              ) : (
                <span className="font-sans">Sin orden</span>
              )}
            </dd>
          </div>
          {receipt.supplierReference ? (
            <div>
              <dt className="text-muted">Remito o factura del proveedor</dt>
              <dd>{receipt.supplierReference}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">Moneda</dt>
            <dd>{receipt.currency}</dd>
          </div>
        </dl>

        <div
          className="-mx-5 mt-4 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
          tabIndex={0}
          role="region"
          aria-label={`Líneas de la recepción ${receipt.displayNumber}`}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Líneas de la recepción {receipt.displayNumber}
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
              {receipt.lines.map((line) => (
                <tr key={line.position}>
                  <td className={tableCellClass}>
                    {line.product ? (
                      <>
                        <Link
                          href={`/productos/${line.productId}`}
                          className={`${linkClass} print:no-underline`}
                        >
                          {line.product.name}
                        </Link>
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
                    {formatMoney(line.unitCost, receipt.currency)}
                  </td>
                  <td
                    className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                  >
                    {formatMoney(line.lineTotal, receipt.currency)}
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
                  {formatMoney(receipt.total, receipt.currency)}
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
            caption={`Historia de la recepción ${receipt.displayNumber}`}
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
