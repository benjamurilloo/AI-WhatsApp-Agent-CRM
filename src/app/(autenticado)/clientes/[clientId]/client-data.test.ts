import { beforeEach, describe, expect, it, vi } from "vitest";
import { getClientStatement } from "@/modules/cash";
import { listClientConversationEvents } from "@/modules/conversations";
import { getUnitWarranties } from "@/modules/inventory";
import { listClientDeliveredUnits } from "@/modules/orders";
import { listClientOperationSales, listClientSoldUnits } from "@/modules/sales";
import type { AuthContext } from "@/modules/organizations";
import { readClientActivityEvents } from "./activity-data";
import { readClientUnits } from "./client-units-data";
import { readClientOperations } from "./operations-data";

// Un módulo que falla (brief-24.4.3, D-2 y D-5). Con los módulos simulados: una falla de base no se
// provoca en un test de integración sin romper las otras lecturas. No es evidencia de integración.
vi.mock("@/modules/organizations", () => ({
  hasCapability: vi.fn(async () => false),
}));
vi.mock("@/modules/sales", () => ({
  listClientOperationSales: vi.fn(),
  listClientSoldUnits: vi.fn(),
}));
vi.mock("@/modules/orders", () => ({
  listClientOperationOrders: vi.fn(async () => ({
    ok: true,
    orders: [],
    total: 3,
  })),
  listClientDeliveredUnits: vi.fn(),
}));
vi.mock("@/modules/service", () => ({
  listClientOperationServiceOrders: vi.fn(),
  listUnitServiceOrders: vi.fn(async () => new Map()),
  repairsAllowed: vi.fn(async () => false),
}));
vi.mock("@/modules/inventory", () => ({ getUnitWarranties: vi.fn() }));
vi.mock("@/modules/appointments", () => ({
  listClientOperationAppointments: vi.fn(),
}));
vi.mock("@/modules/tradeins", () => ({
  listClientOperationTradeIns: vi.fn(),
}));
vi.mock("@/modules/conversations", () => ({
  listClientConversationEvents: vi.fn(),
}));
vi.mock("@/modules/cash", () => ({ getClientStatement: vi.fn() }));
vi.mock("@/shared/log", () => ({
  logEvent: vi.fn(),
  newRequestId: () => "req",
}));

const context = {
  userId: "u",
  organizationId: "o",
  role: "admin",
} as AuthContext;

beforeEach(() => {
  vi.mocked(listClientOperationSales).mockResolvedValue({
    ok: true,
    sales: [],
    total: 0,
  });
  vi.mocked(listClientConversationEvents).mockResolvedValue({
    ok: true,
    conversations: [],
    notes: [],
  } as never);
  vi.mocked(getClientStatement).mockResolvedValue({
    ok: true,
    statement: { documents: [], currencies: [] },
  } as never);
});

describe("readClientUnits", () => {
  beforeEach(() => {
    vi.mocked(listClientDeliveredUnits).mockResolvedValue({
      ok: true,
      units: [],
    } as never);
    vi.mocked(listClientSoldUnits).mockResolvedValue({
      ok: true,
      units: [],
    } as never);
    vi.mocked(getUnitWarranties).mockResolvedValue({
      ok: true,
      units: [],
    } as never);
  });

  it("sin compras hay sección, vacía", async () => {
    expect((await readClientUnits(context, "c"))?.section?.units).toEqual([]);
  });

  it("sin la capacidad o sin permiso, la sección no aparece", async () => {
    vi.mocked(getUnitWarranties).mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
    } as never);
    expect((await readClientUnits(context, "c"))?.section).toBeNull();
    vi.mocked(listClientSoldUnits).mockResolvedValue({
      ok: false,
      code: "FORBIDDEN",
    } as never);
    expect((await readClientUnits(context, "c"))?.section).toBeNull();
  });

  it("una excepción o un rechazo de otra clase valen null, no «no compró equipos»", async () => {
    vi.mocked(getUnitWarranties).mockRejectedValue(new Error("base"));
    expect(await readClientUnits(context, "c")).toBeNull();
    vi.mocked(listClientDeliveredUnits).mockResolvedValue({
      ok: false,
      code: "VALIDATION_ERROR",
    } as never);
    expect(await readClientUnits(context, "c")).toBeNull();
  });
});

describe("readClientOperations", () => {
  it("un módulo que tira queda en failed, sin cantidad, y los demás siguen", async () => {
    vi.mocked(listClientOperationSales).mockRejectedValue(new Error("base"));
    const data = await readClientOperations(context, "c");
    expect(data.failed).toEqual(["venta"]);
    expect(data.totals).toEqual({ pedido: 3 });
  });

  it("un módulo que rechaza también queda en failed", async () => {
    vi.mocked(listClientOperationSales).mockResolvedValue({
      ok: false,
      code: "FORBIDDEN",
    } as never);
    expect((await readClientOperations(context, "c")).failed).toEqual([
      "venta",
    ]);
  });
});

describe("readClientActivityEvents", () => {
  it("una excepción de conversaciones o de la cuenta se dice, sin tumbar la pestaña", async () => {
    vi.mocked(listClientConversationEvents).mockRejectedValue(
      new Error("base"),
    );
    vi.mocked(getClientStatement).mockRejectedValue(new Error("base"));
    const data = await readClientActivityEvents(context, "c");
    expect(data.failed).toEqual(["conversaciones", "cuenta corriente"]);
    expect(data.events).toEqual([]);
  });

  it("sin fallas, failed queda vacío", async () => {
    expect((await readClientActivityEvents(context, "c")).failed).toEqual([]);
  });
});
