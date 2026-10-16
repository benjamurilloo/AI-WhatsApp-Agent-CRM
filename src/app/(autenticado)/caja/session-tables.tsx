import Link from "next/link";
import type { CashSessionDetail } from "@/modules/cash";
import {
  inactiveBadgeClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatShortDateTime } from "@/app/_format/date-time";
import {
  formatMoney,
  moneyFromDatabase,
  moneyToDatabase,
} from "@/shared/money";
import { PAYMENT_VOID_REASON_LABEL } from "@/app/(autenticado)/compras/pagos/messages";
import { SupplierPaymentsTable } from "@/app/(autenticado)/compras/pagos/payments-table";
import {
  RECEIPT_VOID_REASON_LABEL,
  REFUND_VOID_REASON_LABEL,
  voidReasonText,
} from "@/app/(autenticado)/devoluciones/messages";
import {
  differenceText,
  KIND_LABEL,
  REASON_LABEL,
  UNKNOWN_MEMBER_TEXT,
} from "./messages";

// Los totales por moneda y los movimientos de una sesión (brief-21.2, D-10), para la caja abierta y
// para el arqueo de una cerrada. Cada moneda va en su fila: nunca se suman entre sí. Desde la 21.3,
// los cobros en efectivo: su columna en los totales y su lista (brief-21.3, D-5). Desde la 21.4, la
// lista dice el destino de cada cobro, la venta o el pedido de una seña, como /caja/cobros. Desde la
// 21.5 (brief-21.5, D-6 y D-9): los cobros y las devoluciones en efectivo de los totales van sin lo
// anulado mientras la sesión estaba abierta; las listas marcan lo anulado, y una sesión cerrada lista
// las anulaciones posteriores a su cierre, que explican su diferencia. Desde la 21.6, el destino de un
// cobro a cuenta es «A cuenta» (brief-21.6, D-9). Desde la 22.6 (brief-22.6, D-9; ADR 0023, punto 12): los
// pagos a proveedores en efectivo, sin lo anulado en la sesión, en su columna para los dos roles; su
// lista y sus anulaciones posteriores al cierre, solo para un admin: a un viewer cash no se las da.

// Lo que entró o salió, sin lo anulado en la sesión.
function net(amount: string, voided: string): string {
  return moneyToDatabase(moneyFromDatabase(amount) - moneyFromDatabase(voided));
}

function VoidedBadge({ displayNumber }: { displayNumber: string }) {
  return (
    <span
      className={`${inactiveBadgeClass} ml-2 font-sans`}
      title={`Anulado por ${displayNumber}`}
    >
      Anulado
    </span>
  );
}

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;
const numberHead = `${tableHeadCellClass} text-right`;

export function CurrencyTotalsTable({
  session,
}: {
  session: CashSessionDetail;
}) {
  const closed = session.closedAt !== null;
  // La columna de los pagos a proveedores, solo si la sesión tuvo alguno.
  const withPayments = session.currencies.some(
    (row) =>
      row.supplierPayments !== "0.00" || row.supplierPaymentVoids !== "0.00",
  );
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
              Devoluciones
            </th>
            {withPayments ? (
              <th scope="col" className={numberHead}>
                Pagos a proveedores
              </th>
            ) : null}
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
                {formatMoney(net(row.receipts, row.receiptVoids), row.currency)}
              </td>
              <td className={numberCell}>
                {formatMoney(net(row.refunds, row.refundVoids), row.currency)}
              </td>
              {withPayments ? (
                <td className={numberCell}>
                  {formatMoney(
                    net(row.supplierPayments, row.supplierPaymentVoids),
                    row.currency,
                  )}
                </td>
              ) : null}
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
              Destino
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
                {row.voided ? (
                  <VoidedBadge displayNumber={row.voided.displayNumber} />
                ) : null}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {row.sale ? (
                  <>
                    Venta{" "}
                    <Link
                      href={`/ventas/${row.sale.id}`}
                      className={`${linkClass} font-mono print:no-underline`}
                    >
                      {row.sale.displayNumber}
                    </Link>
                  </>
                ) : row.order ? (
                  <>
                    Pedido{" "}
                    <Link
                      href={`/pedidos/${row.order.id}`}
                      className={`${linkClass} font-mono print:no-underline`}
                    >
                      {row.order.displayNumber}
                    </Link>
                  </>
                ) : row.account ? (
                  <Link
                    href={`/clientes/${row.account.clientId}/cuenta`}
                    className={`${linkClass} print:no-underline`}
                  >
                    A cuenta
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

export function SessionRefundsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  if (session.refunds.length === 0) {
    return <p className="text-sm text-muted">Sin devoluciones en efectivo.</p>;
  }
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Devoluciones en efectivo de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Devoluciones en efectivo de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Devolución
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Hora
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Desde
            </th>
            <th scope="col" className={numberHead}>
              Monto
            </th>
          </tr>
        </thead>
        <tbody>
          {session.refunds.map((row) => (
            <tr key={row.id}>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                <Link
                  href={`/devoluciones/${row.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.displayNumber}
                </Link>
                {row.voided ? (
                  <VoidedBadge displayNumber={row.voided.displayNumber} />
                ) : null}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {row.sale ? (
                  <>
                    Venta{" "}
                    <Link
                      href={`/ventas/${row.sale.id}`}
                      className={`${linkClass} font-mono print:no-underline`}
                    >
                      {row.sale.displayNumber}
                    </Link>
                  </>
                ) : (
                  "Saldo a favor"
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

// Las anulaciones posteriores al cierre (ADR 0022, punto 7; brief-21.5, D-6): el arqueo guardado no
// cambia, y estas explican su diferencia. Solo en una sesión cerrada.
export function LateVoidsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  if (session.lateVoids.length === 0) return null;
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Anulaciones posteriores al cierre de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Anulaciones posteriores al cierre de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Anulación
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Fecha
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Anula
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Motivo
            </th>
            <th scope="col" className={numberHead}>
              Efecto en esta caja
            </th>
          </tr>
        </thead>
        <tbody>
          {session.lateVoids.map((row) => (
            <tr key={row.displayNumber}>
              <td className={`${tableCellClass} font-mono whitespace-nowrap`}>
                {row.displayNumber}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {row.kind === "receipt" ? "Recibo" : "Devolución"}{" "}
                <Link
                  href={
                    row.kind === "receipt"
                      ? `/cobros/${row.source.id}`
                      : `/devoluciones/${row.source.id}`
                  }
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.source.displayNumber}
                </Link>
              </td>
              <td className={tableCellClass}>
                {voidReasonText(
                  row.kind === "receipt"
                    ? RECEIPT_VOID_REASON_LABEL
                    : REFUND_VOID_REASON_LABEL,
                  row.reason,
                )}
              </td>
              <td className={numberCell}>
                {/* Un cobro anulado no entró: lo contado tuvo eso de más. Una devolución anulada no
                    salió: lo contado tuvo eso de menos. */}
                {row.kind === "receipt" ? "− " : "+ "}
                {formatMoney(row.amount, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Las anulaciones posteriores al cierre de los pagos a proveedores en efectivo de la sesión (brief-22.6,
// D-9): solo las recibe un admin. Un pago anulado no salió: lo contado tuvo eso de más.
export function LateSupplierPaymentVoidsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  const rows = session.supplierPayments?.lateVoids ?? [];
  if (rows.length === 0) return null;
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Pagos a proveedores anulados después del cierre de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Pagos a proveedores anulados después del cierre de la sesión{" "}
          {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Anulación
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Fecha
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Anula
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Motivo
            </th>
            <th scope="col" className={numberHead}>
              Efecto en esta caja
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.displayNumber}>
              <td className={`${tableCellClass} font-mono whitespace-nowrap`}>
                {row.displayNumber}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                Pago{" "}
                <Link
                  href={`/compras/pagos/${row.source.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.source.displayNumber}
                </Link>
              </td>
              <td className={tableCellClass}>
                {PAYMENT_VOID_REASON_LABEL[row.reason]}
              </td>
              <td className={numberCell}>
                + {formatMoney(row.amount, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Los pagos a proveedores en efectivo de la sesión (brief-22.6, D-9): solo un admin los recibe. El
// nombre del proveedor lo compone la página con purchasing.
export function SessionSupplierPaymentsTable({
  session,
  timeZone,
  supplierNames,
}: {
  session: CashSessionDetail;
  timeZone: string;
  supplierNames: Map<string, string>;
}) {
  const items = session.supplierPayments?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">Sin pagos a proveedores en efectivo.</p>
    );
  }
  return (
    <SupplierPaymentsTable
      caption={`Pagos a proveedores en efectivo de la sesión ${session.displayNumber}`}
      payments={items}
      timeZone={timeZone}
      supplierNames={supplierNames}
    />
  );
}
