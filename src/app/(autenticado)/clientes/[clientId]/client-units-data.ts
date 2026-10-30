import { getUnitWarranties, type WarrantyUnit } from "@/modules/inventory";
import { listClientDeliveredUnits } from "@/modules/orders";
import type { AuthContext } from "@/modules/organizations";
import { listClientSoldUnits } from "@/modules/sales";
import { listUnitServiceOrders, repairsAllowed } from "@/modules/service";
import { readOrNull } from "./operations-data";

// Las lecturas de «Equipos comprados» (brief-29.9, D-3; brief-24.4.3, D-2). Vive aparte de la tarjeta
// para que scripts/medir-caminos.ts mida este mismo camino. Sin la capacidad o sin permiso no hay
// sección; una lectura que falla vale null y la tarjeta lo dice, no «no compró equipos».

type ServiceOrders = Awaited<ReturnType<typeof listUnitServiceOrders>>;

export type ClientUnitsData = {
  ok: true;
  // null: la sección no aparece.
  section: {
    documents: Map<string, { href: string; label: string }>;
    units: WarrantyUnit[];
    serviceOrders: ServiceOrders;
    repairs: boolean;
  } | null;
};

const HIDDEN = { ok: true, section: null } as const;
const hides = (code: string) => code === "NOT_FOUND" || code === "FORBIDDEN";

export function readClientUnits(
  context: AuthContext,
  clientId: string,
): Promise<ClientUnitsData | null> {
  return readOrNull(
    context,
    async (): Promise<ClientUnitsData | { ok: false }> => {
      const [delivered, sold] = await Promise.all([
        listClientDeliveredUnits(context, clientId),
        listClientSoldUnits(context, clientId),
      ]);
      if (!delivered.ok) return hides(delivered.code) ? HIDDEN : { ok: false };
      if (!sold.ok) return hides(sold.code) ? HIDDEN : { ok: false };
      const documents = new Map<string, { href: string; label: string }>();
      for (const unit of delivered.units) {
        if (!documents.has(unit.unitId)) {
          documents.set(unit.unitId, {
            href: `/pedidos/${unit.orderId}`,
            label: `Pedido ${unit.displayNumber}`,
          });
        }
      }
      for (const unit of sold.units) {
        if (!documents.has(unit.unitId)) {
          documents.set(unit.unitId, {
            href: `/ventas/${unit.saleId}`,
            label: `Venta ${unit.displayNumber}`,
          });
        }
      }
      const [result, serviceOrders] = await Promise.all([
        getUnitWarranties(context, [...documents.keys()]),
        listUnitServiceOrders(context, [...documents.keys()]),
      ]);
      if (!result.ok) return hides(result.code) ? HIDDEN : { ok: false };
      const repairs =
        context.role === "admin" && (await repairsAllowed(context));
      // En el orden de los comprobantes: la entrega o la venta más nueva primero.
      const byId = new Map(result.units.map((unit) => [unit.id, unit]));
      const units = [...documents.keys()].flatMap((id) => {
        const unit = byId.get(id);
        return unit ? [unit] : [];
      });
      return {
        ok: true,
        section: { documents, units, serviceOrders, repairs },
      };
    },
  );
}
