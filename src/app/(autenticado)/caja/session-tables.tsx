import Link from "next/link";
import type { CashSessionDetail } from "@/modules/cash";
import {
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import {
  differenceText,
  KIND_LABEL,
  REASON_LABEL,
  UNKNOWN_MEMBER_TEXT,
} from "./messages";

// Los totales por moneda y los movimientos de una sesión (brief-21.2, D-10), para la caja abierta y
// para el arqueo de una cerrada. Cada moneda va en su fila: nunca se suman entre sí. Desde la 21.3,
// los cobros en efectivo: su columna en los totales y su lista (brief-21.3, D-5).

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;
const numberHead = `${tableHeadCellClass} text-right`;

export function CurrencyTotalsTable({
  session,
}: {
  session: CashSessionDetail;
}) {
  const closed = session.closedAt !== null;
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Totales por moneda de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Totales por moneda de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Moneda
            </th>
            <th scope="col" className={numberHead}>
              Inicial
            </th>
            <th scope="col" className={numberHead}>
              Cobros
            </th>
            <th scope="col" className={numberHead}>
              Aportes
            </th>
            <th scope="col" className={numberHead}>
              Retiros
            </th>
            <th scope="col" className={numberHead}>
              Esperado
            </th>
            {closed ? (
              <>
                <th scope="col" className={numberHead}>
                  Contado
                </th>
                <th scope="col" className={numberHead}>
                  Diferencia
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {session.currencies.map((row) => (
            <tr key={row.currency}>
              <th scope="row" className={`${tableCellClass} font-mono`}>
                {row.currency}
              </th>
              <td className={numberCell}>
                {formatMoney(row.initial, row.currency)}
              </td>
              <td className={numberCell}>
                {formatMoney(row.receipts, row.currency)}
              </td>
              <td className={numberCell}>
                {formatMoney(row.contributions, row.currency)}
              </td>
              <td className={numberCell}>
                {formatMoney(row.withdrawals, row.currency)}
              </td>
              <td className={`${numberCell} font-semibold`}>
                {formatMoney(row.expected, row.currency)}
              </td>
              {closed ? (
                <>
                  <td className={numberCell}>
                    {row.counted ? formatMoney(row.counted, row.currency) : "—"}
                  </td>
                  <td className={`${numberCell} font-semibold`}>
                    {row.difference
                      ? differenceText(row.difference, row.currency)
                      : "—"}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MovementsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  if (session.movements.length === 0) {
    return <p className="text-sm text-muted">Sin aportes ni retiros.</p>;
  }
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Movimientos de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Movimientos de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Hora
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Tipo
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Motivo
            </th>
            <th scope="col" className={numberHead}>
              Monto
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Registró
            </th>
          </tr>
        </thead>
        <tbody>
          {session.movements.map((row) => (
            <tr key={row.id}>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={tableCellClass}>{KIND_LABEL[row.kind]}</td>
              <td className={tableCellClass}>{REASON_LABEL[row.reason]}</td>
              <td className={numberCell}>
                {row.kind === "withdrawal" ? "− " : "+ "}
                {formatMoney(row.amount, row.currency)}
              </td>
              <td className={tableCellClass}>
                {row.createdByName ?? UNKNOWN_MEMBER_TEXT}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SessionReceiptsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  if (session.receipts.length === 0) {
    return <p className="text-sm text-muted">Sin cobros en efectivo.</p>;
  }
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Cobros en efectivo de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Cobros en efectivo de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Recibo
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Hora
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Venta
            </th>
            <th scope="col" className={numberHead}>
              Monto
            </th>
          </tr>
        </thead>
        <tbody>
          {session.receipts.map((row) => (
            <tr key={row.id}>
              <td className={tableCellClass}>
                <Link
                  href={`/cobros/${row.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.displayNumber}
                </Link>
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} font-mono`}>
                {row.sale ? (
                  <Link
                    href={`/ventas/${row.sale.id}`}
                    className={`${linkClass} print:no-underline`}
                  >
                    {row.sale.displayNumber}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className={numberCell}>
                {formatMoney(row.amount, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
