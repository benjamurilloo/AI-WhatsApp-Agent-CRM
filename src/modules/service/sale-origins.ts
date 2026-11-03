import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { authorize, type AuthContext } from "@/modules/organizations";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { serviceOrders } from "./schema";
import { repairsAllowed } from "./repair-list";
import { formatServiceOrderNumber } from "./service-orders";

// El origen de una venta que salió de una orden de servicio (brief-24.6.2-b, D-3): el número de la
// orden, «OS-000123», para un lote de ventas y en **una sola consulta**.
//
// Por qué está acá y no al revés: `sales` **no conoce** `service`. Lo dice `DataModel.md:1441` —«la
// orden apunta a la venta»— y lo vigilan las guardas `service-dependencies` y `service-writes`.
// `service_orders.sale_id` es la FK, y es `UNIQUE`, así que una venta tiene como máximo una orden. El
// listado de ventas **compone** el origen llamando a esta función, como compone lo cobrado llamando a
// `cash`; ningún módulo gana una dependencia nueva.
//
// Detrás de la capacidad `repairs` (ADR 0024, puntos 7 y 10): sin ella **no se ejecuta ninguna
// consulta** y el listado distingue mostrador y pedido, como antes de esta subfase.
//
// La consulta vive en este archivo, no en `repository.ts`, siguiendo lo que ya hace `warranties.ts`
// en este mismo módulo. Usa el índice `(organization_id, sale_id)` de la FK.

type Executor = Db | DbTransaction;

export type SaleOrigin = {
  serviceOrderId: string;
  number: number;
  // «OS-000123».
  displayNumber: string;
};

export async function getSaleOrigins(
  context: AuthContext,
  saleIds: string[],
  executor: Executor = getDb(),
): Promise<Map<string, SaleOrigin>> {
  const signedIn = authorize(context, {});
  // Sin sesión no hay orígenes, y sin ventas tampoco: ni una consulta en los dos casos.
  if (!signedIn.ok) return new Map();
  if (saleIds.length === 0) return new Map();
  if (!(await repairsAllowed(context))) return new Map();
  const rows = await executor
    .select({
      id: serviceOrders.id,
      number: serviceOrders.number,
      saleId: serviceOrders.saleId,
    })
    .from(serviceOrders)
    .where(
      and(
        eq(serviceOrders.organizationId, context.organizationId),
        isNotNull(serviceOrders.saleId),
        inArray(serviceOrders.saleId, saleIds),
      ),
    );
  const origins = new Map<string, SaleOrigin>();
  for (const row of rows) {
    if (row.saleId === null) continue;
    origins.set(row.saleId, {
      serviceOrderId: row.id,
      number: row.number,
      displayNumber: formatServiceOrderNumber(row.number),
    });
  }
  return origins;
}
