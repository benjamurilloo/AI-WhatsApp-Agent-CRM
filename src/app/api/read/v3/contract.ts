import { z } from "zod";
import type { ServiceProductVariant } from "@/modules/catalog";
import type { ExchangeSetup } from "@/modules/fx";
import type {
  ServiceAvailableUnit,
  ServiceCatalogProduct,
  ServiceProductBalance,
} from "@/modules/inventory";
import type { FreeSlots } from "@/modules/appointments";
import type { Capability } from "@/modules/organizations";
import type { ServiceClientOrder, ServiceRepairModel } from "@/modules/service";
import type {
  ServiceChecklistItem,
  ServiceTradeInQuoteResult,
} from "@/modules/tradeins";
import {
  convertMoney,
  currencyDecimals,
  exchangeRateToDatabase,
  moneyFromDatabase,
  moneyToDatabase,
} from "@/shared/money";
import {
  contractAmount,
  contractQuantity,
  productSchema,
} from "../v1/contract";

// Contrato de lectura v3: el catálogo del rubro (docs/contracts/read-v3.md; brief-29.8, D-1 a D-6).
// Las tres rutas de productos de la v2, con el objeto ampliado (la condición con los usados, el
// seguimiento, el modelo, los atributos de la variante y el precio convertido), y dos rutas nuevas:
// las unidades disponibles de un producto y las capacidades. Desde la 29.8.2, dos más: las
// reparaciones de un modelo y las órdenes de servicio del cliente de una conversación (brief-29.8.2,
// D-1 a D-4), y desde la 29.8.3, el checklist y la cotización orientativa de un usado (brief-29.8.3,
// D-2 y D-3), cambios compatibles dentro de v3. El transporte, los errores y el log son
// los de v1. Como en v1, los esquemas son estrictos y los tests validan contra ellos.
//
// El agente nunca recibe un IMEI, un costo, un margen ni los datos de identidad del cliente (ADR
// 0024, punto 14): cada campo se mapea a mano, y tests/guards/agent-contract-fields.test.ts revisa
// las claves.

export const READ_CONTRACT_VERSION_V3 = "3";

export const PRODUCT_CONDITIONS_V3 = ["new", "refurbished", "used"] as const;
export const PRODUCT_TRACKINGS_V3 = ["quantity", "unit"] as const;

const contractMoney = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);

// La tasa, en texto: sin ceros de más a la derecha y hasta seis decimales («1200», «1187.5»).
const rateText = z.string().regex(/^[1-9][0-9]*(\.[0-9]{0,5}[1-9])?$/);

// El precio en la otra moneda del par (D-6), o null.
export const priceConvertedSchema = z
  .strictObject({
    amount: contractMoney,
    currency,
    rate: rateText,
    rate_as_of: z.iso.datetime({ precision: 3 }),
  })
  .nullable();

export const productSchemaV3 = z.strictObject({
  ...productSchema.shape,
  condition: z.enum(PRODUCT_CONDITIONS_V3),
  tracking: z.enum(PRODUCT_TRACKINGS_V3),
  model: z
    .strictObject({
      model_id: z.uuid(),
      name: z.string().min(1),
      brand: z.string().nullable(),
    })
    .nullable(),
  attributes: z.array(
    z.strictObject({
      key: z.string().min(1),
      name: z.string().min(1),
      value: z.string(),
    }),
  ),
  price_converted: priceConvertedSchema,
});

export const productListResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  items: z.array(productSchemaV3),
});

export const productResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  product: productSchemaV3,
});

const canonicalQuantity = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$/);

export const productStockResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  product_id: z.uuid(),
  quantity_on_hand: canonicalQuantity,
  quantity_reserved: canonicalQuantity,
  quantity_available: canonicalQuantity,
  unit: z.string().min(1),
  stock_status: z.enum(["disponible", "bajo_stock", "sin_stock"]),
});

// Una unidad disponible (D-3): sin el IMEI, el costo ni el origen.
export const unitSchemaV3 = z.strictObject({
  unit_id: z.uuid(),
  grade: z.string().nullable(),
  battery_health: z.number().int().min(1).max(100).nullable(),
  price: z.strictObject({ amount: contractMoney, currency }).nullable(),
  price_converted: priceConvertedSchema,
});

export const unitListResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  product_id: z.uuid(),
  items: z.array(unitSchemaV3),
});

// Las capacidades activas (D-5). Un valor nuevo del enum es compatible: el validador acepta cualquier
// texto, y el emisor ignora los que no conoce.
export const capabilityListResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  capabilities: z.array(z.string().regex(/^[a-z][a-z_]*$/)),
});

const modelSchemaV3 = z.strictObject({
  model_id: z.uuid(),
  name: z.string().min(1),
  brand: z.string().nullable(),
});

const moneySchemaV3 = z.strictObject({ amount: contractMoney, currency });

// Las reparaciones de un modelo (brief-29.8.2, D-2): solo el precio al cliente, nunca el costo.
export const repairListResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  items: z.array(
    z.strictObject({
      model: modelSchemaV3,
      repairs: z
        .array(
          z.strictObject({
            repair_type_id: z.uuid(),
            name: z.string().min(1),
            price: moneySchemaV3,
            price_converted: priceConvertedSchema,
          }),
        )
        .min(1),
    }),
  ),
});

export const SERVICE_ORDER_STATUSES_V3 = [
  "received",
  "sent",
  "quoted",
  "approved",
  "rejected",
  "repaired",
  "delivered",
  "cancelled",
] as const;

// Las órdenes del cliente de la conversación (brief-29.8.2, D-3 y D-4): sin el IMEI, lo que reportó el
// cliente, el técnico, el costo, la venta ni el motivo de una cancelación. El presupuesto va sin
// convertir.
export const serviceOrderSchemaV3 = z.strictObject({
  number: z.string().regex(/^OS-[0-9]{6,}$/),
  model: modelSchemaV3,
  status: z.enum(SERVICE_ORDER_STATUSES_V3),
  status_at: z.iso.datetime({ precision: 3 }),
  received_at: z.iso.datetime({ precision: 3 }),
  quote: z
    .strictObject({
      total: moneySchemaV3,
      repairs: z.array(
        z.strictObject({ name: z.string().min(1), price: moneySchemaV3 }),
      ),
    })
    .nullable(),
});

export const serviceOrderListResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  items: z.array(serviceOrderSchemaV3),
});

// El checklist de un usado (brief-29.8.3, D-2): los puntos activos, sin su reparación ni su costo.
export const tradeInChecklistResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  items: z.array(
    z.strictObject({
      item_id: z.uuid(),
      name: z.string().min(1),
      mandatory: z.boolean(),
    }),
  ),
});

// Las franjas libres para el agente (brief-29.10.2, D-2 y A-1): la fecha de hoy del negocio, la duración,
// los motivos activos y, por día, las franjas que puede pedir, con el desplazamiento de la zona. Nunca la
// ocupación, el cupo ni un turno (D-7).
const slotInstant = z.iso.datetime({ offset: true, local: false });

export const appointmentSlotsResponseSchemaV3 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V3),
  today: z.iso.date(),
  slot_minutes: z.number().int().positive().nullable(),
  reasons: z.array(
    z.strictObject({ reason_id: z.uuid(), name: z.string().min(1) }),
  ),
  days: z.array(
    z.strictObject({
      date: z.iso.date(),
      slots: z
        .array(z.strictObject({ starts_at: slotInstant, ends_at: slotInstant }))
        .min(1),
    }),
  ),
});

export type ContractAppointmentSlotsV3 = z.infer<
  typeof appointmentSlotsResponseSchemaV3
>;

export function toContractAppointmentSlotsV3(
  slots: FreeSlots,
): ContractAppointmentSlotsV3 {
  return {
    contract_version: READ_CONTRACT_VERSION_V3,
    today: slots.today,
    slot_minutes: slots.slotMinutes,
    reasons: slots.reasons.map((reason) => ({
      reason_id: reason.id,
      name: reason.name,
    })),
    days: slots.days.map((day) => ({
      date: day.date,
      slots: day.slots.map((slot) => ({
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
      })),
    })),
  };
}

export const TRADE_IN_QUOTE_REASONS_V3 = [
  "checklist_incomplete",
  "not_accepted",
  "not_quotable",
] as const;

// La cotización de un usado (brief-29.8.3, D-3 y U-4): el rango redondeado y los nombres de lo que se
// descontó, o null y uno de tres motivos. Nunca el valor exacto, el precio de referencia, el margen,
// los costos, el porcentaje ni el paso (H-3).
export const tradeInQuoteResponseSchemaV3 = z
  .strictObject({
    contract_version: z.literal(READ_CONTRACT_VERSION_V3),
    quote: z
      .strictObject({
        product: z.strictObject({
          product_id: z.uuid(),
          name: z.string().min(1),
        }),
        estimate: z.literal(true),
        range: z.strictObject({
          low: contractMoney,
          high: contractMoney,
          currency,
        }),
        range_converted: z
          .strictObject({
            low: contractMoney,
            high: contractMoney,
            currency,
            rate: rateText,
            rate_as_of: z.iso.datetime({ precision: 3 }),
          })
          .nullable(),
        repairs: z.array(z.string().min(1)),
      })
      .nullable(),
    reason: z
      .discriminatedUnion("code", [
        z.strictObject({
          code: z.literal("checklist_incomplete"),
          item_ids: z.array(z.uuid()).min(1),
        }),
        z.strictObject({
          code: z.literal("not_accepted"),
          items: z.array(z.string().min(1)).min(1),
        }),
        z.strictObject({ code: z.literal("not_quotable") }),
      ])
      .nullable(),
  })
  .refine((body) => (body.quote === null) !== (body.reason === null), {
    message: "una cotización o un motivo, nunca los dos ni ninguno",
  });

export type ContractProductV3 = z.infer<typeof productSchemaV3>;
export type ContractPriceConverted = z.infer<typeof priceConvertedSchema>;
export type ContractUnitV3 = z.infer<typeof unitSchemaV3>;

type Price = { amount: string; currency: string };

// La tasa como la guarda la base («1200.000000»), sin los ceros de la derecha.
export function contractRate(rate: bigint): string {
  return exchangeRateToDatabase(rate).replace(/\.?0+$/, "");
}

// El precio en la otra moneda (ADR 0025, punto 10; brief-29.8, D-6 y U-3): con la conversión de
// src/shared/money y la cotización vigente, redondeado a los decimales de la moneda de destino. null
// sin cotización, con la vigente vencida, con una moneda que no es del par o si la conversión no
// cabe. La tasa nunca se invierte: es la del par, cuántas unidades de la otra moneda vale una de la
// principal; lo que cambia es si se multiplica o se divide.
export function convertPrice(
  price: Price | null,
  setup: ExchangeSetup | null,
): ContractPriceConverted {
  if (!price || !setup?.current || setup.current.stale) return null;
  const { mainCurrency, quoteCurrency } = setup;
  if (mainCurrency === quoteCurrency) return null;
  const target =
    price.currency === mainCurrency
      ? quoteCurrency
      : price.currency === quoteCurrency
        ? mainCurrency
        : null;
  if (target === null) return null;
  const decimals = currencyDecimals(target);
  if (!decimals.ok) return null;
  const amount = moneyFromDatabase(price.amount);
  if (amount <= 0n) return null;
  const converted = convertMoney({
    amount,
    rate: setup.current.rate,
    direction: target === quoteCurrency ? "to_quote" : "to_base",
    targetDecimals: decimals.decimals,
  });
  if (!converted.ok) return null;
  return {
    amount: contractAmount(moneyToDatabase(converted.amount), target),
    currency: target,
    rate: contractRate(setup.current.rate),
    rate_as_of: setup.current.asOf.toISOString(),
  };
}

function contractPrice(price: Price | null): ContractUnitV3["price"] {
  return price
    ? {
        amount: contractAmount(price.amount, price.currency),
        currency: price.currency,
      }
    : null;
}

// Mapeo explícito, campo por campo: ningún dato del modelo sale por accidente. variant es null sin la
// capacidad variants: el producto va sin modelo ni atributos.
export function toContractProductV3(
  product: ServiceCatalogProduct,
  variant: ServiceProductVariant | null,
  setup: ExchangeSetup | null,
): ContractProductV3 {
  return {
    product_id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    brand: product.brand,
    category: product.category,
    condition: product.condition,
    price: contractPrice(product.price),
    stock_status: product.stockStatus,
    tracking: product.tracking,
    model: variant?.model
      ? {
          model_id: variant.model.id,
          name: variant.model.name,
          brand: variant.model.brand,
        }
      : null,
    attributes: (variant?.attributes ?? []).map((attribute) => ({
      key: attribute.key,
      name: attribute.name,
      value: attribute.value,
    })),
    price_converted: convertPrice(product.price, setup),
  };
}

// El precio de una unidad es el propio o, si no tiene, el del producto (D-3).
export function toContractUnitV3(
  unit: ServiceAvailableUnit,
  productPrice: Price | null,
  setup: ExchangeSetup | null,
): ContractUnitV3 {
  const price = unit.price ?? productPrice;
  return {
    unit_id: unit.id,
    grade: unit.grade,
    battery_health: unit.batteryHealth,
    price: contractPrice(price),
    price_converted: convertPrice(price, setup),
  };
}

// De menor a mayor precio (D-3). Las monedas no se comparan entre sí: primero las del precio del
// producto, después las demás por código; una unidad sin precio va al final. Empate: por id.
export function sortUnitsByPrice(
  units: ContractUnitV3[],
  productCurrency: string | null,
): ContractUnitV3[] {
  const key = (unit: ContractUnitV3) =>
    unit.price === null ? 2 : unit.price.currency === productCurrency ? 0 : 1;
  const cents = (unit: ContractUnitV3) =>
    unit.price === null ? 0n : moneyFromDatabase(toDatabaseAmount(unit.price));
  return [...units].sort((a, b) => {
    const byKey = key(a) - key(b);
    if (byKey !== 0) return byKey;
    if (a.price && b.price && a.price.currency !== b.price.currency) {
      return a.price.currency < b.price.currency ? -1 : 1;
    }
    const diff = cents(a) - cents(b);
    if (diff !== 0n) return diff < 0n ? -1 : 1;
    return a.unit_id < b.unit_id ? -1 : a.unit_id > b.unit_id ? 1 : 0;
  });
}

// El monto del contrato («420», «1234.5») con la escala de la base, para compararlo.
function toDatabaseAmount(price: { amount: string }): string {
  const [integer, fraction = ""] = price.amount.split(".");
  return `${integer}.${fraction.padEnd(2, "0")}`;
}

export type ContractProductStockV3 = z.infer<
  typeof productStockResponseSchemaV3
>;

export function toContractProductStockV3(
  stock: ServiceProductBalance,
): ContractProductStockV3 {
  return {
    contract_version: READ_CONTRACT_VERSION_V3,
    product_id: stock.productId,
    quantity_on_hand: contractQuantity(stock.quantityOnHand),
    quantity_reserved: contractQuantity(stock.quantityReserved),
    quantity_available: contractQuantity(stock.quantityAvailable),
    unit: stock.unit,
    stock_status: stock.stockStatus,
  };
}

export type ContractRepairListV3 = z.infer<typeof repairListResponseSchemaV3>;

// Mapeo explícito (brief-29.8.2, D-2): el modelo y cada reparación con su precio al cliente y el
// convertido, con una sola cotización por respuesta.
export function toContractRepairListV3(
  models: ServiceRepairModel[],
  setup: ExchangeSetup | null,
): ContractRepairListV3 {
  return {
    contract_version: READ_CONTRACT_VERSION_V3,
    items: models.map(({ model, repairs }) => ({
      model: { model_id: model.id, name: model.name, brand: model.brand },
      repairs: repairs.map((repair) => ({
        repair_type_id: repair.repairTypeId,
        name: repair.name,
        price: contractPrice(repair.price)!,
        price_converted: convertPrice(repair.price, setup),
      })),
    })),
  };
}

export type ContractServiceOrderListV3 = z.infer<
  typeof serviceOrderListResponseSchemaV3
>;

// Mapeo explícito (brief-29.8.2, D-4): el número como lo tiene el cliente en su comprobante.
export function toContractServiceOrderListV3(
  orders: ServiceClientOrder[],
  formatNumber: (number: number) => string,
): ContractServiceOrderListV3 {
  return {
    contract_version: READ_CONTRACT_VERSION_V3,
    items: orders.map((order) => ({
      number: formatNumber(order.number),
      model: {
        model_id: order.model.id,
        name: order.model.name,
        brand: order.model.brand,
      },
      status: order.status,
      status_at: order.statusAt.toISOString(),
      received_at: order.receivedAt.toISOString(),
      quote: order.quote
        ? {
            total: contractPrice(order.quote.total)!,
            repairs: order.quote.repairs.map((repair) => ({
              name: repair.name,
              price: contractPrice(repair.price)!,
            })),
          }
        : null,
    })),
  };
}

export type ContractTradeInChecklistV3 = z.infer<
  typeof tradeInChecklistResponseSchemaV3
>;

export function toContractTradeInChecklistV3(
  items: ServiceChecklistItem[],
): ContractTradeInChecklistV3 {
  return {
    contract_version: READ_CONTRACT_VERSION_V3,
    items: items.map((item) => ({
      item_id: item.id,
      name: item.name,
      mandatory: item.isMandatory,
    })),
  };
}

export type ContractTradeInQuoteV3 = z.infer<
  typeof tradeInQuoteResponseSchemaV3
>;

// El rango en la otra moneda (U-5), con la regla de convertPrice para el techo y el piso. Un piso en
// cero es cero en las dos monedas: convertPrice no convierte un monto que no es positivo.
function convertRange(
  low: string,
  high: string,
  currency: string,
  setup: ExchangeSetup | null,
): NonNullable<ContractTradeInQuoteV3["quote"]>["range_converted"] {
  const top = convertPrice({ amount: high, currency }, setup);
  if (!top) return null;
  const bottom =
    moneyFromDatabase(low) === 0n
      ? { amount: contractAmount("0", top.currency) }
      : convertPrice({ amount: low, currency }, setup);
  if (!bottom) return null;
  return {
    low: bottom.amount,
    high: top.amount,
    currency: top.currency,
    rate: top.rate,
    rate_as_of: top.rate_as_of,
  };
}

// Los motivos finos de tradeins pasan a los tres del contrato (U-4): el agente solo distingue qué
// preguntar, cuándo decir que no se recibe y cuándo derivar. Cualquier motivo nuevo cae en not_quotable.
export function toContractTradeInQuoteV3(
  result: Exclude<ServiceTradeInQuoteResult, { code: "NOT_FOUND" }>,
  setup: ExchangeSetup | null,
): ContractTradeInQuoteV3 {
  if (!result.ok) {
    return {
      contract_version: READ_CONTRACT_VERSION_V3,
      quote: null,
      reason:
        result.code === "CHECKLIST_INCOMPLETE"
          ? { code: "checklist_incomplete", item_ids: result.itemIds }
          : result.code === "NOT_ACCEPTED"
            ? { code: "not_accepted", items: result.items }
            : { code: "not_quotable" },
    };
  }
  const { quote } = result;
  return {
    contract_version: READ_CONTRACT_VERSION_V3,
    quote: {
      product: { product_id: quote.product.id, name: quote.product.name },
      estimate: true,
      range: {
        low: contractAmount(quote.low, quote.currency),
        high: contractAmount(quote.high, quote.currency),
        currency: quote.currency,
      },
      range_converted: convertRange(
        quote.low,
        quote.high,
        quote.currency,
        setup,
      ),
      repairs: quote.repairs,
    },
    reason: null,
  };
}

export function toContractCapabilities(capabilities: Capability[]): {
  contract_version: typeof READ_CONTRACT_VERSION_V3;
  capabilities: string[];
} {
  return {
    contract_version: READ_CONTRACT_VERSION_V3,
    capabilities: [...capabilities],
  };
}
