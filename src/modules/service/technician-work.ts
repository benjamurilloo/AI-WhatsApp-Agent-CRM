import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { listModels } from "@/modules/catalog";
import { type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import { repairTypes, serviceOrderLines, serviceOrders } from "./schema";
import { formatServiceOrderNumber, requireRepairs } from "./service-orders";

// Los trabajos que un técnico ya reparó (brief-24.8.2-b, D-4): el número de la orden, el modelo del
// equipo, los tipos de reparación y lo que cobra, para la tarjeta «Trabajo reparado» de la ficha del
// proveedor (lámina 14 del lote 28).
//
// **No toca la cuenta** (H-5 del brief): lo que el técnico tiene pendiente es de `cash`, que ya lo
// resuelve con `listTechnicianChargesForAccount`, y la ficha lo muestra en su tarjeta «Cuenta». Acá
// solo está el trabajo, con su costo. Mezclar las dos cosas obligaría a `service` a conocer la
// imputación, que es justo lo que el ADR 0023 (punto 11) y la guarda impiden.
//
// Tiene **su propio `authorize(admin)`** —vía `requireRepairs(context, "admin")`, que además exige la
// capacidad `repairs` (ADR 0024, punto 10)— porque la llama una pantalla, no una transacción de otro
// módulo, a diferencia de `technician-charges.ts`.
//
// La consulta vive en este archivo, como `sale-origins.ts` y `warranties.ts`. Usa el mismo camino que
// `findTechnicianCharges`: `repaired_at is not null` con `technician_id`. El modelo se compone con
// `listModels` del catálogo, como hace la lista de órdenes: **sin `JOIN` entre módulos**. Los tipos
// de reparación sí se cruzan, porque las líneas y los tipos son de este módulo.

export type TechnicianWorkItem = {
  id: string;
  number: number;
  // «OS-000123».
  displayNumber: string;
  modelId: string;
  modelName: string | null;
  // Los tipos de reparación de las líneas, en el orden de la orden. Puede venir vacío si la orden
  // no tiene líneas, que es el caso de una unidad propia reparada sin presupuesto por línea.
  repairTypes: string[];
  // La moneda y el total del técnico, con la escala de la base ("1234.50").
  currency: string;
  total: string;
  repairedAt: Date;
};

// Lo que entra en la tarjeta de la ficha. Más que esto ya es la lista de reparaciones filtrada por
// el técnico, que es a donde lleva «Ver reparaciones» (D-5).
export const TECHNICIAN_WORK_LIMIT = 5;

export async function listTechnicianWork(
  context: AuthContext,
  supplierId: string,
  limit: number = TECHNICIAN_WORK_LIMIT,
): Promise<
  | { ok: true; items: TechnicianWorkItem[]; total: number }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  if (!isUuid(supplierId)) return failure("NOT_FOUND");

  const db = getDb();
  const where = and(
    eq(serviceOrders.organizationId, context.organizationId),
    eq(serviceOrders.technicianId, supplierId.toLowerCase()),
    isNotNull(serviceOrders.repairedAt),
    // Un reclamo reparado sin cargo no le debe nada al técnico, y tampoco es trabajo facturable
    // (brief-29.9.2, D-4): se cuenta igual que en la cuenta.
    isNotNull(serviceOrders.technicianTotal),
  );

  const [counted, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(serviceOrders)
      .where(where),
    db
      .select({
        id: serviceOrders.id,
        number: serviceOrders.number,
        modelId: serviceOrders.modelId,
        currency: serviceOrders.technicianCurrency,
        total: serviceOrders.technicianTotal,
        repairedAt: serviceOrders.repairedAt,
      })
      .from(serviceOrders)
      .where(where)
      .orderBy(desc(serviceOrders.repairedAt), desc(serviceOrders.number))
      .limit(limit),
  ]);
  const total = counted[0]?.total ?? 0;
  if (rows.length === 0) return { ok: true, items: [], total };

  const [lines, models] = await Promise.all([
    db
      .select({
        serviceOrderId: serviceOrderLines.serviceOrderId,
        name: repairTypes.name,
        position: serviceOrderLines.position,
      })
      .from(serviceOrderLines)
      .innerJoin(
        repairTypes,
        eq(repairTypes.id, serviceOrderLines.repairTypeId),
      )
      .where(
        and(
          eq(serviceOrderLines.organizationId, context.organizationId),
          inArray(
            serviceOrderLines.serviceOrderId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(serviceOrderLines.position),
    listModels(context),
  ]);
  const modelNames = new Map(
    models.ok ? models.models.map((model) => [model.id, model.name]) : [],
  );
  const typesOf = new Map<string, string[]>();
  for (const line of lines) {
    const names = typesOf.get(line.serviceOrderId) ?? [];
    names.push(line.name);
    typesOf.set(line.serviceOrderId, names);
  }

  return {
    ok: true,
    total,
    items: rows.map((row) => ({
      id: row.id,
      number: row.number,
      displayNumber: formatServiceOrderNumber(row.number),
      modelId: row.modelId,
      modelName: modelNames.get(row.modelId) ?? null,
      repairTypes: typesOf.get(row.id) ?? [],
      // El filtro de arriba garantiza los dos, y la base lo sostiene con el CHECK de la 0059.
      currency: row.currency!,
      total: row.total!,
      repairedAt: row.repairedAt!,
    })),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value.trim());
}
