import Link from "next/link";
import type { SaleReceipts } from "@/modules/cash";
import {
  linkClass,
  primaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";

// La sección «Cobros» del detalle de una venta (brief-21.3, D-8; ADR 0022, punto 6): la compone la
// página con cash, nunca sales. Lo cobrado, lo imputado desde la cuenta del cliente y lo que falta,
// o «Cobrada»; en una venta anulada, a dónde fue lo cobrado. La lista de cobros enlaza cada recibo.

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

export function SaleReceiptsSection({
  saleId,
  displayNumber,
  receipts,
  canCollect,
  timeZone,
}: {
  saleId: string;
  displayNumber: string;
  receipts: SaleReceipts;
  canCollect: boolean;
  timeZone: string;
}) {
  const money = (value: string) => formatMoney(value, receipts.currency);
  const voided = receipts.status === "voided";
  const rows: [string, string][] = [
    ["Total", money(receipts.total)],
    ["Cobrado", money(receipts.collected)],
  ];
  if (receipts.hasClient && receipts.imputed !== "0.00") {
    rows.push([
      "Imputado desde la cuenta del cliente",
      money(receipts.imputed),
    ]);
  }

  return (
    <SectionCard id="cobros-titulo" title="Cobros" icon="banknote">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
        {voided ? null : (
          <div className="contents">
            <dt className="font-semibold">Falta</dt>
            <dd className="text-right font-semibold tabular-nums">
              {receipts.status === "collected"
                ? "Cobrada"
                : money(receipts.outstanding)}
            </dd>
          </div>
        )}
      </dl>
      {voided && receipts.collected !== "0.00" ? (
        <p className="mt-3 text-sm">
          {receipts.hasClient
            ? `Lo cobrado (${money(receipts.toAccount)}) pasó a la cuenta del cliente como saldo a favor.`
            : `A devolver: ${money(receipts.toRefund)}.`}
        </p>
      ) : null}

      {receipts.receipts.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Sin cobros.</p>
      ) : (
        <div
          className="-mx-5 mt-4 overflow-x-auto sm:-mx-6"
          tabIndex={0}
          role="region"
          aria-label={`Cobros de la venta ${displayNumber}`}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Cobros de la venta {displayNumber}
            </caption>
            <thead>
              <tr>
                <th scope="col" className={tableHeadCellClass}>
                  Recibo
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
              {receipts.receipts.map((row) => (
                <tr key={row.id}>
                  <td className={tableCellClass}>
                    <Link
                      href={`/cobros/${row.id}`}
                      className={`${linkClass} font-mono`}
                    >
                      {row.displayNumber}
                    </Link>
                    <span className="block text-xs text-muted">
                      {formatShortDateTime(row.createdAt, timeZone)}
                    </span>
                  </td>
                  <td className={tableCellClass}>{row.paymentMethodName}</td>
                  <td className={numberCell}>
                    {formatMoney(row.amount, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canCollect && receipts.status === "pending" ? (
        <p className="mt-4">
          <Link href={`/ventas/${saleId}/cobrar`} className={primaryLinkClass}>
            <Icon name="plus" className="size-4" />
            Registrar cobro
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}
