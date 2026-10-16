import Link from "next/link";
import type { GoodsReceiptPayments } from "@/modules/cash";
import { linkClass, primaryLinkClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { formatMoney } from "@/shared/money";
import { SupplierPaymentsTable } from "./payments-table";

// Lo pagado de una recepción, en su detalle (brief-22.6, D-13): lo compone la página con cash, nunca
// purchasing (ADR 0023, punto 11). Vigente: lo pagado, lo imputado desde la cuenta y lo que falta, con
// «Registrar un pago» si falta algo. Anulada: lo que pasó a la cuenta del proveedor. Solo admin.
export function ReceiptPaymentsSection({
  receiptId,
  supplierId,
  standing,
  timeZone,
}: {
  receiptId: string;
  supplierId: string | null;
  standing: GoodsReceiptPayments;
  timeZone: string;
}) {
  const money = (value: string) => formatMoney(value, standing.currency);
  return (
    <SectionCard id="pagos-titulo" title="Pagos" icon="banknote">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Pagado</dt>
          <dd className="font-semibold tabular-nums">{money(standing.paid)}</dd>
        </div>
        {standing.voided ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">Pasó a la cuenta del proveedor</dt>
            <dd className="font-semibold tabular-nums">
              {money(standing.toAccount)}
            </dd>
          </div>
        ) : (
          <>
            <div>
              <dt className="text-muted">Imputado desde la cuenta</dt>
              <dd className="tabular-nums">{money(standing.imputed)}</dd>
            </div>
            <div>
              <dt className="text-muted">Falta pagar</dt>
              <dd className="font-semibold tabular-nums">
                {money(standing.outstanding)}
              </dd>
            </div>
          </>
        )}
      </dl>
      {standing.voided ? (
        <p className="mt-3 text-sm text-muted">
          La recepción está anulada: no debe nada, y lo pagado contra ella se
          imputa a las otras recepciones del proveedor o queda a favor del
          negocio.
        </p>
      ) : null}
      <div className="mt-4">
        {standing.payments.length === 0 ? (
          <p className="text-sm text-muted">Sin pagos contra esta recepción.</p>
        ) : (
          <SupplierPaymentsTable
            caption="Pagos de esta recepción"
            payments={standing.payments}
            timeZone={timeZone}
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {!standing.voided && standing.outstanding !== "0.00" ? (
          <Link
            href={`/compras/recepciones/${receiptId}/pagar`}
            className={primaryLinkClass}
          >
            <Icon name="banknote" className="size-4" />
            Registrar un pago
          </Link>
        ) : null}
        {supplierId ? (
          <Link
            href={`/compras/proveedores/${supplierId}/pagar`}
            className={`${linkClass} self-center text-sm`}
          >
            Pago a cuenta del proveedor
          </Link>
        ) : null}
      </div>
    </SectionCard>
  );
}
