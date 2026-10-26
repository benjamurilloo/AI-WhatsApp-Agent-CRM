import { z } from "zod";
import {
  MESSAGE_DIRECTIONS,
  MESSAGE_KINDS,
  MESSAGE_SENDERS,
  type AgentPauseStateResult,
  type HistoryMessage,
} from "@/modules/conversations";
import { isOpaqueReference } from "@/modules/ingestion";
import type {
  ServiceCatalogProduct,
  ServiceProductStock,
} from "@/modules/inventory";
import type {
  BusinessHoursForService,
  KnowledgeEntry,
} from "@/modules/knowledge";
import { ERROR_CODES } from "@/shared/errors";
import { currencyDecimals } from "@/shared/money";

// Contrato de lectura v1 (docs/contracts/read-v1.md, brief-11.3, D-8). Este archivo es el
// validador ejecutable: los esquemas de las respuestas son estrictos, así que un campo de más en
// una respuesta falla la validación, como un campo desconocido en la ingestión. Los tests de
// integración validan contra ellos toda respuesta de éxito, y los fixtures de
// tests/fixtures/read/v1/ también.

export const READ_CONTRACT_VERSION = "1";

// Parámetros (D-4).
export const MAX_QUERY_LENGTH = 200;
export const PRODUCTS_DEFAULT_LIMIT = 10;
export const PRODUCTS_MAX_LIMIT = 25;
export const KNOWLEDGE_DEFAULT_LIMIT = 20;
export const KNOWLEDGE_MAX_LIMIT = 50;
// Historial (brief-12.4, D-3): el emisor usa hoy 15, así que 20 le deja margen, y 50 acota una
// respuesta con texto de clientes.
export const MESSAGES_DEFAULT_LIMIT = 20;
export const MESSAGES_MAX_LIMIT = 50;

// Un carácter de control, NUL incluido, nunca llega a PostgreSQL (N-6 de la 11.2), y un surrogate
// suelto no es UTF-8 válido.
const CONTROL = /\p{Cc}/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

// model_id y condition, desde la 29.8: solo los filtros de la lista de la v3 (brief-29.8, D-2).
// battery_health, passed y failed, desde la 29.8.3: la cotización de un usado (brief-29.8.3, D-3).
// from y days, desde la 29.10.2: las franjas libres (brief-29.10.2, D-2).
export type ReadField =
  | "q"
  | "limit"
  | "product_id"
  | "conversation_ref"
  | "correlation_id"
  | "model_id"
  | "condition"
  | "battery_health"
  | "passed"
  | "failed"
  | "from"
  | "days";

type Parsed<T> = { ok: true; value: T } | { ok: false; field: ReadField };

// conversation_ref: obligatorio, con las reglas de las referencias opacas de la ingestión, que
// son las mismas con que se creó la conversación (brief-12.4, D-3). No se recorta: una referencia
// con espacios al borde no existe.
export function parseConversationRef(raw: string | null): Parsed<string> {
  return raw !== null && isOpaqueReference(raw)
    ? { ok: true, value: raw }
    : { ok: false, field: "conversation_ref" };
}

// q: obligatorio o no según la ruta, de 1 a 200 caracteres después de recortar.
export function parseQuery(
  raw: string | null,
  { required }: { required: boolean },
): Parsed<string | null> {
  if (raw === null || raw.trim() === "") {
    return required ? { ok: false, field: "q" } : { ok: true, value: null };
  }
  const text = raw.trim();
  if (
    text.length > MAX_QUERY_LENGTH ||
    CONTROL.test(text) ||
    LONE_SURROGATE.test(text)
  ) {
    return { ok: false, field: "q" };
  }
  return { ok: true, value: text };
}

// limit: entero decimal sin signo ni ceros de relleno, dentro del rango de la ruta.
export function parseLimit(
  raw: string | null,
  { defaultLimit, maxLimit }: { defaultLimit: number; maxLimit: number },
): Parsed<number> {
  if (raw === null) return { ok: true, value: defaultLimit };
  if (!/^[1-9][0-9]{0,2}$/.test(raw)) return { ok: false, field: "limit" };
  const limit = Number(raw);
  return limit <= maxLimit
    ? { ok: true, value: limit }
    : { ok: false, field: "limit" };
}

// Respuestas (D-4). Montos como decimal en texto, nunca number de JSON.

const nullableText = z.string().nullable();

export const productSchema = z.strictObject({
  product_id: z.uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  description: nullableText,
  unit: z.string().min(1),
  brand: nullableText,
  category: nullableText,
  condition: z.enum(["new", "refurbished"]),
  price: z
    .strictObject({
      amount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/),
      currency: z.string().regex(/^[A-Z]{3}$/),
    })
    .nullable(),
  stock_status: z.enum(["disponible", "bajo_stock", "sin_stock"]),
});

export const productListResponseSchema = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION),
  items: z.array(productSchema),
});

export const productResponseSchema = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION),
  product: productSchema,
});

// Fecha de calendario, inclusiva, o null si ese lado no tiene límite (brief-11.2, D-3).
const calendarDate = z.iso.date().nullable();

export const knowledgeEntrySchema = z.strictObject({
  entry_id: z.uuid(),
  title: z.string().min(1),
  category: z.string().min(1),
  content: z.string().min(1),
  valid_from: calendarDate,
  valid_until: calendarDate,
});

export const knowledgeListResponseSchema = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION),
  items: z.array(knowledgeEntrySchema),
});

// Mensaje del historial (brief-12.4, D-4). kind y sent_by en null son «sin dato»: los mensajes
// de v1 y de los seeds. sent_by solo en salidas.
export const historyMessageSchema = z
  .strictObject({
    external_ref: nullableText,
    direction: z.enum(MESSAGE_DIRECTIONS),
    kind: z.enum(MESSAGE_KINDS).nullable(),
    sent_by: z.enum(MESSAGE_SENDERS).nullable(),
    sent_at: z.iso.datetime({ precision: 3 }),
    body_text: nullableText,
  })
  .refine(
    (message) => message.direction === "outbound" || message.sent_by === null,
    { path: ["sent_by"] },
  );

export const messageListResponseSchema = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION),
  items: z.array(historyMessageSchema),
});

// Etiqueta del catálogo de la organización (brief-16.2, D-7): solo las activas, con su id para los
// eventos client.tag_added y client.tag_removed. Nunca datos de un cliente (invariante 6).
export const clientTagSchema = z.strictObject({
  tag_id: z.uuid(),
  name: z.string().min(1),
});

export const clientTagListResponseSchema = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION),
  items: z.array(clientTagSchema),
});

// Marca de pausa de una conversación (brief-16.3, D-3): si un admin pausó al agente y desde
// cuándo. Nunca datos del cliente ni mensajes (invariante 3). agent_paused_at es null si y solo si
// agent_paused es false.
export const conversationStateResponseSchema = z
  .strictObject({
    contract_version: z.literal(READ_CONTRACT_VERSION),
    agent_paused: z.boolean(),
    agent_paused_at: z.iso.datetime({ precision: 3 }).nullable(),
  })
  .refine((state) => state.agent_paused === (state.agent_paused_at !== null), {
    path: ["agent_paused_at"],
  });

// Cantidad disponible de un producto (brief-16.6, D-3; FR-API-09). Decimal en texto, nunca number
// de JSON, en forma canónica: sin ceros de más a la derecha y hasta tres decimales («12», «2.5»,
// «0»). La unidad y el estado salen de la misma lectura. Nunca el punto de reposición.
export const productStockResponseSchema = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION),
  product_id: z.uuid(),
  quantity_available: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$/),
  unit: z.string().min(1),
  stock_status: z.enum(["disponible", "bajo_stock", "sin_stock"]),
});

// Horario de atención (brief-17.4, D-6 con R-1; FR-API-10). Horas en HH:MM de la zona de la
// organización, de 00:00 a 23:59; la apertura es inclusiva y el cierre no. weekday: 1 es lunes y 7
// es domingo. Un día con slots vacío está cerrado. Con configured en false, open_now es false,
// next_change es null y weekly, days y exceptions vienen vacíos: el agente usa el texto.
const clockTime = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const weekdayNumber = z.number().int().min(1).max(7);

const hoursSlotSchema = z
  .strictObject({ opens: clockTime, closes: clockTime })
  .refine((slot) => slot.opens < slot.closes, { path: ["closes"] });
const hoursSlotsSchema = z.array(hoursSlotSchema).max(2);

export const businessHoursResponseSchema = z
  .strictObject({
    contract_version: z.literal(READ_CONTRACT_VERSION),
    configured: z.boolean(),
    timezone: z.string().min(1),
    now_local: z.strictObject({
      date: z.iso.date(),
      time: clockTime,
      weekday: weekdayNumber,
    }),
    open_now: z.boolean(),
    next_change: z
      .strictObject({
        kind: z.enum(["opens", "closes"]),
        date: z.iso.date(),
        time: clockTime,
      })
      .nullable(),
    weekly: z.array(
      z.strictObject({ weekday: weekdayNumber, slots: hoursSlotsSchema }),
    ),
    days: z.array(
      z.strictObject({
        date: z.iso.date(),
        weekday: weekdayNumber,
        slots: hoursSlotsSchema,
        reason: nullableText,
      }),
    ),
    exceptions: z.array(
      z.strictObject({
        date: z.iso.date(),
        slots: hoursSlotsSchema,
        reason: nullableText,
      }),
    ),
  })
  .refine(
    (hours) =>
      hours.configured
        ? hours.weekly.length === 7 && hours.days.length === 7
        : !hours.open_now &&
          hours.next_change === null &&
          hours.weekly.length === 0 &&
          hours.days.length === 0 &&
          hours.exceptions.length === 0,
    { path: ["configured"] },
  );

export const errorResponseSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  request_id: z.uuid(),
  fields: z.array(z.string()).optional(),
});

export type ContractProduct = z.infer<typeof productSchema>;
export type ContractKnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type ContractHistoryMessage = z.infer<typeof historyMessageSchema>;
export type ContractClientTag = z.infer<typeof clientTagSchema>;
export type ContractConversationState = z.infer<
  typeof conversationStateResponseSchema
>;
export type ContractProductStock = z.infer<typeof productStockResponseSchema>;
export type ContractBusinessHours = z.infer<typeof businessHoursResponseSchema>;

// La base guarda numeric(14, 2) («300000.00»). El contrato lo escribe con los decimales de la
// moneda: «300000» en CLP, «1234.50» en ARS. La escritura ya rechaza decimales que la moneda no
// tiene (brief-11.1, D-6), así que cortar los ceros no pierde nada.
export function contractAmount(amount: string, currency: string): string {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) throw new Error("moneda sin decimales conocidos");
  const [integer, fraction = "00"] = amount.split(".");
  if (decimals.decimals === 0) {
    if (/[^0]/.test(fraction)) throw new Error("decimales en una moneda sin");
    return integer!;
  }
  return `${integer}.${fraction.slice(0, decimals.decimals)}`;
}

// La condición del contrato: new o refurbished. Desde la 29.5 el modelo tiene también used, y las
// lecturas de servicio de catalog dejan afuera esos productos para v1 y v2 (brief-29.5, D-7). Desde la
// 29.8 los lee solo read-v3, con su propio mapeo (brief-29.8, D-2). Si uno llegara acá, es un defecto:
// se lanza en vez de mandarlo con otra condición.
export function contractCondition(
  condition: ServiceCatalogProduct["condition"],
): ContractProduct["condition"] {
  if (condition === "used") {
    throw new Error("Un producto usado llegó a una lectura de servicio.");
  }
  return condition;
}

// Mapeo explícito, campo por campo: ningún dato del modelo sale por accidente.
export function toContractProduct(
  product: ServiceCatalogProduct,
): ContractProduct {
  return {
    product_id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    brand: product.brand,
    category: product.category,
    condition: contractCondition(product.condition),
    price: product.price
      ? {
          amount: contractAmount(product.price.amount, product.price.currency),
          currency: product.price.currency,
        }
      : null,
    stock_status: product.stockStatus,
  };
}

// Solo los campos del contrato: ni el estado, ni si está activa, ni las fechas de alta.
export function toContractKnowledgeEntry(
  entry: KnowledgeEntry,
): ContractKnowledgeEntry {
  return {
    entry_id: entry.id,
    title: entry.title,
    category: entry.category,
    content: entry.content,
    valid_from: entry.validFrom,
    valid_until: entry.validUntil,
  };
}

// Solo los campos del contrato: ni el id del mensaje o de la conversación, ni el cliente, ni el
// estado (brief-12.4, D-4). La hora, en UTC con milisegundos.
export function toContractHistoryMessage(
  message: HistoryMessage,
): ContractHistoryMessage {
  return {
    external_ref: message.externalRef,
    direction: message.direction,
    kind: message.kind,
    sent_by: message.sentBy,
    sent_at: message.sentAt.toISOString(),
    body_text: message.body,
  };
}

// La hora, en UTC con milisegundos; sin la pausa, null.
export function toContractConversationState(
  state: Extract<AgentPauseStateResult, { ok: true }>,
): ContractConversationState {
  return {
    contract_version: READ_CONTRACT_VERSION,
    agent_paused: state.agentPausedAt !== null,
    agent_paused_at: state.agentPausedAt?.toISOString() ?? null,
  };
}

// La base guarda numeric(14, 3) («12.500»). El contrato corta los ceros de la derecha y el punto
// que queda solo: «12.500» es «12.5», y «12.000» es «12».
export function contractQuantity(quantity: string): string {
  if (!/^[0-9]+\.[0-9]{3}$/.test(quantity)) {
    throw new Error("cantidad fuera de numeric(14, 3)");
  }
  return quantity.replace(/0+$/, "").replace(/\.$/, "");
}

export function toContractProductStock(
  stock: ServiceProductStock,
): ContractProductStock {
  return {
    contract_version: READ_CONTRACT_VERSION,
    product_id: stock.productId,
    quantity_available: contractQuantity(stock.quantityOnHand),
    unit: stock.unit,
    stock_status: stock.stockStatus,
  };
}

// Sin horario cargado, solo la hora del negocio: el resto vacío, para que el agente no afirme nada
// (D-6). Ni los ids de los días especiales ni la entrada de texto de D-5.
export function toContractBusinessHours(
  hours: BusinessHoursForService,
): ContractBusinessHours {
  const { status } = hours;
  return {
    contract_version: READ_CONTRACT_VERSION,
    configured: hours.configured,
    timezone: hours.timezone,
    now_local: {
      date: status.localDate,
      time: status.localTime,
      weekday: status.weekday,
    },
    open_now: hours.configured && status.openNow,
    next_change: hours.configured ? status.nextChange : null,
    weekly: hours.configured
      ? hours.week.map((day) => ({ weekday: day.weekday, slots: day.slots }))
      : [],
    days: hours.configured
      ? hours.days.map((day) => ({
          date: day.date,
          weekday: day.weekday,
          slots: day.slots,
          reason: day.reason,
        }))
      : [],
    exceptions: hours.configured
      ? hours.exceptions.map((exception) => ({
          date: exception.date,
          slots: exception.slots,
          reason: exception.reason,
        }))
      : [],
  };
}
