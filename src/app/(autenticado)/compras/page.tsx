import { redirect } from "next/navigation";

// Compras lleva a las órdenes de compra, que son el trabajo de todos los días (brief-22.3, D-10).
// Hasta la 22.3 llevaba a los proveedores. La lista exige admin por su cuenta.
export default function PurchasingPage() {
  redirect("/compras/ordenes");
}
