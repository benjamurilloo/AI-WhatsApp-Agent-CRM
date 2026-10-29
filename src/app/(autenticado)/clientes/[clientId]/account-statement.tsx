import Link from "next/link";
import {
  STATEMENT_DOCUMENTS_LIMIT,
  type ClientStatement,
} from "@/modules/cash";
import {
  inactiveBadgeClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatDate, formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { ReferenceTotal } from "@/app/(autenticado)/caja/reference-total";
import {
  destinationText,
  DOCUMENT_KIND_LABEL,
  documentHref,
  NO_MOVEMENTS_MESSAGE,
} from "./cuenta/messages";

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

// El cuerpo del estado de cuenta (brief-21.6, D-4), compartido desde la 24.4.1 entre la pestaña
// Cuenta corriente de la ficha y la página imprimible /cuenta (brief-24.4.1, D-4; la 24.7.2 lo
// reusa): por moneda, el resumen y la imputación de cada venta vigente, y los comprobantes, sin saldo
// corrido. Con `currency`, solo esa moneda y sus comprobantes; sin ella, todo, como imprime /cuenta.
export function StatementBody({
  statement,
  timeZone,
  currency = null,
}: {
  statement: ClientStatement;
  timeZone: string;
  currency?: string | null;
}) {
  const currencies =
    currency === null
      ? statement.currencies
      : statement.currencies.filter((row) => row.currency === currency);
  const documents =
    currency === null
      ? statement.documents
      : statement.documents.filter((row) => row.currency === currency);
  return (
    <>
      {statement.currencies.length === 0 ? (
        <p className="mt-4 text-sm">{NO_MOVEMENTS_MESSAGE}</p>
      ) : null}
      {currency === null ? (
        <>
          <ReferenceTotal
            reference={statement.references.owed}
            label="Debe en total"
            timeZone={timeZone}
            className="mt-4"
          />
          <ReferenceTotal
            reference={statement.references.inFavor}
            label="A favor en total"
            timeZone={timeZone}
            className="mt-2"
          />
        </>
      ) : null}

      {currencies.map((account) => {
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
              <dt className="text-muted">Haber (cobros menos devoluciones)</dt>
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
                    Imputación de las ventas vigentes en {account.currency}, de
                    la más vieja a la más nueva
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

      {documents.length > 0 ? (
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
                {documents.map((document) => (
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
    </>
  );
}
