import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de Compras (brief-22.3, D-10): las órdenes de compra, desde la 22.4 las recepciones
// (brief-22.4, D-11), desde la 22.6 los pagos (brief-22.6, D-13), desde la 22.7 lo que hay que pagar
// (brief-22.7, D-7) y los proveedores, como la navegación interna de la caja.
export function PurchasingSubNav({
  current,
}: {
  current: "ordenes" | "recepciones" | "pagos" | "a-pagar" | "proveedores";
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
          href: "/compras/pagos",
          label: "Pagos",
          icon: "banknote",
          current: current === "pagos",
        },
        {
          href: "/compras/a-pagar",
          label: "A pagar",
          icon: "list",
          current: current === "a-pagar",
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
