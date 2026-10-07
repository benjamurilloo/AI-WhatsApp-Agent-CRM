import { z } from "zod";
import {
  MESSAGE_DIRECTIONS,
  MESSAGE_KINDS,
  MESSAGE_SENDERS,
  type HistoryMessage,
} from "@/modules/conversations";
import { isOpaqueReference } from "@/modules/ingestion";
import type { ServiceCatalogProduct } from "@/modules/inventory";
import type { KnowledgeEntry } from "@/modules/knowledge";
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

export type ReadField =
  "q" | "limit" | "product_id" | "conversation_ref" | "correlation_id";

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

export const errorResponseSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  request_id: z.uuid(),
  fields: z.array(z.string()).optional(),
});

export type ContractProduct = z.infer<typeof productSchema>;
export type ContractKnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type ContractHistoryMessage = z.infer<typeof historyMessageSchema>;
export type ContractClientTag = z.infer<typeof clientTagSchema>;

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
    condition: product.condition,
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
