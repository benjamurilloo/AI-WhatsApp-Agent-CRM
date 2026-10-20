import type { DbTransaction } from "@/shared/db";
import * as repository from "./repository";

// Numeración sin huecos por organización y tipo (ADR 0019, punto 2; ADR 0020, punto 2;
// brief-19.2). numbering no autoriza ni conoce el documento: lo llama el módulo que lo crea,
// dentro de su transacción, que se exige por tipo. Así la venta de la Fase 20 numera sin
// depender de orders.

export type DocumentKind = repository.DocumentKind;

export function nextDocumentNumber(
  tx: DbTransaction,
  organizationId: string,
  kind: DocumentKind,
): Promise<number> {
  return repository.takeNextNumber(tx, organizationId, kind);
}

// El número como se muestra: el prefijo del tipo y seis dígitos, P-000123, V-000123, A-000045,
// C-000045, R-000123, AR-000012, D-000007, AD-000002, OC-000004, RC-000003, ARC-000001, PP-000002, APP-000001 u OS-000123 (ADR 0019, punto 2; ADR 0021, puntos 6 y 7; ADR 0022, punto 11;
// ADR 0023, puntos 3, 4, 6, 8 y 13; ADR 0024, punto 10). Pasado el millón, el número se muestra con todos sus dígitos.
const PREFIXES: Record<DocumentKind, string> = {
  order: "P",
  sale: "V",
  sale_void: "A",
  // La sesión de caja (ADR 0022, punto 11; brief-21.2).
  cash_session: "C",
  // El cobro, como recibo (ADR 0022, punto 11; brief-21.3).
  receipt: "R",
  // La anulación de un cobro, la devolución y su anulación (ADR 0022, punto 11; brief-21.5).
  receipt_void: "AR",
  refund: "D",
  refund_void: "AD",
  // La orden de compra (ADR 0023, punto 3; brief-22.3, H-5).
  purchase_order: "OC",
  // La recepción (ADR 0023, punto 4; brief-22.4).
  goods_receipt: "RC",
  // La anulación de la recepción (ADR 0023, puntos 6 y 13; brief-22.5, H-8).
  goods_receipt_void: "ARC",
  // El pago a un proveedor y su anulación (ADR 0023, puntos 8 y 13; brief-22.6).
  supplier_payment: "PP",
  supplier_payment_void: "APP",
  // La orden de servicio de una reparación (ADR 0024, punto 10; brief-29.6, D-4).
  service_order: "OS",
};

export function formatDocumentNumber(
  kind: DocumentKind,
  value: number,
): string {
  return `${PREFIXES[kind]}-${String(value).padStart(6, "0")}`;
}
