import Link from "next/link";
import type { TradeInMoney } from "@/modules/cash";
import {
  cardClass,
  inlineButtonClass,
  linkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";

// Lo que el usado hizo con su valor (brief-29.7.2, D-6), solo para un admin: con la permuta, los cobros
// con «Permuta» que lo usan y lo que queda; con la compra, los pagos, lo que falta y «Pagar». Los
// anulados se muestran tachados y no cuentan.

export function TradeInMoneySection({
  tradeInId,
  money,
  voided,
  timeZone,
}: {
  tradeInId: string;
  money: TradeInMoney;
  voided: boolean;
  timeZone: string;
}) {
  const format = (value: string) => formatMoney(value, money.currency);
  return (
    <section
      aria-labelledby="dinero-titulo"
      className={`mt-6 ${cardClass} p-5 sm:p-6`}
    >
      {money.destination === "sale_credit" ? (
        <>
          <h2 id="dinero-titulo" className={sectionTitleClass}>
            La permuta
          </h2>
          <p className="mt-2 text-sm">
            Descontado {format(money.used)} de {format(money.value)}. Queda{" "}
            <span className="font-semibold tabular-nums">
              {format(money.available)}
            </span>
            .
          </p>
          {money.receipts.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Todavía no descontó ninguna venta. Se usa desde «Registrar cobro»
              de una venta del cliente, con el medio «Permuta».
            </p>
          ) : (
            <div className="-mx-5 mt-3 overflow-x-auto sm:-mx-6">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Cobros con «Permuta» que usan este usado
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Cobro
                    </th>
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
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {money.receipts.map((row) => (
                    <tr key={row.id} className={row.voided ? "text-muted" : ""}>
                      <td className={tableCellClass}>
                        <Link
                          href={`/cobros/${row.id}`}
                          className={`${linkClass} font-mono`}
                        >
                          {row.displayNumber}
                        </Link>
                        {row.voided
                          ? ` · anulado por ${row.voided.displayNumber}`
                          : ""}
                      </td>
                      <td className={tableCellClass}>
                        {row.sale ? (
                          <Link
                            href={`/ventas/${row.sale.id}`}
                            className={`${linkClass} font-mono`}
                          >
                            {row.sale.displayNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={tableCellClass}>
                        {formatShortDateTime(row.createdAt, timeZone)}
                      </td>
                      <td
                        className={`${tableCellClass} text-right tabular-nums ${row.voided ? "line-through" : ""}`}
                      >
                        {formatMoney(row.amount, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="dinero-titulo" className={sectionTitleClass}>
              Los pagos
            </h2>
            {!voided && money.outstanding !== "0.00" ? (
              <Link
                href={`/usados/${tradeInId}/pago`}
                className={inlineButtonClass}
              >
                Pagar
              </Link>
            ) : null}
          </div>
          <p className="mt-2 text-sm">
            Pagado {format(money.paid)} de {format(money.value)}.{" "}
            {money.outstanding === "0.00" ? (
              "No falta nada."
            ) : (
              <>
                Falta{" "}
                <span className="font-semibold tabular-nums">
                  {format(money.outstanding)}
                </span>
                .
              </>
            )}
          </p>
          {money.payments.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Todavía no se le pagó al cliente.
            </p>
          ) : (
            <div className="-mx-5 mt-3 overflow-x-auto sm:-mx-6">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Pagos de este usado</caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Pago
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Fecha
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Medio
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
                  {money.payments.map((row) => (
                    <tr key={row.id} className={row.voided ? "text-muted" : ""}>
                      <td className={tableCellClass}>
                        <Link
                          href={`/usados/pagos/${row.id}`}
                          className={`${linkClass} font-mono`}
                        >
                          {row.displayNumber}
                        </Link>
                        {row.voided
                          ? ` · anulado por ${row.voided.displayNumber}`
                          : ""}
                      </td>
                      <td className={tableCellClass}>
                        {formatShortDateTime(row.createdAt, timeZone)}
                      </td>
                      <td className={tableCellClass}>
                        {row.paymentMethodName}
                      </td>
                      <td
                        className={`${tableCellClass} text-right tabular-nums ${row.voided ? "line-through" : ""}`}
                      >
                        {formatMoney(row.amount, row.currency)}
                        {row.tender ? (
                          <span className="block text-xs text-muted">
                            {tenderNote(row.tender)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
