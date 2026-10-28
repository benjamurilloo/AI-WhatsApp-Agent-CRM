import { describe, expect, it } from "vitest";
import {
  groupSuggestions,
  looksLikeFullPhone,
} from "@/app/_components/suggest-filter";
import {
  composeGroups,
  kindsForRole,
  SEARCH_KINDS,
  searchScopeText,
  toSuggestions,
  type SearchHit,
} from "./groups";

// La composición de la búsqueda global (brief-23.3): qué tipos pide cada rol, qué pasa cuando una
// lectura falla y qué dice cada opción.

const hit = (id: string, extra: Partial<SearchHit> = {}): SearchHit => ({
  id,
  label: `Etiqueta ${id}`,
  href: `/algo/${id}`,
  ...extra,
});

const ok = (hits: SearchHit[]): PromiseSettledResult<SearchHit[]> => ({
  status: "fulfilled",
  value: hits,
});

const failed: PromiseSettledResult<SearchHit[]> = {
  status: "rejected",
  reason: new Error("caída"),
};

describe("kindsForRole", () => {
  it("un admin busca en los nueve tipos, en el orden de los grupos", () => {
    expect(kindsForRole("admin")).toEqual(SEARCH_KINDS);
    expect(SEARCH_KINDS).toHaveLength(9);
  });

  it("un viewer no pide compras ni proveedores (H-1c), y sí reparaciones y turnos (brief-24.2, D-3)", () => {
    expect(kindsForRole("viewer")).toEqual([
      "clients",
      "repairs",
      "appointments",
      "orders",
      "products",
      "devices",
      "sales",
    ]);
  });
});

describe("composeGroups", () => {
  it("deja afuera los tipos sin resultados y recorta al límite", () => {
    const result = composeGroups(
      "12",
      ["clients", "orders", "products"],
      [ok([]), ok([hit("1"), hit("2"), hit("3"), hit("4")]), ok([hit("5")])],
      3,
    );
    expect(result.failed).toEqual([]);
    expect(result.groups.map((group) => group.kind)).toEqual([
      "orders",
      "products",
    ]);
    expect(result.groups[0]!.hits.map((item) => item.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("si una lectura falla, los otros grupos se muestran (AC-5)", () => {
    const result = composeGroups(
      "ana",
      ["clients", "orders", "products"],
      [ok([hit("1")]), failed, ok([hit("2")])],
      3,
    );
    expect(result.failed).toEqual(["orders"]);
    expect(result.groups.map((group) => group.kind)).toEqual([
      "clients",
      "products",
    ]);
  });

  it("«Ver todos en …» lleva a la lista con la búsqueda puesta", () => {
    const kinds = SEARCH_KINDS;
    const result = composeGroups(
      "P-12 &",
      kinds,
      kinds.map((_, index) => ok([hit(String(index))])),
      8,
    );
    expect(
      Object.fromEntries(
        result.groups.map((group) => [group.kind, group.moreHref]),
      ),
    ).toEqual({
      clients: "/clientes?q=P-12+%26",
      // Sin una lista que reúna lo encontrado por cliente (brief-24.2, D-3).
      repairs: null,
      appointments: null,
      orders: "/pedidos?numero=P-12+%26",
      products: "/productos?q=P-12+%26",
      // Los equipos no tienen lista: el grupo es todo (brief-29.9, U-3).
      devices: null,
      sales: "/ventas?numero=P-12+%26",
      purchaseOrders: "/compras/ordenes?numero=P-12+%26",
      suppliers: "/compras/proveedores?q=P-12+%26",
    });
  });

  it("los equipos no se cortan en /buscar, que no tiene a dónde llevarlos", () => {
    const devices = Array.from({ length: 10 }, (_, index) =>
      hit(String(index)),
    );
    const page = composeGroups(
      "356938035643809",
      ["devices"],
      [ok(devices)],
      8,
    );
    expect(page.groups[0]!.hits).toHaveLength(10);
    const suggest = composeGroups(
      "356938035643809",
      ["devices"],
      [ok(devices)],
      3,
    );
    expect(suggest.groups[0]!.hits).toHaveLength(3);
  });
});

describe("searchScopeText", () => {
  it("nombra solo lo que el rol y las capacidades dejan ver (brief-24.2, D-6)", () => {
    expect(searchScopeText("viewer", [])).toBe(
      "Clientes, pedidos, productos y ventas",
    );
    expect(searchScopeText("admin", [])).toBe(
      "Clientes, pedidos, productos, ventas, compras y proveedores",
    );
    expect(
      searchScopeText("viewer", [
        "repairs",
        "appointments",
        "serialized_units",
      ]),
    ).toBe(
      "Clientes, reparaciones, turnos, pedidos, productos, equipos por IMEI y ventas",
    );
    expect(searchScopeText("viewer", ["serialized_units"])).toContain(
      "equipos por IMEI",
    );
  });
});

describe("looksLikeFullPhone", () => {
  it("un teléfono entero sí; un número de pedido, un nombre o un IMEI con letras, no (brief-24.2, D-4)", () => {
    expect(looksLikeFullPhone("+54 11 5555-0182")).toBe(true);
    expect(looksLikeFullPhone("1155550182")).toBe(true);
    expect(looksLikeFullPhone("123")).toBe(false);
    expect(looksLikeFullPhone("P-000123")).toBe(false);
    expect(looksLikeFullPhone("Lucía")).toBe(false);
  });
});

describe("toSuggestions", () => {
  it("cada opción lleva su grupo y su tipo dicho (D-5)", () => {
    const { groups } = composeGroups(
      "123",
      ["orders", "sales"],
      [
        ok([hit("p", { label: "P-000123", detail: "Ana · Confirmado" })]),
        ok([hit("v", { label: "V-000123" })]),
      ],
      3,
    );
    expect(toSuggestions(groups)).toEqual([
      {
        id: "orders:p",
        label: "P-000123",
        detail: "Ana · Confirmado",
        detailStyle: undefined,
        href: "/algo/p",
        group: "Pedidos",
        spokenKind: "pedido",
      },
      {
        id: "sales:v",
        label: "V-000123",
        detail: undefined,
        detailStyle: undefined,
        href: "/algo/v",
        group: "Ventas",
        spokenKind: "venta",
      },
    ]);
  });

  it("el mismo id en dos tipos da dos opciones distintas", () => {
    const { groups } = composeGroups(
      "1",
      ["orders", "sales"],
      [ok([hit("x")]), ok([hit("x")])],
      3,
    );
    const ids = toSuggestions(groups).map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("groupSuggestions", () => {
  it("agrupa las opciones consecutivas y conserva el índice de cada una", () => {
    const groups = groupSuggestions([
      { group: "Clientes" },
      { group: "Clientes" },
      { group: "Pedidos" },
    ]);
    expect(
      groups.map((group) => [
        group.title,
        group.items.map((entry) => entry.index),
      ]),
    ).toEqual([
      ["Clientes", [0, 1]],
      ["Pedidos", [2]],
    ]);
  });

  it("sin grupos, una sola lista sin título, como siempre", () => {
    const groups = groupSuggestions([{}, {}]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBeNull();
  });
});
