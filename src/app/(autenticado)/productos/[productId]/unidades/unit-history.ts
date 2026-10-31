import type {
  AuditAction,
  NamedAuditActor,
  NamedAuditLogEntry,
} from "@/modules/audit";
import type {
  StockMovementType,
  UnitAuditResult,
  UnitMovement,
  UnitMovementsResult,
} from "@/modules/inventory";

// El historial de una unidad, compuesto **en memoria** de dos fuentes (brief-24.5.2, D-3): los
// movimientos de stock de la unidad y sus entradas de auditoría. Sin `JOIN`: son dos módulos y la
// regla de frontera del Overview lo prohíbe.
//
// Las dos fuentes no son equivalentes y **la diferencia es la razón de ser de este archivo**:
//
// - los movimientos los ven **los dos roles**, porque un movimiento de stock no es auditoría;
// - la auditoría la ve **solo un `admin`**, porque `SecurityModel.md` la reserva (D-10, H-12).
//
// De ahí sale la asimetría declarada de AC-19: el motivo de una baja **desde `available`** vive en
// el movimiento, así que lo ve un `viewer`; el de una baja **desde `in_review`** vive solo en la
// auditoría, porque esa baja no es un movimiento (U-2 de la 29.6.2), así que lo ve solo un `admin`.
//
// Las dos lecturas entran **como parámetros**, no se invocan por su nombre acá dentro. Es la
// convención que dejó el defecto B-3 de la 24.5.1: un camino de error que no se puede forzar en una
// prueba es un camino que nadie comprobó, y con la lectura inyectada el fallo se fuerza **sin
// mockear el módulo**.

export type UnitHistoryEvent =
  | {
      kind: "movement";
      id: string;
      at: Date;
      type: StockMovementType;
      quantity: string;
      reason: string;
      authorName: string;
    }
  | {
      kind: "audit";
      id: string;
      at: Date;
      // La **acción** de la entrada, no solo su estado. Sin ella, `create`, `update`, `price_change`
      // y `cost_change` se dibujaban todas como «Cambio de estado» y sin ningún dato: fue el
      // hallazgo N-2 de la revisión independiente, y es visible para el usuario. Sobre `stock_unit`
      // se escriben cinco acciones distintas, no una.
      action: AuditAction;
      from: string | null;
      to: string | null;
      // El motivo que la baja dejó en la auditoría, si lo hay.
      reason: string | null;
      // Qué campos cambiaron, para las acciones que no son de estado: una corrección de grado o un
      // cambio de días de garantía tiene que decir **qué** cambió.
      changed: string[];
      actor: NamedAuditActor;
    };

export type UnitHistory = {
  // `null` significa «no se pudo leer» y la pantalla lo anuncia. **Nunca una lista vacía en lugar
  // de un fallo**: eso es exactamente lo que I-2 prohíbe.
  movements: UnitMovement[] | null;
  // Tres estados, no dos: `null` es «no se pudo leer» y `undefined` es «este rol no la lee», que no
  // es un fallo y no se anuncia como tal (D-10).
  audit: NamedAuditLogEntry[] | null | undefined;
  // Lo que se pudo unir, de más nuevo a más viejo. Si una fuente falló, trae solo la otra, y el
  // llamador tiene en `movements` y `audit` con qué decir que está incompleto.
  events: UnitHistoryEvent[];
  // **Cuántos eventos hay de verdad en cada fuente, contra cuántos se trajeron.** Sin esto, un
  // historial recortado se ve completo: era el riesgo R-2 del brief, y la revisión independiente
  // encontró que estaba mitigado solo para los movimientos (N-1). La auditoría se corta en 25
  // entradas por página, y una unidad con varias reparaciones las pasa sin esfuerzo.
  movementsShown: number;
  movementsLimit: number;
  auditShown: number;
  // El total real de la auditoría, que la lectura sí devuelve y antes se descartaba. `null` cuando
  // no se pudo leer o cuando este rol no la lee.
  auditTotal: number | null;
};

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Los campos que la entrada declara cambiados, sin sus valores: el historial dice **qué** cambió,
// no a qué, porque un valor de auditoría puede ser un dato que esta pantalla no muestra.
function changedFields(entry: NamedAuditLogEntry): string[] {
  const keys = new Set([
    ...Object.keys(entry.diff.before ?? {}),
    ...Object.keys(entry.diff.after ?? {}),
  ]);
  // `status` y `reason` ya se muestran aparte; no se repiten en la lista de campos.
  keys.delete("status");
  keys.delete("reason");
  return [...keys];
}

function toAuditEvent(entry: NamedAuditLogEntry): UnitHistoryEvent {
  return {
    kind: "audit",
    id: entry.id,
    at: entry.createdAt,
    action: entry.action,
    from: textOf(entry.diff.before?.status),
    to: textOf(entry.diff.after?.status),
    reason: textOf(entry.diff.after?.reason),
    changed: changedFields(entry),
    actor: entry.actor,
  };
}

function toMovementEvent(movement: UnitMovement): UnitHistoryEvent {
  return {
    kind: "movement",
    id: movement.id,
    at: movement.createdAt,
    type: movement.type,
    quantity: movement.quantity,
    reason: movement.reason,
    authorName: movement.author.name,
  };
}

export async function readUnitHistory({
  readMovements,
  readAudit,
  onError,
}: {
  readMovements: () => Promise<UnitMovementsResult>;
  // `null` cuando el rol no lee la auditoría: la pantalla no la pide, y el servicio igual la
  // rechazaría (I-9). Ocultarla es además, no en lugar de.
  readAudit: (() => Promise<UnitAuditResult>) | null;
  onError: (error: unknown) => void;
}): Promise<UnitHistory> {
  let movementsLimit = 0;
  const movements = await read(readMovements, onError, (result) => {
    if (!result.ok) return null;
    movementsLimit = result.limit;
    return result.movements;
  });

  // El total de la auditoría se conserva, no se descarta: es lo único con lo que la pantalla puede
  // decir que el historial está recortado (N-1).
  let auditTotal: number | null = null;
  const audit =
    readAudit === null
      ? undefined
      : await read(readAudit, onError, (result) => {
          if (!result.ok) return null;
          auditTotal = result.total;
          return result.entries;
        });

  const events = [
    ...(movements ?? []).map(toMovementEvent),
    ...(audit ?? []).map(toAuditEvent),
  ].sort((a, b) => {
    const byDate = b.at.getTime() - a.at.getTime();
    // Dos eventos del mismo instante necesitan un orden estable, o la lista baila entre cargas.
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });

  return {
    movements,
    audit,
    events,
    movementsShown: movements?.length ?? 0,
    movementsLimit,
    auditShown: audit?.length ?? 0,
    auditTotal,
  };
}

// Una lectura que **lanza** devuelve `null`, igual que una que vuelve como `Failure`. El contrato
// `Result` del módulo solo nombra los fallos de negocio; un error de base lanza y no llega al
// `if (!result.ok)`. Haber confundido esas dos cosas fue el bloqueante B-3 de la 24.5.1.
async function read<T, R>(
  reader: () => Promise<T>,
  onError: (error: unknown) => void,
  take: (result: T) => R[] | null,
): Promise<R[] | null> {
  // Comprobado en los dos sentidos el 2026-10-31: al quitar este `catch`, **tres** pruebas de
  // `unit-history.test.ts` fallan (brief-24.5.2, AC-10).
  let result: T;
  try {
    result = await reader();
  } catch (error) {
    onError(error);
    return null;
  }
  return take(result);
}

// `writeOffReasonFrom` vivía acá y **se retiró el 2026-10-31** por el hallazgo N-5 de la revisión
// independiente. Era el resto de la mitad de AC-7 que D-11 eliminó —el motivo en la sección «Dadas
// de baja»— y no tenía ningún llamador de producción: solo sus tres pruebas. Peor que código
// muerto: leído desde el informe de pruebas, daba la impresión de que ese camino estaba cubierto por
// una pantalla que ya no existe. El motivo de la baja se muestra en el panel, y ahí sale de los
// eventos del historial, no de esta función.
