"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addOption,
  createAttribute,
  createModel,
  moveAttribute,
  moveModel,
  moveOption,
  setAttributeActive,
  setModelActive,
  updateAttribute,
  updateModel,
  updateOption,
  type ActiveChangeResult,
  type AttributeField,
  type AttributeWriteResult,
  type ModelField,
  type ModelWriteResult,
} from "@/modules/catalog";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  ATTRIBUTE_NAME_MESSAGE,
  ATTRIBUTE_NAME_TAKEN_MESSAGE,
  ATTRIBUTE_OPTIONS_MESSAGE,
  ATTRIBUTE_TYPE_MESSAGE,
  ATTRIBUTE_VARIANT_MESSAGE,
  changeMessage,
  MODEL_BRAND_MESSAGE,
  MODEL_NAME_MESSAGE,
  MODEL_NAME_TAKEN_MESSAGE,
  OPTION_LABEL_MESSAGE,
  OPTION_TAKEN_MESSAGE,
  unexpectedErrorMessage,
  type ChangeState,
  type FormState,
} from "./messages";

// Server Actions de Modelos y Atributos (brief-29.2, D-4 y D-5). Next.js compara Origin con Host; la
// sesión, el rol, la organización y la capacidad se verifican en catalog. El log lleva actor,
// organización, código y duración, nunca nombres.

const MODELS = "/modelos";
const ATTRIBUTES = "/modelos/atributos";

function logDone(
  started: number,
  requestId: string,
  route: string,
  code: Parameters<typeof logEvent>[0]["code"],
  context: AuthContext,
  error?: unknown,
) {
  logEvent({
    level: code === "OK" ? "info" : error ? "error" : "warn",
    requestId,
    route,
    code,
    userId: context.userId,
    organizationId: context.organizationId,
    durationMs: performance.now() - started,
    error,
  });
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

type Rejection = { field: string | null; message: string };

// Un formulario con campos: guarda, y ante un rechazo devuelve lo escrito con el mensaje.
async function runForm<R extends { ok: boolean; code?: string }>(
  route: string,
  values: Record<string, string>,
  save: (context: AuthContext) => Promise<R>,
  outcome: (result: R & { ok: true }) => string,
  reject: (result: R & { ok: false }, requestId: string) => Rejection,
): Promise<FormState> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();
  let destination: string;
  try {
    const result = await save(context);
    if (!result.ok) {
      logDone(
        started,
        requestId,
        route,
        result.code as Parameters<typeof logEvent>[0]["code"],
        context,
      );
      return {
        status: "error",
        requestId,
        values,
        ...reject(result as R & { ok: false }, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(MODELS, "layout");
    revalidatePath("/productos");
    destination = outcome(result as R & { ok: true });
  } catch (error) {
    logDone(started, requestId, route, "INTERNAL", context, error);
    return {
      status: "error",
      requestId,
      values,
      field: null,
      message: unexpectedErrorMessage(requestId),
    };
  }
  redirect(destination);
}

// Modelos.

const MODEL_FIELD_MESSAGES: Record<ModelField, string> = {
  name: MODEL_NAME_MESSAGE,
  brand: MODEL_BRAND_MESSAGE,
};

function modelRejection(
  result: Exclude<ModelWriteResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    const field = result.fields[0] ?? "name";
    return { field, message: MODEL_FIELD_MESSAGES[field] };
  }
  if (result.code === "CONFLICT") {
    return { field: "name", message: MODEL_NAME_TAKEN_MESSAGE };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

export async function createModelAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    name: text(formData, "name"),
    brand: text(formData, "brand"),
  };
  return runForm(
    "modelos.crear",
    values,
    (context) => createModel(context, values),
    (result) => `${MODELS}/${result.modelId}?aviso=modelo-creado`,
    modelRejection,
  );
}

export async function updateModelAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const modelId = text(formData, "modelId");
  const values = {
    name: text(formData, "name"),
    brand: text(formData, "brand"),
  };
  return runForm(
    "modelos.editar",
    values,
    (context) => updateModel(context, modelId, values),
    (result) =>
      result.changed
        ? `${MODELS}/${modelId}?aviso=modelo-editado`
        : `${MODELS}/${modelId}`,
    modelRejection,
  );
}

// Activar y desactivar, sin campos.
async function runChange(
  route: string,
  operation: (context: AuthContext) => Promise<ActiveChangeResult>,
  destination: (changed: boolean) => string,
): Promise<ChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();
  let target: string;
  try {
    const result = await operation(context);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return {
        status: "error",
        requestId,
        message: changeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(MODELS, "layout");
    revalidatePath("/productos");
    target = destination(result.changed);
  } catch (error) {
    logDone(started, requestId, route, "INTERNAL", context, error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }
  redirect(target);
}

export async function setModelActiveAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const modelId = text(formData, "modelId");
  const isActive = text(formData, "isActive") === "1";
  return runChange(
    isActive ? "modelos.reactivar" : "modelos.desactivar",
    (context) => setModelActive(context, modelId, isActive),
    (changed) =>
      changed
        ? `${MODELS}/${modelId}?aviso=${isActive ? "modelo-reactivado" : "modelo-desactivado"}`
        : `${MODELS}/${modelId}`,
  );
}

// El orden (revisión independiente de la 29.2, H-2): subir o bajar un lugar. Vuelve a la misma
// pantalla, sin aviso: el cambio se ve en la lista.
export async function moveModelAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  return runChange(
    "modelos.ordenar",
    (context) =>
      moveModel(
        context,
        text(formData, "modelId"),
        text(formData, "direction"),
      ),
    () => MODELS,
  );
}

export async function moveAttributeAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  return runChange(
    "atributos.ordenar",
    (context) =>
      moveAttribute(
        context,
        text(formData, "definitionId"),
        text(formData, "direction"),
      ),
    () => ATTRIBUTES,
  );
}

export async function moveOptionAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  let definitionId = "";
  return runChange(
    "atributos.ordenar-opcion",
    async (context) => {
      const result = await moveOption(
        context,
        text(formData, "optionId"),
        text(formData, "direction"),
      );
      if (!result.ok) return result;
      definitionId = result.definitionId;
      return { ok: true, changed: result.changed };
    },
    () => `${ATTRIBUTES}?editar=${definitionId}`,
  );
}

// Atributos.

const ATTRIBUTE_FIELD_MESSAGES: Record<AttributeField, string> = {
  name: ATTRIBUTE_NAME_MESSAGE,
  type: ATTRIBUTE_TYPE_MESSAGE,
  isVariant: ATTRIBUTE_VARIANT_MESSAGE,
  options: ATTRIBUTE_OPTIONS_MESSAGE,
};

const ATTRIBUTE_FIELD_ORDER: AttributeField[] = [
  "name",
  "type",
  "isVariant",
  "options",
];

function attributeRejection(
  result: Exclude<AttributeWriteResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    const field =
      ATTRIBUTE_FIELD_ORDER.find((candidate) =>
        result.fields.includes(candidate),
      ) ?? "name";
    return { field, message: ATTRIBUTE_FIELD_MESSAGES[field] };
  }
  if (result.code === "CONFLICT") {
    return result.field === "option"
      ? { field: "label", message: OPTION_TAKEN_MESSAGE }
      : { field: "name", message: ATTRIBUTE_NAME_TAKEN_MESSAGE };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

export async function createAttributeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    name: text(formData, "name"),
    type: text(formData, "type"),
    isRequired: text(formData, "isRequired"),
    isVariant: text(formData, "isVariant"),
    options: text(formData, "options"),
  };
  return runForm(
    "atributos.crear",
    values,
    (context) =>
      createAttribute(context, {
        name: values.name,
        type: values.type,
        isRequired: values.isRequired === "1",
        isVariant: values.isVariant === "1",
        options: values.options.split(/\r?\n/),
      }),
    () => `${ATTRIBUTES}?aviso=atributo-creado`,
    attributeRejection,
  );
}

export async function updateAttributeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const definitionId = text(formData, "definitionId");
  const values = {
    name: text(formData, "name"),
    isRequired: text(formData, "isRequired"),
  };
  return runForm(
    "atributos.editar",
    values,
    (context) =>
      updateAttribute(context, definitionId, {
        name: values.name,
        isRequired: values.isRequired === "1",
      }),
    (result) =>
      result.changed ? `${ATTRIBUTES}?aviso=atributo-editado` : ATTRIBUTES,
    attributeRejection,
  );
}

export async function setAttributeActiveAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const definitionId = text(formData, "definitionId");
  const isActive = text(formData, "isActive") === "1";
  return runChange(
    isActive ? "atributos.reactivar" : "atributos.desactivar",
    (context) => setAttributeActive(context, definitionId, isActive),
    (changed) =>
      changed
        ? `${ATTRIBUTES}?aviso=${isActive ? "atributo-reactivado" : "atributo-desactivado"}`
        : ATTRIBUTES,
  );
}

export async function addOptionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const definitionId = text(formData, "definitionId");
  const values = { label: text(formData, "label") };
  return runForm(
    "atributos.opcion.agregar",
    values,
    (context) => addOption(context, definitionId, values.label),
    () => `${ATTRIBUTES}?aviso=opcion-agregada`,
    (result, requestId) => {
      const rejection = attributeRejection(result, requestId);
      return rejection.field === "options"
        ? { field: "label", message: OPTION_LABEL_MESSAGE }
        : rejection;
    },
  );
}

export async function updateOptionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const optionId = text(formData, "optionId");
  const values = { label: text(formData, "label") };
  const isActive = formData.get("isActive");
  return runForm(
    "atributos.opcion.editar",
    values,
    (context) =>
      updateOption(
        context,
        optionId,
        isActive === null
          ? { label: values.label }
          : { isActive: isActive === "1" },
      ),
    (result) =>
      result.changed ? `${ATTRIBUTES}?aviso=opcion-editada` : ATTRIBUTES,
    (result, requestId) => {
      const rejection = attributeRejection(result, requestId);
      return rejection.field === "options"
        ? { field: "label", message: OPTION_LABEL_MESSAGE }
        : rejection;
    },
  );
}
