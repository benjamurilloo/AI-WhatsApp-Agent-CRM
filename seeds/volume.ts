import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/modules/auth";
import { users } from "@/modules/auth/schema";
import {
  productModels,
  productPrices,
  products,
} from "@/modules/catalog/schema";
import { conversations, messages } from "@/modules/conversations/schema";
import { clients } from "@/modules/crm/schema";
import { ingestionEvents } from "@/modules/ingestion/schema";
import {
  inventories,
  inventoryMovements,
  stockUnits,
} from "@/modules/inventory/schema";
import { knowledgeEntries } from "@/modules/knowledge/schema";
import {
  organizationCapabilities,
  organizationMembers,
  organizations,
} from "@/modules/organizations/schema";
import { createDb, type Db } from "@/shared/db";
import {
  assertSeedableDatabase,
  localTimesToUtc,
  organizationTimezone,
  todayIn,
} from "./conversations";

// Seed de volumen sintético (brief-6.2, D-3): una organización propia con su admin, `size` clientes
// y `size` conversaciones con entre 1 y 12 mensajes. Determinista: ids derivados del índice y un
// generador con semilla fija. Idempotente: una fila existente no se toca (messages es de solo
// inserción), así que las fechas quedan fijadas en la primera corrida (D-2). Cada fila usa un
// generador propio, derivado de su índice, así que la fila i es la misma con cualquier tamaño.

// --- Organizaciones del volumen (9.3, D-1) ---
//
// Hasta la 9.3 el seed sembraba una sola organización, y por eso todos los planes de consulta
// del proyecto se midieron con una organización dueña de casi todas las filas: `organization_id
// = X` no filtraba nada y el planificador elegía recorridos completos, correctamente. Lo que
// cambia un plan es la selectividad, y la selectividad la da la asimetría entre organizaciones.
//
// La organización **ordinal 0 es la histórica y sus filas no cambian**: mismos ids, mismos
// nombres, mismos teléfonos, mismas cantidades. No es una cortesía hacia los tests: la
// calibración de D-3 reproduce en staging la tanda de la 8.5 para separar "cambió la máquina"
// de "cambió la distribución", y esa resta no significa nada si además cambiaron los datos.
//
// El ordinal viaja en el segundo grupo del UUID, que estaba fijo en `0000`. Para el ordinal 0
// el id resultante es idéntico al de antes, carácter por carácter.
function hex4(ordinal: number): string {
  return ordinal.toString(16).padStart(4, "0");
}

export function volumeOrganizationId(ordinal: number): string {
  return `5eed0000-${hex4(ordinal)}-4000-8000-000000000021`;
}

export function volumeUser(ordinal: number): {
  id: string;
  email: string;
  name: string;
} {
  return {
    id: `5eed0000-${hex4(ordinal)}-4000-8000-000000000022`,
    // El ordinal 0 conserva la dirección histórica; las demás llevan el ordinal. La excepción
    // es fea y es deliberada: `email` es único en toda la tabla `users`, así que sin ella la
    // segunda organización choca, y cambiar la del ordinal 0 rompería la reproducción de la 8.5.
    email:
      ordinal === 0 ? "volumen@example.com" : `volumen${ordinal}@example.com`,
    name: ordinal === 0 ? "Admin de volumen" : `Admin de volumen ${ordinal}`,
  };
}

// El dominio lleva el ordinal desde la 9.3 y el 0 conserva el histórico, por el mismo motivo
// que en `volumeUser`: `users.email` es único en **toda** la tabla, no por organización. Es la
// trampa menos visible de sembrar varias organizaciones con el mismo código.
export function volumeMemberEmail(ordinal: number, index: number): string {
  const dominio =
    ordinal === 0 ? "volumen.example" : `volumen${ordinal}.example`;
  return `miembro${String(index + 1).padStart(4, "0")}@${dominio}`;
}

export const VOLUME_ORGANIZATION_ID = volumeOrganizationId(0);
export const VOLUME_USER = volumeUser(0);
export const VOLUME_DEFAULT_SIZE = 10_000;

// Catálogo, inventario y miembros (brief-8.5, D-2). Los productos acompañan al tamaño de
// clientes; los miembros se quedan en 500, que es el número exacto que Overview fijó como
// condición de revisión de la lista compuesta en memoria.
export const VOLUME_MEMBER_COUNT = 500;

export type VolumeShape = {
  ordinal: number;
  size: number;
  // Cuántos productos concentran cientos de movimientos. Es una propiedad **declarada** de la
  // organización y no una fracción de `size`: derivarla del tamaño haría que la fila i dependiera
  // de cuántas filas se sembraron, y el seed garantiza desde la 6.2 que la fila i es la misma con
  // cualquier tamaño. Esa garantía tiene tests y no se toca acá.
  heavyProducts: number;
  members: number;
  // Eventos de ingestión (9.3, D-5). En 0 la tabla no se toca, que es el estado previo a la 9.3.
  ingestionEvents: number;
  // Lo que sigue es de la 13.2 (D-3) y es opcional: una forma que no lo declara siembra
  // exactamente lo mismo que antes, y la organización histórica no lo declara.
  //
  // Referencia del emisor en cada conversación. Sin ella, la consulta de la conversación vigente
  // (12.2) no tiene ninguna candidata: exige `external_ref is not null`.
  externalRefs?: boolean;
  // Precios (11.1): un precio vigente para nueve de cada diez productos, y uno anterior para uno
  // de cada cinco de esos.
  prices?: boolean;
  // Entradas de información del negocio (11.2).
  knowledgeEntries?: number;
  // Una conversación más, con esta cantidad de mensajes, todos más recientes que los demás: el
  // caso del plan del historial que la 12.4 dejó sin medir (H-3).
  concentratedMessages?: number;
  // Lo que sigue es de la 24.5.2 (D-9, H-14) y también es opcional.
  //
  // **Por qué hizo falta**: hasta la 24.5.2 este seed no sembraba ni capacidades, ni modelos, ni
  // una sola unidad con IMEI. Eso dejaba **sin instrumento** a dos caminos que ya existían en la
  // aplicación: el catálogo agrupado por modelo (24.5.1) y la lista de unidades de un producto.
  // La medición que el §Riesgos de la 24.5.1 prometía no se hizo por esto, y el motivo no estaba
  // escrito en ninguna parte: no era que faltara agregar el camino al script de medición —eso
  // también faltaba, y no alcanzaba—, era que no había datos sobre los que el camino significara
  // algo. Un camino sin datos que lo ejerciten no se puede medir, y medirlo sobre tres filas de
  // una organización de demostración y llamarlo «la medición» es peor que declararlo sin medir.
  //
  // Cuántos modelos tiene la organización, con la capacidad `variants` activada. Los productos se
  // reparten entre ellos y **uno de cada cinco queda sin modelo**, para que el grupo «Sin modelo»
  // del catálogo agrupado exista y no sea un caso que nunca se mide.
  models?: number;
  // Un producto por unidad con esta cantidad de unidades, con la capacidad `serialized_units`.
  units?: number;
};

export const VOLUME_ORDINAL_0: VolumeShape = {
  ordinal: 0,
  size: VOLUME_DEFAULT_SIZE,
  heavyProducts: 20,
  members: VOLUME_MEMBER_COUNT,
  ingestionEvents: 0,
};

// D-1, resuelta el 2026-09-23: una organización que domina la tabla, tres medianas y dieciséis
// chicas. Las tres situaciones a la vez, y veinte valores distintos de `organization_id` para que
// la estadística `n_distinct` signifique algo.
export const VOLUME_DISTRIBUTION: readonly VolumeShape[] = [
  { ...VOLUME_ORDINAL_0, ingestionEvents: 20_000 },
  ...Array.from({ length: 3 }, (_, i) => ({
    ordinal: 1 + i,
    size: 1_000,
    heavyProducts: 2,
    members: 50,
    ingestionEvents: 2_000,
  })),
  ...Array.from({ length: 16 }, (_, i) => ({
    ordinal: 4 + i,
    size: 50,
    heavyProducts: 0,
    members: 5,
    ingestionEvents: 100,
  })),
];

// La distribución de la medición de la 13.2 (D-3): la de la 9.3 con referencias, precios e
// información del negocio, más una organización chica donde una conversación concentra la
// mayoría de los mensajes. Es una hipótesis, como la de la 9.3: no hay uso real que la corrija
// hasta que entre el primer negocio.
export const VOLUME_CONCENTRATED_ORDINAL = 20;
// *Ampliada el 2026-10-31 (24.5.2, D-9 y H-14)* con `models` y `units`. Antes, esta distribución no
// tenía ni modelos ni unidades, y por eso el catálogo agrupado y la lista de unidades **no se podían
// medir**: no había datos que ejercitaran esos caminos. Los números no son redondos por gusto:
// 50 modelos sobre 10.000 productos dan grupos de unas 160 presentaciones, que es un grupo grande
// de verdad, y 500 unidades en un producto pasan de sobra las 25 de una página.
export const VOLUME_MEASUREMENT: readonly VolumeShape[] = [
  ...VOLUME_DISTRIBUTION.map((shape) => ({
    ...shape,
    externalRefs: true,
    prices: true,
    knowledgeEntries: shape.size >= 1_000 ? 200 : 30,
    models: shape.size >= 1_000 ? 50 : 5,
    units: shape.size >= 10_000 ? 500 : shape.size >= 1_000 ? 100 : 10,
  })),
  {
    ordinal: VOLUME_CONCENTRATED_ORDINAL,
    size: 300,
    heavyProducts: 0,
    members: 5,
    ingestionEvents: 100,
    externalRefs: true,
    prices: true,
    knowledgeEntries: 30,
    concentratedMessages: 4_000,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const SPREAD_DAYS = 180;
const BATCH = 1000;
const MAX_MESSAGES = 12;

// La mayoría de los productos tiene pocos movimientos y unos pocos tienen cientos: es el caso
// que rompe una paginación de historial, y el promedio solo no lo produce (brief-8.5, D-2).
// Cuántos son los pocos lo declara cada organización en `heavyProducts`.
const MOVEMENTS_TYPICAL = 6;
const MOVEMENTS_HEAVY = 400;

const FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Diego",
  "Elena",
  "Federico",
  "Gabriela",
  "Hugo",
  "Inés",
  "Julián",
];
const LAST_NAMES = [
  "Sintético",
  "Ejemplo",
  "Prueba",
  "Ficticio",
  "Demo",
  "Muestra",
  "Simulado",
  "Modelo",
];
const INBOUND = [
  "Hola, ¿tienen stock?",
  "¿Cuál es el precio?",
  "¿Hacen envíos?",
  "Quería consultar por mi pedido.",
  "¿A qué hora abren?",
  "Gracias por la respuesta.",
];
const OUTBOUND = [
  "¡Hola! Sí, tenemos stock.",
  "Te paso la lista de precios.",
  "Sí, enviamos a todo el país.",
  "Tu pedido ya está en camino.",
  "Abrimos de 9 a 19.",
  "¡Gracias a vos!",
];
const STATUSES = ["open", "pending", "closed"] as const;

const PRODUCT_NOUNS = [
  "Café",
  "Yerba",
  "Azúcar",
  "Harina",
  "Aceite",
  "Fideos",
  "Arroz",
  "Galletitas",
  "Té",
  "Leche",
];
const PRODUCT_QUALIFIERS = [
  "molido",
  "en grano",
  "orgánico",
  "premium",
  "clásico",
  "integral",
  "sin sal",
  "x 500 g",
];
const UNITS = ["unidad", "kg", "litro", "caja"];
const MOVEMENT_REASONS = [
  "Recuento inicial",
  "Ajuste por recuento",
  "Rotura",
  "Ingreso de mercadería",
  "Corrección de carga",
];

const KNOWLEDGE_TOPICS = [
  "Horario de atención",
  "Medios de pago",
  "Envíos",
  "Ubicación del local",
  "Cambios y devoluciones",
  "Garantía",
  "Promociones",
  "Retiro en el local",
];
const KNOWLEDGE_CATEGORIES = ["Atención", "Pagos", "Envíos", "Local"];
const KNOWLEDGE_CONTENTS = [
  "Atendemos de lunes a viernes, de 9 a 19, y los sábados de 10 a 14.",
  "Aceptamos efectivo, transferencia y tarjetas de crédito y débito.",
  "Enviamos a todo el país. El costo depende del destino y del peso.",
  "Estamos en el centro, a dos cuadras de la plaza principal.",
  "Los cambios se hacen dentro de los 30 días, con el comprobante.",
];

// Códigos normalizados de la taxonomía de errores, que es lo único que `error_code` admite: nunca
// payload, cabeceras ni credenciales. La métrica 12 agrupa por esta columna.
const EVENT_ERROR_CODES = ["VALIDATION_ERROR", "CONFLICT", "INTERNAL_ERROR"];

// mulberry32: generador pseudoaleatorio con semilla fija, sin dependencias.
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// El ordinal entra por XOR con un multiplicador propio: para el ordinal 0 el término es 0 y la
// semilla queda idéntica a la de antes de la 9.3, así que la organización histórica genera las
// mismas filas. Para los demás ordinales, dos organizaciones del mismo tamaño no son clones.
function rowGenerator(kind: number, index: number, ordinal = 0): () => number {
  return generator(
    Math.imul(kind, 0x9e3779b1) ^
      Math.imul(index + 1, 0x85ebca6b) ^
      Math.imul(ordinal, 0xc2b2ae35),
  );
}

// 1 clientes · 2 conversaciones · 3 mensajes · 4 productos · 5 saldos · 6 movimientos · 7 usuarios
// · 8 eventos de ingestión (9.3) · 9 precios · a información del negocio · b la conversación
// concentrada · c sus mensajes (13.2) · d modelos · e el producto por unidad, su saldo y sus
// movimientos · f sus unidades (24.5.2). El ordinal de organización va en el segundo grupo, que
// estaba fijo en `0000`: con ordinal 0 el id es el histórico y con otro ordinal no puede colisionar.
export type VolumeKind =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "a" | "b" | "c" | "d" | "e" | "f";

export function volumeId(kind: VolumeKind, index: number, ordinal = 0): string {
  return `5eed000${kind}-${hex4(ordinal)}-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

async function insertInBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH) {
    await insert(rows.slice(start, start + BATCH));
  }
}

export type VolumeCounts = {
  clients: number;
  conversations: number;
  messages: number;
  products: number;
  balances: number;
  movements: number;
  members: number;
  ingestionEvents: number;
  prices: number;
  knowledgeEntries: number;
};

// Una fecha de calendario desplazada en días, sin pasar por la zona horaria de la máquina.
function shiftDate(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

// Siembra **una** organización del volumen. `seedVolume` la llama con el ordinal 0 y
// `seedVolumeDistribution` recorre la distribución de D-1.
export async function seedVolumeOrganization(
  db: Db,
  password: string,
  shape: VolumeShape,
  options: { referenceDate?: string; passwordHash?: string } = {},
): Promise<VolumeCounts> {
  await assertSeedableDatabase(db);
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `La contraseña del seed necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }
  const { ordinal, size } = shape;
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("El tamaño del volumen tiene que ser un entero positivo.");
  }

  const organizationId = volumeOrganizationId(ordinal);
  const user = volumeUser(ordinal);
  // `passwordHash` se calcula una sola vez y lo comparten el admin y los 500 miembros sintéticos
  // (brief-8.5, hallazgo 3): argon2id con los parámetros de producción tarda decenas de segundos
  // para 500 contraseñas que ninguna medición usa, y este seed no prueba autenticación. Desde la
  // 9.3 el llamador puede pasarlo ya calculado, para no repetir ese costo por cada organización.
  const passwordHash = options.passwordHash ?? (await hashPassword(password));
  const organizationName =
    ordinal === 0
      ? "Organización de volumen"
      : `Organización de volumen ${ordinal}`;
  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: organizationId, name: organizationName })
      .onConflictDoUpdate({
        target: organizations.id,
        set: { name: organizationName },
      });
    const values = {
      email: user.email,
      name: user.name,
      mustChangePassword: false,
      isActive: true,
    };
    // Una segunda corrida no reescribe la fila (11.0, D-3; R-14 de la revisión de la 9.3). Dos
    // cosas la reescribían: el hash, porque argon2 usa sal aleatoria, y `updated_at`, porque su
    // `$onUpdate` lo cambia en cualquier `DO UPDATE`. Por eso el hash solo se escribe al crear el
    // usuario, y el resto solo se repone si difiere. Costo: para cambiar la contraseña de los
    // usuarios de volumen hay que borrarlos y volver a sembrar.
    await tx
      .insert(users)
      .values({ id: user.id, passwordHash, ...values })
      .onConflictDoUpdate({
        target: users.id,
        set: values,
        setWhere: sql`${users.email} is distinct from excluded.email
          or ${users.name} is distinct from excluded.name
          or ${users.mustChangePassword} is distinct from excluded.must_change_password
          or ${users.isActive} is distinct from excluded.is_active`,
      });
    await tx
      .insert(organizationMembers)
      .values({
        organizationId,
        userId: user.id,
        role: "admin",
      })
      .onConflictDoUpdate({
        target: organizationMembers.userId,
        set: { organizationId, role: "admin" },
      });
  });

  const timezone = await organizationTimezone(db, organizationId);
  const referenceDate = options.referenceDate ?? (await todayIn(db, timezone));
  // Todo mensaje queda antes del inicio del día de referencia.
  const [end] = await localTimesToUtc(db, timezone, [`${referenceDate} 00:00`]);

  const clientRows = Array.from({ length: size }, (_, i) => {
    const random = rowGenerator(1, i, ordinal);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    return {
      id: volumeId(1, i, ordinal),
      organizationId: organizationId,
      displayName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${i + 1}`,
      phoneE164: random() < 0.1 ? null : `+549116${String(i).padStart(7, "0")}`,
      notes: null,
      isActive: random() >= 0.05,
    };
  });

  const conversationRows: (typeof conversations.$inferInsert)[] = [];
  const messageRows: (typeof messages.$inferInsert)[] = [];
  for (let i = 0; i < size; i++) {
    const random = rowGenerator(2, i, ordinal);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    const count = 1 + Math.floor(random() * MAX_MESSAGES);
    // El último mensaje puede quedar hasta MAX_MESSAGES * 4 horas después del primero.
    const start =
      end!.getTime() - 2 * DAY_MS - Math.floor(random() * SPREAD_DAYS * DAY_MS);
    const conversationId = volumeId(2, i, ordinal);
    let direction: "inbound" | "outbound" =
      random() < 0.85 ? "inbound" : "outbound";
    let sentAt = start;
    for (let position = 0; position < count; position++) {
      if (position > 0) {
        sentAt += (1 + Math.floor(random() * 240)) * 60 * 1000;
        if (random() < 0.7) {
          direction = direction === "inbound" ? "outbound" : "inbound";
        }
      }
      messageRows.push({
        // Id derivado de la conversación y la posición, no de un contador global.
        id: volumeId(3, i * (MAX_MESSAGES + 1) + position, ordinal),
        organizationId: organizationId,
        conversationId,
        direction,
        sentAt: new Date(sentAt),
        bodyText: `${pick(direction === "inbound" ? INBOUND : OUTBOUND)} (#${i + 1})`,
      });
    }
    const clientId =
      random() < 0.2 ? null : volumeId(1, Math.floor(random() * size), ordinal);
    conversationRows.push({
      id: conversationId,
      organizationId: organizationId,
      clientId,
      channel: "whatsapp",
      status: pick(STATUSES),
      startedAt: new Date(start),
      lastMessageAt: new Date(sentAt),
      ...(shape.externalRefs
        ? { externalRef: `vol-conv-${ordinal}-${i + 1}` }
        : {}),
    });
  }

  // La conversación concentrada (13.2, D-3): abierta, del primer cliente activo con teléfono, con
  // un mensaje cada cinco minutos hasta una hora antes del día de referencia. Todos sus mensajes
  // son posteriores a los de las demás, que terminan dos días antes: es la forma en la que el
  // planificador dudó entre los dos índices de `messages` (12.4, H-3).
  const concentrated = shape.concentratedMessages ?? 0;
  if (concentrated > 0) {
    const owner = clientRows.find(
      (client) => client.isActive && client.phoneE164 !== null,
    );
    if (!owner) {
      throw new Error(
        "La conversación concentrada necesita un cliente activo con teléfono.",
      );
    }
    const conversationId = volumeId("b", 0, ordinal);
    const last = end!.getTime() - 60 * 60 * 1000;
    const step = 5 * 60 * 1000;
    const first = last - (concentrated - 1) * step;
    for (let position = 0; position < concentrated; position++) {
      const direction = position % 2 === 0 ? "inbound" : "outbound";
      messageRows.push({
        id: volumeId("c", position, ordinal),
        organizationId,
        conversationId,
        direction,
        sentAt: new Date(first + position * step),
        bodyText: `${(direction === "inbound" ? INBOUND : OUTBOUND)[position % INBOUND.length]} (concentrada ${position + 1})`,
      });
    }
    conversationRows.push({
      id: conversationId,
      organizationId,
      clientId: owner.id,
      channel: "whatsapp",
      status: "open",
      startedAt: new Date(first),
      lastMessageAt: new Date(last),
      externalRef: `vol-conv-${ordinal}-concentrada`,
    });
  }

  // Catálogo e inventario (brief-8.5). El saldo sale de la cadena de movimientos y no al revés:
  // un saldo que no coincida con sus movimientos es un estado que ninguna operación real produce.
  const productRows: (typeof products.$inferInsert)[] = [];
  const movementRows: (typeof inventoryMovements.$inferInsert)[] = [];
  const balanceRows: (typeof inventories.$inferInsert)[] = [];
  for (let i = 0; i < size; i++) {
    const random = rowGenerator(4, i, ordinal);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    const productId = volumeId(4, i, ordinal);
    productRows.push({
      id: productId,
      organizationId: organizationId,
      sku: `SKU-${String(i + 1).padStart(6, "0")}`,
      name: `${pick(PRODUCT_NOUNS)} ${pick(PRODUCT_QUALIFIERS)} ${i + 1}`,
      description: null,
      unit: pick(UNITS),
      reorderPoint: String(Math.floor(random() * 20)),
      isActive: random() >= 0.05,
      // El modelo, solo si la forma lo declara (24.5.2). El reparto es por módulo del índice y no
      // por el generador: así los grupos del catálogo agrupado tienen tamaños parejos y conocidos,
      // que es lo que hace comparable una medición entre corridas. **Uno de cada cinco queda sin
      // modelo** para que el grupo «Sin modelo» exista.
      modelId:
        shape.models && i % 5 !== 0
          ? volumeId("d", i % shape.models, ordinal)
          : null,
    });

    // Unos pocos productos concentran cientos de movimientos; el resto tiene entre 0 y 6, y los
    // que tienen 0 quedan sin fila en inventories, que es el caso "sin fila, saldo 0" del diseño.
    const count =
      i < shape.heavyProducts
        ? MOVEMENTS_HEAVY
        : Math.floor(random() * (MOVEMENTS_TYPICAL + 1));
    let balance = 0;
    let createdAt = end!.getTime() - SPREAD_DAYS * DAY_MS;
    for (let position = 0; position < count; position++) {
      createdAt += (1 + Math.floor(random() * 600)) * 60 * 1000;
      const quantity = 1 + Math.floor(random() * 50);
      // Negativo solo si el saldo alcanza: balance_after tiene un CHECK de no negatividad.
      const negative = random() < 0.4 && balance >= quantity;
      balance += negative ? -quantity : quantity;
      movementRows.push({
        id: volumeId(6, i * (MOVEMENTS_HEAVY + 1) + position, ordinal),
        organizationId: organizationId,
        productId,
        type: negative ? "adjustment_negative" : "adjustment_positive",
        quantity: String(quantity),
        balanceAfter: String(balance),
        reason: pick(MOVEMENT_REASONS),
        createdBy: user.id,
        createdAt: new Date(createdAt),
      });
    }
    if (count > 0) {
      balanceRows.push({
        id: volumeId(5, i, ordinal),
        organizationId: organizationId,
        productId,
        quantityOnHand: String(balance),
      });
    }
  }

  // Modelos, capacidades y el producto por unidad (24.5.2, D-9 y H-14).
  //
  // El producto por unidad va **aparte del bucle de arriba**, con su propio índice: la garantía del
  // seed desde la 6.2 es que «la fila i es la misma con cualquier tamaño», y meterlo en el bucle
  // habría cambiado qué es la fila i. Lleva un movimiento por unidad, porque el saldo de este seed
  // sale de la cadena de movimientos y no al revés.
  const modelRows: (typeof productModels.$inferInsert)[] = [];
  const capabilityRows: (typeof organizationCapabilities.$inferInsert)[] = [];
  const unitRows: (typeof stockUnits.$inferInsert)[] = [];

  if (shape.models) {
    capabilityRows.push({
      organizationId,
      capability: "variants",
      activatedBy: user.id,
    });
    for (let i = 0; i < shape.models; i++) {
      const random = rowGenerator(11, i, ordinal);
      const pick = <T>(list: readonly T[]): T =>
        list[Math.floor(random() * list.length)]!;
      modelRows.push({
        id: volumeId("d", i, ordinal),
        organizationId,
        name: `${pick(PRODUCT_NOUNS)} modelo ${i + 1}`,
        brand: pick(PRODUCT_QUALIFIERS),
        position: i,
        isActive: true,
        createdAt: end!,
        updatedAt: end!,
      });
    }
  }

  if (shape.units) {
    capabilityRows.push({
      organizationId,
      capability: "serialized_units",
      activatedBy: user.id,
    });
    const unitProductId = volumeId("e", 0, ordinal);
    productRows.push({
      id: unitProductId,
      organizationId,
      sku: `SKU-UNIDADES-${hex4(ordinal)}`,
      name: `Equipo por unidad ${ordinal}`,
      description: null,
      unit: "unidad",
      reorderPoint: "0",
      isActive: true,
      tracking: "unit",
      modelId: shape.models ? volumeId("d", 0, ordinal) : null,
    });
    // **Todas nacen `available`, y se quedan así.** Dos razones, las dos verificadas y no supuestas:
    //
    // 1. El trigger `stock_units_guard` **rechaza un `insert` que no nazca `available`**, así que
    //    sembrar una unidad ya reservada o vendida exigiría insertarla disponible y después
    //    recorrerla con `update` por cada transición legal. Se puede, pero no hace falta.
    // 2. Para **medir**, el caso caro de `listProductUnits` es el conjunto de resultados más
    //    grande, que es justamente «todas disponibles»; un filtro por otro estado devuelve pocas
    //    filas o ninguna, y eso es el caso barato. El reparto de estados le importa a los
    //    recorridos end-to-end, que lo arman ellos, no a la medición.
    //
    // Queda declarado como límite de este seed: **no sirve para ejercitar el filtro por estado con
    // volumen**. Si alguna vez hace falta, se agrega recorriendo la máquina de estados con `update`.
    for (let i = 0; i < shape.units; i++) {
      const random = rowGenerator(12, i, ordinal);
      const at = new Date(end!.getTime() - (shape.units - i) * 60 * 1000);
      unitRows.push({
        id: volumeId("f", i, ordinal),
        organizationId,
        productId: unitProductId,
        // Respeta `stock_units_serial_format`. Sus últimos cuatro dígitos son únicos dentro del
        // producto, que es lo que la búsqueda por sufijo de la 24.5.2 necesita para que una
        // medición de ese camino devuelva una sola fila y no un conjunto al azar.
        serial: `VOL-${hex4(ordinal)}-${String(i + 1).padStart(6, "0")}`,
        cost: ((50_000 + Math.floor(random() * 50_000)) / 100).toFixed(2),
        costCurrency: "USD",
        originType: "manual",
        createdBy: user.id,
        createdAt: at,
      });
      // Un movimiento por unidad: el saldo de este seed sale de la cadena de movimientos y no al
      // revés, así que el saldo final es exactamente `shape.units`.
      movementRows.push({
        id: volumeId("e", i + 1, ordinal),
        organizationId,
        productId: unitProductId,
        type: "adjustment_positive",
        quantity: "1",
        balanceAfter: String(i + 1),
        reason: "Alta de una unidad del seed de volumen",
        unitId: volumeId("f", i, ordinal),
        createdBy: user.id,
        createdAt: at,
      });
    }
    balanceRows.push({
      id: volumeId("e", 0, ordinal),
      organizationId,
      productId: unitProductId,
      quantityOnHand: String(shape.units),
    });
  }

  // Precios (13.2, D-3). `product_prices` es de solo inserción: la idempotencia es por id. La
  // fecha se fija acá, y no con el `clock_timestamp()` de la columna, para que el precio vigente
  // sea el mismo en cualquier corrida.
  const priceRows: (typeof productPrices.$inferInsert)[] = [];
  if (shape.prices) {
    for (let i = 0; i < size; i++) {
      const random = rowGenerator(9, i, ordinal);
      if (random() >= 0.9) continue;
      const amount = () =>
        ((100 + Math.floor(random() * 99_900)) / 100).toFixed(2);
      const currency = random() < 0.05 ? "USD" : "ARS";
      const current = end!.getTime() - (1 + Math.floor(random() * 60)) * DAY_MS;
      if (random() < 0.2) {
        priceRows.push({
          id: volumeId(9, i * 2, ordinal),
          organizationId,
          productId: volumeId(4, i, ordinal),
          amount: amount(),
          currency,
          createdBy: user.id,
          createdAt: new Date(current - 30 * DAY_MS),
        });
      }
      priceRows.push({
        id: volumeId(9, i * 2 + 1, ordinal),
        organizationId,
        productId: volumeId(4, i, ordinal),
        amount: amount(),
        currency,
        createdBy: user.id,
        createdAt: new Date(current),
      });
    }
  }

  // Información del negocio (13.2, D-3). El título es único por organización sin distinguir
  // mayúsculas, así que lleva el número de fila. Una de cada seis está vencida y una de cada
  // seis todavía no rige, para que el filtro de vigencia tenga algo que descartar.
  const knowledgeRows: (typeof knowledgeEntries.$inferInsert)[] = [];
  for (let i = 0; i < (shape.knowledgeEntries ?? 0); i++) {
    const random = rowGenerator(10, i, ordinal);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    const validity = random();
    knowledgeRows.push({
      id: volumeId("a", i, ordinal),
      organizationId,
      title: `${pick(KNOWLEDGE_TOPICS)} ${i + 1}`,
      category: pick(KNOWLEDGE_CATEGORIES),
      content: pick(KNOWLEDGE_CONTENTS),
      isActive: random() >= 0.1,
      validFrom:
        validity > 5 / 6
          ? shiftDate(referenceDate, 1 + Math.floor(random() * 30))
          : null,
      validUntil:
        validity < 1 / 6
          ? shiftDate(referenceDate, -(1 + Math.floor(random() * 30)))
          : null,
      createdAt: end!,
      updatedAt: end!,
    });
  }

  // Miembros sintéticos: 500 usuarios con el mismo hash, un cuarto de ellos viewer y algunos
  // inactivos, para que el filtro y el orden de la lista tengan algo que hacer.
  const memberUserRows: (typeof users.$inferInsert)[] = [];
  const memberRows: (typeof organizationMembers.$inferInsert)[] = [];
  for (let i = 0; i < shape.members; i++) {
    const random = rowGenerator(7, i, ordinal);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    const userId = volumeId(7, i, ordinal);
    memberUserRows.push({
      id: userId,
      email: volumeMemberEmail(ordinal, i),
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${i + 1}`,
      passwordHash,
      mustChangePassword: false,
      isActive: random() >= 0.1,
    });
    memberRows.push({
      organizationId: organizationId,
      userId,
      role: random() < 0.25 ? "admin" : "viewer",
    });
  }

  // Eventos de ingestión (9.3, D-5). La métrica 12 nunca se midió con volumen: `ingestion_events`
  // está vacía en desarrollo y no hay emisor conectado. Esto no cierra esa parte del riesgo —los
  // eventos son sintéticos— pero le da a la consulta un rango de índice sobre el que medir.
  //
  // Los tres CHECK de la tabla acoplan `status` con las otras columnas: `processed_at` es no nulo
  // si y solo si el estado no es `received`, y `error_code` es no nulo si y solo si es `failed`.
  // Se respetan acá y no se descubren al insertar.
  const eventRows: (typeof ingestionEvents.$inferInsert)[] = [];
  for (let i = 0; i < shape.ingestionEvents; i++) {
    const random = rowGenerator(8, i, ordinal);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    const receivedAt =
      end!.getTime() - Math.floor(random() * SPREAD_DAYS * DAY_MS);
    const roll = random();
    const status =
      roll < 0.9 ? "processed" : roll < 0.97 ? ("failed" as const) : "received";
    eventRows.push({
      id: volumeId(8, i, ordinal),
      organizationId,
      source: "whatsapp",
      externalRef: `vol-${ordinal}-${i + 1}`,
      eventType: "message.recorded",
      payloadHash: createHash("sha256")
        .update(`volumen:${ordinal}:${i}`)
        .digest("hex"),
      status,
      errorCode: status === "failed" ? pick(EVENT_ERROR_CODES) : null,
      receivedAt: new Date(receivedAt),
      processedAt: status === "received" ? null : new Date(receivedAt + 1_000),
    });
  }

  await db.transaction((tx) =>
    insertInBatches(clientRows, (batch) =>
      tx
        .insert(clients)
        .values(batch)
        .onConflictDoNothing({ target: clients.id }),
    ),
  );
  await db.transaction((tx) =>
    insertInBatches(conversationRows, (batch) =>
      tx
        .insert(conversations)
        .values(batch)
        .onConflictDoNothing({ target: conversations.id }),
    ),
  );
  await db.transaction((tx) =>
    insertInBatches(messageRows, (batch) =>
      tx
        .insert(messages)
        .values(batch)
        .onConflictDoNothing({ target: messages.id }),
    ),
  );

  // Las capacidades y los modelos van **antes** que los productos: `products.model_id` apunta al
  // modelo, y sin la capacidad la vista agrupada no se ofrece (24.5.2).
  await db.transaction((tx) =>
    insertInBatches(capabilityRows, (batch) =>
      tx
        .insert(organizationCapabilities)
        .values(batch)
        .onConflictDoNothing({
          target: [
            organizationCapabilities.organizationId,
            organizationCapabilities.capability,
          ],
        }),
    ),
  );
  await db.transaction((tx) =>
    insertInBatches(modelRows, (batch) =>
      tx
        .insert(productModels)
        .values(batch)
        .onConflictDoNothing({ target: productModels.id }),
    ),
  );
  await db.transaction((tx) =>
    insertInBatches(productRows, (batch) =>
      tx
        .insert(products)
        .values(batch)
        .onConflictDoNothing({ target: products.id }),
    ),
  );
  // Los usuarios van antes que los movimientos y que las membresías: los referencian.
  await db.transaction((tx) =>
    insertInBatches(memberUserRows, (batch) =>
      tx.insert(users).values(batch).onConflictDoNothing({ target: users.id }),
    ),
  );
  await db.transaction((tx) =>
    insertInBatches(memberRows, (batch) =>
      tx
        .insert(organizationMembers)
        .values(batch)
        .onConflictDoNothing({ target: organizationMembers.userId }),
    ),
  );
  // Las unidades van **antes** que los movimientos: `inventory_movements.unit_id` las referencia.
  // Nacen todas `available`, que es lo único que el trigger `stock_units_guard` admite en un
  // `insert` (24.5.2).
  if (unitRows.length > 0) {
    await db.transaction((tx) =>
      insertInBatches(unitRows, (batch) =>
        tx
          .insert(stockUnits)
          .values(batch)
          .onConflictDoNothing({ target: stockUnits.id }),
      ),
    );
  }
  // inventory_movements es de solo inserción (ADR 0013): la idempotencia es por id y nunca por
  // UPDATE, que el trigger rechazaría. El saldo sí se puede actualizar, pero se deja fijo con
  // DO NOTHING para que el estado de la primera corrida no cambie en las siguientes.
  await db.transaction((tx) =>
    insertInBatches(movementRows, (batch) =>
      tx
        .insert(inventoryMovements)
        .values(batch)
        .onConflictDoNothing({ target: inventoryMovements.id }),
    ),
  );
  await db.transaction((tx) =>
    insertInBatches(balanceRows, (batch) =>
      tx
        .insert(inventories)
        .values(batch)
        .onConflictDoNothing({ target: inventories.productId }),
    ),
  );
  // Los precios van después de los productos y de los usuarios: referencian a los dos.
  if (priceRows.length > 0) {
    await db.transaction((tx) =>
      insertInBatches(priceRows, (batch) =>
        tx
          .insert(productPrices)
          .values(batch)
          .onConflictDoNothing({ target: productPrices.id }),
      ),
    );
  }
  if (knowledgeRows.length > 0) {
    await db.transaction((tx) =>
      insertInBatches(knowledgeRows, (batch) =>
        tx
          .insert(knowledgeEntries)
          .values(batch)
          .onConflictDoNothing({ target: knowledgeEntries.id }),
      ),
    );
  }
  // ingestion_events rechaza DELETE por trigger para cualquier rol (ADR 0013, migración 0012):
  // la idempotencia es por id y nunca por borrado y reinserción.
  if (eventRows.length > 0) {
    await db.transaction((tx) =>
      insertInBatches(eventRows, (batch) =>
        tx
          .insert(ingestionEvents)
          .values(batch)
          .onConflictDoNothing({ target: ingestionEvents.id }),
      ),
    );
  }

  const counts = await db.execute<VolumeCounts>(
    sql`select
          (select count(*)::int from clients where organization_id = ${organizationId}) as clients,
          (select count(*)::int from conversations where organization_id = ${organizationId}) as conversations,
          (select count(*)::int from messages where organization_id = ${organizationId}) as messages,
          (select count(*)::int from products where organization_id = ${organizationId}) as products,
          (select count(*)::int from inventories where organization_id = ${organizationId}) as balances,
          (select count(*)::int from inventory_movements where organization_id = ${organizationId}) as movements,
          (select count(*)::int from organization_members where organization_id = ${organizationId}) as members,
          (select count(*)::int from ingestion_events where organization_id = ${organizationId}) as "ingestionEvents",
          (select count(*)::int from product_prices where organization_id = ${organizationId}) as prices,
          (select count(*)::int from knowledge_entries where organization_id = ${organizationId}) as "knowledgeEntries"`,
  );
  return counts.rows[0]!;
}

// La forma histórica: siembra la organización ordinal 0 y nada más. Firma y conducta sin cambios
// respecto de antes de la 9.3, incluido que no toca `ingestion_events`.
export async function seedVolume(
  db: Db,
  password: string,
  options: { size?: number; referenceDate?: string } = {},
): Promise<VolumeCounts> {
  return seedVolumeOrganization(
    db,
    password,
    { ...VOLUME_ORDINAL_0, size: options.size ?? VOLUME_DEFAULT_SIZE },
    { referenceDate: options.referenceDate },
  );
}

// Siembra la distribución completa de D-1, una organización por vez. El hash de contraseña se
// calcula una sola vez para las veinte: argon2id con parámetros de producción tarda decenas de
// segundos y ninguna medición de esta subfase prueba autenticación.
export async function seedVolumeDistribution(
  db: Db,
  password: string,
  options: { shapes?: readonly VolumeShape[]; referenceDate?: string } = {},
): Promise<{ byOrganization: (VolumeCounts & { ordinal: number })[] }> {
  await assertSeedableDatabase(db);
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `La contraseña del seed necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }
  const shapes = options.shapes ?? VOLUME_DISTRIBUTION;
  const passwordHash = await hashPassword(password);
  const byOrganization: (VolumeCounts & { ordinal: number })[] = [];
  for (const shape of shapes) {
    const counts = await seedVolumeOrganization(db, password, shape, {
      referenceDate: options.referenceDate,
      passwordHash,
    });
    byOrganization.push({ ordinal: shape.ordinal, ...counts });
  }
  return { byOrganization };
}

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!url) throw new Error("Falta DATABASE_URL: copiá .env.example a .env.");
  if (!password) {
    throw new Error("Falta SEED_USER_PASSWORD: copiá .env.example a .env.");
  }
  const argument = process.argv[2];
  // `distribucion` siembra las veinte organizaciones de D-1; `medicion`, las veintiuna de la 13.2;
  // un número siembra solo la ordinal 0 con ese tamaño, que es la forma de antes de la 9.3 y la
  // que usa la calibración de D-3.
  const measurement = argument === "medicion";
  const distribution = argument === "distribucion" || measurement;
  const size =
    argument === undefined || distribution ? undefined : Number(argument);

  const db = createDb(url);
  const started = performance.now();
  try {
    if (distribution) {
      const { byOrganization } = await seedVolumeDistribution(db, password, {
        shapes: measurement ? VOLUME_MEASUREMENT : VOLUME_DISTRIBUTION,
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const total = (key: keyof VolumeCounts): number =>
        byOrganization.reduce((sum, row) => sum + row[key], 0);
      for (const row of byOrganization) {
        console.log(
          `  organización ${row.ordinal}: ${row.clients} clientes, ${row.conversations} conversaciones, ` +
            `${row.messages} mensajes, ${row.products} productos, ${row.movements} movimientos, ` +
            `${row.members} miembros, ${row.ingestionEvents} eventos, ${row.prices} precios, ` +
            `${row.knowledgeEntries} entradas de información.`,
        );
      }
      console.log(
        `Distribución de volumen aplicada: ${byOrganization.length} organizaciones, ` +
          `${total("clients")} clientes, ${total("conversations")} conversaciones, ` +
          `${total("messages")} mensajes, ${total("products")} productos, ` +
          `${total("movements")} movimientos, ${total("members")} miembros, ` +
          `${total("ingestionEvents")} eventos de ingestión, ${total("prices")} precios y ` +
          `${total("knowledgeEntries")} entradas de información en ${seconds} s.`,
      );
      return;
    }
    const counts = await seedVolume(db, password, { size });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(
      `Seed de volumen aplicado para ${VOLUME_USER.email}: ${counts.clients} clientes, ` +
        `${counts.conversations} conversaciones, ${counts.messages} mensajes, ` +
        `${counts.products} productos, ${counts.balances} saldos, ` +
        `${counts.movements} movimientos y ${counts.members} miembros en ${seconds} s.`,
    );
  } finally {
    await db.$client.end();
  }
}

// Solo corre al ejecutarse con npm run db:seed:volume; importarlo desde los tests no escribe nada.
if (process.argv[1]?.replaceAll("\\", "/").endsWith("seeds/volume.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
