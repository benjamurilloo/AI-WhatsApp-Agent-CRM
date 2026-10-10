import { requireSession } from "@/app/_auth/session";
import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de un producto (brief-15.4, D-3): el resumen, los movimientos de stock y el
// historial de precios. Son páginas que ya existían, no pestañas. Desde la 18.2, los costos, solo
// para un admin (D-1 y D-3): la barra lee el rol de la sesión, que se resuelve una sola vez por
// request, así cada página que la usa la muestra igual. Ocultar el enlace es presentación: la
// página de costos y su servicio rechazan a un viewer por su cuenta.
export async function ProductSubNav({
  productId,
  current,
}: {
  productId: string;
  current: "resumen" | "movimientos" | "precios" | "costos";
}) {
  const context = await requireSession();
  const base = `/productos/${productId}`;
  return (
    <SubNav
      label="Secciones del producto"
      items={[
        {
          href: base,
          label: "Resumen",
          icon: "package",
          current: current === "resumen",
        },
        {
          href: `${base}/movimientos`,
          label: "Movimientos de stock",
          icon: "layers",
          current: current === "movimientos",
        },
        {
          href: `${base}/precios`,
          label: "Historial de precios",
          icon: "tag",
          current: current === "precios",
        },
        ...(context.role === "admin"
          ? [
              {
                href: `${base}/costos`,
                label: "Costos y margen",
                icon: "creditCard" as const,
                current: current === "costos",
              },
            ]
          : []),
      ]}
    />
  );
}
