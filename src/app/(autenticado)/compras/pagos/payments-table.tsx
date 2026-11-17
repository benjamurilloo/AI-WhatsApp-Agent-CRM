import type { ReactNode } from "react";
import Link from "next/link";
import type { SupplierPaymentListItem } from "@/modules/cash";
import {
  inactiveBadgeClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";
import { UNKNOWN_SUPPLIER_TEXT } from "../ordenes/messages";
import { ACCOUNT_TARGET_TEXT, VOIDED_BADGE_TEXT } from "./messages";

// Una tabla de pagos a proveedores (brief-22.6, D-13): la lista, los pagos de una recepción y los de
// una sesión de caja, que solo ve un admin (D-9). El nombre del proveedor lo compone la página con
// purchasing; sin él, la columna no va.
//
// Desde la 24.8.2 tiene **dos disposiciones** (brief-24.8.2, V-2). `list` es la de la lámina 08: el
// orden de columnas que dibuja y la vigencia como **columna «Estado»**, con texto e ícono, que es
// lo que la 24.6.2-e fijó para las ventas. `compact` es la de siempre, y la conservan la ficha de
// la recepción y el detalle de la sesión de caja: **esas pantallas no son de esta subfase** y
// reordenarles las columnas de prepo sería cambiarlas fuera de su brief.

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

type Column =
  "number" | "supplier" | "target" | "date" | "method" | "amount" | "status";

// Los encabezados de la lámina 08 son más largos que los de hoy, así que cada disposición conserva
// los suyos: la ficha de la recepción y la sesión de caja siguen diciendo «Pago», «Fecha» y «Medio».
const HEADING: Record<"compact" | "list", Record<Column, string>> = {
  compact: {
    number: "Pago",
    supplier: "Proveedor",
    target: "Destino",
    date: "Fecha",
    method: "Medio",
    amount: "Monto",
    status: "Estado",
  },
  list: {
    number: "Comprobante",
    supplier: "Proveedor",
    target: "Destino",
    date: "Fecha y hora",
    method: "Medio de pago",
    amount: "Monto",
    status: "Estado",
  },
};

export function SupplierPaymentsTable({
  caption,
  payments,
  timeZone,
  supplierNames,
  cashSide = false,
  layout = "compact",
  hrefForPayment,
}: {
  caption: string;
  payments: SupplierPaymentListItem[];
  timeZone: string;
  supplierNames?: Map<string, string>;
  // En la caja, la cifra es lo que salió de ella (brief-29.4.3, D-5).
  cashSide?: boolean;
  // `list` solo lo pide la lista de pagos (brief-24.8.2, V-2).
  layout?: "compact" | "list";
  // A dónde lleva el número. Por omisión, al comprobante imprimible; en la lista, al panel.
  hrefForPayment?: (payment: SupplierPaymentListItem) => string;
}) {
  const columns: Column[] =
    layout === "list"
      ? [
          "number",
          ...(supplierNames ? (["supplier"] as const) : []),
          "target",
          "date",
          "method",
          "amount",
          "status",
        ]
      : [
          "number",
          "date",
          ...(supplierNames ? (["supplier"] as const) : []),
          "target",
          "method",
          "amount",
        ];

  function cell(column: Column, row: SupplierPaymentListItem): ReactNode {
    switch (column) {
      case "number":
        return (
          <td className={`${tableCellClass} whitespace-nowrap`} key={column}>
            <Link
              href={
                hrefForPayment
                  ? hrefForPayment(row)
                  : `/compras/pagos/${row.id}`
              }
              className={`${linkClass} font-mono print:no-underline`}
            >
              {row.displayNumber}
            </Link>
            {/* En `list` la vigencia es su propia columna: acá sobraría. */}
            {row.voided && layout === "compact" ? (
              <span
                className={`${inactiveBadgeClass} ml-2 font-sans`}
                title={`Anulado por ${row.voided.displayNumber}`}
              >
                {VOIDED_BADGE_TEXT}
              </span>
            ) : null}
          </td>
        );
      case "supplier":
        return (
          <td className={tableCellClass} key={column}>
            <Link
              href={`/compras/proveedores/${row.supplierId}`}
              className={`${linkClass} print:no-underline`}
            >
              {supplierNames?.get(row.supplierId) ?? UNKNOWN_SUPPLIER_TEXT}
            </Link>
          </td>
        );
      case "target":
        return (
          <td className={`${tableCellClass} whitespace-nowrap`} key={column}>
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
        );
      case "date":
        return (
          <td className={`${tableCellClass} whitespace-nowrap`} key={column}>
            {formatShortDateTime(row.createdAt, timeZone)}
          </td>
        );
      case "method":
        return (
          <td className={tableCellClass} key={column}>
            {row.paymentMethodName}
          </td>
        );
      case "amount":
        return (
          <td className={numberCell} key={column}>
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
        );
      case "status":
        return (
          <td className={`${tableCellClass} whitespace-nowrap`} key={column}>
            {row.voided ? (
              <StatusBadge
                tone="neutral"
                icon="circleX"
                title={`Anulado por ${row.voided.displayNumber}`}
              >
                {VOIDED_BADGE_TEXT}
              </StatusBadge>
            ) : (
              <StatusBadge tone="success" icon="circleCheck">
                Vigente
              </StatusBadge>
            )}
          </td>
        );
    }
  }

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
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className={
                  column === "amount"
                    ? `${tableHeadCellClass} text-right`
                    : tableHeadCellClass
                }
              >
                {HEADING[layout][column]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payments.map((row) => (
            <tr key={row.id}>{columns.map((column) => cell(column, row))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
