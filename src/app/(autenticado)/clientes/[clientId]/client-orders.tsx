import Link from "next/link";
import { listRecentClientOrders } from "@/modules/orders";
import type { AuthContext } from "@/modules/organizations";
import { linkClass, primaryLinkClass } from "@/app/_components/form-styles";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { NO_CLIENT_ORDERS_MESSAGE } from "@/app/(autenticado)/pedidos/messages";
import { OrderStatusBadge } from "@/app/(autenticado)/pedidos/status-badge";

// Los últimos pedidos del cliente en su ficha (brief-19.2, D-8): número, fecha, estado y total,
// un enlace a la lista filtrada por el cliente y, para admin con el cliente activo, el alta con
// el cliente ya elegido.
export async function ClientOrders({
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
  const result = await listRecentClientOrders(context, clientId);
  const canCreate = context.role === "admin" && clientActive;
  return (
    <div className="flex flex-col gap-4">
      {!result.ok || result.total === 0 ? (
        <p className="text-sm text-muted">{NO_CLIENT_ORDERS_MESSAGE}</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {result.orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <Link
                    href={`/pedidos/${order.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {order.displayNumber}
                  </Link>
                  <span className="block text-sm text-muted">
                    {formatShortDateTime(order.createdAt, timeZone)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">
                    {formatMoney(order.total, order.currency)}
                  </span>
                  <OrderStatusBadge status={order.status} />
                </span>
              </li>
            ))}
          </ul>
          {result.total > result.orders.length ? (
            <p className="text-sm">
              <Link href={`/pedidos?cliente=${clientId}`} className={linkClass}>
                Ver los {result.total} pedidos
              </Link>
            </p>
          ) : (
            <p className="text-sm">
              <Link href={`/pedidos?cliente=${clientId}`} className={linkClass}>
                Ver en la lista de pedidos
              </Link>
            </p>
          )}
        </>
      )}
      {canCreate ? (
        <p>
          <Link
            href={`/pedidos/nuevo?cliente=${clientId}`}
            className={primaryLinkClass}
          >
            + Nuevo pedido
          </Link>
        </p>
      ) : null}
    </div>
  );
}
