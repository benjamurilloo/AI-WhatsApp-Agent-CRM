import { describe, expect, it } from "vitest";
import type {
  GoodsReceiptSummary,
  PurchaseOrderAuditEntry,
} from "@/modules/purchasing";
import {
  auditActionLabel,
  describeAuditEntry,
  purchaseOrderActivity,
  receiptActivityRow,
} from "./audit-summary";

// La «Actividad» de la orden de compra (brief-24.8.1, D-6): el hecho en una oración, no la
// transición. Reemplaza a los textos de la 22.3 y la 22.4 («Alta», «Abierta → Cerrada»).

function entry(
  action: PurchaseOrderAuditEntry["action"],
  diff: PurchaseOrderAuditEntry["diff"],
  createdAt = new Date(0),
): PurchaseOrderAuditEntry {
  return {
    id: `a-${createdAt.getTime()}-${action}`,
    entityType: "purchase_order",
    action,
    diff,
    actor: { kind: "user", id: "u", name: "Ana" },
    createdAt,
  };
}

function receipt(
  overrides: Partial<GoodsReceiptSummary> = {},
): GoodsReceiptSummary {
  return {
    id: "r1",
    number: 91,
    displayNumber: "RC-000091",
    supplierId: "s1",
    supplierName: "Importaciones Sur",
    purchaseOrderId: "o1",
    purchaseOrderDisplayNumber: "OC-000057",
    unitCount: "1.000",
    total: "1020.00",
    currency: "USD",
    createdAt: new Date(1000),
    voidDisplayNumber: null,
    ...overrides,
  };
}

describe("la actividad de una orden de compra", () => {
  it("el alta nombra a quien la creó y, sin autor resoluble, lo omite", () => {
    const created = entry("create", {
      before: null,
      after: {
        number: 4,
        status: "open",
        supplier_id: "proveedor-x",
        currency: "ARS",
        total: "3002.49",
        lines: 2,
      },
    });
    expect(auditActionLabel(created)).toBe("Creada");
    expect(describeAuditEntry(created, "Carla Méndez")).toBe(
      "Orden de compra creada por Carla Méndez.",
    );
    expect(describeAuditEntry(created, null)).toBe("Orden de compra creada.");
    // Ni el id del proveedor ni ningún otro dato interno salen a la pantalla (ADR 0023, punto 14).
    expect(describeAuditEntry(created, "Carla Méndez")).not.toContain(
      "proveedor-x",
    );
  });

  it("la cancelación cuenta el hecho y no la transición", () => {
    const cancelled = entry("status_change", {
      before: { status: "open" },
      after: { status: "cancelled" },
    });
    expect(auditActionLabel(cancelled)).toBe("Cancelada");
    expect(describeAuditEntry(cancelled, "Ana")).toBe(
      "Orden de compra cancelada por Ana.",
    );
    expect(describeAuditEntry(cancelled, "Ana")).not.toContain("→");
  });

  // brief-22.4, D-6: los dos cierres se distinguen, y desde la 24.8.1 cada uno con su oración.
  it("el cierre automático nombra la recepción, y el cierre a mano dice que queda faltante", () => {
    const byReceipt = entry("status_change", {
      before: {
        status: "open",
        closed_by: "goods_receipt",
        goods_receipt_number: "RC-000123",
      },
      after: {
        status: "closed",
        closed_by: "goods_receipt",
        goods_receipt_number: "RC-000123",
      },
    });
    expect(auditActionLabel(byReceipt)).toBe("Cerrada");
    expect(describeAuditEntry(byReceipt, "Ana")).toBe(
      "La recepción RC-000123 completó la orden.",
    );
    const manual = entry("status_change", {
      before: { status: "open", closed_by: "manual" },
      after: { status: "closed", closed_by: "manual" },
    });
    expect(auditActionLabel(manual)).toBe("Cerrada con faltante");
    expect(describeAuditEntry(manual, "Ana")).toBe(
      "Orden cerrada con faltante por Ana: lo que falta ya no se recibe con esta orden.",
    );
  });

  // Desde la 24.8.1-b la oración dice **las unidades** y no el monto (brief-24.8.1-b, AC-12): el
  // monto ya está en la tarjeta «Recepciones», y lo que la actividad no decía es cuánto entró.
  it("la recepción dice su número y sus unidades, y la anulada, con qué se anuló", () => {
    const current = receiptActivityRow(receipt());
    expect(current.label).toBe("Recepción");
    expect(current.sentence).toBe(
      "Se registró la recepción RC-000091 por 1 unidad.",
    );
    const many = receiptActivityRow(receipt({ unitCount: "2.500" }));
    expect(many.sentence).toBe(
      "Se registró la recepción RC-000091 por 2,5 unidades.",
    );
    const voided = receiptActivityRow(
      receipt({ voidDisplayNumber: "ARC-000012" }),
    );
    expect(voided.label).toBe("Recepción anulada");
    expect(voided.sentence).toBe(
      "Se registró la recepción RC-000091 por 1 unidad, anulada con ARC-000012.",
    );
  });

  // El orden es el de la lámina: de lo más viejo a lo más nuevo, al revés de como llega la
  // auditoría. Y la recepción va antes del cierre que provocó, que se escribe en la misma
  // transacción y puede traer el mismo instante.
  it("ordena de lo más viejo a lo más nuevo y pone la recepción antes del cierre que provocó", () => {
    const closedAt = new Date(2000);
    const rows = purchaseOrderActivity({
      entries: [
        entry(
          "status_change",
          {
            before: {
              status: "open",
              closed_by: "goods_receipt",
              goods_receipt_number: "RC-000091",
            },
            after: {
              status: "closed",
              closed_by: "goods_receipt",
              goods_receipt_number: "RC-000091",
            },
          },
          closedAt,
        ),
        entry("create", { before: null, after: { status: "open" } }),
      ],
      actorName: () => "Ana",
      receipts: [receipt({ createdAt: closedAt })],
    });
    expect(rows.map((row) => row.label)).toEqual([
      "Creada",
      "Recepción",
      "Cerrada",
    ]);
  });

  it("sin entradas ni recepciones no inventa filas", () => {
    expect(
      purchaseOrderActivity({
        entries: [],
        actorName: () => null,
        receipts: [],
      }),
    ).toEqual([]);
  });
});
