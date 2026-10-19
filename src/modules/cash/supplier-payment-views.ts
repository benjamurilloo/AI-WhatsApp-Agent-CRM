import { formatDocumentNumber } from "@/modules/numbering";
import { getGoodsReceiptForPayment } from "@/modules/purchasing";
import * as repository from "./repository";
import type * as paymentRepository from "./supplier-payment-repository";
import { tenderView, type TenderView } from "./tender";

// Cómo se muestran los pagos a proveedores (brief-22.6, D-13), compartido por sus pantallas y por el
// detalle de la sesión de caja, que solo los muestra a un admin (D-9). El nombre del proveedor lo
// compone la página con purchasing: cash solo lee las recepciones (D-5).

export type DocumentRef = { id: string; displayNumber: string };

export function formatSupplierPaymentNumber(value: number): string {
  return formatDocumentNumber("supplier_payment", value);
}

export function formatSupplierPaymentVoidNumber(value: number): string {
  return formatDocumentNumber("supplier_payment_void", value);
}

export type SupplierPaymentVoidView = DocumentRef & {
  number: number;
  reason: paymentRepository.SupplierPaymentVoidReason;
  sessionId: string | null;
  createdAt: Date;
};

export type SupplierPaymentListItem = DocumentRef & {
  number: number;
  createdAt: Date;
  target: paymentRepository.SupplierPaymentTarget;
  supplierId: string;
  // La recepción de un pago contra una recepción.
  goodsReceipt: DocumentRef | null;
  paymentMethodName: string;
  isCash: boolean;
  currency: string;
  amount: string;
  // Lo que salió en otra moneda (brief-29.4.3, D-7), o null.
  tender: TenderView | null;
  // Su anulación: se muestra y no cuenta.
  voided: SupplierPaymentVoidView | null;
};

export function voidViewOf(
  row: paymentRepository.SupplierPaymentRow["voided"],
): SupplierPaymentVoidView | null {
  if (row === null) return null;
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatSupplierPaymentVoidNumber(row.number),
    reason: row.reason as paymentRepository.SupplierPaymentVoidReason,
    sessionId: row.sessionId,
    createdAt: row.createdAt,
  };
}

// Los números de las recepciones de unos pagos, por purchasing: una lectura por recepción, con una
// transacción, como destinationsOf con las ventas. Una página tiene a lo sumo una página de pagos.
async function receiptsOf(
  organizationId: string,
  rows: paymentRepository.SupplierPaymentRow[],
): Promise<Map<string, DocumentRef>> {
  const ids = [
    ...new Set(
      rows
        .map((row) => row.goodsReceiptId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const refs = new Map<string, DocumentRef>();
  if (ids.length === 0) return refs;
  await repository.withTransaction(async (tx) => {
    for (const id of ids) {
      const receipt = await getGoodsReceiptForPayment(tx, organizationId, id);
      if (receipt) refs.set(id, { id, displayNumber: receipt.displayNumber });
    }
  });
  return refs;
}

export async function supplierPaymentListItems(
  organizationId: string,
  rows: paymentRepository.SupplierPaymentRow[],
): Promise<SupplierPaymentListItem[]> {
  if (rows.length === 0) return [];
  const [methods, receipts] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    receiptsOf(organizationId, rows),
  ]);
  const methodOf = new Map(methods.map((method) => [method.id, method]));
  return rows.map((row) => {
    const method = methodOf.get(row.paymentMethodId);
    return {
      id: row.id,
      number: row.number,
      displayNumber: formatSupplierPaymentNumber(row.number),
      createdAt: row.createdAt,
      target: row.target,
      supplierId: row.supplierId,
      goodsReceipt:
        row.goodsReceiptId === null
          ? null
          : (receipts.get(row.goodsReceiptId) ?? null),
      paymentMethodName: method?.name ?? "",
      isCash: method?.isCash ?? false,
      currency: row.currency,
      amount: row.amount,
      tender: tenderView(row),
      voided: voidViewOf(row.voided),
    };
  });
}
