import Link from "next/link";
import type { OrderReceipts } from "@/modules/cash";
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

// La sección «Señas» del detalle de un pedido (brief-21.4, D-5 y D-8; ADR 0022, punto 5): la compone
// la página con cash, nunca orders. Lo señado, lo que le falta y qué pasó con lo señado: retenido
// para el pedido, aplicado a su venta, o en la cuenta del cliente si se canceló. La lista enlaza
// cada recibo, y admin registra una seña mientras el pedido esté abierto y le falte algo.

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

export function OrderReceiptsSection({
  orderId,
  displayNumber,
  receipts,
  canDeposit,
  timeZone,
}: {
  orderId: string;
  displayNumber: string;
  receipts: OrderReceipts;
  canDeposit: boolean;
  timeZone: string;
}) {
  const money = (value: string) => formatMoney(value, receipts.currency);

  return (
    <SectionCard id="senas-titulo" title="Señas" icon="banknote">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Señado</dt>
        <dd className="text-right tabular-nums">{money(receipts.deposited)}</dd>
        {receipts.situation === "none" || receipts.situation === "retained" ? (
          <>
            <dt className="font-semibold">Le falta</dt>
            <dd className="text-right font-semibold tabular-nums">
              {money(receipts.outstanding)}
            </dd>
          </>
        ) : null}
      </dl>
      {receipts.situation === "retained" ? (
        <p className="mt-3 text-sm">
          La seña queda retenida para este pedido hasta que se emita su venta.
        </p>
      ) : receipts.situation === "applied" && receipts.sale ? (
        <p className="mt-3 text-sm">
          La seña cuenta para la venta{" "}
          <Link
            href={`/ventas/${receipts.sale.id}`}
            className={`${linkClass} font-mono`}
          >
            {receipts.sale.displayNumber}
          </Link>
          .
        </p>
      ) : receipts.situation === "to_account" ? (
        <p className="mt-3 text-sm">
          El pedido se canceló: lo señado pasó a la cuenta del cliente como
          saldo a favor.
        </p>
      ) : null}

      {receipts.receipts.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Sin señas.</p>
      ) : (
        <div
          className="-mx-5 mt-4 overflow-x-auto sm:-mx-6"
          tabIndex={0}
          role="region"
          aria-label={`Señas del pedido ${displayNumber}`}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Señas del pedido {displayNumber}
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

      {canDeposit && receipts.open ? (
        <p className="mt-4">
          <Link href={`/pedidos/${orderId}/senar`} className={primaryLinkClass}>
            <Icon name="plus" className="size-4" />
            Registrar seña
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}
