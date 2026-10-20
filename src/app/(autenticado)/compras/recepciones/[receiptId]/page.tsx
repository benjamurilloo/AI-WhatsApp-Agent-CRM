import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getGoodsReceiptPayments } from "@/modules/cash";
import { getAvailableStock } from "@/modules/inventory";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import {
  formatCuit,
  getGoodsReceipt,
  listGoodsReceiptAudit,
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
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { PrintButton } from "../../ordenes/[orderId]/print-button";
import { ReceiptPaymentsSection } from "../../pagos/receipt-payments-section";
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
  VOID_REASON_LABEL,
  VOIDED_BADGE_TEXT,
} from "../messages";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { VoidGoodsReceiptConfirm } from "./void-confirm";

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
// la leyenda. Al imprimir queda solo el comprobante. La historia, al pie. Solo admin. Desde la 22.5
// (brief-22.5, D-9): una anulada lo dice, enlaza su anulación y se imprime con la marca; una vigente se
// anula en el paso ?confirmar=anular, que muestra lo que sale del stock con lo disponible hoy. Desde la
// 22.6 (brief-22.6, D-13), lo pagado y lo que falta, compuesto con cash.
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
  const [timeZone, frame, audit, payments] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    listGoodsReceiptAudit(context, receipt.id, page(query.historial)),
    getGoodsReceiptPayments(context, receipt.id),
  ]);
  const actorLabel = audit.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = goodsReceiptNoticeMessage(query.aviso);
  const supplier = receipt.supplier;
  const receiptVoid = receipt.receiptVoid;
  const voiding = receiptVoid === null && query.confirmar === "anular";
  // Lo disponible hoy de cada producto, solo para la confirmación.
  const available = voiding
    ? await getAvailableStock(
        context,
        receipt.lines.map((line) => line.productId),
      )
    : null;

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
          {notice ? <ActionNotice>{notice}</ActionNotice> : null}
        </div>
        {receiptVoid ? (
          <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            Anulada por{" "}
            <Link
              href={`${href}/anulacion`}
              className={`${linkClass} font-mono`}
            >
              {receiptVoid.displayNumber}
            </Link>{" "}
            el {formatShortDateTime(receiptVoid.createdAt, timeZone)}:{" "}
            {VOID_REASON_LABEL[receiptVoid.reason]}.
          </p>
        ) : null}
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
            {receiptVoid ? (
              <p className="font-semibold uppercase">
                {VOIDED_BADGE_TEXT} por{" "}
                <span className="font-mono">{receiptVoid.displayNumber}</span>
              </p>
            ) : null}
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
                    {line.serials.length > 0 ? (
                      // Desde la 29.5: los IMEI de las unidades que creó la línea (brief-29.5, D-6).
                      <span className="mt-1 block text-xs text-muted">
                        IMEI:{" "}
                        <span className="font-mono break-all">
                          {line.serials.join(", ")}
                        </span>
                      </span>
                    ) : null}
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

      {payments.ok ? (
        <div className="mt-6 print:hidden">
          <ReceiptPaymentsSection
            receiptId={receipt.id}
            supplierId={supplier?.id ?? null}
            standing={payments.standing}
            timeZone={timeZone}
          />
        </div>
      ) : null}

      <div className="mt-6 print:hidden">
        <SectionCard id="anulacion-titulo" title="Anulación" icon="close">
          {receiptVoid ? (
            <>
              <p className="text-sm">
                Anulación{" "}
                <span className="font-mono">{receiptVoid.displayNumber}</span> ·{" "}
                {VOID_REASON_LABEL[receiptVoid.reason]}
              </p>
              <p className="mt-4 text-sm">
                <Link href={`${href}/anulacion`} className={linkClass}>
                  Ver el comprobante de la anulación
                </Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Esta recepción está vigente.</p>
          )}
          {receiptVoid === null ? (
            <div className="mt-4">
              {voiding ? (
                <VoidGoodsReceiptConfirm
                  receiptId={receipt.id}
                  displayNumber={receipt.displayNumber}
                  hasOrder={receipt.purchaseOrder !== null}
                  paidNote={
                    payments.ok && payments.standing.paid !== "0.00"
                      ? `Lo pagado contra esta recepción, ${formatMoney(payments.standing.paid, receipt.currency)}, pasa a la cuenta del proveedor: se imputa a sus otras recepciones o queda a favor del negocio.`
                      : null
                  }
                  lines={receipt.lines.map((line) => ({
                    productId: line.productId,
                    name: line.product?.name ?? UNKNOWN_PRODUCT_TEXT,
                    unit: line.product?.unit ?? "",
                    quantity: line.quantity,
                    available:
                      (available?.ok
                        ? available.available.get(line.productId)
                        : undefined) ?? "0.000",
                  }))}
                />
              ) : (
                <Link
                  href={`${href}?confirmar=anular`}
                  className={dangerOutlineLinkClass}
                >
                  <Icon name="close" className="size-4" />
                  Anular la recepción
                </Link>
              )}
            </div>
          ) : null}
        </SectionCard>
      </div>

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
