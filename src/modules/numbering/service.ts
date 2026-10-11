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

// El número como se muestra: el prefijo del tipo y seis dígitos, P-000123 (ADR 0019, punto 2).
// Pasado el millón, el número se muestra con todos sus dígitos.
const PREFIXES: Record<DocumentKind, string> = { order: "P" };

export function formatDocumentNumber(
  kind: DocumentKind,
  value: number,
): string {
  return `${PREFIXES[kind]}-${String(value).padStart(6, "0")}`;
}
