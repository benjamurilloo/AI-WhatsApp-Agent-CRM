import type { AttributeType } from "@/modules/catalog";
import type { ErrorCode } from "@/shared/errors";

// Textos de Modelos y Atributos, de la capacidad variants (brief-29.2, D-4 y D-5).

export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const MODEL_NOT_FOUND_MESSAGE = "Este modelo no existe.";
export const NO_MODELS_MESSAGE = "Todavía no hay modelos.";
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
