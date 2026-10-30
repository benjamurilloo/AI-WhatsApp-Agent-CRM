import { countUpcomingAppointmentsByClient } from "@/modules/appointments";
import { getClientBalances, type ClientBalance } from "@/modules/cash";
import {
  countOpenConversationsByClient,
  searchClientsByLastInteraction,
  type ClientInteractionPage,
} from "@/modules/conversations";
import { countOpenOrdersByClient } from "@/modules/orders";
import { hasCapability, type AuthContext } from "@/modules/organizations";
import {
  countOpenServiceOrdersByClient,
  listClientIdsWithOpenServiceOrders,
} from "@/modules/service";
import { logEvent, newRequestId } from "@/shared/log";
import {
  interactionFilter,
  type ClientFilters,
  type ClientView,
} from "./filters";
import type { OpenWork } from "./list-cells";

// La composición de la lista de clientes (brief-24.4.2, D-1 a D-4): el saldo de cash, los clientes
// con reparaciones abiertas de service, la lista de conversations con sus vistas y, para la página,
// «En curso» de cada módulo. Sin JOIN entre módulos (Overview, «la lista de clientes con sus vistas»).
// Vive aparte de la página para que scripts/medir-caminos.ts mida exactamente este camino (R-1).

export type ClientListData = {
  result: Extract<ClientInteractionPage<ClientView>, { ok: true }>;
  // La vista que se aplicó: una que no se ofrece, en la URL, vale «Todos».
  view: ClientView;
  // Las vistas que se ofrecen, además de «Todos».
  views: Partial<Record<ClientView, ReadonlySet<string>>>;
  openWork: (clientId: string) => OpenWork;
  // null: el saldo no se pudo leer; la columna dice «No disponible», nunca un cero.
  balancesOf: (clientId: string) => ClientBalance[] | null;
};

export async function readClientList(
  context: AuthContext,
  filters: ClientFilters,
  now: Date,
): Promise<ClientListData | null> {
  const [repairs, appointments, balances] = await Promise.all([
    hasCapability(context.organizationId, "repairs"),
    hasCapability(context.organizationId, "appointments"),
    readBalances(context),
  ]);
  const repairIds = repairs
    ? await listClientIdsWithOpenServiceOrders(context)
    : null;

  // Las vistas (D-1): «Con saldo» si se pudo leer el saldo, «Con reparaciones» con repairs.
  const views: Partial<Record<ClientView, ReadonlySet<string>>> = {};
  if (balances !== null) {
    views.with_balance = new Set(
      balances.filter((row) => row.owed !== "0.00").map((row) => row.clientId),
    );
  }
  if (repairIds?.ok) views.with_repairs = repairIds.clientIds;
  const view: ClientView =
    filters.view !== "all" && views[filters.view] ? filters.view : "all";

  const result = await searchClientsByLastInteraction<ClientView>(
    context,
    { ...filters, interaction: interactionFilter(filters.interaction, now) },
    {
      views: views as Record<ClientView, ReadonlySet<string>>,
      view: view === "all" ? null : view,
    },
  );
  if (!result.ok) return null;

  // «En curso» (D-3), solo de los clientes de la página.
  const pageIds = result.clients.map((client) => client.id);
  const [orders, serviceOrders, upcoming, conversations] = await Promise.all([
    countOpenOrdersByClient(context, pageIds),
    repairs ? countOpenServiceOrdersByClient(context, pageIds) : null,
    appointments ? countUpcomingAppointmentsByClient(context, pageIds) : null,
    countOpenConversationsByClient(context, pageIds),
  ]);
  const balancesByClient = new Map<string, ClientBalance[]>();
  for (const row of balances ?? []) {
    const rows = balancesByClient.get(row.clientId);
    if (rows) rows.push(row);
    else balancesByClient.set(row.clientId, [row]);
  }

  return {
    result,
    view,
    views,
    openWork: (clientId) => ({
      repairs: serviceOrders?.ok
        ? serviceOrders.counts.get(clientId)
        : undefined,
      appointments: upcoming?.ok ? upcoming.counts.get(clientId) : undefined,
      orders: orders.ok ? orders.counts.get(clientId) : undefined,
      conversations: conversations.ok
        ? conversations.counts.get(clientId)
        : undefined,
    }),
    balancesOf: (clientId) =>
      balances === null ? null : (balancesByClient.get(clientId) ?? []),
  };
}

// El saldo de la organización (D-2). Si la lectura falla, null: la vista «Con saldo» no se ofrece.
async function readBalances(
  context: AuthContext,
): Promise<ClientBalance[] | null> {
  try {
    const result = await getClientBalances(context);
    return result.ok ? result.balances : null;
  } catch (error) {
    logEvent({
      level: "error",
      requestId: newRequestId(),
      route: "/clientes",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      error,
    });
    return null;
  }
}
