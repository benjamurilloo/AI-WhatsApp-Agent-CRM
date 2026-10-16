import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de Compras (brief-22.3, D-10): las órdenes de compra, desde la 22.4 las recepciones
// (brief-22.4, D-11) y los proveedores, como la navegación interna de la caja.
export function PurchasingSubNav({
  current,
}: {
  current: "ordenes" | "recepciones" | "proveedores";
}) {
  return (
    <SubNav
      label="Secciones de compras"
      items={[
        {
          href: "/compras/ordenes",
          label: "Órdenes de compra",
          icon: "fileText",
          current: current === "ordenes",
        },
        {
          href: "/compras/recepciones",
          label: "Recepciones",
          icon: "package",
          current: current === "recepciones",
        },
        {
          href: "/compras/proveedores",
          label: "Proveedores",
          icon: "truck",
          current: current === "proveedores",
        },
      ]}
    />
  );
}
