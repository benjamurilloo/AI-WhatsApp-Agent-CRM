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
  inlineButtonClass,
  labelClass,
  linkClass,
  primaryLinkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
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
import type { SearchParams } from "../../filters";
import {
  debitDocumentHref,
  IMPUTATION_TITLE,
  NO_SUPPLIER_MOVEMENTS_MESSAGE,
  statementFilterNote,
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

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Pantalla 55 (brief-22.7, D-4; ADR 0023, puntos 9 y 13): el estado de cuenta de un proveedor,
// imprimible como los comprobantes. Por moneda, el resumen (debe, haber, saldo y lo que está a favor
// del negocio) y la imputación de hoy de cada recepción vigente: a dónde se aplicó cada peso. Debajo,
// los comprobantes del proveedor, de los más nuevos a los más viejos, sin saldo corrido. El encabezado
// lleva el nombre y el CUIT, sin teléfono ni email. Solo admin (punto 12). Lo compone la página con
// cash y purchasing: purchasing no depende de cash (punto 11).
//
// *Desde la 24.8.2-b* (brief-24.8.2-b, D-7, D-9 y V-25 a V-34) toma la forma de la lámina 11: el
// título es el nombre del proveedor con «Estado de cuenta» de subtítulo, cada moneda es una tarjeta
// con el saldo grande —y Debe y Haber debajo, que la lámina no dibuja y el README del mismo lote
// exige (H-4)—, la imputación es **una sola tabla con columna Moneda** y rótulos «Pago directo ·
// Desde cuenta · Pendiente», y hay un filtro de moneda si hay más de una.
//
// **El filtro no recorta el documento**: lo que esconde, lo esconde solo en pantalla
// (`hidden print:…`), así que al imprimir sale el estado de cuenta entero. Un estado de cuenta
// filtrado que no dijera que está filtrado sería un documento que miente, y por eso además lo
// avisa en pantalla.
export default async function SupplierStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { supplierId } = await params;
  const query = await searchParams;
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

  // El filtro de moneda (D-9): vive en la URL y **no se dibuja con una sola moneda**, por la regla
  // de la 24.8.2. Una moneda que el proveedor no tiene equivale a no filtrar.
  const currencies = statement.currencies.map((account) => account.currency);
  const requested = single(query.moneda).toUpperCase();
  const selected = currencies.includes(requested) ? requested : "";
  // Lo que el filtro deja afuera se esconde **solo en pantalla**.
  const offScreen = (currency: string, row = false) =>
    selected === "" || selected === currency
      ? ""
      : row
        ? "hidden print:table-row"
        : "hidden print:block";
  // Las filas de la imputación, de todas las monedas, en una sola tabla (V-28).
  const imputations = statement.currencies.flatMap((account) =>
    account.receipts.map((receipt) => ({
      currency: account.currency,
      receipt,
    })),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href={href} label="Volver al proveedor" />
        <DetailHeader
          title={name}
          leading={<HeaderIcon name="list" />}
          subtitle={
            <>
              <p>{SUPPLIER_STATEMENT_TITLE}</p>
              <p className="text-sm">{SUPPLIER_IMPUTATION_NOTE}</p>
            </>
          }
          actions={
            <>
              <Link href={`${href}/pagar`} className={primaryLinkClass}>
                <Icon name="banknote" className="size-4" />
                Registrar pago a cuenta
              </Link>
              <PrintButton />
            </>
          }
        />
        {currencies.length > 1 ? (
          <form
            method="get"
            action={`${href}/cuenta`}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="moneda" className={labelClass}>
                Moneda
              </label>
              <select
                id="moneda"
                name="moneda"
                defaultValue={selected}
                className={selectClass}
              >
                <option value="">Todas</option>
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={inlineButtonClass}>
              <Icon name="filter" className="size-4" />
              Ver
            </button>
          </form>
        ) : null}
        {selected !== "" ? (
          <p role="status" className="mt-3 text-sm text-muted">
            {statementFilterNote(selected)}
          </p>
        ) : null}
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

        {/* Una tarjeta por moneda, con el saldo grande (V-27), y Debe y Haber conservados (D-7). */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {statement.currencies.map((account) => {
            const money = (value: string) =>
              formatMoney(value, account.currency);
            return (
              <section
                key={account.currency}
                aria-labelledby={`moneda-${account.currency}`}
                className={`min-w-0 rounded-xl border border-border bg-surface-muted p-4 ${offScreen(account.currency)}`}
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <Icon name="banknote" className="size-5" />
                  </span>
                  <h3
                    id={`moneda-${account.currency}`}
                    className="text-sm font-semibold text-muted"
                  >
                    En <span className="font-mono">{account.currency}</span>
                  </h3>
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {account.balance.side === "zero"
                    ? money("0.00")
                    : money(account.balance.amount)}
                </p>
                <p className="text-sm text-muted">
                  {account.balance.side === "zero"
                    ? "Saldo"
                    : account.balance.side === "owed"
                      ? "Se le debe"
                      : "A favor del negocio"}
                </p>
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
                  <dt className="text-muted">Debe (comprobantes vigentes)</dt>
                  <dd className="text-right tabular-nums">
                    {money(account.debit)}
                  </dd>
                  <dt className="text-muted">Haber (pagos vigentes)</dt>
                  <dd className="text-right tabular-nums">
                    {money(account.credit)}
                  </dd>
                </dl>
                {account.inFavor !== "0.00" ? (
                  <p className="mt-3 text-sm">
                    Quedan {money(account.inFavor)} a favor del negocio, para
                    las recepciones que vengan.
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>

        {/* «Imputación actual»: una sola tabla con columna Moneda (V-28), con los rótulos de la
            lámina sobre los mismos tres números de siempre (V-29) y «Ver detalle» por fila (V-30).
            La fecha se conserva: es lo que explica el orden de la imputación (V-31). */}
        {imputations.length > 0 ? (
          <section aria-labelledby="imputacion-titulo" className="mt-8">
            <h3 id="imputacion-titulo" className="text-base font-semibold">
              {IMPUTATION_TITLE}
            </h3>
            <div
              className="relative -mx-5 mt-2 overflow-x-auto sm:-mx-6 print:mx-0"
              tabIndex={0}
              role="region"
              aria-label={IMPUTATION_TITLE}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Imputación de los comprobantes vigentes, de la más vieja a la
                  más nueva
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Comprobante
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Fecha
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Moneda
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
                      Pago directo
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Desde cuenta
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Pendiente
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} print:hidden`}
                    >
                      <span className="sr-only">Detalle</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {imputations.map(({ currency, receipt }) => {
                    const money = (value: string) =>
                      formatMoney(value, currency);
                    return (
                      <tr
                        key={`${currency}-${receipt.id}`}
                        className={offScreen(currency, true)}
                      >
                        <td
                          className={`${tableCellClass} font-mono whitespace-nowrap`}
                        >
                          {receipt.displayNumber}
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {formatDate(receipt.issuedAt, timeZone)}
                        </td>
                        <td className={`${tableCellClass} font-mono`}>
                          {currency}
                        </td>
                        <td className={numberCell}>{money(receipt.total)}</td>
                        <td className={numberCell}>{money(receipt.direct)}</td>
                        <td className={numberCell}>{money(receipt.imputed)}</td>
                        <td className={`${numberCell} font-semibold`}>
                          {receipt.outstanding === "0.00"
                            ? "Pagada"
                            : money(receipt.outstanding)}
                        </td>
                        <td
                          className={`${tableCellClass} whitespace-nowrap print:hidden`}
                        >
                          <Link
                            href={debitDocumentHref(receipt)}
                            className={linkClass}
                          >
                            Ver detalle
                            <span className="sr-only">
                              {" "}
                              de {receipt.displayNumber}
                            </span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

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
              className="relative -mx-5 mt-2 overflow-x-auto sm:-mx-6 print:mx-0"
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
                    <tr
                      key={`${document.kind}-${document.displayNumber}`}
                      className={offScreen(document.currency, true)}
                    >
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
