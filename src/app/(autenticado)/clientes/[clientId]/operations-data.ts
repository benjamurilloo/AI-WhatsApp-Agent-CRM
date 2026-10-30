import {
  listClientOperationAppointments,
  type ClientOperationAppointment,
} from "@/modules/appointments";
import {
  listClientOperationOrders,
  type ClientOperationOrder,
} from "@/modules/orders";
import { hasCapability, type AuthContext } from "@/modules/organizations";
import {
  listClientOperationSales,
  type ClientOperationSale,
} from "@/modules/sales";
import {
  listClientOperationServiceOrders,
  type ClientOperationServiceOrder,
} from "@/modules/service";
import {
  listClientOperationTradeIns,
  type ClientOperationTradeIn,
} from "@/modules/tradeins";
import { logEvent, newRequestId } from "@/shared/log";
import type { OperationSources, OperationType } from "./operations-rows";

// Las lecturas de Operaciones y Actividad (brief-24.4.3, D-2): una por módulo, cada una con su rol y su
// capacidad, sin JOIN entre módulos. Vive aparte de la página para que scripts/medir-caminos.ts mida
// este mismo camino (R-1). Un módulo que falla no se muestra en cero: queda en failed.

export type ClientOperationsData = {
  sources: OperationSources;
  // La cantidad real de cada tipo que se leyó; un tipo sin capacidad o que falló no está.
  totals: Partial<Record<OperationType, number>>;
  failed: OperationType[];
  capabilities: {
    repairs: boolean;
    appointments: boolean;
    tradeIns: boolean;
  };
};

// Una lectura que tira o devuelve un rechazo vale null, y queda en el log.
export async function readOrNull<T extends { ok: boolean }>(
  context: AuthContext,
  work: () => Promise<T>,
): Promise<Extract<T, { ok: true }> | null> {
  try {
    const result = await work();
    return result.ok ? (result as Extract<T, { ok: true }>) : null;
  } catch (error) {
    logEvent({
      level: "error",
      requestId: newRequestId(),
      route: "/clientes/[clientId]",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      error,
    });
    return null;
  }
}

export async function readClientOperations(
  context: AuthContext,
  clientId: string,
): Promise<ClientOperationsData> {
  const [repairs, appointments, tradeIns] = await Promise.all([
    hasCapability(context.organizationId, "repairs"),
    hasCapability(context.organizationId, "appointments"),
    hasCapability(context.organizationId, "trade_ins"),
  ]);
  const [sales, orders, serviceOrders, clientAppointments, clientTradeIns] =
    await Promise.all([
      readOrNull(context, () => listClientOperationSales(context, clientId)),
      readOrNull(context, () => listClientOperationOrders(context, clientId)),
      repairs
        ? readOrNull(context, () =>
            listClientOperationServiceOrders(context, clientId),
          )
        : undefined,
      appointments
        ? readOrNull(context, () =>
            listClientOperationAppointments(context, clientId),
          )
        : undefined,
      tradeIns
        ? readOrNull(context, () =>
            listClientOperationTradeIns(context, clientId),
          )
        : undefined,
    ]);

  const totals: Partial<Record<OperationType, number>> = {};
  const failed: OperationType[] = [];
  const note = (
    type: OperationType,
    result: { total: number } | null | undefined,
  ) => {
    if (result === null) failed.push(type);
    else if (result !== undefined) totals[type] = result.total;
  };
  note("venta", sales);
  note("pedido", orders);
  note("reparacion", serviceOrders);
  note("turno", clientAppointments);
  note("usado", clientTradeIns);

  return {
    sources: {
      sales: (sales?.sales ?? []) satisfies ClientOperationSale[],
      orders: (orders?.orders ?? []) satisfies ClientOperationOrder[],
      serviceOrders: (serviceOrders?.orders ??
        []) satisfies ClientOperationServiceOrder[],
      appointments: (clientAppointments?.appointments ??
        []) satisfies ClientOperationAppointment[],
      tradeIns: (clientTradeIns?.tradeIns ??
        []) satisfies ClientOperationTradeIn[],
    },
    totals,
    failed,
    capabilities: { repairs, appointments, tradeIns },
  };
}
