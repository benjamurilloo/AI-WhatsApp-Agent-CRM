import type { ClientField, TagField } from "@/modules/crm";
import type { ErrorCode } from "@/shared/errors";

// Textos de las pantallas 6 y 7 (wireframes 06 y 07), derivados de la taxonomía de errores
// (brief-5.3).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const CLIENT_NOT_FOUND_MESSAGE = "Este cliente no existe.";
export const NO_CLIENTS_MESSAGE = "Todavía no hay clientes.";
export const NO_CLIENT_RESULTS_MESSAGE =
  "Ningún cliente coincide con esta búsqueda.";

// El duplicado puede ser un cliente desactivado, que la lista oculta por defecto (brief-5.3, D-2).
export const PHONE_TAKEN_MESSAGE =
  "Ya existe un cliente con ese teléfono. Si está desactivado, buscalo con el filtro «Solo inactivos» o «Todos» y reactivalo.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// Formulario de cliente (alta y edición).

export const NAME_REQUIRED_MESSAGE =
  "Ingresá un nombre de hasta 200 caracteres.";
export const PHONE_FORMAT_MESSAGE =
  "Ingresá el teléfono en formato internacional, con + y código de país, por ejemplo +5491155551234.";
export const NOTES_TOO_LONG_MESSAGE =
  "Las notas no pueden superar los 1000 caracteres.";
export const PHONE_HINT = "Formato internacional, por ejemplo +5491155551234.";
export const NOTES_HINT = "No registres datos sensibles innecesarios.";

// Campos ampliados (brief-17.1). Los límites van escritos, como los de las etiquetas:
// messages.test.ts comprueba que coincidan con CLIENT_FIELD_LIMITS.
export const EMAIL_FORMAT_MESSAGE =
  "Ingresá un email válido de hasta 254 caracteres, por ejemplo nombre@dominio.com.";
export const KIND_MESSAGE = "Elegí persona o empresa.";
export const COMPANY_TOO_LONG_MESSAGE =
  "La empresa no puede superar los 120 caracteres.";
export const JOB_TITLE_TOO_LONG_MESSAGE =
  "El cargo no puede superar los 120 caracteres.";
export const ADDRESS_TOO_LONG_MESSAGE =
  "La calle y el número no pueden superar los 200 caracteres.";
export const CITY_TOO_LONG_MESSAGE =
  "La ciudad no puede superar los 120 caracteres.";
export const PROVINCE_MESSAGE = "Elegí una provincia de la lista.";
export const POSTAL_CODE_FORMAT_MESSAGE =
  "Ingresá un código postal de hasta 10 letras y números, por ejemplo 1425 o C1425ABC.";
export const SEGMENT_TOO_LONG_MESSAGE =
  "El segmento no puede superar los 60 caracteres.";
export const SEGMENT_HINT =
  "Una clasificación comercial, por ejemplo Mayorista o Minorista.";
// Lo que ve un viewer en lugar del email, la calle y el código postal (D-8).
export const CONTACT_HIDDEN_MESSAGE = "Solo visible para administradores.";

const CLIENT_FIELD_MESSAGES: Record<ClientField, string> = {
  displayName: NAME_REQUIRED_MESSAGE,
  phone: PHONE_FORMAT_MESSAGE,
  notes: NOTES_TOO_LONG_MESSAGE,
  email: EMAIL_FORMAT_MESSAGE,
  kind: KIND_MESSAGE,
  companyName: COMPANY_TOO_LONG_MESSAGE,
  jobTitle: JOB_TITLE_TOO_LONG_MESSAGE,
  addressLine: ADDRESS_TOO_LONG_MESSAGE,
  city: CITY_TOO_LONG_MESSAGE,
  province: PROVINCE_MESSAGE,
  postalCode: POSTAL_CODE_FORMAT_MESSAGE,
  segment: SEGMENT_TOO_LONG_MESSAGE,
};

// El orden del formulario (D-11).
const CLIENT_FIELD_ORDER: ClientField[] = [
  "displayName",
  "phone",
  "notes",
  "email",
  "kind",
  "companyName",
  "jobTitle",
  "addressLine",
  "city",
  "province",
  "postalCode",
  "segment",
];

// Primer campo inválido en el orden del formulario, con su mensaje.
export function clientFieldError(fields: ClientField[]): {
  field: ClientField;
  message: string;
} {
  const field =
    CLIENT_FIELD_ORDER.find((candidate) => fields.includes(candidate)) ??
    "displayName";
  return { field, message: CLIENT_FIELD_MESSAGES[field] };
}

export type ClientFormValues = Record<ClientField, string>;

export type ClientFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: ClientField | null;
      message: string;
      values: ClientFormValues;
    };

// Desactivar y reactivar (pantalla 7).

export type ClientChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function clientChangeMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return CLIENT_NOT_FOUND_MESSAGE;
    case "CONFLICT":
      return PHONE_TAKEN_MESSAGE;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creado: "Cliente creado.",
  editado: "Cliente actualizado.",
  desactivado: "Cliente desactivado.",
  reactivado: "Cliente reactivado.",
  "etiqueta-agregada": "Etiqueta agregada.",
  "etiqueta-quitada": "Etiqueta quitada.",
};

// Etiquetas de clientes (brief-16.1): la ficha (pantalla 7) y el catálogo (pantalla 13).

export const NO_TAGS_MESSAGE = "Este cliente no tiene etiquetas.";
export const NO_TAG_CATALOG_MESSAGE = "Todavía no hay etiquetas.";
export const TAG_NAME_MESSAGE = "Ingresá un nombre de hasta 40 caracteres.";
export const TAG_COLOR_MESSAGE = "Elegí uno de los colores.";
export const TAG_NAME_TAKEN_MESSAGE =
  "Ya existe una etiqueta con ese nombre. Si está desactivada, reactivala desde la lista.";
export const TAG_NOT_FOUND_MESSAGE =
  "Esta etiqueta no existe o está desactivada.";
// Los límites de D-11 van escritos: este archivo lo usan componentes de cliente, que no pueden
// importar valores de crm. messages.test.ts comprueba que coincidan con MAX_ACTIVE_TAGS y
// MAX_TAGS_PER_CLIENT.
export const TAG_ORGANIZATION_LIMIT_MESSAGE =
  "Ya hay 50 etiquetas activas, el máximo. Desactivá alguna para sumar otra.";
export const TAG_CLIENT_LIMIT_MESSAGE =
  "Un cliente puede tener hasta 10 etiquetas. Quitá alguna para agregar otra.";
export const SUGGESTED_TAGS_TAKEN_MESSAGE =
  "Las etiquetas sugeridas solo se crean con el catálogo vacío.";

const TAG_FIELD_MESSAGES: Record<TagField, string> = {
  name: TAG_NAME_MESSAGE,
  color: TAG_COLOR_MESSAGE,
};

export function tagFieldError(fields: TagField[]): {
  field: TagField;
  message: string;
} {
  const field: TagField = fields.includes("name") ? "name" : "color";
  return { field, message: TAG_FIELD_MESSAGES[field] };
}

export type TagFormValues = { name: string; color: string };

export type TagFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: TagField | null;
      message: string;
      values: TagFormValues;
    };

// Un rechazo al poner, quitar, desactivar o reactivar una etiqueta, con el límite si lo hubo.
export function tagChangeMessage(
  result: {
    code: Exclude<ErrorCode, "UNAUTHENTICATED">;
    limit?: "organization" | "client";
  },
  requestId: string,
): string {
  if (result.limit === "client") return TAG_CLIENT_LIMIT_MESSAGE;
  if (result.limit === "organization") return TAG_ORGANIZATION_LIMIT_MESSAGE;
  switch (result.code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return TAG_NOT_FOUND_MESSAGE;
    case "CONFLICT":
      return SUGGESTED_TAGS_TAKEN_MESSAGE;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

const TAG_NOTICES: Record<string, string> = {
  creada: "Etiqueta creada.",
  editada: "Etiqueta actualizada.",
  desactivada:
    "Etiqueta desactivada. Los clientes que la tenían la conservan, como inactiva.",
  reactivada: "Etiqueta reactivada.",
  sugeridas: "Etiquetas sugeridas creadas.",
};

export function tagNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(TAG_NOTICES, key) ? TAG_NOTICES[key]! : null;
}

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
