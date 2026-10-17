import { describe, expect, it } from "vitest";
import {
  BOTTOM_BAR,
  crumbFor,
  isCurrent,
  moreLinks,
  sectionHref,
  type NavLink,
} from "./nav-links";

const ADMIN: NavLink[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/conversaciones", label: "Conversaciones", icon: "messageCircle" },
  { href: "/clientes", label: "Clientes", icon: "users" },
  { href: "/productos", label: "Productos", icon: "package" },
  { href: "/pedidos", label: "Pedidos", icon: "list" },
  { href: "/ventas", label: "Ventas", icon: "receipt" },
  { href: "/caja", label: "Caja", icon: "banknote" },
  { href: "/compras", label: "Compras", icon: "truck" },
  { href: "/informacion", label: "Información", icon: "info" },
  { href: "/usuarios", label: "Usuarios", icon: "user" },
];

const VIEWER = ADMIN.filter(
  (link) => link.href !== "/compras" && link.href !== "/usuarios",
);

describe("sectionHref", () => {
  it("toma el primer segmento de la ruta", () => {
    expect(sectionHref("/")).toBe("/");
    expect(sectionHref("/clientes")).toBe("/clientes");
    expect(sectionHref("/clientes/123/cuenta")).toBe("/clientes");
    expect(sectionHref("/compras/proveedores/9/pagar")).toBe("/compras");
  });

  it("lleva el cobro y la devolución a la caja", () => {
    expect(sectionHref("/cobros/1")).toBe("/caja");
    expect(sectionHref("/devoluciones/1/anular")).toBe("/caja");
  });
});

describe("isCurrent", () => {
  it("marca la sección de la ruta y nada más", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/clientes/1", "/")).toBe(false);
    expect(isCurrent("/clientes/1", "/clientes")).toBe(true);
    // Un prefijo de texto no es la misma sección.
    expect(isCurrent("/clientesx", "/clientes")).toBe(false);
  });
});

describe("crumbFor", () => {
  it("en la portada de una sección, la sección es la página actual", () => {
    expect(crumbFor("/clientes", ADMIN)).toEqual({
      href: "/clientes",
      label: "Clientes",
      exact: true,
    });
    expect(crumbFor("/", ADMIN)).toEqual({
      href: "/",
      label: "Dashboard",
      exact: true,
    });
  });

  it("dentro de una sección, la sección es un enlace", () => {
    expect(crumbFor("/productos/5/precios", ADMIN)).toEqual({
      href: "/productos",
      label: "Productos",
      exact: false,
    });
    expect(crumbFor("/cobros/7", ADMIN)?.label).toBe("Caja");
  });

  it("sin sección en el menú del rol, no hay nivel", () => {
    expect(crumbFor("/desconocida", ADMIN)).toBeNull();
    expect(crumbFor("/usuarios", VIEWER)).toBeNull();
  });
});

describe("la barra inferior", () => {
  it("tiene cuatro destinos fijos que ven los dos roles", () => {
    expect(BOTTOM_BAR.map((link) => link.label)).toEqual([
      "Inicio",
      "Chats",
      "Clientes",
      "Ventas",
    ]);
    for (const fixed of BOTTOM_BAR) {
      expect(VIEWER.some((link) => link.href === fixed.href)).toBe(true);
    }
  });

  it("«Más» lleva el resto, según el rol", () => {
    expect(moreLinks(ADMIN).map((link) => link.label)).toEqual([
      "Productos",
      "Pedidos",
      "Caja",
      "Compras",
      "Información",
      "Usuarios",
    ]);
    expect(moreLinks(VIEWER).map((link) => link.label)).toEqual([
      "Productos",
      "Pedidos",
      "Caja",
      "Información",
    ]);
  });
});
