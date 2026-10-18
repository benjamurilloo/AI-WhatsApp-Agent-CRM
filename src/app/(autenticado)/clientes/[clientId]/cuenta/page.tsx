import type { Metadata } from "next";
import Link from "next/link";
import { getClientStatement, STATEMENT_DOCUMENTS_LIMIT } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  inactiveBadgeClass,
  linkClass,
  primaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { PageNotice } from "@/app/_components/page-notice";
import {
  formatDate,
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { PrintButton } from "@/app/(autenticado)/cobros/[receiptId]/print-button";
import { NOT_AN_INVOICE_LEGEND } from "@/app/(autenticado)/devoluciones/messages";
import {
  CLIENT_NOT_FOUND_MESSAGE,
  destinationText,
  DOCUMENT_KIND_LABEL,
  documentHref,
  FORBIDDEN_PAGE_MESSAGE,
  IMPUTATION_NOTE,
  NO_MOVEMENTS_MESSAGE,
  STATEMENT_TITLE,
  UNNAMED_CLIENT_TEXT,
} from "./messages";
import { ACCOUNT_RECEIPT_NOTICE } from "../cobrar/messages";

export const metadata: Metadata = {
  title: "Estado de cuenta — AI WhatsApp Agent CRM",
};

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

// Pantalla 37 (brief-21.6, D-4; ADR 0022, puntos 9 y 11): el estado de cuenta de un cliente,
// imprimible como los comprobantes. Por moneda, el resumen (debe, haber, saldo, a favor y las señas
// retenidas aparte) y la imputación de hoy de cada venta vigente: a dónde se aplicó cada peso. Debajo,
// los comprobantes del cliente, de la más nueva a la más vieja, sin saldo corrido. Para los dos roles,
// sin el contacto del cliente; un admin cobra a cuenta desde acá. Lo compone la página con cash: crm
// no depende de cash (ADR 0022, punto 13).
export default async function ClientStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const { clientId } = await params;
  const query = await searchParams;
  const found = await getClientStatement(context, clientId);
  if (!found.ok) {
    return (
      <PageNotice
        title={STATEMENT_TITLE}
        message={
          found.code === "FORBIDDEN"
            ? FORBIDDEN_PAGE_MESSAGE
            : CLIENT_NOT_FOUND_MESSAGE
        }
        back={{ href: "/clientes", label: "Volver a clientes" }}
      />
    );
  }
  const { statement } = found;
  const [timeZone, frame] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
  ]);
  const name = statement.client.displayName ?? UNNAMED_CLIENT_TEXT;
  // Después de un cobro a cuenta (D-5): el aviso, con el enlace al recibo si es de este cliente.
  const receiptParam = typeof query.cobro === "string" ? query.cobro : "";
  const newReceipt = statement.documents.find(
    (row) => row.kind === "receipt" && row.id === receiptParam,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href={`/clientes/${clientId}`} label="Volver al cliente" />
        <DetailHeader
          title={`${STATEMENT_TITLE} de ${name}`}
          leading={<HeaderIcon name="list" />}
          subtitle={<p>{IMPUTATION_NOTE}</p>}
          actions={
            <>
              {context.role === "admin" ? (
                <Link
                  href={`/clientes/${clientId}/cobrar`}
                  className={primaryLinkClass}
                >
                  Cobrar a cuenta
                </Link>
              ) : null}
              <PrintButton />
            </>
          }
        />
        <div role="status" className="mt-4 empty:hidden">
          {newReceipt ? (
            <ActionNotice>
              {ACCOUNT_RECEIPT_NOTICE}{" "}
              <Link
                href={`/cobros/${newReceipt.id}`}
                className={`${linkClass} font-mono`}
              >
                {newReceipt.displayNumber}
              </Link>
            </ActionNotice>
          ) : null}
        </div>
      </div>

      <article
        data-comprobante
        aria-labelledby="estado-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="estado-titulo" className="text-lg font-semibold">
              {STATEMENT_TITLE}
            </h2>
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-sm">
              Al {formatFullDateTime(statement.generatedAt, timeZone)}
            </p>
          </div>
        </header>

        {statement.currencies.length === 0 ? (
          <p className="mt-4 text-sm">{NO_MOVEMENTS_MESSAGE}</p>
        ) : null}

        {statement.currencies.map((account) => {
          const money = (value: string) => formatMoney(value, account.currency);
          return (
            <section
              key={account.currency}
              aria-labelledby={`moneda-${account.currency}`}
              className="mt-6"
            >
              <h3
                id={`moneda-${account.currency}`}
                className="text-base font-semibold"
              >
                En <span className="font-mono">{account.currency}</span>
              </h3>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm sm:max-w-md">
                <dt className="text-muted">Debe (ventas vigentes)</dt>
                <dd className="text-right tabular-nums">
                  {money(account.debit)}
                </dd>
                <dt className="text-muted">
                  Haber (cobros menos devoluciones)
                </dt>
                <dd className="text-right tabular-nums">
                  {money(account.credit)}
                </dd>
                <dt className="font-semibold">Saldo</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {account.balance.side === "zero"
                    ? money("0.00")
                    : account.balance.side === "debt"
                      ? `Debe ${money(account.balance.amount)}`
                      : `A favor ${money(account.balance.amount)}`}
                </dd>
                {account.retained !== "0.00" ? (
                  <>
                    <dt className="text-muted">
                      Señas retenidas (no cuentan hasta que el pedido se vende o
                      se cancela)
                    </dt>
                    <dd className="text-right tabular-nums">
                      {money(account.retained)}
                    </dd>
                  </>
                ) : null}
              </dl>

              {account.sales.length > 0 ? (
                <div
                  className="-mx-5 mt-4 overflow-x-auto sm:-mx-6 print:mx-0"
                  tabIndex={0}
                  role="region"
                  aria-label={`Imputación en ${account.currency}`}
                >
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Imputación de las ventas vigentes en {account.currency},
                      de la más vieja a la más nueva
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className={tableHeadCellClass}>
                          Venta
                        </th>
                        <th scope="col" className={tableHeadCellClass}>
                          Fecha
                        </th>
                        <th
                          scope="col"
                          className={`${tableHeadCellClass} text-right`}
                        >
                          Total
                        </th>
                        <th
                          scope="col"
                          className={`${tableHeadCellClass} text-right`}
                        >
                          Cobrado
                        </th>
                        <th
                          scope="col"
                          className={`${tableHeadCellClass} text-right`}
                        >
                          De la cuenta
                        </th>
                        <th
                          scope="col"
                          className={`${tableHeadCellClass} text-right`}
                        >
                          Falta
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.sales.map((sale) => (
                        <tr key={sale.id}>
                          <td className={`${tableCellClass} whitespace-nowrap`}>
                            <Link
                              href={`/ventas/${sale.id}`}
                              className={`${linkClass} font-mono print:no-underline`}
                            >
                              {sale.displayNumber}
                            </Link>
                          </td>
                          <td className={`${tableCellClass} whitespace-nowrap`}>
                            {formatDate(sale.issuedAt, timeZone)}
                          </td>
                          <td className={numberCell}>{money(sale.total)}</td>
                          <td className={numberCell}>{money(sale.direct)}</td>
                          <td className={numberCell}>{money(sale.imputed)}</td>
                          <td className={`${numberCell} font-semibold`}>
                            {sale.outstanding === "0.00"
                              ? "Cobrada"
                              : money(sale.outstanding)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {account.inFavor !== "0.00" ? (
                <p className="mt-2 text-sm">
                  Quedan {money(account.inFavor)} a favor del cliente.
                </p>
              ) : null}
            </section>
          );
        })}

        {statement.documents.length > 0 ? (
          <section aria-labelledby="comprobantes-titulo" className="mt-8">
            <h3 id="comprobantes-titulo" className="text-base font-semibold">
              Comprobantes
            </h3>
            {statement.truncated ? (
              <p className="mt-1 text-sm text-muted">
                Se muestran los {STATEMENT_DOCUMENTS_LIMIT} más recientes. El
                resumen y la imputación cuentan todos.
              </p>
            ) : null}
            <div
              className="-mx-5 mt-2 overflow-x-auto sm:-mx-6 print:mx-0"
              tabIndex={0}
              role="region"
              aria-label="Comprobantes del cliente"
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Comprobantes del cliente, del más nuevo al más viejo
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Fecha
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Comprobante
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Detalle
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {statement.documents.map((document) => (
                    <tr key={`${document.kind}-${document.displayNumber}`}>
                      <td className={`${tableCellClass} whitespace-nowrap`}>
                        {formatShortDateTime(document.createdAt, timeZone)}
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap`}>
                        {DOCUMENT_KIND_LABEL[document.kind]}{" "}
                        <Link
                          href={documentHref(document)}
                          className={`${linkClass} font-mono print:no-underline`}
                        >
                          {document.displayNumber}
                        </Link>
                        {document.voided ? (
                          <span className={`${inactiveBadgeClass} ml-2`}>
                            Anulado
                          </span>
                        ) : null}
                      </td>
                      <td className={tableCellClass}>
                        {destinationText(document) ?? ""}
                      </td>
                      <td className={numberCell}>
                        {formatMoney(document.amount, document.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <p className="mt-6 text-xs text-muted">{IMPUTATION_NOTE}</p>
        <p className="mt-2 text-center text-sm font-semibold uppercase">
          {NOT_AN_INVOICE_LEGEND}
        </p>
      </article>

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
