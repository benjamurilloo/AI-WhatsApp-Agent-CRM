import { describe, expect, it } from "vitest";
import {
  buildOperationsView,
  DEFAULT_OPERATION_FILTERS,
  operationDateText,
  operationFiltersHref,
  operationsEmptyTitle,
  operationsRangeText,
  parseOperationFilters,
  toOperationRows,
  type OperationRow,
  type OperationSources,
} from "./operations-rows";

const TODAY = "2026-10-30";
const TZ = "America/Argentina/Buenos_Aires";
const CLIENT = "0b6f1a52-3c4d-4e5f-8a9b-0c1d2e3f4a5b";

describe("operationsEmptyTitle", () => {
  it("no afirma que no tiene operaciones si un módulo no se pudo leer", () => {
    expect(operationsEmptyTitle(DEFAULT_OPERATION_FILTERS, ["venta"])).toBe(
      "No hay operaciones para mostrar entre las que se pudieron leer.",
    );
  });

  it("con un tipo elegido, habla de ese tipo", () => {
    expect(
      operationsEmptyTitle({ ...DEFAULT_OPERATION_FILTERS, type: "turno" }, []),
    ).toBe("Este cliente todavía no tiene turnos.");
  });

  it("los filtros y el cliente sin nada dicen lo suyo", () => {
    expect(
      operationsEmptyTitle({ ...DEFAULT_OPERATION_FILTERS, search: "zzz" }, [
        "venta",
      ]),
    ).toBe("No encontramos operaciones con esos filtros.");
    expect(operationsEmptyTitle(DEFAULT_OPERATION_FILTERS, [])).toBe(
      "Este cliente todavía no tiene operaciones.",
    );
  });
});

const SOURCES = {
  sales: [
    {
      id: "s1",
      displayNumber: "V-000001",
      lineCount: 2,
      total: "100.00",
      currency: "ARS",
      createdAt: new Date("2026-10-20T15:00:00Z"),
      voidDisplayNumber: "A-000001",
      voidedAt: new Date("2026-10-21T15:00:00Z"),
    },
  ],
  orders: [
    {
      id: "o1",
      displayNumber: "P-000001",
      lineCount: 1,
      total: "50.00",
      currency: "USD",
      status: "pending",
      createdAt: new Date("2026-10-25T15:00:00Z"),
      cancelledAt: null,
    },
  ],
  serviceOrders: [
    {
      id: "r1",
      displayNumber: "OS-000001",
      kind: "customer_device",
      modelName: "iPhone Reparación",
      status: "repaired",
      open: true,
      customerTotal: null,
      customerCurrency: null,
      warranty: null,
      createdAt: new Date("2026-06-01T15:00:00Z"),
    },
  ],
  appointments: [
    {
      id: "t1",
      date: "2026-11-05",
      start: "17:00",
      end: "17:30",
      status: "confirmed",
      reasonName: "Retiro de equipo",
      createdAt: new Date("2026-10-29T15:00:00Z"),
    },
    {
      id: "t2",
      date: "2026-10-01",
      start: "10:00",
      end: "10:30",
      status: "confirmed",
      reasonName: "Consulta",
      createdAt: new Date("2026-09-29T15:00:00Z"),
    },
  ],
  tradeIns: [
    {
      id: "u1",
      displayNumber: "PU-000001",
      productName: "iPhone 11",
      destination: "purchase",
      value: null,
      voidDisplayNumber: null,
      voidedAt: null,
      createdAt: new Date("2026-09-12T15:00:00Z"),
    },
  ],
} as unknown as OperationSources;

const rows = () => toOperationRows(SOURCES, TZ, TODAY);
const totals = { venta: 1, pedido: 1, reparacion: 1, turno: 2, usado: 1 };

function view(filters: Partial<typeof DEFAULT_OPERATION_FILTERS>) {
  return buildOperationsView(
    rows(),
    { ...DEFAULT_OPERATION_FILTERS, ...filters },
    totals,
    TODAY,
  );
}

const ids = (list: OperationRow[]) => list.map((row) => row.id);

describe("la tabla de Operaciones (brief-24.4.3, D-1 a D-3)", () => {
  it("une las cinco fuentes por fecha descendente, con el turno futuro arriba", () => {
    expect(ids(rows())).toEqual(["t1", "o1", "s1", "t2", "u1", "r1"]);
  });

  it("cada fila conserva su importe y lo que no tiene o el rol no recibe queda en null", () => {
    const byId = new Map(rows().map((row) => [row.id, row]));
    expect(byId.get("s1")?.amount).toEqual({
      amount: "100.00",
      currency: "ARS",
    });
    expect(byId.get("o1")?.amount?.currency).toBe("USD");
    expect(byId.get("r1")?.amount).toBeNull();
    expect(byId.get("t1")?.amount).toBeNull();
    expect(byId.get("u1")?.amount).toBeNull();
  });

  it("pedido y venta dicen la cantidad de productos, y el turno no tiene número", () => {
    const byId = new Map(rows().map((row) => [row.id, row]));
    expect(byId.get("s1")?.detail).toBe("2 productos");
    expect(byId.get("o1")?.detail).toBe("1 producto");
    expect(byId.get("t1")?.reference).toBeNull();
    expect(byId.get("t1")?.title).toBe("Retiro de equipo");
  });

  it("«En curso»: pedido pendiente, reparación abierta y turno desde hoy; no el turno pasado", () => {
    expect(ids(view({ state: "en_curso" }).rows)).toEqual(["t1", "o1", "r1"]);
    expect(ids(view({ state: "cerradas" }).rows)).toEqual(["s1", "t2", "u1"]);
  });

  it("la fecha corta por días hacia atrás y deja el turno futuro", () => {
    expect(ids(view({ date: "30" }).rows)).toEqual(["t1", "o1", "s1", "t2"]);
    expect(ids(view({ date: "90" }).rows)).not.toContain("r1");
  });

  it("busca por número o equipo, sin mayúsculas ni acentos", () => {
    expect(ids(view({ search: "p-000001" }).rows)).toEqual(["o1"]);
    expect(ids(view({ search: "IPHONE REPARACION" }).rows)).toEqual(["r1"]);
    expect(view({ search: "nada" }).rows).toEqual([]);
  });

  it("sin filtros, los chips dicen la cantidad real, aunque pase de lo leído", () => {
    const capped = buildOperationsView(
      rows(),
      DEFAULT_OPERATION_FILTERS,
      { ...totals, venta: 350 },
      TODAY,
    );
    expect(capped.counts.venta).toBe(350);
    expect(capped.countAll).toBe(355);
  });

  it("con filtros, los chips cuentan sobre ellos, y el tipo elegido no cambia las demás", () => {
    const filtered = view({ state: "en_curso", type: "pedido" });
    expect(filtered.counts).toEqual({
      venta: 0,
      pedido: 1,
      reparacion: 1,
      turno: 1,
      usado: 0,
    });
    expect(ids(filtered.rows)).toEqual(["o1"]);
  });

  it("un tipo que no se leyó no tiene chip ni cuenta como cero", () => {
    const partial = buildOperationsView(
      rows().filter((row) => row.type !== "reparacion"),
      DEFAULT_OPERATION_FILTERS,
      { venta: 1, pedido: 1, turno: 2, usado: 1 },
      TODAY,
    );
    expect("reparacion" in partial.counts).toBe(false);
    expect(partial.countAll).toBe(5);
  });

  it("pagina de a 25 y lleva una página fuera de rango a la última", () => {
    const many: OperationRow[] = Array.from({ length: 30 }, (_, index) => ({
      ...rows()[0]!,
      id: String(index),
    }));
    const paged = buildOperationsView(
      many,
      { ...DEFAULT_OPERATION_FILTERS, page: 9 },
      { turno: 30 },
      TODAY,
    );
    expect(paged.page).toBe(2);
    expect(paged.pageCount).toBe(2);
    expect(paged.rows).toHaveLength(5);
    expect(operationsRangeText(paged)).toBe("26 – 30 de 30 operaciones");
  });

  it("lee los filtros de la URL y descarta lo que no se ofrece", () => {
    expect(
      parseOperationFilters({
        tipo: "usado",
        buscar: " PU ",
        estado: "en_curso",
        fecha: "90",
        pagina: "3",
      }),
    ).toEqual({
      type: "usado",
      search: "PU",
      state: "en_curso",
      date: "90",
      page: 3,
    });
    expect(
      parseOperationFilters({
        tipo: "otro",
        estado: "x",
        fecha: "7",
        pagina: "-1",
      }),
    ).toEqual(DEFAULT_OPERATION_FILTERS);
  });

  it("arma el enlace solo con lo que no es predeterminado", () => {
    expect(operationFiltersHref(CLIENT, DEFAULT_OPERATION_FILTERS)).toBe(
      `/clientes/${CLIENT}?pestana=operaciones`,
    );
    expect(
      operationFiltersHref(CLIENT, {
        ...DEFAULT_OPERATION_FILTERS,
        type: "turno",
        date: "30",
        page: 2,
      }),
    ).toBe(
      `/clientes/${CLIENT}?pestana=operaciones&tipo=turno&fecha=30&pagina=2`,
    );
  });

  it("la fecha se escribe como la v2", () => {
    expect(operationDateText("2026-10-27 17:00")).toMatch(/^27 oct 2026$/);
  });
});
