import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de Compras (brief-22.3, D-10): las órdenes de compra y los proveedores, como la
// navegación interna de la caja.
export function PurchasingSubNav({
  current,
}: {
  current: "ordenes" | "proveedores";
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
          href: "/compras/proveedores",
          label: "Proveedores",
          icon: "truck",
          current: current === "proveedores",
        },
      ]}
    />
  );
}
