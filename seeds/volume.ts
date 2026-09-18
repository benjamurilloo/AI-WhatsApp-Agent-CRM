import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/modules/auth";
import { users } from "@/modules/auth/schema";
import { products } from "@/modules/catalog/schema";
import { conversations, messages } from "@/modules/conversations/schema";
import { clients } from "@/modules/crm/schema";
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

export const VOLUME_ORGANIZATION_ID = "5eed0000-0000-4000-8000-000000000021";
export const VOLUME_USER = {
  id: "5eed0000-0000-4000-8000-000000000022",
  email: "volumen@example.com",
  name: "Admin de volumen",
} as const;
export const VOLUME_DEFAULT_SIZE = 10_000;

// Catálogo, inventario y miembros (brief-8.5, D-2). Los productos acompañan al tamaño de
// clientes; los miembros se quedan en 500, que es el número exacto que Overview fijó como
// condición de revisión de la lista compuesta en memoria.
export const VOLUME_MEMBER_COUNT = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
const SPREAD_DAYS = 180;
const BATCH = 1000;
const MAX_MESSAGES = 12;

// La mayoría de los productos tiene pocos movimientos y unos pocos tienen cientos: es el caso
// que rompe una paginación de historial, y el promedio solo no lo produce (brief-8.5, D-2).
const MOVEMENTS_TYPICAL = 6;
const MOVEMENTS_HEAVY = 400;
const HEAVY_PRODUCTS = 20;

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

function rowGenerator(kind: number, index: number): () => number {
  return generator(
    Math.imul(kind, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b),
  );
}

// 1 clientes · 2 conversaciones · 3 mensajes · 4 productos · 5 saldos · 6 movimientos · 7 usuarios.
function volumeId(kind: 1 | 2 | 3 | 4 | 5 | 6 | 7, index: number): string {
  return `5eed000${kind}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

async function insertInBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH) {
    await insert(rows.slice(start, start + BATCH));
  }
}

export async function seedVolume(
  db: Db,
  password: string,
  options: { size?: number; referenceDate?: string } = {},
): Promise<{
  clients: number;
  conversations: number;
  messages: number;
  products: number;
  balances: number;
  movements: number;
  members: number;
}> {
  await assertSeedableDatabase(db);
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `La contraseña del seed necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }
  const size = options.size ?? VOLUME_DEFAULT_SIZE;
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("El tamaño del volumen tiene que ser un entero positivo.");
  }

  const passwordHash = await hashPassword(password);
  const organizationName = "Organización de volumen";
  // `passwordHash` se calcula una sola vez y lo comparten el admin y los 500 miembros sintéticos
  // (brief-8.5, hallazgo 3): argon2id con los parámetros de producción tarda decenas de segundos
  // para 500 contraseñas que ninguna medición usa, y este seed no prueba autenticación.
  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: VOLUME_ORGANIZATION_ID, name: organizationName })
      .onConflictDoUpdate({
        target: organizations.id,
        set: { name: organizationName },
      });
    const values = {
      email: VOLUME_USER.email,
      name: VOLUME_USER.name,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
    };
    await tx
      .insert(users)
      .values({ id: VOLUME_USER.id, ...values })
      .onConflictDoUpdate({ target: users.id, set: values });
    await tx
      .insert(organizationMembers)
      .values({
        organizationId: VOLUME_ORGANIZATION_ID,
        userId: VOLUME_USER.id,
        role: "admin",
      })
      .onConflictDoUpdate({
        target: organizationMembers.userId,
        set: { organizationId: VOLUME_ORGANIZATION_ID, role: "admin" },
      });
  });

  const timezone = await organizationTimezone(db, VOLUME_ORGANIZATION_ID);
  const referenceDate = options.referenceDate ?? (await todayIn(db, timezone));
  // Todo mensaje queda antes del inicio del día de referencia.
  const [end] = await localTimesToUtc(db, timezone, [`${referenceDate} 00:00`]);

  const clientRows = Array.from({ length: size }, (_, i) => {
    const random = rowGenerator(1, i);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    return {
      id: volumeId(1, i),
      organizationId: VOLUME_ORGANIZATION_ID,
      displayName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${i + 1}`,
      phoneE164: random() < 0.1 ? null : `+549116${String(i).padStart(7, "0")}`,
      notes: null,
      isActive: random() >= 0.05,
    };
  });

  const conversationRows: (typeof conversations.$inferInsert)[] = [];
  const messageRows: (typeof messages.$inferInsert)[] = [];
  for (let i = 0; i < size; i++) {
    const random = rowGenerator(2, i);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    const count = 1 + Math.floor(random() * MAX_MESSAGES);
    // El último mensaje puede quedar hasta MAX_MESSAGES * 4 horas después del primero.
    const start =
      end!.getTime() - 2 * DAY_MS - Math.floor(random() * SPREAD_DAYS * DAY_MS);
    const conversationId = volumeId(2, i);
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
        id: volumeId(3, i * (MAX_MESSAGES + 1) + position),
        organizationId: VOLUME_ORGANIZATION_ID,
        conversationId,
        direction,
        sentAt: new Date(sentAt),
        bodyText: `${pick(direction === "inbound" ? INBOUND : OUTBOUND)} (#${i + 1})`,
      });
    }
    const clientId =
      random() < 0.2 ? null : volumeId(1, Math.floor(random() * size));
    conversationRows.push({
      id: conversationId,
      organizationId: VOLUME_ORGANIZATION_ID,
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
    const random = rowGenerator(4, i);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    const productId = volumeId(4, i);
    productRows.push({
      id: productId,
      organizationId: VOLUME_ORGANIZATION_ID,
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
      i < HEAVY_PRODUCTS
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
        id: volumeId(6, i * (MOVEMENTS_HEAVY + 1) + position),
        organizationId: VOLUME_ORGANIZATION_ID,
        productId,
        type: negative ? "adjustment_negative" : "adjustment_positive",
        quantity: String(quantity),
        balanceAfter: String(balance),
        reason: pick(MOVEMENT_REASONS),
        createdBy: VOLUME_USER.id,
        createdAt: new Date(createdAt),
      });
    }
    if (count > 0) {
      balanceRows.push({
        id: volumeId(5, i),
        organizationId: VOLUME_ORGANIZATION_ID,
        productId,
        quantityOnHand: String(balance),
      });
    }
  }

  // Miembros sintéticos: 500 usuarios con el mismo hash, un cuarto de ellos viewer y algunos
  // inactivos, para que el filtro y el orden de la lista tengan algo que hacer.
  const memberUserRows: (typeof users.$inferInsert)[] = [];
  const memberRows: (typeof organizationMembers.$inferInsert)[] = [];
  for (let i = 0; i < VOLUME_MEMBER_COUNT; i++) {
    const random = rowGenerator(7, i);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(random() * list.length)]!;
    const userId = volumeId(7, i);
    memberUserRows.push({
      id: userId,
      email: `miembro${String(i + 1).padStart(4, "0")}@volumen.example`,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${i + 1}`,
      passwordHash,
      mustChangePassword: false,
      isActive: random() >= 0.1,
    });
    memberRows.push({
      organizationId: VOLUME_ORGANIZATION_ID,
      userId,
      role: random() < 0.25 ? "admin" : "viewer",
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

  const counts = await db.execute<{
    clients: number;
    conversations: number;
    messages: number;
    products: number;
    balances: number;
    movements: number;
    members: number;
  }>(
    sql`select
          (select count(*)::int from clients where organization_id = ${VOLUME_ORGANIZATION_ID}) as clients,
          (select count(*)::int from conversations where organization_id = ${VOLUME_ORGANIZATION_ID}) as conversations,
          (select count(*)::int from messages where organization_id = ${VOLUME_ORGANIZATION_ID}) as messages,
          (select count(*)::int from products where organization_id = ${VOLUME_ORGANIZATION_ID}) as products,
          (select count(*)::int from inventories where organization_id = ${VOLUME_ORGANIZATION_ID}) as balances,
          (select count(*)::int from inventory_movements where organization_id = ${VOLUME_ORGANIZATION_ID}) as movements,
          (select count(*)::int from organization_members where organization_id = ${VOLUME_ORGANIZATION_ID}) as members`,
  );
  return counts.rows[0]!;
}

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!url) throw new Error("Falta DATABASE_URL: copiá .env.example a .env.");
  if (!password) {
    throw new Error("Falta SEED_USER_PASSWORD: copiá .env.example a .env.");
  }
  const sizeArgument = process.argv[2];
  const size = sizeArgument === undefined ? undefined : Number(sizeArgument);

  const db = createDb(url);
  const started = performance.now();
  try {
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
