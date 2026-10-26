import Link from "next/link";
import type { AuthContext } from "@/modules/organizations";
import { listClientServiceOrders } from "@/modules/service";
import { linkClass, primaryLinkClass } from "@/app/_components/form-styles";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { UNKNOWN_MODEL_TEXT } from "@/app/(autenticado)/reparaciones/messages";
import { ServiceOrderStatusBadge } from "@/app/(autenticado)/reparaciones/sub-nav";
import { warrantyText } from "@/app/(autenticado)/_warranty/warranty-text";

// Las últimas órdenes de servicio del cliente en su ficha (brief-29.6, D-10), como sus pedidos: número,
// modelo, fecha y estado, y para un admin con el cliente activo, el alta con el cliente ya elegido. Sin
// la capacidad repairs, la sección no aparece. Desde la 29.9 (brief-29.9, D-3), una orden entregada
// reparada dice su garantía.
export async function ClientServiceOrders({
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
  const result = await listClientServiceOrders(context, clientId);
  if (!result.ok) return null;
  const canCreate = context.role === "admin" && clientActive;
  return (
    <SectionCard id="reparaciones-titulo" title="Reparaciones" icon="wrench">
      <div className="flex flex-col gap-4">
        {result.total === 0 ? (
          <p className="text-sm text-muted">
            Este cliente no tiene órdenes de servicio.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {result.orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <Link
                    href={`/reparaciones/${order.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {order.displayNumber}
                  </Link>
                  <span className="block text-sm text-muted">
                    {order.modelName ?? UNKNOWN_MODEL_TEXT} ·{" "}
                    {formatShortDateTime(order.createdAt, timeZone)}
                    {order.warranty ? ` · ${warrantyText(order.warranty)}` : ""}
                  </span>
                </span>
                <ServiceOrderStatusBadge status={order.status} />
              </li>
            ))}
          </ul>
        )}
        {result.total > result.orders.length ? (
          <p className="text-sm text-muted">
            Se muestran las {result.orders.length} más recientes de{" "}
            {result.total}.
          </p>
        ) : null}
        {canCreate ? (
          <p>
            <Link
              href={`/reparaciones/nueva?cliente=${clientId}`}
              className={primaryLinkClass}
            >
              + Nueva orden de servicio
            </Link>
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
