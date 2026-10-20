import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { lockProductsForOrder } from "@/modules/catalog";
import { removeReceivedStock } from "@/modules/inventory";
import { nextDocumentNumber } from "@/modules/numbering";
import { authorize, type AuthContext } from "@/modules/organizations";
import { failure, type Failure } from "@/shared/errors";
import * as receiptRepository from "./goods-receipt-repository";
import {
  formatGoodsReceiptNumber,
  formatGoodsReceiptVoidNumber,
} from "./goods-receipts";
import * as orderRepository from "./purchase-order-repository";
import * as supplierRepository from "./repository";

// La anulación de la recepción (ADR 0023, puntos 6, 10 y 12; brief-22.5). Solo admin. Anula la
// recepción entera con otro comprobante, con un motivo de la lista cerrada: saca del stock lo que la
// recepción sumó, solo si alcanza lo disponible, y no toca el costo ni el estado de la orden.
//
// La serialización (D-5), en el orden del punto 10:
// 1. con orden, su cabecera FOR UPDATE, y otra mirada a la anulación: dos anulaciones de una
//    recepción con orden, o una anulación y la cancelación o el cierre de su orden, se ordenan acá;
// 2. los productos en modo compartido, ordenados por id, sin mirar si están activos;
// 3. la salida de stock, que bloquea los saldos y comprueba lo disponible;
// 4. ante una falta, otra mirada a la anulación con los saldos tomados (H-3): sin orden, dos
//    anulaciones se ordenan en los saldos, y la segunda encuentra el stock ya sacado por la primera;
// 5. el motivo, que vuelve a mirar y toma el contador;
// 6. la anulación y la auditoría.
// Todo rechazo después de bloquear se lanza y se traduce fuera de la transacción (convención de la
// 19.3; R-1 de la 22.4). Ningún rechazo escribe, audita, mueve stock ni consume número (D-6).

export type GoodsReceiptVoidReason = receiptRepository.GoodsReceiptVoidReason;

export const GOODS_RECEIPT_VOID_REASONS =
  receiptRepository.GOODS_RECEIPT_VOID_REASONS;

type VoidReference = { id: string; number: number; displayNumber: string };

export type GoodsReceiptVoidShortage = {
  productId: string;
  // Lo que hay que sacar y lo disponible hoy, con la escala de la base.
  requested: string;
  available: string;
};

export type VoidGoodsReceiptResult =
  // La orden de la recepción, si tiene: su detalle cambia lo recibido.
  | { ok: true; receiptVoid: VoidReference; purchaseOrderId: string | null }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "already_voided"; receiptVoid: VoidReference }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "insufficient_stock"; shortages: GoodsReceiptVoidShortage[] }
    >
  // Desde la 29.5: una unidad que creó la recepción ya no está disponible, porque se dio de baja (o,
  // desde la 29.5.2, se reservó o se vendió). Lleva sus IMEI (brief-29.5, D-4).
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "units_not_available"; serials: string[] }
    >;

const idSchema = z.uuid();
const reasonSchema = z.enum(receiptRepository.GOODS_RECEIPT_VOID_REASONS);

function voidReference(row: receiptRepository.GoodsReceiptVoidRow) {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatGoodsReceiptVoidNumber(row.number),
  };
}

function voidedResult(
  row: receiptRepository.GoodsReceiptVoidRow,
): VoidGoodsReceiptResult {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "already_voided",
    receiptVoid: voidReference(row),
  };
}

// Los rechazos que llegan con algo bloqueado se lanzan, para revertir la transacción y con ella la
// fila en 0 que pudo crear el bloqueo de un saldo. Se traducen fuera.
class AlreadyVoided extends Error {
  constructor(readonly row: receiptRepository.GoodsReceiptVoidRow) {
    super("already_voided");
  }
}

class InsufficientStock extends Error {
  constructor(readonly shortages: GoodsReceiptVoidShortage[]) {
    super("insufficient_stock");
  }
}

class UnitsNotAvailable extends Error {
  constructor(readonly serials: string[]) {
    super("units_not_available");
  }
}

export async function voidGoodsReceipt(
  context: AuthContext,
  goodsReceiptId: string,
  reason: string,
): Promise<VoidGoodsReceiptResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(goodsReceiptId).success) {
    return failure("VALIDATION_ERROR");
  }
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return failure("VALIDATION_ERROR");
  const { organizationId, userId } = context;

  // La recepción y sus líneas se leen sin bloqueo: son inmutables (D-4). Una ya anulada se rechaza
  // antes de bloquear nada.
  const receipt = await receiptRepository.findGoodsReceipt(
    organizationId,
    goodsReceiptId.toLowerCase(),
  );
  if (!receipt) return failure("NOT_FOUND");
  const previous = await receiptRepository.findVoidByGoodsReceipt(
    organizationId,
    receipt.id,
  );
  if (previous) return voidedResult(previous);
  const lines = await receiptRepository.findGoodsReceiptLines(
    organizationId,
    receipt.id,
  );
  // Desde la 29.5, las unidades que creó cada línea de un producto por unidad: son de solo inserción.
  const unitIds = new Map<string, string[]>();
  for (const row of await receiptRepository.findGoodsReceiptLineUnits(
    organizationId,
    receipt.id,
  )) {
    unitIds.set(row.productId, [
      ...(unitIds.get(row.productId) ?? []),
      row.unitId,
    ]);
  }
  const displayNumber = formatGoodsReceiptNumber(receipt.number);

  try {
    return await supplierRepository.withTransaction(
      async (tx): Promise<VoidGoodsReceiptResult> => {
        const voidedNow = () =>
          receiptRepository.findVoidByGoodsReceipt(
            organizationId,
            receipt.id,
            tx,
          );

        // 1. Con orden, la cabecera FOR UPDATE, y otra mirada a la anulación. La orden no cambia: el
        // bloqueo solo ordena (D-4, punto 5).
        if (receipt.purchaseOrderId !== null) {
          const locked = await orderRepository.findPurchaseOrder(
            organizationId,
            receipt.purchaseOrderId,
            tx,
            { forUpdate: true },
          );
          if (!locked) throw new Error("la orden de la recepción no existe");
          const again = await voidedNow();
          if (again) throw new AlreadyVoided(again);
        }

        // 2. Los productos en modo compartido, por id, sin mirar si están activos (punto 6).
        await lockProductsForOrder(
          tx,
          organizationId,
          lines.map((line) => line.productId),
        );

        // 3 a 5. La salida de stock: bloquea los saldos, comprueba lo disponible y, si alcanza, pide
        // el motivo, que vuelve a mirar y toma el contador. El motivo no nombra al proveedor.
        let number: number | null = null;
        const stock = await removeReceivedStock(tx, {
          organizationId,
          lines: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            ...(unitIds.has(line.productId)
              ? { unitIds: unitIds.get(line.productId)! }
              : {}),
          })),
          reason: async () => {
            const again = await voidedNow();
            if (again) throw new AlreadyVoided(again);
            number = await nextDocumentNumber(
              tx,
              organizationId,
              "goods_receipt_void",
            );
            return `Anulación ${formatGoodsReceiptVoidNumber(number)} de la recepción ${displayNumber}`;
          },
          createdBy: userId,
        });
        if (!stock.ok) {
          // 4. Con los saldos o las unidades tomados: si otra anulación de la misma recepción confirmó
          // antes, el stock que falta es el que ella sacó, y la respuesta es «ya anulada» (H-3).
          const again = await voidedNow();
          if (again) throw new AlreadyVoided(again);
          if (stock.reason === "units_unavailable") {
            throw new UnitsNotAvailable(stock.units.map((unit) => unit.serial));
          }
          const positions = new Map(
            lines.map((line) => [line.productId, line.position]),
          );
          throw new InsufficientStock(
            [...stock.shortages].sort(
              (x, y) =>
                positions.get(x.productId)! - positions.get(y.productId)!,
            ),
          );
        }
        if (number === null) throw new Error("La anulación no tomó su número.");

        // 6. La anulación, con la moneda y el total de la recepción, y la auditoría sobre ella, con
        // el número de la anulación y el motivo, y nada más (D-7). La orden no se audita: su estado
        // no cambia.
        const receiptVoid = await receiptRepository.insertGoodsReceiptVoid(tx, {
          organizationId,
          number,
          goodsReceiptId: receipt.id,
          currency: receipt.currency,
          total: receipt.total,
          reason: parsedReason.data,
          createdBy: userId,
        });
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "goods_receipt",
          entityId: receipt.id,
          action: "void",
          diff: {
            before: { void_number: null, reason: null },
            after: {
              void_number: receiptVoid.number,
              reason: receiptVoid.reason,
            },
          },
        });
        return {
          ok: true,
          receiptVoid: voidReference(receiptVoid),
          purchaseOrderId: receipt.purchaseOrderId,
        };
      },
    );
  } catch (error) {
    if (error instanceof AlreadyVoided) return voidedResult(error.row);
    if (error instanceof InsufficientStock) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_stock",
        shortages: error.shortages,
      };
    }
    if (error instanceof UnitsNotAvailable) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units_not_available",
        serials: error.serials,
      };
    }
    // La base es la última defensa: dos anulaciones que igual chocan en
    // goods_receipt_voids_goods_receipt_unique son la misma regla, no un error (D-5).
    if (!receiptRepository.isGoodsReceiptAlreadyVoided(error)) throw error;
    const existing = await receiptRepository.findVoidByGoodsReceipt(
      organizationId,
      receipt.id,
    );
    if (!existing) throw error;
    return voidedResult(existing);
  }
}
