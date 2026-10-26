import Link from "next/link";
import { getUnitWarranties } from "@/modules/inventory";
import { listClientDeliveredUnits } from "@/modules/orders";
import type { AuthContext } from "@/modules/organizations";
import { listClientSoldUnits } from "@/modules/sales";
import { linkClass, secondaryLinkClass } from "@/app/_components/form-styles";
import { SectionCard } from "@/app/_components/section-card";
import { warrantyText } from "@/app/(autenticado)/_warranty/warranty-text";

// Los equipos que compró el cliente en su ficha (brief-29.9, D-3): las unidades de sus pedidos
// entregados y de sus ventas sin pedido vigentes, con su garantía. La página compone: orders y sales
// dan las unidades, inventory la garantía. Sin la capacidad serialized_units, la sección no aparece.
export async function ClientUnits({
  context,
  clientId,
}: {
  context: AuthContext;
  clientId: string;
}) {
  const [delivered, sold] = await Promise.all([
    listClientDeliveredUnits(context, clientId),
    listClientSoldUnits(context, clientId),
  ]);
  const documents = new Map<string, { href: string; label: string }>();
  for (const unit of delivered.ok ? delivered.units : []) {
    if (!documents.has(unit.unitId)) {
      documents.set(unit.unitId, {
        href: `/pedidos/${unit.orderId}`,
        label: `Pedido ${unit.displayNumber}`,
      });
    }
  }
  for (const unit of sold.ok ? sold.units : []) {
    if (!documents.has(unit.unitId)) {
      documents.set(unit.unitId, {
        href: `/ventas/${unit.saleId}`,
        label: `Venta ${unit.displayNumber}`,
      });
    }
  }
  const result = await getUnitWarranties(context, [...documents.keys()]);
  if (!result.ok) return null;
  // En el orden de los comprobantes: la entrega o la venta más nueva primero.
  const byId = new Map(result.units.map((unit) => [unit.id, unit]));
  const units = [...documents.keys()].flatMap((id) => {
    const unit = byId.get(id);
    return unit ? [unit] : [];
  });
  return (
    <SectionCard id="equipos-titulo" title="Equipos comprados" icon="package">
      {units.length === 0 ? (
        <p className="text-sm text-muted">
          Este cliente no compró equipos con IMEI.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {units.map((unit) => {
            const document = documents.get(unit.id)!;
            return (
              <li key={unit.id} className="flex flex-col gap-1 py-2">
                <span className="flex flex-wrap gap-x-2">
                  <Link
                    href={`/productos/${unit.productId}/unidades`}
                    className={linkClass}
                  >
                    {unit.productName}
                  </Link>
                  <span className="font-mono">{unit.serial}</span>
                </span>
                <span className="flex flex-wrap gap-x-2 text-sm text-muted">
                  <Link href={document.href} className={secondaryLinkClass}>
                    {document.label}
                  </Link>
                  {unit.warranty ? (
                    <span>{warrantyText(unit.warranty)}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
