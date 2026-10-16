import { z } from "zod";
import { authorize, type AuthContext } from "@/modules/organizations";
import { failure, type Failure } from "@/shared/errors";
import type { DbTransaction } from "@/shared/db";
import * as receiptRepository from "./goods-receipt-repository";
import {
  formatGoodsReceiptNumber,
  formatGoodsReceiptVoidNumber,
} from "./goods-receipts";
import * as supplierRepository from "./repository";

// Lo que purchasing le da a cash para los pagos a proveedores (ADR 0023, puntos 8 a 11; brief-22.6,
// D-5). cash depende de purchasing; purchasing no depende de cash y nunca toma el bloqueo de cobros.
//
// Las tres primeras reciben la transacción de cash y no pasan por authorize: las llama cash después
// de su propio authorize(admin), con el bloqueo de cobros tomado, como getSaleForReceipt de sales.
// Ninguna escribe. Un id que no es uuid no encuentra nada.

const idSchema = z.uuid();

export type SupplierLockStatus = "active" | "inactive" | "not_found";

// El proveedor en modo compartido (ADR 0023, punto 10; brief-22.6, D-7): el INSERT del pago lo toma
// por su clave foránea, y sin esto una edición del proveedor podría dejar el pago esperando con el
// contador tomado (ADR 0021, punto 7). Un proveedor desactivado se paga (punto 2): quien llama decide
// qué hacer con el estado.
export async function lockSupplierForPayment(
  tx: DbTransaction,
  organizationId: string,
  supplierId: string,
): Promise<SupplierLockStatus> {
  if (!idSchema.safeParse(supplierId).success) return "not_found";
  const supplier = await supplierRepository.findSupplier(
    organizationId,
    supplierId.toLowerCase(),
    tx,
    { forShare: true },
  );
  if (!supplier) return "not_found";
  return supplier.isActive ? "active" : "inactive";
}

// Una recepción como la ve la cuenta del proveedor: lo que una venta le da a la cuenta de un cliente
// (ADR 0023, punto 9).
export type GoodsReceiptForPayment = {
  id: string;
  number: number;
  displayNumber: string;
  supplierId: string;
  currency: string;
  // Con la escala de la base ("1234.50").
  total: string;
  // La fecha de emisión: el orden de la imputación.
  createdAt: Date;
  voided: boolean;
  voidDisplayNumber: string | null;
};

function forPayment(
  row: receiptRepository.GoodsReceiptForAccountRow,
): GoodsReceiptForPayment {
  const { voidNumber, ...rest } = row;
  return {
    ...rest,
    displayNumber: formatGoodsReceiptNumber(row.number),
    voided: voidNumber !== null,
    voidDisplayNumber:
      voidNumber === null ? null : formatGoodsReceiptVoidNumber(voidNumber),
  };
}

export async function getGoodsReceiptForPayment(
  tx: DbTransaction,
  organizationId: string,
  goodsReceiptId: string,
): Promise<GoodsReceiptForPayment | null> {
  if (!idSchema.safeParse(goodsReceiptId).success) return null;
  const row = await receiptRepository.findGoodsReceiptForAccount(
    tx,
    organizationId,
    goodsReceiptId.toLowerCase(),
  );
  return row ? forPayment(row) : null;
}

// Las recepciones de un proveedor, anuladas incluidas, de la más vieja a la más nueva.
export async function listSupplierGoodsReceiptsForAccount(
  tx: DbTransaction,
  organizationId: string,
  supplierId: string,
): Promise<GoodsReceiptForPayment[]> {
  if (!idSchema.safeParse(supplierId).success) return [];
  const rows = await receiptRepository.findSupplierGoodsReceiptsForAccount(
    tx,
    organizationId,
    supplierId.toLowerCase(),
  );
  return rows.map(forPayment);
}

// Para las pantallas de los pagos, no para cash (brief-22.6, D-13): los nombres de unos proveedores,
// que la página compone con los pagos. Solo admin.
export async function getSupplierNames(
  context: AuthContext,
  supplierIds: string[],
): Promise<{ ok: true; names: Map<string, string> } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return failure("FORBIDDEN");
  const ids = [
    ...new Set(
      supplierIds
        .filter((id) => idSchema.safeParse(id).success)
        .map((id) => id.toLowerCase()),
    ),
  ];
  const rows = await supplierRepository.findSupplierNames(
    context.organizationId,
    ids,
  );
  return { ok: true, names: new Map(rows.map((row) => [row.id, row.name])) };
}
