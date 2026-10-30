import Link from "next/link";
import type { AuthContext } from "@/modules/organizations";
import { OPEN_WARRANTY_CLAIM_STATUSES } from "@/modules/service";
import { STATUS_LABEL } from "@/app/(autenticado)/reparaciones/messages";
import { linkClass, secondaryLinkClass } from "@/app/_components/form-styles";
import { SectionCard } from "@/app/_components/section-card";
import { warrantyText } from "@/app/(autenticado)/_warranty/warranty-text";
import { readClientUnits } from "./client-units-data";

// Los equipos que compró el cliente en su ficha (brief-29.9, D-3): las unidades de sus pedidos
// entregados y de sus ventas sin pedido vigentes, con su garantía. La página compone: orders y sales
// dan las unidades, inventory la garantía. Sin la capacidad serialized_units, la sección no aparece.
// Desde la 29.9.2, service da los reclamos de cada unidad, y un admin abre uno desde acá con este
// cliente (brief-29.9.2, D-1 y D-5).
export async function ClientUnits({
  context,
  clientId,
}: {
  context: AuthContext;
  clientId: string;
}) {
  const data = await readClientUnits(context, clientId);
  if (data === null) {
    return (
      <SectionCard id="equipos-titulo" title="Equipos comprados" icon="package">
        <p className="text-sm text-muted">
          No se pudieron leer los equipos de este cliente.
        </p>
      </SectionCard>
    );
  }
  if (data.section === null) return null;
  const { documents, units, serviceOrders, repairs } = data.section;
  // Los reclamos de garantía de cada unidad (brief-29.9.2, D-5); sin repairs, ninguno, y no se ofrece
  // abrir uno. Lo abre un admin, con la unidad en garantía y sin otro reclamo abierto.
  const claimsOf = (unitId: string) =>
    (serviceOrders.get(unitId) ?? []).filter(
      (order) => order.kind === "warranty_claim",
    );
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
                {claimsOf(unit.id).length > 0 ? (
                  <span className="flex flex-wrap gap-x-2 text-sm">
                    {claimsOf(unit.id).map((claim) => (
                      <Link
                        key={claim.id}
                        href={`/reparaciones/${claim.id}`}
                        className={secondaryLinkClass}
                      >
                        Reclamo {claim.displayNumber} ·{" "}
                        {STATUS_LABEL[claim.status]}
                      </Link>
                    ))}
                  </span>
                ) : null}
                {repairs &&
                unit.warranty?.status === "in_warranty" &&
                !claimsOf(unit.id).some((claim) =>
                  OPEN_WARRANTY_CLAIM_STATUSES.includes(claim.status),
                ) ? (
                  <span className="text-sm">
                    <Link
                      href={`/reparaciones/reclamo?unidad=${unit.id}&cliente=${clientId}`}
                      className={linkClass}
                    >
                      Abrir un reclamo de garantía
                    </Link>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
