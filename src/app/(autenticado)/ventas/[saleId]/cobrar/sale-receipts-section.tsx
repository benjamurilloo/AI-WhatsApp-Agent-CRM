import Link from "next/link";
import type { SaleReceipts } from "@/modules/cash";
import {
  inactiveBadgeClass,
  linkClass,
  primaryLinkClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { TO_ACCOUNT_RULE_TEXT } from "@/app/(autenticado)/clientes/[clientId]/cuenta/messages";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";

// La sección «Cobros» del detalle de una venta (brief-21.3, D-8; ADR 0022, punto 6): la compone la
// página con cash, nunca sales. Lo cobrado, lo imputado desde la cuenta del cliente y lo que falta,
// o «Cobrada»; en una venta anulada, a dónde fue lo cobrado. La lista de cobros enlaza cada recibo.
// Desde la 21.4, lo cobrado incluye la seña del pedido de la venta vigente, con su número, y la lista
// marca cada seña con su pedido (brief-21.4, D-5 y D-8). Desde la 21.5 (brief-21.5, D-9): los cobros
// anulados, marcados y fuera de lo cobrado; en una venta anulada, lo devuelto y lo que queda a
// devolver, con «Devolver» para admin, o el enlace a devolver el saldo a favor de la cuenta. Desde la
// 21.6 (brief-21.6, D-7 y D-8): con cliente, lo que debe o tiene a favor su cuenta en la moneda de la
// venta, con el enlace al estado de cuenta, y en una venta anulada, que lo cobrado pasó a la cuenta
// sin afirmar un saldo a favor que puede no existir.

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
  if (receipts.order && receipts.deposited !== "0.00") {
    rows.push([
      `Incluye la seña del pedido ${receipts.order.displayNumber}`,
      money(receipts.deposited),
    ]);
  }
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
            ? `Lo cobrado (${money(receipts.toAccount)}) pasó a la cuenta del cliente. ${TO_ACCOUNT_RULE_TEXT}`
            : receipts.refunded === "0.00"
              ? `A devolver: ${money(receipts.toRefund)}.`
              : `Devuelto: ${money(receipts.refunded)}. A devolver: ${money(receipts.toRefund)}.`}
        </p>
      ) : null}
      {receipts.hasClient && receipts.clientId !== null ? (
        <p className="mt-3 text-sm">
          Cuenta del cliente:{" "}
          <span className="font-semibold tabular-nums">
            {receipts.clientOwed !== "0.00"
              ? `debe ${money(receipts.clientOwed)}`
              : receipts.clientInFavor !== "0.00"
                ? `tiene ${money(receipts.clientInFavor)} a favor`
                : "al día"}
          </span>
          .{" "}
          <Link
            href={`/clientes/${receipts.clientId}/cuenta`}
            className={linkClass}
          >
            Ver estado de cuenta
          </Link>
        </p>
      ) : null}
      {canCollect &&
      voided &&
      receipts.hasClient &&
      receipts.clientId !== null &&
      receipts.clientInFavor !== "0.00" ? (
        <p className="mt-3">
          <Link
            href={`/clientes/${receipts.clientId}/devolver`}
            className={secondaryLinkClass}
          >
            <Icon name="undo" className="size-4" />
            Devolver saldo a favor
          </Link>
        </p>
      ) : null}
      {canCollect &&
      voided &&
      !receipts.hasClient &&
      receipts.toRefund !== "0.00" ? (
        <p className="mt-3">
          <Link
            href={`/ventas/${saleId}/devolver`}
            className={secondaryLinkClass}
          >
            <Icon name="undo" className="size-4" />
            Devolver
          </Link>
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
                    {row.voided ? (
                      <span
                        className={`${inactiveBadgeClass} ml-2 font-sans`}
                        title={`Anulado por ${row.voided.displayNumber}`}
                      >
                        Anulado
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted">
                      {formatShortDateTime(row.createdAt, timeZone)}
                    </span>
                    {row.order ? (
                      <span className="block text-xs text-muted">
                        Seña del pedido{" "}
                        <Link
                          href={`/pedidos/${row.order.id}`}
                          className={`${linkClass} font-mono`}
                        >
                          {row.order.displayNumber}
                        </Link>
                      </span>
                    ) : null}
                  </td>
                  <td className={tableCellClass}>
                    {row.paymentMethodName}
                    {row.tradeIn ? (
                      <>
                        {" "}
                        <Link
                          href={`/usados/${row.tradeIn.id}`}
                          className={linkClass}
                        >
                          {row.tradeIn.displayNumber}
                        </Link>
                      </>
                    ) : null}
                  </td>
                  <td className={numberCell}>
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

      {receipts.refunds.length > 0 ? (
        <div
          className="-mx-5 mt-4 overflow-x-auto sm:-mx-6"
          tabIndex={0}
          role="region"
          aria-label={`Devoluciones de la venta ${displayNumber}`}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Devoluciones de la venta {displayNumber}
            </caption>
            <thead>
              <tr>
                <th scope="col" className={tableHeadCellClass}>
                  Devolución
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
              {receipts.refunds.map((row) => (
                <tr key={row.id}>
                  <td className={tableCellClass}>
                    <Link
                      href={`/devoluciones/${row.id}`}
                      className={`${linkClass} font-mono`}
                    >
                      {row.displayNumber}
                    </Link>
                    {row.voided ? (
                      <span
                        className={`${inactiveBadgeClass} ml-2 font-sans`}
                        title={`Anulada por ${row.voided.displayNumber}`}
                      >
                        Anulada
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted">
                      {formatShortDateTime(row.createdAt, timeZone)}
                    </span>
                  </td>
                  <td className={tableCellClass}>{row.paymentMethodName}</td>
                  <td className={numberCell}>
                    {formatMoney(row.amount, row.currency)}
                    {row.tender ? (
                      <span className="block text-xs text-muted">
                        {tenderNote(row.tender, true)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

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
