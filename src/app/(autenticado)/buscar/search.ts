import { suggestProducts } from "@/modules/catalog";
import { searchClients, suggestClients } from "@/modules/crm";
import { listOrders } from "@/modules/orders";
import type { AuthContext } from "@/modules/organizations";
import { listPurchaseOrders, listSuppliers } from "@/modules/purchasing";
import { listSales } from "@/modules/sales";
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

type Reader = (
  context: AuthContext,
  text: string,
  mode: SearchMode,
) => Promise<SearchHit[]>;

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
  const settled = await Promise.allSettled(
    kinds.map((kind) => READERS[kind](context, text, mode)),
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
