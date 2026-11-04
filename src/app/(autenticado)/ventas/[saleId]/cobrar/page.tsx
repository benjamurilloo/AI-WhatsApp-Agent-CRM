import { redirect } from "next/navigation";

// El cobro de una venta dejó de ser una página con la 24.6.2-d (brief-24.6.2-d, D-2 y D-3): ahora
// es el panel `?panel=cobro` de la pestaña «Cobros» de la ficha, como la seña de un pedido desde la
// 24.6.1. Lo que era la pantalla 28 vive en `ventas/[saleId]/page.tsx`.
//
// **La ruta se conserva redirigiendo y no se borra** (D-4). No es solo un favorito: la aplicación la
// viene generando desde la 21.3, está en el historial de los usuarios y la nombran pruebas que ya
// existen. Una redirección es más barata que buscar todos los enlaces, y no romper una dirección
// que el proyecto publicó no necesita más justificación. `?moneda=` y `?usado=` viajan con ella, así
// que elegir una moneda o un usado y recargar sigue funcionando.
export default async function SaleReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{
    moneda?: string | string[];
    usado?: string | string[];
  }>;
}) {
  const { saleId } = await params;
  const query = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const extra = (["moneda", "usado"] as const)
    .map((name) => [name, first(query[name])] as const)
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => `&${name}=${encodeURIComponent(value!)}`)
    .join("");
  redirect(`/ventas/${saleId}?pestana=cobros&panel=cobro${extra}`);
}
