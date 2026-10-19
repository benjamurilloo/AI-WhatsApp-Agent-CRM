import Link from "next/link";
import type { SupplierPaymentListItem } from "@/modules/cash";
import {
  inactiveBadgeClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";
import { UNKNOWN_SUPPLIER_TEXT } from "../ordenes/messages";
import { ACCOUNT_TARGET_TEXT, VOIDED_BADGE_TEXT } from "./messages";

// Una tabla de pagos a proveedores (brief-22.6, D-13): la lista, los pagos de una recepción y los de
// una sesión de caja, que solo ve un admin (D-9). El nombre del proveedor lo compone la página con
// purchasing; sin él, la columna no va.

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

export function SupplierPaymentsTable({
  caption,
  payments,
  timeZone,
  supplierNames,
  cashSide = false,
}: {
  caption: string;
  payments: SupplierPaymentListItem[];
  timeZone: string;
  supplierNames?: Map<string, string>;
  // En la caja, la cifra es lo que salió de ella (brief-29.4.3, D-5).
  cashSide?: boolean;
}) {
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Pago
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Fecha
            </th>
            {supplierNames ? (
              <th scope="col" className={tableHeadCellClass}>
                Proveedor
              </th>
            ) : null}
            <th scope="col" className={tableHeadCellClass}>
              Destino
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Medio
            </th>
            <th scope="col" className={`${tableHeadCellClass} text-right`}>
              Monto
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((row) => (
            <tr key={row.id}>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                <Link
                  href={`/compras/pagos/${row.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.displayNumber}
                </Link>
                {row.voided ? (
                  <span
                    className={`${inactiveBadgeClass} ml-2 font-sans`}
                    title={`Anulado por ${row.voided.displayNumber}`}
                  >
                    {VOIDED_BADGE_TEXT}
                  </span>
                ) : null}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              {supplierNames ? (
                <td className={tableCellClass}>
                  <Link
                    href={`/compras/proveedores/${row.supplierId}`}
                    className={`${linkClass} print:no-underline`}
                  >
                    {supplierNames.get(row.supplierId) ?? UNKNOWN_SUPPLIER_TEXT}
                  </Link>
                </td>
              ) : null}
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {row.goodsReceipt ? (
                  <>
                    Recepción{" "}
                    <Link
                      href={`/compras/recepciones/${row.goodsReceipt.id}`}
                      className={`${linkClass} font-mono print:no-underline`}
                    >
                      {row.goodsReceipt.displayNumber}
                    </Link>
                  </>
                ) : (
                  ACCOUNT_TARGET_TEXT
                )}
              </td>
              <td className={tableCellClass}>{row.paymentMethodName}</td>
              <td className={numberCell}>
                {cashSide && row.tender
                  ? formatMoney(row.tender.amount, row.tender.currency)
                  : formatMoney(row.amount, row.currency)}
                {row.tender ? (
                  <span className="block text-xs text-muted">
                    {cashSide
                      ? `Aplicado: ${formatMoney(row.amount, row.currency)}`
                      : tenderNote(row.tender, true)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
