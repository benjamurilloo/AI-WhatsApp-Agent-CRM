import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getOrder } from "@/modules/orders";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getSale, listSaleAudit } from "@/modules/sales";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { PhoneText } from "@/app/(autenticado)/clientes/phone-text";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { DetailList } from "@/app/_components/detail-list";
import {
  cardClass,
  linkClass,
  noticeClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { saleFiltersHref, type SearchParams } from "../filters";
import {
  CURRENT_PRODUCT_NAME_NOTE,
  FORBIDDEN_PAGE_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  SALE_NOT_FOUND_MESSAGE,
  saleNoticeMessage,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
} from "../messages";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Venta — AI WhatsApp Agent CRM",
};

const TITLE = "Venta";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Pantalla 18: el detalle de una venta, que es también su comprobante imprimible (brief-20.2,
// D-5; ADR 0021, punto 8). El comprobante lleva la organización, el número, la fecha, el nombre del
// cliente, el pedido, las líneas, el total y la leyenda; al imprimir queda solo él (print:hidden y
// las reglas @media print de globals.css). El contacto del cliente se ve en pantalla solo si crm lo
// entrega para el rol, y nunca se imprime (D-9). La historia, solo admin. Ningún costo ni margen.
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
  // El pedido y la organización los compone la página, por la interfaz de cada módulo
  // (ADR 0021, punto 9).
  const [timeZone, frame, order] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    getOrder(context, sale.orderId),
  ]);
  const orderNumber = order.ok ? order.order.displayNumber : null;
  const audit = isAdmin
    ? await listSaleAudit(context, sale.id, page(query.historial))
    : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = saleNoticeMessage(query.aviso);
  const client = sale.client;
  const clientName = client?.displayName ?? UNKNOWN_CLIENT_TEXT;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href="/ventas" label="Volver a ventas" />
        <DetailHeader
          title={`Venta ${sale.displayNumber}`}
          leading={<HeaderIcon name="receipt" />}
          subtitle={
            <p>
              Total:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(sale.total, sale.currency)}
              </span>
            </p>
          }
          actions={<PrintButton />}
        />

        <div role="status" className="mt-4 empty:hidden">
          {notice ? <p className={noticeClass}>{notice}</p> : null}
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3 print:mt-0 print:block">
        <article
          data-comprobante
          aria-labelledby="comprobante-titulo"
          className={`${cardClass} p-5 sm:p-6 lg:col-span-2 print:border-0 print:p-0 print:shadow-none`}
        >
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="text-lg font-semibold">{frame.organizationName}</p>
              <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
            </div>
            <div className="text-right">
              <h2 id="comprobante-titulo" className="text-lg font-semibold">
                Venta <span className="font-mono">{sale.displayNumber}</span>
              </h2>
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
                      {formatMoney(line.unitPrice, line.currency)}
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
            {CURRENT_PRODUCT_NAME_NOTE}
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
                    <Link href={`/clientes/${client.id}`} className={linkClass}>
                      {client.displayName}
                    </Link>
                  ) : (
                    UNKNOWN_CLIENT_TEXT
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
            <p className="mt-4 text-sm">
              <Link
                href={saleFiltersHref({
                  number: "",
                  from: "",
                  to: "",
                  clientId: sale.clientId,
                  page: 1,
                })}
                className={linkClass}
              >
                Ver las ventas de este cliente
              </Link>
            </p>
          </SectionCard>
        </div>
      </div>

      {audit?.ok ? (
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
                ? `/ventas/${sale.id}?historial=${target}`
                : `/ventas/${sale.id}`
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
