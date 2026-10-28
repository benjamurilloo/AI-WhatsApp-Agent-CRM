import { describe, expect, it } from "vitest";
import {
  allLinks,
  BOTTOM_BAR,
  crumbFor,
  currentLink,
  hidesBottomBar,
  isCurrent,
  moreGroups,
  visibleGroups,
  type NavGroup,
} from "./nav-links";

// Los grupos de un admin con todas las capacidades (brief-24.1, D-1).
const ADMIN: NavGroup[] = [
  {
    id: "inicio",
    label: null,
    links: [{ href: "/", label: "Inicio", icon: "home" }],
  },
  {
    id: "atencion",
    label: "Atención",
    links: [
      {
        href: "/conversaciones",
        label: "Conversaciones",
        icon: "messageCircle",
      },
      { href: "/clientes", label: "Clientes", icon: "users" },
      { href: "/turnos", label: "Turnos", icon: "calendar" },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo e inventario",
    links: [{ href: "/productos", label: "Productos", icon: "package" }],
  },
  {
    id: "comercial",
    label: "Comercial",
    links: [
      { href: "/pedidos", label: "Pedidos", icon: "list" },
      { href: "/ventas", label: "Ventas", icon: "receipt" },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    links: [
      { href: "/caja", label: "Caja", icon: "banknote" },
      { href: "/caja/deudores", label: "Cuentas de clientes", icon: "users" },
    ],
  },
  {
    id: "abastecimiento",
    label: "Abastecimiento",
    links: [
      { href: "/compras", label: "Compras", icon: "truck" },
      { href: "/compras/recepciones", label: "Recepciones", icon: "package" },
    ],
  },
  {
    id: "administracion",
    label: "Administración",
    links: [
      { href: "/informacion", label: "Información", icon: "info" },
      { href: "/informacion/horario", label: "Horarios", icon: "clock" },
      { href: "/usuarios", label: "Usuarios", icon: "user" },
    ],
  },
];

// Un viewer: sin Abastecimiento ni Usuarios.
const VIEWER: NavGroup[] = ADMIN.map((group) => ({
  ...group,
  links: group.links.filter(
    (link) => !link.href.startsWith("/compras") && link.href !== "/usuarios",
  ),
}));

describe("visibleGroups", () => {
  it("quita los grupos sin destinos", () => {
    expect(visibleGroups(VIEWER).map((group) => group.id)).not.toContain(
      "abastecimiento",
    );
    expect(visibleGroups(ADMIN)).toHaveLength(ADMIN.length);
  });
});

describe("currentLink", () => {
  it("toma el destino de prefijo más largo", () => {
    expect(currentLink("/compras/recepciones/7", ADMIN)?.link.label).toBe(
      "Recepciones",
    );
    expect(currentLink("/compras/a-pagar", ADMIN)?.link.label).toBe("Compras");
    expect(currentLink("/caja/deudores", ADMIN)?.link.label).toBe(
      "Cuentas de clientes",
    );
    expect(currentLink("/caja/sesiones/3", ADMIN)?.link.label).toBe("Caja");
    expect(currentLink("/informacion/horario", ADMIN)?.link.label).toBe(
      "Horarios",
    );
    expect(currentLink("/informacion/5", ADMIN)?.link.label).toBe(
      "Información",
    );
  });

  it("lleva el cobro y la devolución a la caja", () => {
    expect(currentLink("/cobros/1", ADMIN)?.link.label).toBe("Caja");
    expect(currentLink("/devoluciones/1/anular", ADMIN)?.link.label).toBe(
      "Caja",
    );
  });

  it("Inicio es solo la raíz, y un prefijo de texto no es la misma sección", () => {
    expect(currentLink("/", ADMIN)?.link.label).toBe("Inicio");
    expect(currentLink("/clientes/1", ADMIN)?.link.label).toBe("Clientes");
    expect(currentLink("/clientesx", ADMIN)).toBeNull();
  });

  it("devuelve el grupo del destino", () => {
    expect(currentLink("/turnos/9", ADMIN)?.group.label).toBe("Atención");
  });
});

describe("isCurrent", () => {
  it("marca un solo destino", () => {
    expect(
      isCurrent("/compras/recepciones", "/compras/recepciones", ADMIN),
    ).toBe(true);
    expect(isCurrent("/compras/recepciones", "/compras", ADMIN)).toBe(false);
    expect(isCurrent("/", "/", ADMIN)).toBe(true);
  });
});

describe("crumbFor", () => {
  it("en la portada de un destino, el destino es la página actual", () => {
    expect(crumbFor("/clientes", ADMIN)).toEqual({
      group: "Atención",
      href: "/clientes",
      label: "Clientes",
      exact: true,
    });
    expect(crumbFor("/", ADMIN)).toEqual({
      group: null,
      href: "/",
      label: "Inicio",
      exact: true,
    });
  });

  it("dentro de un destino, el destino es un enlace", () => {
    expect(crumbFor("/compras/recepciones/7", ADMIN)).toEqual({
      group: "Abastecimiento",
      href: "/compras/recepciones",
      label: "Recepciones",
      exact: false,
    });
    expect(crumbFor("/cobros/7", ADMIN)?.label).toBe("Caja");
  });

  it("sin destino en el menú del rol, no hay nivel", () => {
    expect(crumbFor("/desconocida", ADMIN)).toBeNull();
    expect(crumbFor("/usuarios", VIEWER)).toBeNull();
    expect(crumbFor("/compras/recepciones/7", VIEWER)).toBeNull();
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
      expect(allLinks(VIEWER).some((link) => link.href === fixed.href)).toBe(
        true,
      );
    }
  });

  it("«Más» lleva el resto bajo su grupo, según el rol", () => {
    const admin = moreGroups(ADMIN);
    expect(admin.map((group) => group.label)).toEqual([
      "Atención",
      "Catálogo e inventario",
      "Comercial",
      "Finanzas",
      "Abastecimiento",
      "Administración",
    ]);
    expect(admin[0]?.links.map((link) => link.label)).toEqual(["Turnos"]);
    expect(admin[2]?.links.map((link) => link.label)).toEqual(["Pedidos"]);

    const viewer = moreGroups(VIEWER);
    expect(viewer.map((group) => group.id)).not.toContain("abastecimiento");
    expect(allLinks(viewer).map((link) => link.label)).not.toContain(
      "Usuarios",
    );
  });

  it("un grupo que queda vacío fuera de la barra no aparece en «Más»", () => {
    const onlyBar: NavGroup[] = [
      {
        id: "atencion",
        label: "Atención",
        links: [
          {
            href: "/conversaciones",
            label: "Conversaciones",
            icon: "messageCircle",
          },
          { href: "/clientes", label: "Clientes", icon: "users" },
        ],
      },
    ];
    expect(moreGroups(onlyBar)).toEqual([]);
  });
});

describe("hidesBottomBar", () => {
  it("se retira en el hilo y en los formularios", () => {
    expect(hidesBottomBar("/conversaciones/abc")).toBe(true);
    expect(hidesBottomBar("/ventas/nueva")).toBe(true);
    expect(hidesBottomBar("/clientes/nuevo")).toBe(true);
    expect(hidesBottomBar("/compras/proveedores/9/editar")).toBe(true);
    expect(hidesBottomBar("/caja/abrir")).toBe(true);
    expect(hidesBottomBar("/ventas/1/anulacion")).toBe(true);
    expect(hidesBottomBar("/usados/1/pago")).toBe(true);
    expect(hidesBottomBar("/reparaciones/reclamo")).toBe(true);
    // La edición en la misma ficha, con ?editar=1.
    expect(hidesBottomBar("/informacion/1", true)).toBe(true);
    expect(hidesBottomBar("/clientes/1", true)).toBe(true);
  });

  it("se conserva en las listas, las fichas y las consultas", () => {
    expect(hidesBottomBar("/")).toBe(false);
    expect(hidesBottomBar("/conversaciones")).toBe(false);
    expect(hidesBottomBar("/ventas/1")).toBe(false);
    expect(hidesBottomBar("/usados/pagos/1")).toBe(false);
    expect(hidesBottomBar("/usados/cotizar")).toBe(false);
    expect(hidesBottomBar("/clientes/1/cuenta")).toBe(false);
  });
});
