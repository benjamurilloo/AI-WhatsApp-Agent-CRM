import { hasCapability } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de un producto (brief-15.4, D-3): el resumen, los movimientos de stock y el
// historial de precios. Son páginas que ya existían, no pestañas. Desde la 18.2, los costos, solo
// para un admin (D-1 y D-3): la barra lee el rol de la sesión, que se resuelve una sola vez por
// request, así cada página que la usa la muestra igual. Ocultar el enlace es presentación: la
// página de costos y su servicio rechazan a un viewer por su cuenta. Desde la 29.5, las unidades,
// solo con la capacidad serialized_units (brief-29.5, D-6), con la misma regla: la página la vuelve a
// comprobar.
//
// Desde la 24.5.1 (brief-24.5.1, D-1, variante (a)) la barra tiene la forma de las pestañas de la
// lámina 09: los cinco nombres cortos de la v2, sin íconos —como ya las dejó la 24.3.1 en la
// bandeja— y con su propio desplazamiento horizontal en el teléfono. Las cinco rutas no se mueven:
// lo que cambia es el dibujo, no la navegación. El `aria-current` y el recorrido por teclado los
// pone `SubNav`, que son enlaces de verdad.
export async function ProductSubNav({
  productId,
  current,
}: {
  productId: string;
  current: "resumen" | "movimientos" | "precios" | "costos" | "unidades";
}) {
  const context = await requireSession();
  const units = await hasCapability(context.organizationId, "serialized_units");
  const base = `/productos/${productId}`;
  return (
    <SubNav
      label="Secciones del producto"
      scroll
      items={[
        {
          href: base,
          label: "Resumen",
          current: current === "resumen",
        },
        ...(units
          ? [
              {
                href: `${base}/unidades`,
                label: "Unidades",
                current: current === "unidades",
              },
            ]
          : []),
        {
          href: `${base}/movimientos`,
          label: "Movimientos",
          current: current === "movimientos",
        },
        {
          href: `${base}/precios`,
          label: "Precios",
          current: current === "precios",
        },
        ...(context.role === "admin"
          ? [
              {
                href: `${base}/costos`,
                label: "Costos",
                current: current === "costos",
              },
            ]
          : []),
      ]}
    />
  );
}
