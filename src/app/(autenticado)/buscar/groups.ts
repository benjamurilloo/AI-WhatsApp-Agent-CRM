import type { RemoteSuggestion } from "@/app/_components/suggest-filter";

// La búsqueda global (brief-23.3): seis tipos, desde la 29.9 los equipos por IMEI (brief-29.9, U-3),
// y desde la 24.2 las reparaciones y los turnos (brief-24.2, D-3), cada uno con la lectura y el
// permiso de su módulo (D-2). Este archivo solo junta y da forma, sin leer nada: lo que se prueba sin
// base.

export type SearchKind =
  | "clients"
  | "repairs"
  | "appointments"
  | "orders"
  | "products"
  | "devices"
  | "sales"
  | "purchaseOrders"
  | "suppliers";

export type SearchHit = {
  id: string;
  label: string;
  detail?: string;
  // El SKU se muestra como código; el cliente y el estado, como texto.
  detailStyle?: "code" | "text";
  href: string;
};

export type SearchGroup = {
  kind: SearchKind;
  title: string;
  hits: SearchHit[];
  // «Ver todos en …»: la lista del módulo con la búsqueda puesta. Null si el tipo no tiene lista.
  moreHref: string | null;
  moreLabel: string;
};

export type SearchResult = {
  // Solo los grupos con resultados, en el orden de SEARCH_KINDS.
  groups: SearchGroup[];
  // Los tipos cuya lectura falló: sus grupos no se muestran, los demás sí (D-4).
  failed: SearchKind[];
};

// El orden de los grupos (D-1). Desde la 24.2, las reparaciones y los turnos van después de los
// clientes, porque la mayoría sale de ellos (brief-24.2, D-3).
export const SEARCH_KINDS: readonly SearchKind[] = [
  "clients",
  "repairs",
  "appointments",
  "orders",
  "products",
  "devices",
  "sales",
  "purchaseOrders",
  "suppliers",
];

// Compras y proveedores son solo de admin (H-1c): para un viewer no se piden.
const ADMIN_ONLY: ReadonlySet<SearchKind> = new Set([
  "purchaseOrders",
  "suppliers",
]);

export function kindsForRole(role: string): SearchKind[] {
  return SEARCH_KINDS.filter(
    (kind) => role === "admin" || !ADMIN_ONLY.has(kind),
  );
}

// Cuántos por tipo: tres en la lista que se abre al escribir, ocho en /buscar (D-1).
export const SUGGEST_LIMIT = 3;
export const PAGE_LIMIT = 8;

// De cuántos clientes encontrados se leen las reparaciones y los turnos (brief-24.2, D-3, R-1).
export const FOUND_CLIENTS_LIMIT = 3;

// Lo que se lee de lo que escribe quien busca, como en las sugerencias de cada módulo (H-2).
export const MAX_SEARCH_LENGTH = 100;

type KindText = {
  title: string;
  // Lo que dice cada opción para un lector de pantalla que no anuncia el grupo (D-5, R-3).
  spoken: string;
  moreLabel: string;
  moreHref: ((text: string) => string) | null;
};

function listHref(path: string, param: string) {
  return (text: string) => `${path}?${new URLSearchParams({ [param]: text })}`;
}

export const KIND_TEXT: Readonly<Record<SearchKind, KindText>> = {
  clients: {
    title: "Clientes",
    spoken: "cliente",
    moreLabel: "Ver todos en Clientes",
    moreHref: listHref("/clientes", "q"),
  },
  // Por el número de la orden y las de los clientes encontrados (brief-24.2, D-3). Sin lista que
  // las reúna: /buscar muestra el grupo entero.
  repairs: {
    title: "Reparaciones",
    spoken: "reparación",
    moreLabel: "",
    moreHref: null,
  },
  // Los turnos de los clientes encontrados: un turno no tiene número (brief-24.2, H-3).
  appointments: {
    title: "Turnos",
    spoken: "turno",
    moreLabel: "",
    moreHref: null,
  },
  orders: {
    title: "Pedidos",
    spoken: "pedido",
    moreLabel: "Ver todos en Pedidos",
    moreHref: listHref("/pedidos", "numero"),
  },
  products: {
    title: "Productos",
    spoken: "producto",
    moreLabel: "Ver todos en Productos",
    moreHref: listHref("/productos", "q"),
  },
  // Las unidades y las órdenes de equipos de clientes con ese IMEI, con su garantía (brief-29.9, U-3).
  // No hay una lista de equipos: /buscar muestra el grupo entero (las unidades de un IMEI y hasta 20
  // órdenes), y Enter en las sugerencias lleva ahí.
  devices: {
    title: "Equipos",
    spoken: "equipo",
    moreLabel: "",
    moreHref: null,
  },
  sales: {
    title: "Ventas",
    spoken: "venta",
    moreLabel: "Ver todas en Ventas",
    moreHref: listHref("/ventas", "numero"),
  },
  purchaseOrders: {
    title: "Compras",
    spoken: "orden de compra",
    moreLabel: "Ver todas en Compras",
    moreHref: listHref("/compras/ordenes", "numero"),
  },
  suppliers: {
    title: "Proveedores",
    spoken: "proveedor",
    moreLabel: "Ver todos en Proveedores",
    moreHref: listHref("/compras/proveedores", "q"),
  },
};

// Lo que se puede buscar, para el subtítulo del diálogo (brief-24.2, D-6): solo los tipos que el
// rol y las capacidades de la organización dejan ver. Los equipos existen con unidades o con
// reparaciones.
export function searchScopeText(
  role: string,
  capabilities: readonly string[],
): string {
  const has = (capability: string) => capabilities.includes(capability);
  const parts = [
    "clientes",
    ...(has("repairs") ? ["reparaciones"] : []),
    ...(has("appointments") ? ["turnos"] : []),
    "pedidos",
    "productos",
    ...(has("serialized_units") || has("repairs") ? ["equipos por IMEI"] : []),
    "ventas",
    ...(role === "admin" ? ["compras", "proveedores"] : []),
  ];
  const last = parts.pop()!;
  const text = `${parts.join(", ")} y ${last}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Junta lo que devolvió cada lectura: un tipo que falló queda en `failed` y fuera de los grupos;
// uno sin resultados, fuera de los dos.
export function composeGroups(
  text: string,
  kinds: readonly SearchKind[],
  settled: readonly PromiseSettledResult<SearchHit[]>[],
  limit: number,
): SearchResult {
  const groups: SearchGroup[] = [];
  const failed: SearchKind[] = [];
  kinds.forEach((kind, index) => {
    const outcome = settled[index];
    if (!outcome || outcome.status === "rejected") {
      failed.push(kind);
      return;
    }
    const { title, moreLabel, moreHref } = KIND_TEXT[kind];
    // Un tipo sin lista no se corta en /buscar: es el único lugar donde se ve entero.
    const hits =
      moreHref || limit === SUGGEST_LIMIT
        ? outcome.value.slice(0, limit)
        : outcome.value;
    if (hits.length === 0) return;
    groups.push({
      kind,
      title,
      hits,
      moreHref: moreHref ? moreHref(text) : null,
      moreLabel,
    });
  });
  const order = (group: SearchGroup) => SEARCH_KINDS.indexOf(group.kind);
  groups.sort((a, b) => order(a) - order(b));
  return { groups, failed };
}

// Las opciones del combobox de la barra: cada una con su grupo y su tipo dicho.
export function toSuggestions(
  groups: readonly SearchGroup[],
): RemoteSuggestion[] {
  return groups.flatMap((group) =>
    group.hits.map((hit) => ({
      id: `${group.kind}:${hit.id}`,
      label: hit.label,
      detail: hit.detail,
      detailStyle: hit.detailStyle,
      href: hit.href,
      group: group.title,
      spokenKind: KIND_TEXT[group.kind].spoken,
    })),
  );
}
