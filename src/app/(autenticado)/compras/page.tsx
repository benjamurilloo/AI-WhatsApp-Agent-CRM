import { redirect } from "next/navigation";

// Compras lleva a los proveedores hasta que la 22.3 sume las órdenes de compra y la navegación
// interna de la sección (brief-22.2, D-9). La lista exige admin por su cuenta.
export default function PurchasingPage() {
  redirect("/compras/proveedores");
}
