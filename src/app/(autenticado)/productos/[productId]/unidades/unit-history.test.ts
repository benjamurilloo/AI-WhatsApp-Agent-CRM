import { describe, expect, it, vi } from "vitest";
import type { NamedAuditLogEntry } from "@/modules/audit";
import type {
  UnitAuditResult,
  UnitMovement,
  UnitMovementsResult,
} from "@/modules/inventory";
import { readUnitHistory } from "./unit-history";

// El historial de una unidad (brief-24.5.2, D-3, D-10, I-2, AC-10 y AC-19). Las dos lecturas entran
// como parámetros, así que el fallo se fuerza **sin mockear el módulo**: la prueba pasa una función
// que lanza. Es la convención que dejó B-3 de la 24.5.1.

const at = (iso: string) => new Date(iso);

const movement = (id: string, iso: string, reason: string): UnitMovement => ({
  id,
  type: "adjustment_negative",
  quantity: "1.000",
  reason,
  createdAt: at(iso),
  author: { id: "11111111-1111-4111-8111-111111111111", name: "Ana" },
});

// La **acción** es un parámetro y no una constante. Antes estaba fijada en `status_change`, y por
// eso ninguna prueba podía ver que las otras cuatro acciones sobre `stock_unit` —`create`,
// `update`, `price_change` y `cost_change`— se dibujaban todas como «Cambio de estado»: era un
// fixture con forma asumida tapando el hueco, y lo encontró la revisión independiente (N-2).
const auditEntry = (
  id: string,
  iso: string,
  after: Record<string, string | null>,
  action: NamedAuditLogEntry["action"] = "status_change",
  before: Record<string, string | null> | null = {
    status: "in_review",
    reason: null,
  },
): NamedAuditLogEntry => ({
  id,
  entityType: "stock_unit",
  action,
  diff: { before, after },
  actor: {
    kind: "user",
    id: "22222222-2222-4222-8222-222222222222",
    name: "Bruno",
  },
  createdAt: at(iso),
});

const okMovements =
  (movements: UnitMovement[]) => async (): Promise<UnitMovementsResult> => ({
    ok: true,
    movements,
    limit: 50,
  });

const okAudit =
  (entries: NamedAuditLogEntry[]) => async (): Promise<UnitAuditResult> => ({
    ok: true,
    entries,
    total: entries.length,
    page: 1,
    pageCount: 1,
  });

const throws = () => {
  throw new Error("la base no responde");
};

describe("readUnitHistory", () => {
  it("une las dos fuentes de más nuevo a más viejo, sin reportar ningún error", async () => {
    const onError = vi.fn();
    const history = await readUnitHistory({
      readMovements: okMovements([
        movement("m1", "2026-10-20T10:00:00Z", "Retiro por deterioro"),
      ]),
      readAudit: okAudit([
        auditEntry("a1", "2026-10-21T10:00:00Z", {
          status: "written_off",
          reason: "Pantalla rota",
        }),
      ]),
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(history.events.map((event) => event.id)).toEqual(["a1", "m1"]);
    expect(history.movements).toHaveLength(1);
    expect(history.audit).toHaveLength(1);
  });

  it("a un rol que no lee la auditoría le deja `undefined`, que NO es `null`", async () => {
    const onError = vi.fn();
    const history = await readUnitHistory({
      readMovements: okMovements([
        movement("m1", "2026-10-20T10:00:00Z", "Retiro"),
      ]),
      readAudit: null,
      onError,
    });

    // La distinción es el punto: `undefined` es «este rol no la lee» y `null` sería «falló». Si se
    // colapsaran, la pantalla anunciaría un error que no ocurrió.
    expect(history.audit).toBeUndefined();
    expect(history.audit).not.toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(history.events.map((event) => event.kind)).toEqual(["movement"]);
  });

  it("si la lectura de movimientos lanza, devuelve null y reporta el error", async () => {
    const onError = vi.fn();
    const history = await readUnitHistory({
      readMovements: throws,
      readAudit: okAudit([
        auditEntry("a1", "2026-10-21T10:00:00Z", { status: "available" }),
      ]),
      onError,
    });

    expect(history.movements).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    // Lo que sí se pudo leer se muestra igual: una fuente caída no se lleva la otra.
    expect(history.events.map((event) => event.id)).toEqual(["a1"]);
  });

  it("si la lectura de la auditoría lanza, devuelve null y reporta el error", async () => {
    const onError = vi.fn();
    const history = await readUnitHistory({
      readMovements: okMovements([
        movement("m1", "2026-10-20T10:00:00Z", "Retiro"),
      ]),
      readAudit: throws,
      onError,
    });

    expect(history.audit).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(history.events.map((event) => event.id)).toEqual(["m1"]);
  });

  it("un Failure del contrato también es «no se pudo leer», y no reporta un error", async () => {
    const onError = vi.fn();
    const history = await readUnitHistory({
      readMovements: async () => ({ ok: false, code: "NOT_FOUND" }),
      readAudit: async () => ({ ok: false, code: "FORBIDDEN" }),
      onError,
    });

    expect(history.movements).toBeNull();
    expect(history.audit).toBeNull();
    // Un Failure es una respuesta del contrato, no una excepción: no hay nada que loguear.
    expect(onError).not.toHaveBeenCalled();
    expect(history.events).toEqual([]);
  });

  it("nunca devuelve una lista vacía en lugar de un fallo (I-2)", async () => {
    const outcomes = await Promise.all(
      (
        [
          [throws, throws],
          [throws, okAudit([])],
          [okMovements([]), throws],
        ] as const
      ).map(([readMovements, readAudit]) =>
        readUnitHistory({ readMovements, readAudit, onError: () => {} }),
      ),
    );

    // La fuente que falló tiene que quedar en `null`, nunca en `[]`: un `[]` se dibujaría como
    // «sin eventos» y afirmaría que no pasó nada, que es justo lo que no se sabe.
    expect(outcomes[0]!.movements).toBeNull();
    expect(outcomes[0]!.audit).toBeNull();
    expect(outcomes[1]!.movements).toBeNull();
    expect(outcomes[1]!.audit).toEqual([]);
    expect(outcomes[2]!.movements).toEqual([]);
    expect(outcomes[2]!.audit).toBeNull();
    // Y los eventos nunca inventan ni pierden nada: son exactamente lo que se pudo leer. Ojo con la
    // tentación de afirmar acá que ninguna fuente es `[]`: una lista vacía **es** correcta cuando la
    // lectura funcionó y no había nada, como en el tercer caso. Lo que el invariante prohíbe es `[]`
    // cuando la lectura falló, y eso lo afirma cada línea de arriba, una por una.
    for (const outcome of outcomes) {
      expect(outcome.events.length).toBe(
        (outcome.movements?.length ?? 0) + (outcome.audit?.length ?? 0),
      );
    }
  });

  it("ordena de forma estable dos eventos del mismo instante", async () => {
    const same = "2026-10-21T10:00:00Z";
    const history = await readUnitHistory({
      readMovements: okMovements([movement("bbb", same, "Retiro")]),
      readAudit: okAudit([auditEntry("aaa", same, { status: "written_off" })]),
      onError: () => {},
    });

    // Sin el desempate por id, el orden dependería del orden de concatenación y cambiaría entre
    // cargas con los mismos datos.
    expect(history.events.map((event) => event.id)).toEqual(["aaa", "bbb"]);
  });

  it("traduce la entrada de auditoría a un evento de estado con su motivo", async () => {
    const history = await readUnitHistory({
      readMovements: okMovements([]),
      readAudit: okAudit([
        auditEntry("a1", "2026-10-21T10:00:00Z", {
          status: "written_off",
          reason: "Pantalla rota",
        }),
      ]),
      onError: () => {},
    });

    expect(history.events[0]).toMatchObject({
      kind: "audit",
      action: "status_change",
      from: "in_review",
      to: "written_off",
      reason: "Pantalla rota",
      changed: [],
    });
  });

  // N-2: las otras cuatro acciones sobre `stock_unit` no son cambios de estado y tienen que poder
  // distinguirse. Antes todas llegaban al panel como «Cambio de estado» y sin ningún dato.
  it("conserva la acción de cada entrada y qué campos cambiaron", async () => {
    const history = await readUnitHistory({
      readMovements: okMovements([]),
      readAudit: okAudit([
        auditEntry(
          "a3",
          "2026-10-23T10:00:00Z",
          { gradeId: "b", batteryHealth: "88" },
          "update",
          { gradeId: "a", batteryHealth: "91" },
        ),
        auditEntry(
          "a2",
          "2026-10-22T10:00:00Z",
          { price: "900.00" },
          "price_change",
          null,
        ),
        auditEntry(
          "a1",
          "2026-10-21T10:00:00Z",
          { status: "available" },
          "create",
          null,
        ),
      ]),
      onError: () => {},
    });

    expect(
      history.events.map((event) =>
        event.kind === "audit" ? [event.action, event.changed] : null,
      ),
    ).toEqual([
      ["update", ["gradeId", "batteryHealth"]],
      ["price_change", ["price"]],
      ["create", []],
    ]);
  });

  // N-1: el historial tiene que poder decir que está recortado. Antes `total` se descartaba, así
  // que una auditoría cortada en su página se veía completa.
  it("conserva el total de la auditoría para poder decir que está recortada", async () => {
    const entries = Array.from({ length: 25 }, (_, i) =>
      auditEntry(`a${i}`, "2026-10-21T10:00:00Z", { status: "available" }),
    );
    const history = await readUnitHistory({
      readMovements: okMovements([]),
      readAudit: async () => ({
        ok: true,
        entries,
        total: 73,
        page: 1,
        pageCount: 3,
      }),
      onError: () => {},
    });

    expect(history.auditShown).toBe(25);
    expect(history.auditTotal).toBe(73);
  });

  it("sin auditoría, el total queda en null y no en cero", async () => {
    const history = await readUnitHistory({
      readMovements: okMovements([movement("m1", "2026-10-20T10:00:00Z", "x")]),
      readAudit: null,
      onError: () => {},
    });

    // Cero significaría «no tiene cambios», que es una afirmación; `null` es «no lo sé».
    expect(history.auditTotal).toBeNull();
    expect(history.movementsLimit).toBe(50);
    expect(history.movementsShown).toBe(1);
  });
});
