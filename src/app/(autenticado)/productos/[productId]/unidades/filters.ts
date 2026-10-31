import type { UnitStatus } from "@/modules/inventory";
import type { SearchParams } from "../../filters";

// Los parámetros de la pantalla de unidades (brief-24.5.2, D-2, D-5 y D-7):
// `?estado=`, `?imei=` y `?pagina=` para la lista, y `?unidad=<id>` con `?vista=` para el panel.
// Los que ya existían —`?baja=`, `?corregir=`, `?reparar=`, `?garantia=` y `?aviso=`— no se tocan:
// se comprobó que ninguno colisiona. `?unidad=` tampoco: lo usa `/turnos/nuevo`, que es otra ruta.
//
// **Un valor desconocido se reemplaza por el de defecto y nunca da error**, que es la convención
// que `productos/filters.ts` ya fijó para esta parte de la aplicación.

// El tope del serial en la base (UNIT_SERIAL_MAX_LENGTH de inventory/schema): acotar acá evita
// mandarle a la consulta un texto de cualquier largo.
const MAX_SERIAL_LENGTH = 32;

// Los estados en la URL. En español y en plural, como el resto de los filtros del proyecto.
export const STATUS_PARAM: Record<string, UnitStatus> = {
  disponibles: "available",
  reservadas: "reserved",
  vendidas: "sold",
  reparacion: "in_repair",
  revision: "in_review",
  bajas: "written_off",
};

// El camino inverso, para armar los enlaces sin repetir la tabla.
export const STATUS_VALUE: Record<UnitStatus, string> = Object.fromEntries(
  Object.entries(STATUS_PARAM).map(([value, status]) => [status, value]),
) as Record<UnitStatus, string>;

// El orden en que se ofrecen los chips del filtro: primero lo vendible, después lo que está en el
// local fuera del saldo, y al final lo que ya salió. No es el orden del enum, que pone «dada de
// baja» segunda.
//
// El tipo es `Record<UnitStatus, number>` a propósito: **si el enum suma un estado, esto no
// compila**. Un array suelto habría dejado el estado nuevo sin chip y sin aviso, que es la clase de
// hueco silencioso que la 24.5.1 aprendió a no dejar.
const STATUS_RANK: Record<UnitStatus, number> = {
  available: 0,
  reserved: 1,
  in_repair: 2,
  in_review: 3,
  sold: 4,
  written_off: 5,
};

export const STATUS_ORDER: UnitStatus[] = (
  Object.keys(STATUS_RANK) as UnitStatus[]
).sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b]);

// Las dos pestañas del panel de la unidad (lámina 14).
export const PANEL_VIEWS = ["detalle", "historial"] as const;
export type UnitPanelView = (typeof PANEL_VIEWS)[number];

export type UnitFilters = {
  // null es «todas»: la ausencia del parámetro no filtra.
  status: UnitStatus | null;
  serial: string;
  page: number;
  // El panel abierto, si hay uno. No se valida que el id exista: eso lo resuelve la lectura.
  unitId: string | null;
  view: UnitPanelView;
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function readUnitFilters(query: SearchParams): UnitFilters {
  const status = single(query.estado);
  const page = single(query.pagina);
  const view = single(query.vista);
  return {
    status:
      status && Object.hasOwn(STATUS_PARAM, status)
        ? STATUS_PARAM[status]!
        : null,
    serial: (single(query.imei) ?? "").trim().slice(0, MAX_SERIAL_LENGTH),
    page: page && /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
    unitId: single(query.unidad) ?? null,
    view:
      view && (PANEL_VIEWS as readonly string[]).includes(view)
        ? (view as UnitPanelView)
        : "detalle",
  };
}

// Los parámetros de la lista, para que un enlace conserve el recorrido. `pagina` no se arrastra
// cuando cambia el filtro o la búsqueda: con otro conjunto de resultados, la página 3 no significa
// lo mismo.
export function listParams(
  filters: UnitFilters,
  overrides: Partial<Pick<UnitFilters, "status" | "serial" | "page">> = {},
): URLSearchParams {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.status) params.set("estado", STATUS_VALUE[merged.status]);
  if (merged.serial) params.set("imei", merged.serial);
  if (merged.page > 1) params.set("pagina", String(merged.page));
  return params;
}

// El enlace a la lista con un filtro, una búsqueda o una página distintos.
export function listHref(
  base: string,
  filters: UnitFilters,
  overrides: Partial<Pick<UnitFilters, "status" | "serial" | "page">> = {},
): string {
  const params = listParams(filters, overrides);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

// El enlace que abre el panel de una unidad, conservando el filtro, la búsqueda y la página: cerrar
// el panel tiene que volver exactamente a la lista que se estaba mirando (brief-24.5.2, D-2).
export function panelHref(
  base: string,
  filters: UnitFilters,
  unitId: string,
  view: UnitPanelView = "detalle",
): string {
  const params = listParams(filters);
  params.set("unidad", unitId);
  if (view !== "detalle") params.set("vista", view);
  return `${base}?${params.toString()}#unidad-titulo`;
}
