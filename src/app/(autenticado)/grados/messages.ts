import type { GradeField, GradeWriteResult } from "@/modules/inventory";

// Textos de la pantalla de grados de las unidades, de la capacidad serialized_units (brief-29.5,
// D-5).

export const GRADES_TITLE = "Grados de las unidades";
export const NO_GRADES_MESSAGE = "Todavía no hay grados.";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

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

const FIELD_MESSAGE: Record<GradeField, string> = {
  name: "Ingresá un nombre de hasta 40 caracteres.",
  description: "La descripción no puede superar los 120 caracteres.",
};

export function gradeRejection(
  result: Exclude<GradeWriteResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    const field = result.fields[0] ?? "name";
    return { field, message: FIELD_MESSAGE[field] };
  }
  if (result.code === "CONFLICT") {
    return { field: "name", message: "Ya existe un grado con ese nombre." };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

export function changeMessage(code: string, requestId: string): string {
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
  "grado-creado": "Grado creado.",
  "grado-editado": "Grado actualizado.",
  "grado-desactivado":
    "Grado desactivado: ya no se ofrece al cargar una unidad. Las que lo tienen lo conservan.",
  "grado-reactivado": "Grado reactivado.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
