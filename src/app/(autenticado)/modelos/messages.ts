import type { AttributeType } from "@/modules/catalog";
import type { ErrorCode } from "@/shared/errors";

// Textos de Modelos y Atributos, de la capacidad variants (brief-29.2, D-4 y D-5).

export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const MODEL_NOT_FOUND_MESSAGE = "Este modelo no existe.";
export const NO_MODELS_MESSAGE = "Todavía no hay modelos.";
export const NO_MODELS_FOUND_MESSAGE =
  "Ningún modelo coincide con la búsqueda.";
export const MODELS_SUBTITLE =
  "Organizá las familias que comparten variantes y servicios.";

// El filtro de estado de la lámina 03. Su valor por omisión es **«Todos»** y no «Activos» como la
// lámina (*decidido el 2026-11-01, por la revisión independiente, F-7*). Dos razones: la lámina
// dibuja cuatro modelos activos y ninguno inactivo, así que ahí los dos valores se ven igual; y la
// posición de un modelo es **global**, de modo que con un filtro puesto el vecino de una fila puede
// ser un modelo que no se ve, y mover contra un vecino invisible cambia la posición sin cambiar lo
// que el usuario ve. Con «Todos» por omisión, el caso común no tiene vecinos ocultos; con un filtro
// puesto, la pantalla deshabilita las flechas y lo dice.
export const MODEL_ACTIVITY_LABEL = {
  todos: "Todos",
  activos: "Activos",
  inactivos: "Inactivos",
} as const;

export type ModelActivity = keyof typeof MODEL_ACTIVITY_LABEL;

export function readModelActivity(
  value: string | string[] | undefined,
): ModelActivity {
  const key = Array.isArray(value) ? value[0] : value;
  return key === "activos" || key === "inactivos" ? key : "todos";
}

export const REORDER_FILTERED_MESSAGE =
  "Para reordenar, quitá los filtros: la posición es de toda la lista y el vecino de una fila puede estar oculto.";
export const NO_ATTRIBUTES_MESSAGE = "Todavía no hay atributos.";
export const MODEL_NAME_MESSAGE = "Ingresá un nombre de hasta 120 caracteres.";
export const MODEL_BRAND_MESSAGE =
  "La marca no puede superar los 100 caracteres.";
export const MODEL_NAME_TAKEN_MESSAGE = "Ya existe un modelo con ese nombre.";
export const ATTRIBUTE_NAME_MESSAGE =
  "Ingresá un nombre de hasta 60 caracteres, que empiece con una letra.";
export const ATTRIBUTE_NAME_TAKEN_MESSAGE =
  "Ya existe un atributo con ese nombre.";
export const ATTRIBUTE_TYPE_MESSAGE = "Elegí el tipo de dato.";
export const ATTRIBUTE_VARIANT_MESSAGE =
  "Un atributo de variante tiene que ser de tipo «Lista de opciones».";
export const ATTRIBUTE_OPTIONS_MESSAGE =
  "Escribí al menos una opción, una por línea, de hasta 60 caracteres y sin repetir.";
export const OPTION_LABEL_MESSAGE =
  "Ingresá una opción de hasta 60 caracteres.";
export const OPTION_TAKEN_MESSAGE = "Esa opción ya existe en este atributo.";

// Cuántas variantes usan un valor (brief-24.5.3, D-6), y por qué uno en uso no se desactiva a la
// ligera (AC-6). El caso 0 se dice con palabras y no con un «0»: la lámina pone la frase entera.
// Un atributo de variante distingue las combinaciones de un modelo, así que sus valores los usan
// **variantes**; los de un atributo común los usa cualquier producto. Decir «variantes» en los dos
// casos sería falso en el segundo.
export function usageText(usageCount: number, isVariant: boolean): string {
  const singular = isVariant ? "variante" : "producto";
  if (usageCount === 0) {
    return isVariant ? "Ninguna variante lo usa" : "Ningún producto lo usa";
  }
  return usageCount === 1
    ? `1 ${singular} lo usa`
    : `${usageCount} ${singular}s lo usan`;
}

export const OPTION_IN_USE_MESSAGE =
  "Los valores en uso no se quitan: desactivarlos los saca de los productos nuevos, y las variantes que ya los tienen los conservan.";
export const ATTRIBUTE_VALUES_TITLE = "Valores disponibles para variantes";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

export const ATTRIBUTE_TYPE_LABEL: Record<AttributeType, string> = {
  option: "Lista de opciones",
  text: "Texto",
  number: "Número",
  boolean: "Sí o no",
};

// El estado de un formulario: el campo con error, o null para el mensaje general.
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: string | null;
      message: string;
      values: Record<string, string>;
    };

export type ChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function changeMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return "Lo que querías cambiar ya no existe.";
    default:
      return unexpectedErrorMessage(requestId);
  }
}

const NOTICES: Record<string, string> = {
  "modelo-creado": "Modelo creado.",
  "modelo-editado": "Modelo actualizado.",
  "modelo-desactivado": "Modelo desactivado.",
  "modelo-reactivado": "Modelo reactivado.",
  "atributo-creado": "Atributo creado.",
  "atributo-editado": "Atributo actualizado.",
  "atributo-desactivado": "Atributo desactivado.",
  "atributo-reactivado": "Atributo reactivado.",
  "opcion-agregada": "Opción agregada.",
  "opcion-editada": "Opción actualizada.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
