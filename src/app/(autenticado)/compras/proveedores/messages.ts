import type {
  CuitRejection,
  SupplierField,
  SupplierRule,
} from "@/modules/purchasing";
import type { ErrorCode } from "@/shared/errors";

// Textos de las pantallas de proveedores (brief-22.2, D-7 y D-9), derivados de la taxonomía de
// errores, como los de clientes.

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const SUPPLIER_NOT_FOUND_MESSAGE = "Este proveedor no existe.";
export const NO_SUPPLIERS_MESSAGE = "Todavía no hay proveedores.";
export const NO_SUPPLIER_RESULTS_MESSAGE =
  "Ningún proveedor coincide con esta búsqueda.";

// El pie de la lista (brief-24.8.2-b, lámina 13): explica por qué un inactivo sigue estando.
export const INACTIVE_SUPPLIERS_NOTE =
  "Los proveedores inactivos conservan su historial y pueden recibir pagos.";

// El repetido puede ser un proveedor desactivado, que la lista oculta por defecto (D-2 y D-4).
export const NAME_TAKEN_MESSAGE =
  "Ya existe un proveedor con ese nombre. Si está desactivado, buscalo con el filtro «Solo inactivos» o «Todos» y reactivalo.";
export const CUIT_TAKEN_MESSAGE =
  "Ya existe un proveedor con ese CUIT. Si está desactivado, buscalo con el filtro «Solo inactivos» o «Todos» y reactivalo.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// El formulario. Los límites van escritos: este archivo lo usan componentes de cliente, que no
// pueden importar valores de purchasing. messages.test.ts comprueba que coincidan.
export const NAME_MESSAGE = "Ingresá un nombre de hasta 120 caracteres.";
export const PHONE_FORMAT_MESSAGE =
  "Ingresá el teléfono en formato internacional, con + y código de país, por ejemplo +5491155551234.";
export const EMAIL_FORMAT_MESSAGE =
  "Ingresá un email válido de hasta 254 caracteres, por ejemplo nombre@dominio.com.";
// Dos mensajes para el CUIT (brief-22.3, D-12): la forma, y el dígito verificador que no cierra.
export const CUIT_FORMAT_MESSAGE =
  "Ingresá un CUIT de 11 dígitos, con o sin guiones, por ejemplo 20-12345678-6.";
export const CUIT_CHECK_DIGIT_MESSAGE =
  "El dígito verificador no corresponde a este CUIT. Revisá el último número.";
export const PHONE_HINT = "Formato internacional, por ejemplo +5491155551234.";
export const CUIT_HINT =
  "Con o sin guiones. Se comprueba el dígito verificador.";

// La casilla «Es técnico» del formulario (brief-24.8.2-b, D-2; lámina 15). Solo se dibuja con la
// capacidad repairs: sin ella no hay órdenes de reparación que habilitar.
export const TECHNICIAN_LABEL = "Es técnico";
export const TECHNICIAN_HINT =
  "Habilita su selección en órdenes de reparación.";

// El aviso del formulario: es la regla que ya aplica desde la 22.2 (D-2 y D-4).
export const UNIQUE_SUPPLIER_NOTE =
  "El nombre y el CUIT no pueden repetirse, incluso con proveedores inactivos.";

const FIELD_MESSAGES: Record<SupplierField, string> = {
  name: NAME_MESSAGE,
  phone: PHONE_FORMAT_MESSAGE,
  email: EMAIL_FORMAT_MESSAGE,
  cuit: CUIT_FORMAT_MESSAGE,
};

// El orden del formulario.
const FIELD_ORDER: SupplierField[] = ["name", "phone", "email", "cuit"];

// Primer campo inválido en el orden del formulario, con su mensaje. El del CUIT depende de la razón.
export function supplierFieldError(
  fields: SupplierField[],
  cuitReason?: CuitRejection,
): {
  field: SupplierField;
  message: string;
} {
  const field =
    FIELD_ORDER.find((candidate) => fields.includes(candidate)) ?? "name";
  if (field === "cuit" && cuitReason === "check_digit") {
    return { field, message: CUIT_CHECK_DIGIT_MESSAGE };
  }
  return { field, message: FIELD_MESSAGES[field] };
}

// Un nombre o un CUIT repetido, en su campo.
export function supplierRuleError(rule: SupplierRule): {
  field: SupplierField;
  message: string;
} {
  return rule === "duplicate_cuit"
    ? { field: "cuit", message: CUIT_TAKEN_MESSAGE }
    : { field: "name", message: NAME_TAKEN_MESSAGE };
}

// La casilla «Es técnico» se conserva tras un rechazo, como los campos de texto (brief-24.8.2-b,
// D-2). Es un booleano y no un SupplierField: no tiene mensaje de validación propio.
export type SupplierFormValues = Record<SupplierField, string> & {
  isTechnician: boolean;
};

export type SupplierFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: SupplierField | null;
      message: string;
      values: SupplierFormValues;
    };

// Desactivar y reactivar.

export type SupplierChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function supplierChangeMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return SUPPLIER_NOT_FOUND_MESSAGE;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

// La tarjeta del proveedor inactivo de la lámina 17-5 (brief-24.8.2-b, V-35): las tres frases,
// que dicen qué se puede y qué no, en vez de la tarjeta «Estado» muda de antes.
export const SUPPLIER_INACTIVE_LINES = [
  "Este proveedor está inactivo.",
  "No se pueden generar nuevas órdenes de compra ni recibir mercadería.",
  "Puede recibir pagos.",
];

// La tarjeta «Trabajo reparado» de la lámina 14 (V-23, D-4).
export const NO_TECHNICIAN_WORK_MESSAGE =
  "Este técnico todavía no reparó ninguna orden.";
export const TECHNICIAN_WORK_NOTE =
  "Lo que se le debe por estas reparaciones está en su cuenta, junto con sus pagos.";

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creado: "Proveedor creado.",
  editado: "Proveedor actualizado.",
  desactivado: "Proveedor desactivado.",
  reactivado: "Proveedor reactivado.",
  // Acá vivían «tecnico-marcado» y «tecnico-desmarcado», de la 29.6. Se fueron con
  // setTechnicianAction, su único productor: desde la 24.8.2-b (D-2) la marca viaja en el alta y en
  // la edición, que avisan «creado» y «editado».
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
