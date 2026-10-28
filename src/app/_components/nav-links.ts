import type { IconName } from "./icons";

// Secciones del marco, en grupos por tarea (brief-24.1, D-1): las comparten el panel lateral, la
// barra inferior del teléfono y las migas.

export type NavLink = { href: string; label: string; icon: IconName };

// Un grupo sin nombre es el de Inicio, que va arriba y sin título.
export type NavGroup = { id: string; label: string | null; links: NavLink[] };

// Destinos fijos de la barra inferior, con las etiquetas cortas de los mockups (brief-23.1, D-7):
// el nombre accesible es la etiqueta visible. El resto va dentro de «Más».
export const BOTTOM_BAR: readonly NavLink[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/conversaciones", label: "Chats", icon: "messageCircle" },
  { href: "/clientes", label: "Clientes", icon: "users" },
  { href: "/ventas", label: "Ventas", icon: "receipt" },
];

// Rutas que no tienen un ítem propio y viven dentro de otra sección: el cobro y la devolución son
// comprobantes de la caja (brief-21.3 y brief-21.5).
const ALIASES: Record<string, string> = {
  "/cobros": "/caja",
  "/devoluciones": "/caja",
};

// Los grupos que se muestran: los que tienen al menos un destino visible para el rol.
export function visibleGroups(groups: readonly NavGroup[]): NavGroup[] {
  return groups.filter((group) => group.links.length > 0);
}

export function allLinks(groups: readonly NavGroup[]): NavLink[] {
  return groups.flatMap((group) => group.links);
}

function covers(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// El destino al que pertenece una ruta: el de prefijo más largo (brief-24.1, H-3), así
// /compras/recepciones/1 es Recepciones y /compras/a-pagar sigue siendo Compras. El cobro y la
// devolución pasan por su alias. Null si la ruta no está en el menú del rol.
export function currentLink(
  pathname: string,
  groups: readonly NavGroup[],
): { link: NavLink; group: NavGroup } | null {
  const first = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
  const path = ALIASES[first] ?? pathname;
  let best: { link: NavLink; group: NavGroup } | null = null;
  for (const group of groups) {
    for (const link of group.links) {
      if (!covers(path, link.href)) continue;
      if (best === null || link.href.length > best.link.href.length) {
        best = { link, group };
      }
    }
  }
  return best;
}

export function isCurrent(
  pathname: string,
  href: string,
  groups: readonly NavGroup[],
): boolean {
  return currentLink(pathname, groups)?.link.href === href;
}

// Niveles de las migas (brief-24.1, D-4): el grupo, como texto, y el destino. `exact` dice si la
// ruta es la portada del destino, que entonces es la página actual.
export function crumbFor(
  pathname: string,
  groups: readonly NavGroup[],
): {
  group: string | null;
  href: string;
  label: string;
  exact: boolean;
} | null {
  const current = currentLink(pathname, groups);
  if (current === null) return null;
  return {
    group: current.group.label,
    href: current.link.href,
    label: current.link.label,
    exact: pathname === current.link.href,
  };
}

// Lo que va dentro de «Más» (brief-24.1, D-3): los destinos del rol que no están en la barra,
// bajo su grupo. Los grupos que quedan vacíos no aparecen.
export function moreGroups(groups: readonly NavGroup[]): NavGroup[] {
  return visibleGroups(
    groups.map((group) => ({
      ...group,
      links: group.links.filter(
        (link) => !BOTTOM_BAR.some((fixed) => fixed.href === link.href),
      ),
    })),
  );
}

// Los formularios en los que se retira la barra inferior (brief-24.1, D-7): el último segmento de
// la ruta, o la edición en la misma ficha (`?editar=1`). Una ruta que no está acá conserva la barra.
const FORM_SEGMENTS = new Set([
  "nuevo",
  "nueva",
  "editar",
  "cobrar",
  "devolver",
  "senar",
  "pagar",
  "pago",
  "abrir",
  "cerrar",
  "movimiento",
  "anulacion",
  "anular",
  "reclamo",
]);

export function hidesBottomBar(pathname: string, editing = false): boolean {
  if (editing) return true;
  const segments = pathname.split("/").filter(Boolean);
  // El hilo de una conversación.
  if (segments.length === 2 && segments[0] === "conversaciones") return true;
  const last = segments.at(-1);
  return last !== undefined && FORM_SEGMENTS.has(last);
}
