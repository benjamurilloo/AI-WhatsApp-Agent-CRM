import type { Margin } from "@/modules/catalog";
import type {
  ProductUnit,
  ProductUnitCosts,
  ProductUnitCostsResult,
} from "@/modules/inventory";

// La lectura de los costos por unidad, en la **capa de composición** (brief-24.5.2-b, I-2 y AC-11).
//
// Copia la convención que fijó `clientes/list-data.ts` en la 24.4.2 y que la 24.5.2 repitió en
// `unidades/list-data.ts`: el `catch` vive acá, se registra el evento y se devuelve «no se pudo
// leer», **sin agregar un código de error al contrato del módulo**. Y la lectura entra **como
// parámetro** en vez de invocarse por su nombre adentro, que es lo que permite forzar el fallo en
// una prueba sin mockear el módulo — y, por lo tanto, lo que vuelve **alcanzable** la rama que la
// pantalla anuncia.
//
// Sin esto, el aviso «No disponible» de la pantalla sería código muerto: la página ya llamó a
// `getProductCostSummary` con el mismo contexto y el mismo producto, así que los tres `Failure` que
// `getProduct` puede devolver están descartados cuando se llega acá, y un error de base **lanza**
// en vez de volver como `Failure`. Es el defecto que la revisión independiente encontró en la
// 24.5.1 (su B-3) y otra vez en la 24.5.2 (su B-2).

// Qué pudo leerse. `null` es «no se pudo», que **no** es lo mismo que «este producto no tiene
// unidades»: eso último es un resultado legítimo y viaja como `tracking: "quantity"` o como una
// base vacía (I-2).
export type UnitCostsRead =
  | { ok: true; tracking: "quantity"; costs: null }
  | { ok: true; tracking: "unit"; costs: ProductUnitCosts }
  | { ok: false };

export async function readUnitCosts(
  read: () => Promise<ProductUnitCostsResult>,
  onError: (error: unknown) => void,
): Promise<UnitCostsRead> {
  // Comprobado en los dos sentidos el 2026-11-01: al quitar este `catch`, **dos** pruebas de
  // `cost-data.test.ts` fallan —la del rechazo y la del throw síncrono—; con él, las cinco pasan
  // (brief-24.5.2-b, AC-11 e I-2).
  let result: ProductUnitCostsResult;
  try {
    result = await read();
  } catch (error) {
    onError(error);
    return { ok: false };
  }
  // Un `Failure` del contrato también es «no se pudo leer». Que hoy sea difícil de provocar no
  // cambia qué hay que hacer con él: lo que estaría mal es anunciarlo sin poder alcanzarlo.
  if (!result.ok) return { ok: false };
  return result.tracking === "quantity"
    ? { ok: true, tracking: "quantity", costs: null }
    : { ok: true, tracking: "unit", costs: result.costs };
}

// Una fila de la tabla por unidad, **ya resuelta**: el precio de referencia con su procedencia y el
// margen calculado. La arma la página, que es la única que tiene las dos mitades —el costo y el
// precio propio salen de `inventory`, el precio vigente del producto de `catalog`— y el componente
// solo dibuja. Separarlo así deja la tabla probable sin base y sin módulos.
export type UnitCostRow = {
  unit: ProductUnit;
  // El precio contra el que se calculó: el propio de la unidad si lo tiene, si no el del producto
  // (brief-24.5.2-b, D-6). `null` es «el producto tampoco tiene precio».
  price: { amount: string; currency: string } | null;
  // De dónde salió, para decirlo en la celda. Sin esto, dos filas con precios distintos parecen un
  // error de datos.
  priceIsOwn: boolean;
  margin: Margin;
};
