import { permanentRedirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

// Los deudores se mudaron a `/cuentas` (brief-24.7.2, D-2): dejaron de ser una sección de la caja
// y pasaron a ser «Cuentas de clientes», un ítem propio de Finanzas. Esta ruta queda como
// redirección permanente para no romper un enlace guardado ni el historial de nadie.
//
// **Conserva los parámetros**: quien tenía guardado el filtro por moneda llega con su filtro
// puesto. `pagina` también viaja, porque la paginación no cambió de forma.
export default async function DebtorsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["moneda", "cliente", "pagina"]) {
    const value = query[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }
  const search = params.toString();
  permanentRedirect(search ? `/cuentas?${search}` : "/cuentas");
}
