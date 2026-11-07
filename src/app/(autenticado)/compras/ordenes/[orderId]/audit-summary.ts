import {
  type GoodsReceiptSummary,
  type PurchaseOrderAuditEntry,
} from "@/modules/purchasing";
import { formatQuantity } from "@/shared/quantity";
import { byQuantity } from "../messages";

// La «Actividad» de una orden de compra (brief-24.8.1, D-6): el rótulo y la oración de la lámina
// 03 en lugar de la transición —«Alta» / «Orden OC-000004 · 2 líneas · total $ 3.002,49» y
// «Cancelación» / «Abierta → Cancelada»— que esta ficha mostraba desde la 22.3. Lo que se narra es
// el hecho, no el cambio de columna. Nada de `audit` cambia: los textos los compone la página.
//
// **Corrección de D-6, declarada en el brief el 2026-11-06, al implementar.** D-6 dice que la
// actividad se compone «a partir de las entradas de auditoría que ya lee», y con eso solo la fila
// «Recepción parcial» de la lámina no existe: una recepción que **no cierra** la orden no deja
// entrada en la auditoría de la orden —`goods-receipts.ts` audita el `status_change` únicamente
// cuando la recepción la completa, y la propia recepción se audita bajo su entidad—. Esa fila sale
// de `order.receipts`, que la ficha ya lee para la tabla «Recepciones». No es una lectura nueva.

export type PurchaseOrderActivityRow = {
  id: string;
  at: Date;
  label: string;
  sentence: string;
};

// El rótulo de la izquierda del hito, el que la lámina pone en negrita.
export function auditActionLabel(entry: PurchaseOrderAuditEntry): string {
  if (entry.action === "create") return "Creada";
  if (entry.action !== "status_change") return entry.action;
  const after = entry.diff.after;
  if (after?.status === "cancelled") return "Cancelada";
  if (after?.status === "closed") {
    return after.closed_by === "manual" ? "Cerrada con faltante" : "Cerrada";
  }
  return "Cambio de estado";
}

// La oración. El autor va adentro, como en la lámina («Orden de compra creada por Carla Méndez.»),
// y no en una columna «Autor»: la actividad dejó de ser una tabla. Cuando la entrada no tiene un
// nombre resoluble, la oración se dice sin autor en lugar de inventar uno.
export function describeAuditEntry(
  entry: PurchaseOrderAuditEntry,
  actor: string | null,
): string {
  const by = actor ? ` por ${actor}` : "";
  if (entry.action === "create") return `Orden de compra creada${by}.`;
  if (entry.action !== "status_change") return "—";
  const after = entry.diff.after;
  if (after?.status === "cancelled") {
    return `Orden de compra cancelada${by}.`;
  }
  if (after?.status === "closed") {
    if (
      after.closed_by === "goods_receipt" &&
      typeof after.goods_receipt_number === "string"
    ) {
      return `La recepción ${after.goods_receipt_number} completó la orden.`;
    }
    if (after.closed_by === "manual") {
      return `Orden cerrada con faltante${by}: lo que falta ya no se recibe con esta orden.`;
    }
    return `Orden de compra cerrada${by}.`;
  }
  return "—";
}

// La fila de una recepción, con la oración de la lámina: «Se registró la recepción RC-000091 por 2
// unidades». Desde la 24.8.1-b dice **las unidades y no el monto** (brief-24.8.1-b, AC-12): el
// recuento que la 24.8.1 no tenía es la suma de las cantidades de las líneas, que
// `GoodsReceiptSummary` ahora trae en `unitCount`. No es una lectura nueva de esta pantalla: la
// ficha ya lee `order.receipts` para la tabla «Recepciones».
export function receiptActivityRow(
  receipt: GoodsReceiptSummary,
): PurchaseOrderActivityRow {
  const units = formatQuantity(receipt.unitCount);
  const unitText = `${units} ${byQuantity(receipt.unitCount, "unidad", "unidades")}`;
  return {
    id: `recepcion-${receipt.id}`,
    at: receipt.createdAt,
    label: receipt.voidDisplayNumber ? "Recepción anulada" : "Recepción",
    sentence: receipt.voidDisplayNumber
      ? `Se registró la recepción ${receipt.displayNumber} por ${unitText}, anulada con ${receipt.voidDisplayNumber}.`
      : `Se registró la recepción ${receipt.displayNumber} por ${unitText}.`,
  };
}

// La cronología completa, **de la más vieja a la más nueva**, que es como la lee la lámina: primero
// «Creada» y después lo que pasó. La auditoría llega al revés, de la más nueva a la más vieja, que
// es el orden de `listEntityAuditLogs`.
//
// Cuando una recepción y el cierre que provocó caen en el mismo instante —se escriben en la misma
// transacción—, la recepción va primero: es la causa.
export function purchaseOrderActivity({
  entries,
  actorName,
  receipts,
}: {
  entries: PurchaseOrderAuditEntry[];
  actorName: (entry: PurchaseOrderAuditEntry) => string | null;
  receipts: GoodsReceiptSummary[];
}): PurchaseOrderActivityRow[] {
  const rows: { row: PurchaseOrderActivityRow; rank: number }[] = [
    ...receipts.map((receipt) => ({
      row: receiptActivityRow(receipt),
      rank: 0,
    })),
    ...entries.map((entry) => ({
      row: {
        id: entry.id,
        at: entry.createdAt,
        label: auditActionLabel(entry),
        sentence: describeAuditEntry(entry, actorName(entry)),
      },
      rank: 1,
    })),
  ];
  rows.sort(
    (a, b) => a.row.at.getTime() - b.row.at.getTime() || a.rank - b.rank,
  );
  return rows.map((item) => item.row);
}
