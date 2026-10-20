import { z } from "zod";
import type { DbTransaction } from "@/shared/db";
import * as repository from "./repository";
import { formatServiceOrderNumber } from "./service-orders";

// Lo que se le debe a un técnico por sus reparaciones (brief-29.6, D-7; decisión del usuario U-2): una
// orden reparada, y después entregada, pone su costo total al debe de la cuenta del técnico, como una
// recepción, con el número de la orden, su moneda y la fecha de reparación. Una cancelada o rechazada
// no, porque nunca se reparó. El pago es el de la 22.6, a cuenta: imputeAccount lo aplica de la deuda
// más vieja a la más nueva.
//
// La lee cash, con su transacción y después de su propio authorize(admin), como las recepciones de
// purchasing: en el pago, detrás del bloqueo de cobros, y en las lecturas de la cuenta, en una sola
// foto. No escribe ni toma bloqueos: una deuda que aparece mientras se paga solo sube lo que se debe,
// así que el tope del pago nunca queda corto (D-9). service no depende de cash.

const idSchema = z.uuid();

export type TechnicianCharge = {
  id: string;
  number: number;
  displayNumber: string;
  supplierId: string;
  currency: string;
  // Con la escala de la base ("1234.50").
  total: string;
  // La fecha de reparación: el orden de la imputación.
  repairedAt: Date;
};

function toCharge(row: repository.TechnicianChargeRow): TechnicianCharge {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatServiceOrderNumber(row.number),
    supplierId: row.technicianId,
    currency: row.technicianCurrency,
    total: row.technicianTotal,
    repairedAt: row.repairedAt,
  };
}

// Las de un técnico, de la más vieja a la más nueva.
export async function listTechnicianChargesForAccount(
  tx: DbTransaction,
  organizationId: string,
  supplierId: string,
): Promise<TechnicianCharge[]> {
  if (!idSchema.safeParse(supplierId).success) return [];
  const rows = await repository.findTechnicianCharges(tx, organizationId, [
    supplierId.toLowerCase(),
  ]);
  return rows.map(toCharge);
}

// Las de toda la organización, para la lista de proveedores a los que se les debe (brief-22.7, D-7).
export async function listTechnicianChargesForAccounts(
  tx: DbTransaction,
  organizationId: string,
): Promise<TechnicianCharge[]> {
  const rows = await repository.findTechnicianCharges(tx, organizationId, null);
  return rows.map(toCharge);
}
