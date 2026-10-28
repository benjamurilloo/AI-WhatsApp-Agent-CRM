import { listClientAppointments } from "@/modules/appointments";
import { suggestProducts } from "@/modules/catalog";
import { searchClients, suggestClients } from "@/modules/crm";
import { findUnitsBySerial } from "@/modules/inventory";
import { listOrders } from "@/modules/orders";
import type { AuthContext } from "@/modules/organizations";
import { listPurchaseOrders, listSuppliers } from "@/modules/purchasing";
import { listSales } from "@/modules/sales";
import {
  listClientServiceOrders,
  listServiceOrders,
  listServiceOrdersBySerial,
  type ServiceOrderSummary,
} from "@/modules/service";
import { UNIT_STATUS_LABEL } from "@/app/(autenticado)/productos/[productId]/unidades/messages";
import {
  KIND_LABEL,
  STATUS_LABEL as SERVICE_ORDER_STATUS_LABEL,
  UNKNOWN_MODEL_TEXT,
} from "@/app/(autenticado)/reparaciones/messages";
import { warrantyText } from "@/app/(autenticado)/_warranty/warranty-text";
import { formatDayDate } from "@/app/(autenticado)/informacion/horario/messages";
import {
  formatRange,
  STATUS_LABEL as APPOINTMENT_STATUS_LABEL,
} from "@/app/(autenticado)/turnos/messages";
import {
  STATUS_LABEL as ORDER_STATUS_LABEL,
  UNKNOWN_CLIENT_TEXT,
} from "@/app/(autenticado)/pedidos/messages";
import {
  STATUS_LABEL as PURCHASE_ORDER_STATUS_LABEL,
  UNKNOWN_SUPPLIER_TEXT,
} from "@/app/(autenticado)/compras/ordenes/messages";
import {
  CONSUMER_TEXT,
  VOIDED_BADGE_TEXT,
} from "@/app/(autenticado)/ventas/messages";
import {
  composeGroups,
  FOUND_CLIENTS_LIMIT,
  kindsForRole,
  MAX_SEARCH_LENGTH,
  PAGE_LIMIT,
  SUGGEST_LIMIT,
  type SearchHit,
  type SearchKind,
  type SearchResult,
} from "./groups";

// Las lecturas de la búsqueda global (brief-23.3, D-2 y D-4): cada tipo llama a la lectura pública
// de su módulo, que autoriza y filtra por organización como siempre. La aplicación solo junta.
//
// Dos modos: «suggest», la lista que se abre al escribir, y «page», /buscar. Solo cambian los
// clientes: las sugerencias usan suggestClients, que nunca busca por teléfono (D-3), y la página
// usa la búsqueda de la lista, que acepta el teléfono entero. En los dos se muestra solo el nombre.

export type SearchMode = "suggest" | "page";

// `found`: los primeros clientes del grupo Clientes, de los que salen las reparaciones y los turnos
// (brief-24.2, D-3). Si la lectura de clientes falla, es una lista vacía.
type Reader = (
  context: AuthContext,
  text: string,
  mode: SearchMode,
  found: Promise<SearchHit[]>,
) => Promise<SearchHit[]>;

// Una orden de servicio como resultado, por número o por cliente. Una unidad propia no tiene
// cliente: dice su IMEI.
function serviceOrderHit(order: ServiceOrderSummary): SearchHit {
  const who = order.clientName ?? order.unitSerial;
  const claim =
    order.kind === "warranty_claim" ? `${KIND_LABEL.warranty_claim} · ` : "";
  return {
    id: order.id,
    label: order.displayNumber,
    detail: [
      who,
      `${claim}${order.modelName ?? UNKNOWN_MODEL_TEXT}`,
      SERVICE_ORDER_STATUS_LABEL[order.status],
    ]
      .filter(Boolean)
      .join(" · "),
    detailStyle: "text",
    href: `/reparaciones/${order.id}`,
  };
}

// Una lectura que responde FORBIDDEN no debería ocurrir (kindsForRole no la pide); si ocurre, el
// grupo queda vacío, como en la lista de su módulo.
const READERS: Readonly<Record<SearchKind, Reader>> = {
  async clients(context, text, mode) {
    if (mode === "suggest") {
      const result = await suggestClients(context, text);
      if (!result.ok) return [];
      return result.clients.map((client) => ({
        id: client.id,
        label: client.name,
        href: `/clientes/${client.id}`,
      }));
    }
    const result = await searchClients(context, {
      text,
      activity: "active",
      page: 1,
    });
    if (!result.ok) return [];
    return result.clients.map((client) => ({
      id: client.id,
      label: client.displayName,
      href: `/clientes/${client.id}`,
    }));
  },
  // Por el número de la orden, y las de los clientes encontrados, hasta tres de cada uno, en el
  // orden de su ficha. Sin la capacidad, la lectura por número responde NOT_FOUND y no se piden las
  // demás.
  async repairs(context, text, _mode, found) {
    const [byNumber, clients] = await Promise.all([
      listServiceOrders(context, { status: "all", number: text, page: 1 }),
      found,
    ]);
    if (!byNumber.ok) return [];
    // Una lectura por cliente que falla deja afuera solo sus órdenes, no las encontradas por número.
    const perClient = await Promise.allSettled(
      clients.map((client) => listClientServiceOrders(context, client.id)),
    );
    const orders = [
      ...byNumber.orders,
      ...perClient.flatMap((outcome) =>
        outcome.status === "fulfilled" && outcome.value.ok
          ? outcome.value.orders.slice(0, SUGGEST_LIMIT)
          : [],
      ),
    ];
    const seen = new Set<string>();
    return orders
      .filter((order) => !seen.has(order.id) && seen.add(order.id))
      .map(serviceOrderHit);
  },
  // Los turnos de los clientes encontrados, hasta tres de cada uno, en el orden de su ficha. Sin la
  // capacidad, cada lectura responde NOT_FOUND y el grupo queda vacío.
  async appointments(context, _text, _mode, found) {
    const clients = await found;
    const perClient = await Promise.all(
      clients.map(async (client) => ({
        client,
        result: await listClientAppointments(context, client.id),
      })),
    );
    return perClient.flatMap(({ client, result }) =>
      result.ok
        ? result.appointments
            .slice(0, SUGGEST_LIMIT)
            .map((item): SearchHit => ({
              id: item.id,
              label: `${formatDayDate(item.date)}, ${formatRange(item.start, item.end)}`,
              // Un motivo que ya no se encuentra llega vacío y no deja un separador suelto.
              detail: [
                client.label,
                item.reasonName,
                APPOINTMENT_STATUS_LABEL[item.status],
              ]
                .filter(Boolean)
                .join(" · "),
              detailStyle: "text",
              href: `/turnos/${item.id}`,
            }))
        : [],
    );
  },
  async orders(context, text) {
    const result = await listOrders(context, {
      status: "all",
      clientId: null,
      number: text,
      page: 1,
    });
    if (!result.ok) return [];
    return result.orders.map((order) => ({
      id: order.id,
      label: order.displayNumber,
      detail: `${order.clientName ?? UNKNOWN_CLIENT_TEXT} · ${ORDER_STATUS_LABEL[order.status]}`,
      detailStyle: "text",
      href: `/pedidos/${order.id}`,
    }));
  },
  async products(context, text) {
    const result = await suggestProducts(context, text);
    if (!result.ok) return [];
    return result.products.map((product) => ({
      id: product.id,
      label: product.name,
      detail: product.sku,
      detailStyle: "code",
      href: `/productos/${product.id}`,
    }));
  },
  // Las unidades y las órdenes de clientes con ese IMEI exacto. Sin la capacidad, cada lectura responde
  // NOT_FOUND y su parte queda vacía.
  async devices(context, text) {
    const [units, orders] = await Promise.all([
      findUnitsBySerial(context, text),
      listServiceOrdersBySerial(context, text),
    ]);
    const unitHits: SearchHit[] = (units.ok ? units.units : []).map((unit) => ({
      id: unit.id,
      label: unit.serial,
      detail: `${unit.productName} · ${unit.warranty ? warrantyText(unit.warranty) : UNIT_STATUS_LABEL[unit.status]}`,
      detailStyle: "text",
      href: `/productos/${unit.productId}/unidades`,
    }));
    const orderHits: SearchHit[] = (orders.ok ? orders.orders : []).map(
      (order) => ({
        id: order.id,
        label: order.displayNumber,
        // Un reclamo de garantía lo dice (brief-29.9.2, D-5).
        detail: `${order.kind === "warranty_claim" ? `${KIND_LABEL.warranty_claim} · ` : ""}${order.modelName ?? UNKNOWN_MODEL_TEXT} · ${order.warranty ? warrantyText(order.warranty) : SERVICE_ORDER_STATUS_LABEL[order.status]}`,
        detailStyle: "text",
        href: `/reparaciones/${order.id}`,
      }),
    );
    return [...unitHits, ...orderHits];
  },
  async sales(context, text) {
    const result = await listSales(context, {
      clientId: null,
      number: text,
      status: "all",
      from: "",
      to: "",
      page: 1,
    });
    if (!result.ok) return [];
    return result.sales.map((sale) => {
      const client =
        sale.clientName ??
        (sale.clientId === null ? CONSUMER_TEXT : UNKNOWN_CLIENT_TEXT);
      const voided = sale.voidDisplayNumber
        ? ` · ${VOIDED_BADGE_TEXT} (${sale.voidDisplayNumber})`
        : "";
      return {
        id: sale.id,
        label: sale.displayNumber,
        detail: `${client}${voided}`,
        detailStyle: "text",
        href: `/ventas/${sale.id}`,
      };
    });
  },
  async purchaseOrders(context, text) {
    const result = await listPurchaseOrders(context, {
      status: "all",
      supplierId: null,
      number: text,
      page: 1,
    });
    if (!result.ok) return [];
    return result.orders.map((order) => ({
      id: order.id,
      label: order.displayNumber,
      detail: `${order.supplierName || UNKNOWN_SUPPLIER_TEXT} · ${PURCHASE_ORDER_STATUS_LABEL[order.status]}`,
      detailStyle: "text",
      href: `/compras/ordenes/${order.id}`,
    }));
  },
  async suppliers(context, text) {
    const result = await listSuppliers(context, {
      text,
      status: "active",
      page: 1,
    });
    if (!result.ok) return [];
    return result.suppliers.map((supplier) => ({
      id: supplier.id,
      label: supplier.name,
      href: `/compras/proveedores/${supplier.id}`,
    }));
  },
};

export function normalizeSearchText(text: unknown): string {
  return typeof text === "string"
    ? text.trim().slice(0, MAX_SEARCH_LENGTH)
    : "";
}

// Las lecturas van en paralelo; una que falla no arrastra a las otras (D-4, AC-5). Quien llama
// registra `failed` y el primer error, sin el texto buscado.
export async function searchEverything(
  context: AuthContext,
  text: string,
  mode: SearchMode,
): Promise<SearchResult & { error?: unknown }> {
  const kinds = kindsForRole(context.role);
  const clients = READERS.clients(context, text, mode, Promise.resolve([]));
  // Los primeros clientes, para las reparaciones y los turnos; si su lectura falla, ninguno.
  const found = clients.then(
    (hits) => hits.slice(0, FOUND_CLIENTS_LIMIT),
    (): SearchHit[] => [],
  );
  const settled = await Promise.allSettled(
    kinds.map((kind) =>
      kind === "clients" ? clients : READERS[kind](context, text, mode, found),
    ),
  );
  const result = composeGroups(
    text,
    kinds,
    settled,
    mode === "suggest" ? SUGGEST_LIMIT : PAGE_LIMIT,
  );
  const rejected = settled.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  return rejected ? { ...result, error: rejected.reason } : result;
}
