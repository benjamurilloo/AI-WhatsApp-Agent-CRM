import { SubNav } from "@/app/_components/sub-nav";

// Las tres pantallas de un producto (brief-15.4, D-3): el resumen, los movimientos de stock y el
// historial de precios. Son páginas que ya existían, no pestañas.
export function ProductSubNav({
  productId,
  current,
}: {
  productId: string;
  current: "resumen" | "movimientos" | "precios";
}) {
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
      ]}
    />
  );
}
