import type { Metadata } from "next";
import Link from "next/link";
import { getOrder } from "@/modules/orders";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getSale } from "@/modules/sales";
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
import {
  CONSUMER_TEXT,
  FORBIDDEN_PAGE_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  SALE_NOT_FOUND_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
  VOID_REASON_LABEL,
} from "../../messages";
import {
  LineUnitList,
  lineUnitPriceText,
} from "../../../pedidos/line-unit-list";
import { PrintButton } from "../print-button";

export const metadata: Metadata = {
  title: "Anulación — AI WhatsApp Agent CRM",
};

const TITLE = "Anulación";
const NO_VOID_MESSAGE = "Esta venta no está anulada.";

// Pantalla 20: el comprobante de la anulación de una venta (brief-20.4, D-7; ADR 0021, punto 8),
// imprimible como el de la venta. Una venta tiene a lo sumo una anulación, así que la ruta cuelga de
// la venta. Lleva la organización, el número y la fecha de la anulación, la venta que anula, el
// cliente o «Consumidor final», el pedido si hay, las líneas y el total de la venta, el motivo y la
// leyenda. Nunca el contacto del cliente. Para admin y viewer.
export default async function SaleVoidPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const context = await requireSession();
  const { saleId } = await params;
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
  const saleVoid = sale.saleVoid;
  if (!saleVoid) {
    return (
      <PageNotice
        title={TITLE}
        message={NO_VOID_MESSAGE}
        back={{ href: `/ventas/${sale.id}`, label: "Volver a la venta" }}
      />
    );
  }
  const [timeZone, frame, order] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    sale.orderId === null ? null : getOrder(context, sale.orderId),
  ]);
  const orderNumber = order?.ok ? order.order.displayNumber : null;
  const clientName =
    sale.clientId === null
      ? CONSUMER_TEXT
      : (sale.client?.displayName ?? UNKNOWN_CLIENT_TEXT);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink
          href={`/ventas/${sale.id}`}
          label={`Volver a la venta ${sale.displayNumber}`}
        />
        <DetailHeader
          title={`Anulación ${saleVoid.displayNumber}`}
          leading={<HeaderIcon name="receipt" />}
          subtitle={<p>De la venta {sale.displayNumber}</p>}
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
              Anulación{" "}
              <span className="font-mono">{saleVoid.displayNumber}</span>
            </h2>
            <p className="text-sm">
              {formatFullDateTime(saleVoid.createdAt, timeZone)}
            </p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Venta anulada</dt>
            <dd>
              <Link
                href={`/ventas/${sale.id}`}
                className={`${linkClass} font-mono print:no-underline`}
              >
                {sale.displayNumber}
              </Link>{" "}
              del {formatFullDateTime(sale.createdAt, timeZone)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Motivo</dt>
            <dd className="font-semibold">
              {VOID_REASON_LABEL[saleVoid.reason]}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Cliente</dt>
            <dd className="font-semibold">{clientName}</dd>
          </div>
          {sale.orderId !== null ? (
            <div>
              <dt className="text-muted">Pedido</dt>
              <dd className="font-mono">{orderNumber ?? "—"}</dd>
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
              Líneas de la venta {sale.displayNumber}, que esta anulación anula
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
                  Precio unitario
                </th>
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
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
                    <LineUnitList units={line.units} currency={line.currency} />
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
                  Total anulado
                </th>
                <td
                  className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                >
                  {formatMoney(saleVoid.total, saleVoid.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-6 text-center text-sm font-semibold uppercase">
          {NOT_AN_INVOICE_LEGEND}
        </p>
      </article>

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
