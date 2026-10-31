import type {
  UnitStatusCounts,
  UnitStatusCountsResult,
} from "@/modules/inventory";

// Los contadores de unidades del Resumen de la ficha (brief-24.5.1, D-6, AC-5 y AC-6).
//
// La v2 pide que el Resumen responda «qué se puede ofrecer y qué está pendiente». Son tres
// contadores —disponibles, reservadas y en revisión— y **no llevan un total que los sume**, porque
// sumarlos no da ningún número del sistema: el saldo cuenta las disponibles y las reservadas, y las
// que están en reparación o en revisión quedan fuera (brief-24.5.1, I-3; inventory/schema.ts).
//
// Lo que sí es una suma con sentido es la **existencia física**: todo lo que está en el local, en
// cualquier estado salvo vendida o dada de baja. Es el «cinco existencias físicas» del README de
// V2-05, que son tres disponibles, una reservada y una en revisión.

// La lectura de los recuentos, con sus tres desenlaces explícitos (brief-24.5.1, I-2 y AC-8):
//
//  - un objeto: se leyeron, y el Resumen los dibuja;
//  - `undefined`: el producto se lleva por cantidad y no hay unidades que contar, que no es un
//    fallo y no se anuncia como tal;
//  - `null`: **la lectura no se pudo hacer**, y entonces el Resumen lo dice en vez de mostrar
//    ceros.
//
// El `catch` existe porque un error de base **lanza**: no vuelve como un `Failure`. Sin él,
// `null` sería inalcanzable y el anuncio de «No disponible», código muerto —era el defecto que
// encontró la revisión independiente del 2026-10-31—. Sigue la convención de la 24.4.2
// (`clientes/list-data.ts`, `readBalances`): se loguea y se devuelve «no se pudo leer», sin
// agregar un código de error al contrato del módulo, que otros consumidores tendrían que manejar.
//
// Recibe la lectura y el aviso como parámetros para que el fallo se pueda **forzar en una prueba**
// sin mocks del módulo: lo que AC-8 pide demostrar.
export async function readUnitCounts(
  read: () => Promise<UnitStatusCountsResult>,
  onError: (error: unknown) => void,
): Promise<UnitStatusCounts | null | undefined> {
  let result: UnitStatusCountsResult;
  try {
    result = await read();
  } catch (error) {
    onError(error);
    return null;
  }
  if (!result.ok) return null;
  // Por cantidad: `counts` es null por contrato y significa «no tiene unidades», no «falló».
  return result.tracking === "unit" ? result.counts : undefined;
}

export type UnitCounterKey = "available" | "reserved" | "in_review";

export type UnitCounter = {
  key: UnitCounterKey;
  label: string;
  total: number;
};

export function unitCounters(counts: UnitStatusCounts): UnitCounter[] {
  return [
    { key: "available", label: "Disponibles", total: counts.available },
    { key: "reserved", label: "Reservadas", total: counts.reserved },
    { key: "in_review", label: "En revisión", total: counts.in_review },
  ];
}

// Las que están en el local: ni vendidas ni dadas de baja.
export function physicalUnits(counts: UnitStatusCounts): number {
  return (
    counts.available + counts.reserved + counts.in_repair + counts.in_review
  );
}

// Las que están fuera del saldo aunque sigan en el local: reparación y revisión. Si son cero, el
// Resumen no necesita explicar nada, porque disponibles + reservadas sí da el saldo.
export function outsideBalance(counts: UnitStatusCounts): number {
  return counts.in_repair + counts.in_review;
}
