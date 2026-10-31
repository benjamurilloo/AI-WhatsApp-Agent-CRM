import type { ProductUnitsPage, ProductUnitsResult } from "@/modules/inventory";

// La lectura de la lista de unidades, en la **capa de composición** (brief-24.5.2, I-2).
//
// **Por qué existe este archivo.** La página dibujaba «No disponible: no pudimos leer las unidades»
// cuando `listProductUnits` devolvía un `Failure`, y esa rama era **inalcanzable**: la página ya
// había llamado a `getProductStock` con el mismo contexto y el mismo producto, así que los tres
// fallos que `getProduct` puede devolver estaban descartados, y un error de base **lanza** en vez
// de volver como `Failure`. El anuncio era código muerto.
//
// Es **exactamente** el bloqueante B-3 de la 24.5.1, repetido en esta subfase en la lista mientras
// se hacía bien en el panel. Lo encontró la revisión independiente del 2026-10-31 como su B-2. La
// nota del vault que el brief se obliga a tener a la vista lo nombra: «An Announced Error State Is
// Dead Code When the Real Error Throws Instead of Returning a Failure».
//
// La convención la fijó la 24.4.2 con `clientes/list-data.ts`: el `catch` vive acá, se registra el
// evento y se devuelve «no se pudo leer», **sin agregar un código de error al contrato del módulo**.
// Y la lectura entra **como parámetro**, no se invoca por su nombre adentro: así el fallo se fuerza
// en una prueba sin mockear el módulo, que es lo que vuelve comprobable la rama.
export async function readUnitList(
  read: () => Promise<ProductUnitsResult>,
  onError: (error: unknown) => void,
): Promise<ProductUnitsPage | null> {
  // Comprobado en los dos sentidos el 2026-10-31: al quitar este `catch`, **dos** pruebas de
  // `list-data.test.ts` fallan (brief-24.5.2, AC-10 e I-2).
  let result: ProductUnitsResult;
  try {
    result = await read();
  } catch (error) {
    onError(error);
    return null;
  }
  // Un `Failure` del contrato también es «no se pudo leer». Que hoy sea difícil de provocar no
  // cambia qué hay que hacer con él: lo que estaba mal era **anunciarlo sin poder alcanzarlo**.
  if (!result.ok) return null;
  const { ok, ...page } = result;
  void ok;
  return page;
}
