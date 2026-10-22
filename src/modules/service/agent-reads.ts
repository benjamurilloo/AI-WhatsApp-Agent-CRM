import {
  getModelsForService,
  searchActiveModelsForService,
  type ServiceModel,
} from "@/modules/catalog";
import { hasCapability } from "@/modules/organizations";
import * as repository from "./repository";

// Las reparaciones y las órdenes de servicio para el agente, por la API de lectura v3 (brief-29.8.2,
// D-2 a D-4). Reciben la organización de una credencial de servicio y no pasan por authorize: no hay
// persona ni rol, como las demás …ForService (tests/guards/service-read-entry-points.test.ts). Las
// compone el handler de la ruta. Nunca leen el costo, el IMEI, lo que reporta el cliente ni el técnico:
// las consultas de repository no traen esas columnas.

// Modelos por respuesta de la lista (D-2).
export const REPAIR_MODELS_FOR_SERVICE_LIMIT = 10;
// Órdenes por respuesta, y los días en que una cerrada todavía aparece (U-3).
export const CLIENT_SERVICE_ORDERS_FOR_SERVICE_LIMIT = 5;
export const CLOSED_SERVICE_ORDERS_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

type Money = { amount: string; currency: string };

export type ServiceRepairModel = {
  model: ServiceModel;
  repairs: { repairTypeId: string; name: string; price: Money }[];
};

// La lista de un modelo (D-2): los modelos activos que coinciden, cada uno con los tipos activos que
// tienen precio para él, en el orden de la organización. Un modelo sin ninguno no aparece. Sin la
// capacidad repairs, lista vacía.
export async function listRepairPricesForService(
  organizationId: string,
  filter: { text: string } | { modelId: string },
): Promise<ServiceRepairModel[]> {
  if (!(await hasCapability(organizationId, "repairs"))) return [];
  const models = await searchActiveModelsForService(organizationId, filter);
  if (models.length === 0) return [];
  const [types, prices] = await Promise.all([
    repository.findRepairTypes(organizationId),
    repository.findCustomerRepairPrices(
      organizationId,
      models.map((model) => model.id),
    ),
  ]);
  const activeTypes = types.filter((type) => type.isActive);
  const priceByKey = new Map(
    prices.map((row) => [`${row.modelId}:${row.repairTypeId}`, row]),
  );
  const result: ServiceRepairModel[] = [];
  for (const model of models) {
    const repairs = activeTypes.flatMap((type) => {
      const row = priceByKey.get(`${model.id}:${type.id}`);
      return row
        ? [
            {
              repairTypeId: type.id,
              name: type.name,
              price: { amount: row.price, currency: row.priceCurrency },
            },
          ]
        : [];
    });
    if (repairs.length > 0) result.push({ model, repairs });
    if (result.length === REPAIR_MODELS_FOR_SERVICE_LIMIT) break;
  }
  return result;
}

type ServiceOrderStatus = repository.ServiceOrderStatus;

export type ServiceClientOrder = {
  number: number;
  model: ServiceModel;
  status: ServiceOrderStatus;
  statusAt: Date;
  receivedAt: Date;
  // null hasta el presupuesto (D-4).
  quote: {
    total: Money;
    repairs: { name: string; price: Money }[];
  } | null;
};

// La fecha de la transición que dejó la orden en su estado: received es el alta.
function statusAt(row: repository.AgentServiceOrderRow): Date {
  const at: Record<ServiceOrderStatus, Date | null> = {
    received: row.createdAt,
    sent: row.sentAt,
    quoted: row.quotedAt,
    approved: row.approvedAt,
    rejected: row.rejectedAt,
    repaired: row.repairedAt,
    delivered: row.deliveredAt,
    cancelled: row.cancelledAt,
  };
  return at[row.status] ?? row.createdAt;
}

// Las órdenes del equipo de un cliente (U-3 y D-4): las abiertas y las cerradas en los últimos 30 días,
// hasta 5, de la más nueva a la más vieja. Nunca una de una unidad propia. Sin la capacidad repairs,
// lista vacía.
export async function listClientServiceOrdersForService(
  organizationId: string,
  clientId: string,
  now: Date,
): Promise<ServiceClientOrder[]> {
  if (!(await hasCapability(organizationId, "repairs"))) return [];
  const rows = await repository.findClientServiceOrdersForAgent(
    organizationId,
    clientId,
    new Date(now.getTime() - CLOSED_SERVICE_ORDERS_DAYS * DAY_MS),
    CLIENT_SERVICE_ORDERS_FOR_SERVICE_LIMIT,
  );
  if (rows.length === 0) return [];
  const quoted = rows.filter(
    (row) => row.customerTotal !== null && row.customerCurrency !== null,
  );
  const [models, types, lines] = await Promise.all([
    getModelsForService(organizationId, [
      ...new Set(rows.map((row) => row.modelId)),
    ]),
    quoted.length > 0
      ? repository.findRepairTypes(organizationId)
      : Promise.resolve([]),
    repository.findCustomerOrderLines(
      organizationId,
      quoted.map((row) => row.id),
    ),
  ]);
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  return rows.map((row) => {
    const currency = row.customerCurrency;
    const quote =
      row.customerTotal !== null && currency !== null
        ? {
            total: { amount: row.customerTotal, currency },
            repairs: lines
              .filter(
                (line) => line.serviceOrderId === row.id && line.price !== null,
              )
              .map((line) => ({
                name: typeNames.get(line.repairTypeId) ?? "",
                price: { amount: line.price!, currency },
              })),
          }
        : null;
    // La clave foránea compuesta garantiza el modelo: si falta, es un error del sistema.
    const model = models.get(row.modelId);
    if (!model) {
      throw new Error("listClientServiceOrdersForService: modelo inexistente");
    }
    return {
      number: row.number,
      model,
      status: row.status,
      statusAt: statusAt(row),
      receivedAt: row.createdAt,
      quote,
    };
  });
}
