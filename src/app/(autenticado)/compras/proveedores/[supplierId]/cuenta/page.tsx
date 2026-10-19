import type { Metadata } from "next";
import Link from "next/link";
import {
  getSupplierStatement,
  STATEMENT_DOCUMENTS_LIMIT,
} from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { formatCuit, getSupplier } from "@/modules/purchasing";
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
import { PageNotice } from "@/app/_components/page-notice";
import {
  formatDate,
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { PrintButton } from "../../../ordenes/[orderId]/print-button";
import { NOT_AN_INVOICE_LEGEND } from "../../../ordenes/messages";
import { ReferenceTotal } from "@/app/(autenticado)/caja/reference-total";
import {
  NO_SUPPLIER_MOVEMENTS_MESSAGE,
  SUPPLIER_ACCOUNT_ADMIN_ONLY_MESSAGE,
  SUPPLIER_DOCUMENT_KIND_LABEL,
  SUPPLIER_IMPUTATION_NOTE,
  SUPPLIER_NOT_FOUND_MESSAGE,
  SUPPLIER_STATEMENT_TITLE,
  supplierDestinationText,
  supplierDocumentHref,
} from "./messages";

export const metadata: Metadata = {
  title: "Estado de cuenta del proveedor — AI WhatsApp Agent CRM",
};

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

// Pantalla 55 (brief-22.7, D-4; ADR 0023, puntos 9 y 13): el estado de cuenta de un proveedor,
// imprimible como los comprobantes. Por moneda, el resumen (debe, haber, saldo y lo que está a favor
// del negocio) y la imputación de hoy de cada recepción vigente: a dónde se aplicó cada peso. Debajo,
// los comprobantes del proveedor, de los más nuevos a los más viejos, sin saldo corrido. El encabezado
// lleva el nombre y el CUIT, sin teléfono ni email. Solo admin (punto 12). Lo compone la página con
// cash y purchasing: purchasing no depende de cash (punto 11).
export default async function SupplierStatementPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const context = await requireSession();
  const { supplierId } = await params;
  const found = await getSupplierStatement(context, supplierId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return (
        <PageNotice
          title={SUPPLIER_STATEMENT_TITLE}
          message={SUPPLIER_ACCOUNT_ADMIN_ONLY_MESSAGE}
        />
      );
    }
    return (
      <PageNotice
        title={SUPPLIER_STATEMENT_TITLE}
        message={SUPPLIER_NOT_FOUND_MESSAGE}
        back={{ href: "/compras/proveedores", label: "Volver a proveedores" }}
      />
    );
  }
  const { statement } = found;
  const [timeZone, frame, supplier] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    getSupplier(context, statement.supplier.id),
  ]);
  const name = statement.supplier.name;
  const cuit = supplier.ok ? supplier.supplier.cuit : null;
  const href = `/compras/proveedores/${statement.supplier.id}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href={href} label="Volver al proveedor" />
        <DetailHeader
          title={`${SUPPLIER_STATEMENT_TITLE} de ${name}`}
          leading={<HeaderIcon name="list" />}
          subtitle={<p>{SUPPLIER_IMPUTATION_NOTE}</p>}
          actions={
            <>
              <Link href={`${href}/pagar`} className={primaryLinkClass}>
                Pago a cuenta
              </Link>
              <PrintButton />
            </>
          }
        />
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
              {SUPPLIER_STATEMENT_TITLE}
            </h2>
            <p className="text-sm font-semibold">{name}</p>
            {cuit ? <p className="text-sm">CUIT {formatCuit(cuit)}</p> : null}
            <p className="text-sm">
              Al {formatFullDateTime(statement.generatedAt, timeZone)}
            </p>
          </div>
        </header>

        {statement.currencies.length === 0 ? (
          <p className="mt-4 text-sm">{NO_SUPPLIER_MOVEMENTS_MESSAGE}</p>
        ) : null}
        {/* El total de referencia en la moneda principal (brief-29.4.3, D-6). */}
        <ReferenceTotal
          reference={statement.references.owed}
          label="Se le debe en total"
          timeZone={timeZone}
          className="mt-4"
        />
        <ReferenceTotal
          reference={statement.references.inFavor}
          label="A favor del negocio en total"
          timeZone={timeZone}
          className="mt-2"
        />

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
                <dt className="text-muted">Debe (recepciones vigentes)</dt>
                <dd className="text-right tabular-nums">
                  {money(account.debit)}
                </dd>
                <dt className="text-muted">Haber (pagos vigentes)</dt>
                <dd className="text-right tabular-nums">
                  {money(account.credit)}
                </dd>
                <dt className="font-semibold">Saldo</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {account.balance.side === "zero"
                    ? money("0.00")
                    : account.balance.side === "owed"
                      ? `Se le debe ${money(account.balance.amount)}`
                      : `A favor del negocio ${money(account.balance.amount)}`}
                </dd>
              </dl>

              {account.receipts.length > 0 ? (
                <div
                  className="-mx-5 mt-4 overflow-x-auto sm:-mx-6 print:mx-0"
                  tabIndex={0}
                  role="region"
                  aria-label={`Imputación en ${account.currency}`}
                >
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Imputación de las recepciones vigentes en{" "}
                      {account.currency}, de la más vieja a la más nueva
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className={tableHeadCellClass}>
                          Recepción
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
                          Pagado
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
                      {account.receipts.map((receipt) => (
                        <tr key={receipt.id}>
                          <td className={`${tableCellClass} whitespace-nowrap`}>
                            <Link
                              href={`/compras/recepciones/${receipt.id}`}
                              className={`${linkClass} font-mono print:no-underline`}
                            >
                              {receipt.displayNumber}
                            </Link>
                          </td>
                          <td className={`${tableCellClass} whitespace-nowrap`}>
                            {formatDate(receipt.issuedAt, timeZone)}
                          </td>
                          <td className={numberCell}>{money(receipt.total)}</td>
                          <td className={numberCell}>
                            {money(receipt.direct)}
                          </td>
                          <td className={numberCell}>
                            {money(receipt.imputed)}
                          </td>
                          <td className={`${numberCell} font-semibold`}>
                            {receipt.outstanding === "0.00"
                              ? "Pagada"
                              : money(receipt.outstanding)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {account.inFavor !== "0.00" ? (
                <p className="mt-2 text-sm">
                  Quedan {money(account.inFavor)} a favor del negocio, para las
                  recepciones que vengan.
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
              aria-label="Comprobantes del proveedor"
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Comprobantes del proveedor, del más nuevo al más viejo
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
                        {SUPPLIER_DOCUMENT_KIND_LABEL[document.kind]}{" "}
                        <Link
                          href={supplierDocumentHref(document)}
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
                        {supplierDestinationText(document) ?? ""}
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

        <p className="mt-6 text-xs text-muted">{SUPPLIER_IMPUTATION_NOTE}</p>
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
