import Link from "next/link";
import type { AuthContext } from "@/modules/organizations";
import { listClientTradeIns } from "@/modules/tradeins";
import { linkClass, primaryLinkClass } from "@/app/_components/form-styles";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import {
  DESTINATION_SHORT_LABEL,
  UNKNOWN_PRODUCT_TEXT,
} from "@/app/(autenticado)/usados/messages";
import { TradeInStatusBadge } from "@/app/(autenticado)/usados/sub-nav";

// Los últimos usados que entregó el cliente en su ficha (brief-29.7, D-7), como sus reparaciones:
// número, producto, destino, fecha y estado, y para un admin con el cliente activo, la recepción con el
// cliente ya elegido. Sin la capacidad trade_ins, la sección no aparece.
export async function ClientTradeIns({
  context,
  clientId,
  clientActive,
  timeZone,
}: {
  context: AuthContext;
  clientId: string;
  clientActive: boolean;
  timeZone: string;
}) {
  const result = await listClientTradeIns(context, clientId);
  if (!result.ok) return null;
  const canCreate = context.role === "admin" && clientActive;
  return (
    <SectionCard id="usados-titulo" title="Usados entregados" icon="smartphone">
      <div className="flex flex-col gap-4">
        {result.total === 0 ? (
          <p className="text-sm text-muted">
            Este cliente no entregó ningún usado.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {result.tradeIns.map((tradeIn) => (
              <li
                key={tradeIn.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <Link
                    href={`/usados/${tradeIn.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {tradeIn.displayNumber}
                  </Link>
                  <span className="block text-sm text-muted">
                    {tradeIn.productName ?? UNKNOWN_PRODUCT_TEXT} ·{" "}
                    {DESTINATION_SHORT_LABEL[tradeIn.destination]} ·{" "}
                    {formatShortDateTime(tradeIn.createdAt, timeZone)}
                  </span>
                </span>
                <TradeInStatusBadge
                  voided={tradeIn.voidDisplayNumber !== null}
                />
              </li>
            ))}
          </ul>
        )}
        {result.total > result.tradeIns.length ? (
          <p className="text-sm text-muted">
            Se muestran los {result.tradeIns.length} más recientes de{" "}
            {result.total}.
          </p>
        ) : null}
        {canCreate ? (
          <p>
            <Link
              href={`/usados/nuevo?cliente=${clientId}`}
              className={primaryLinkClass}
            >
              + Recibir un usado
            </Link>
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
