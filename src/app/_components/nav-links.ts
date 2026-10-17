import type { IconName } from "./icons";

// Secciones del marco (brief-23.1, D-4): las comparten el panel lateral, la barra inferior del
// teléfono y las migas.

export type NavLink = { href: string; label: string; icon: IconName };

// Destinos fijos de la barra inferior, con las etiquetas cortas de los mockups (D-7): el nombre
// accesible es la etiqueta visible. El resto va dentro de «Más».
export const BOTTOM_BAR: readonly {
  href: string;
  label: string;
  icon: IconName;
}[] = [
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

function firstSegment(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment === undefined ? "/" : `/${segment}`;
}

// La sección a la que pertenece una ruta: la del menú o la de su alias. "/" es el dashboard.
export function sectionHref(pathname: string): string {
  const first = firstSegment(pathname);
  return ALIASES[first] ?? first;
}

export function isCurrent(pathname: string, href: string): boolean {
  return sectionHref(pathname) === href;
}

// Nivel de las migas (D-6): la sección de la ruta, o null si la ruta no está en el menú del rol.
// `exact` dice si la ruta es la portada de la sección, que entonces es la página actual.
export function crumbFor(
  pathname: string,
  links: readonly NavLink[],
): { href: string; label: string; exact: boolean } | null {
  const href = sectionHref(pathname);
  const link = links.find((candidate) => candidate.href === href);
  if (link === undefined) return null;
  return { href: link.href, label: link.label, exact: pathname === link.href };
}

// Lo que va dentro de «Más»: las secciones del rol que no están en la barra.
export function moreLinks(links: readonly NavLink[]): NavLink[] {
  return links.filter(
    (link) => !BOTTOM_BAR.some((fixed) => fixed.href === link.href),
  );
}
