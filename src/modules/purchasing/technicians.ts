import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";

// Los técnicos de las reparaciones (ADR 0023, punto 2; ADR 0024, punto 10; brief-29.6, D-3): un
// proveedor con la marca is_technician, de la capacidad repairs. Puede haber varios. La orden de
// servicio elige entre los activos con la marca, y lo que se le debe va a su cuenta de proveedor
// (D-7). Solo un admin lo ve y lo marca: un viewer no ve el técnico (ADR 0024, punto 14).

const idSchema = z.uuid();

export type Technician = { id: string; name: string };

export type SetTechnicianResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// La marca, con el molde de la desactivación: el proveedor FOR UPDATE, y sin cambio no se escribe ni
// se audita. Sin la capacidad, el proveedor no existe para esta acción.
export async function setSupplierTechnician(
  context: AuthContext,
  supplierId: string,
  isTechnician: boolean,
): Promise<SetTechnicianResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  if (!(await hasCapability(context.organizationId, "repairs"))) {
    return failure("NOT_FOUND");
  }
  const id = supplierId.toLowerCase();
  return repository.withTransaction(
    async (tx): Promise<SetTechnicianResult> => {
      const current = await repository.findSupplier(
        context.organizationId,
        id,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.isTechnician === isTechnician) {
        return { ok: true, changed: false };
      }
      await repository.updateSupplierTechnician(
        tx,
        context.organizationId,
        id,
        isTechnician,
      );
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "supplier",
        entityId: id,
        action: "update",
        diff: {
          before: { isTechnician: current.isTechnician },
          after: { isTechnician },
        },
      });
      return { ok: true, changed: true };
    },
  );
}

// Los técnicos activos, para elegir uno al mandar una orden. Solo admin.
export async function listTechnicians(
  context: AuthContext,
): Promise<{ ok: true; technicians: Technician[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  return {
    ok: true,
    technicians: await repository.findActiveTechnicians(context.organizationId),
  };
}

export type TechnicianLockStatus =
  "technician" | "inactive" | "not_technician" | "not_found";

// El técnico en modo compartido, para mandarle una orden (brief-29.6, D-9): el UPDATE de la orden lo
// toma por su clave foránea, y así una desactivación o un cambio de la marca en curso termina antes y
// se lee su estado confirmado. Recibe la transacción de service, que ya autorizó, como
// lockSupplierForPayment la de cash.
export async function lockTechnicianForServiceOrder(
  tx: DbTransaction,
  organizationId: string,
  supplierId: string,
): Promise<TechnicianLockStatus> {
  if (!idSchema.safeParse(supplierId).success) return "not_found";
  const supplier = await repository.findSupplier(
    organizationId,
    supplierId.toLowerCase(),
    tx,
    { forShare: true },
  );
  if (!supplier) return "not_found";
  if (!supplier.isActive) return "inactive";
  return supplier.isTechnician ? "technician" : "not_technician";
}
