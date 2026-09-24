import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/modules/auth";
import { users } from "@/modules/auth/schema";
import { products } from "@/modules/catalog/schema";
import { conversations, messages } from "@/modules/conversations/schema";
import { clients } from "@/modules/crm/schema";
import { ingestionEvents } from "@/modules/ingestion/schema";
import { inventories, inventoryMovements } from "@/modules/inventory/schema";
import {
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
// · 8 eventos de ingestión (9.3). El ordinal de organización va en el segundo grupo, que estaba
// fijo en `0000`: con ordinal 0 el id es el histórico y con otro ordinal no puede colisionar.
export function volumeId(
  kind: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  index: number,
  ordinal = 0,
): string {
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
};

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
          (select count(*)::int from ingestion_events where organization_id = ${organizationId}) as "ingestionEvents"`,
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
  // `distribucion` siembra las veinte organizaciones de D-1; un número siembra solo la ordinal 0
  // con ese tamaño, que es la forma de antes de la 9.3 y la que usa la calibración de D-3.
  const distribution = argument === "distribucion";
  const size =
    argument === undefined || distribution ? undefined : Number(argument);

  const db = createDb(url);
  const started = performance.now();
  try {
    if (distribution) {
      const { byOrganization } = await seedVolumeDistribution(db, password);
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const total = (key: keyof VolumeCounts): number =>
        byOrganization.reduce((sum, row) => sum + row[key], 0);
      for (const row of byOrganization) {
        console.log(
          `  organización ${row.ordinal}: ${row.clients} clientes, ${row.conversations} conversaciones, ` +
            `${row.messages} mensajes, ${row.products} productos, ${row.movements} movimientos, ` +
            `${row.members} miembros, ${row.ingestionEvents} eventos.`,
        );
      }
      console.log(
        `Distribución de volumen aplicada: ${byOrganization.length} organizaciones, ` +
          `${total("clients")} clientes, ${total("conversations")} conversaciones, ` +
          `${total("messages")} mensajes, ${total("products")} productos, ` +
          `${total("movements")} movimientos, ${total("members")} miembros y ` +
          `${total("ingestionEvents")} eventos de ingestión en ${seconds} s.`,
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
