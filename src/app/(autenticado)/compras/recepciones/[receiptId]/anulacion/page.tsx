import type { Metadata } from "next";
import Link from "next/link";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { formatCuit, getGoodsReceipt } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatFullDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { PrintButton } from "../../../ordenes/[orderId]/print-button";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  UNKNOWN_PRODUCT_TEXT,
  UNKNOWN_SUPPLIER_TEXT,
} from "../../../ordenes/messages";
import {
  CURRENT_DATA_NOTE,
  GOODS_RECEIPT_NOT_FOUND_MESSAGE,
  VOID_COST_NOTE,
  VOID_REASON_LABEL,
} from "../../messages";

export const metadata: Metadata = {
  title: "Anulación de recepción — AI WhatsApp Agent CRM",
};

const TITLE = "Anulación de recepción";
const NO_VOID_MESSAGE = "Esta recepción no está anulada.";

// Pantalla 49: el comprobante de la anulación de una recepción (brief-22.5, D-9; ADR 0023, puntos 6
// y 13), imprimible como el de la recepción. Una recepción tiene a lo sumo una anulación, así que la
// ruta cuelga de ella. Lleva la organización, el número y la fecha de la anulación, la recepción que
// anula, el proveedor con sus datos de hoy, la orden si hay, las líneas y el total de la recepción,
// el motivo y la leyenda. Una recepción sin anular no tiene comprobante. Solo admin.
export default async function GoodsReceiptVoidPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const context = await requireSession();
  const { receiptId } = await params;
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
  const receiptVoid = receipt.receiptVoid;
  const receiptHref = `/compras/recepciones/${receipt.id}`;
  if (!receiptVoid) {
    return (
      <PageNotice
        title={TITLE}
        message={NO_VOID_MESSAGE}
        back={{ href: receiptHref, label: "Volver a la recepción" }}
      />
    );
  }
  const [timeZone, frame] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
  ]);
  const supplier = receipt.supplier;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink
          href={receiptHref}
          label={`Volver a la recepción ${receipt.displayNumber}`}
        />
        <DetailHeader
          title={`Anulación ${receiptVoid.displayNumber}`}
          leading={<HeaderIcon name="receipt" />}
          subtitle={<p>De la recepción {receipt.displayNumber}</p>}
          actions={<PrintButton />}
        />
      </div>

      <article
        data-comprobante
        aria-labelledby="comprobante-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="comprobante-titulo" className="text-lg font-semibold">
              Anulación de recepción{" "}
              <span className="font-mono">{receiptVoid.displayNumber}</span>
            </h2>
            <p className="text-sm">
              {formatFullDateTime(receiptVoid.createdAt, timeZone)}
            </p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Recepción anulada</dt>
            <dd>
              <Link
                href={receiptHref}
                className={`${linkClass} font-mono print:no-underline`}
              >
                {receipt.displayNumber}
              </Link>{" "}
              del {formatFullDateTime(receipt.createdAt, timeZone)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Motivo</dt>
            <dd className="font-semibold">
              {VOID_REASON_LABEL[receiptVoid.reason]}
            </dd>
          </div>
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
          <div>
            <dt className="text-muted">Orden de compra</dt>
            <dd className="font-mono">
              {receipt.purchaseOrder ? (
                receipt.purchaseOrder.displayNumber
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
        </dl>

        <div
          className="-mx-5 mt-4 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
          tabIndex={0}
          role="region"
          aria-label={`Líneas de la recepción ${receipt.displayNumber}`}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Líneas de la recepción {receipt.displayNumber}, que esta anulación
              anula
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
                  Total anulado
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
        <p className="mt-4 text-sm text-muted print:hidden">{VOID_COST_NOTE}</p>
        <p className="mt-2 text-sm text-muted print:hidden">
          {CURRENT_DATA_NOTE}
        </p>
      </article>

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
