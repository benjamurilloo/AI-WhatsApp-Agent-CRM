import { redirect } from "next/navigation";

// La seña de un pedido dejó de ser una página con la 24.6.1 (brief-24.6.1, D-5): ahora es el
// panel `?panel=senar` de la ficha, como las otras tres operaciones.
//
// La ruta se conserva redirigiendo porque **no es solo un favorito**: el aviso que deja
// `createOrderReceiptAction`, los enlaces de la ficha del cliente y las pruebas existentes la
// usan, y una dirección que la aplicación viene generando desde la 21.4 no se rompe sin motivo.
// `?moneda=` viaja con ella, así que elegir una moneda y recargar sigue funcionando.
export default async function OrderReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ moneda?: string | string[] }>;
}) {
  const { orderId } = await params;
  const { moneda } = await searchParams;
  const currency = Array.isArray(moneda) ? moneda[0] : moneda;
  redirect(
    `/pedidos/${orderId}?panel=senar${
      currency ? `&moneda=${encodeURIComponent(currency)}` : ""
    }`,
  );
}
