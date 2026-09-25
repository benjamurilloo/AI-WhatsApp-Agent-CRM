import { existsSync } from "node:fs";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/modules/auth";
import { users } from "@/modules/auth/schema";
import { productPrices, products } from "@/modules/catalog/schema";
import { conversations, messages } from "@/modules/conversations/schema";
import { clients } from "@/modules/crm/schema";
import { inventories, inventoryMovements } from "@/modules/inventory/schema";
import { knowledgeEntries } from "@/modules/knowledge/schema";
import {
  organizationMembers,
  organizations,
} from "@/modules/organizations/schema";
import { createDb, type Db } from "@/shared/db";
import { assertSeedableDatabase, shiftDay, todayIn } from "./conversations";

// Seed del piloto (brief-11.4, D-2 y D-3): una organización propia con datos sintéticos con la
// forma de los del primer negocio —un comercio de tecnología con productos nuevos y
// reacondicionados—, nunca sus datos reales. Marcas, modelos, clientes y teléfonos son inventados.
//
// Determinista: cada fila sale de su índice, sin generador aleatorio, así que el triage puede
// reproducir en desarrollo lo que el piloto vio en staging.
//
// Idempotente, y con una regla distinta para cada clase de fila:
// - la organización y los dos usuarios se reponen en cada corrida, como en el seed básico, para
//   que la contraseña vuelva a ser la de SEED_USER_PASSWORD;
// - todo lo demás se inserta con DO NOTHING: lo que la persona del piloto cambie desde las
//   pantallas no se pisa, y las fechas quedan fijadas en la primera corrida.
//
// Lo que no hace, declarado: no escribe en audit_logs. Los precios, los movimientos y las
// entradas del seed no tienen autor en la auditoría, igual que los del seed de volumen.

export const PILOT_ORGANIZATION_ID = "5eed0000-0000-4000-9000-000000000001";
export const PILOT_ORGANIZATION_NAME = "Organización del piloto";
export const PILOT_TIMEZONE = "America/Argentina/Buenos_Aires";
export const PILOT_CURRENCY = "ARS";

export const PILOT_USERS = [
  {
    id: "5eed0000-0000-4000-9000-000000000011",
    email: "piloto-admin@example.com",
    name: "Admin del piloto",
    role: "admin",
  },
  {
    id: "5eed0000-0000-4000-9000-000000000012",
    email: "piloto-lectura@example.com",
    name: "Lectura del piloto",
    role: "viewer",
  },
] as const;

const ADMIN_ID = PILOT_USERS[0].id;

// Ids por clase: 2 productos, 3 precios, 4 saldos, 5 movimientos, 6 entradas, 7 clientes,
// 8 conversaciones, 9 mensajes. El prefijo `9000` los separa de los del seed básico (`8000`).
function pilotId(kind: number, index: number): string {
  return `5eed0000-0000-4000-9000-${String(kind).padStart(2, "0")}${String(index + 1).padStart(10, "0")}`;
}

export const pilotProductId = (index: number) => pilotId(2, index);
export const pilotEntryId = (index: number) => pilotId(6, index);

// --- Catálogo ---

const CATEGORIES = [
  {
    name: "Celulares",
    models: ["Aria 5", "Aria 7", "Pulse X", "Pulse Mini", "Nova S"],
    base: 420_000,
    step: 45_000,
  },
  {
    name: "Notebooks",
    models: ["Libra 14", "Libra 16", "Atlas Pro", "Atlas Air", "Zenda 13"],
    base: 950_000,
    step: 80_000,
  },
  {
    name: "Tablets",
    models: ["Tabla 10", "Tabla 8", "Folio 11", "Folio Kids", "Tabla Max"],
    base: 310_000,
    step: 30_000,
  },
  {
    name: "Auriculares",
    models: ["Eco Buds", "Eco Over", "Bass 2", "Studio One", "Run Fit"],
    base: 45_000,
    step: 9_000,
  },
  {
    name: "Relojes inteligentes",
    models: ["Pulso 3", "Pulso Lite", "Ritmo S", "Ritmo Sport", "Hora One"],
    base: 120_000,
    step: 18_000,
  },
  {
    name: "Accesorios",
    models: [
      "Cargador 20W",
      "Cable USB-C",
      "Funda rígida",
      "Soporte de escritorio",
      "Power bank 10000",
    ],
    base: 12_000,
    step: 4_500,
  },
] as const;

const BRANDS = [
  "Novatek",
  "Orbis",
  "Kalma",
  "Veltra",
  "Sonora",
  "Lumen",
  "Arkon",
  "Brisa",
] as const;

export const PILOT_PRODUCT_COUNT = 60;
export const PILOT_REORDER_POINT = 3;

// Cinco inactivos, repartidos en categorías distintas.
const INACTIVE = new Set([5, 17, 29, 41, 53]);

type StockPlan = "disponible" | "bajo_stock" | "sin_stock_sin_fila" | "agotado";

export type PilotProduct = {
  index: number;
  sku: string;
  name: string;
  brand: string;
  category: string;
  condition: "new" | "refurbished";
  isActive: boolean;
  // Del más viejo al vigente; vacío si no tiene precio.
  prices: string[];
  stock: StockPlan;
};

function stockPlan(index: number): StockPlan {
  switch (index % 10) {
    case 3:
    case 8:
      return "bajo_stock";
    case 4:
      // Nunca tuvo movimientos: sin fila en inventories, saldo 0.
      return "sin_stock_sin_fila";
    case 9:
      // Tuvo stock y se vendió todo: fila con saldo 0.
      return "agotado";
    default:
      return "disponible";
  }
}

function amount(value: number): string {
  // Redondeado a centenas, como se ponen los precios en una vitrina.
  return `${Math.round(value / 100) * 100}.00`;
}

function productAt(index: number): PilotProduct {
  const category = CATEGORIES[index % CATEGORIES.length]!;
  const round = Math.floor(index / CATEGORIES.length);
  const model = category.models[round % category.models.length]!;
  const brand = BRANDS[(index * 3 + round) % BRANDS.length]!;
  // Un tercio reacondicionado, dos por vuelta y en categorías que rotan: con `index % 3` a secas
  // caerían todos en las mismas dos categorías.
  const condition = (index + round) % 3 === 2 ? "refurbished" : "new";
  const edition = round >= category.models.length ? " (2da gen.)" : "";

  // Nueve sin precio (el 85 % tiene); diez con historial de dos o tres precios.
  const withoutPrice = [3, 11, 19].includes(index % 20);
  const current =
    (category.base + (round % 5) * category.step) *
    (condition === "refurbished" ? 0.7 : 1);
  const history =
    index < 30 && index % 6 === 0 ? 2 : index < 30 && index % 6 === 4 ? 1 : 0;
  const prices = withoutPrice
    ? []
    : [
        ...Array.from({ length: history }, (_, step) =>
          amount(current * (0.8 + 0.1 * step)),
        ),
        amount(current),
      ];

  return {
    index,
    sku: `PIL-${category.name.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    name: `${model}${edition}${condition === "refurbished" ? " reacondicionado" : ""}`,
    brand,
    category: category.name,
    condition,
    isActive: !INACTIVE.has(index),
    prices,
    stock: stockPlan(index),
  };
}

export const PILOT_PRODUCTS: readonly PilotProduct[] = Array.from(
  { length: PILOT_PRODUCT_COUNT },
  (_, index) => productAt(index),
);

// --- Información del negocio ---

export type PilotEntry = {
  title: string;
  category: string;
  content: string;
  isActive: boolean;
  // Días desde el día de la primera corrida, en la zona de la organización; null sin límite.
  validFrom: number | null;
  validUntil: number | null;
};

export const PILOT_ENTRIES: readonly PilotEntry[] = [
  {
    title: "Horario de atención",
    category: "Horarios",
    content:
      "Atendemos de lunes a viernes de 10 a 19 h y los sábados de 10 a 14 h. Domingos y feriados, cerrado.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Horario de atención por WhatsApp",
    category: "Horarios",
    content:
      "Respondemos mensajes de lunes a sábado de 9 a 21 h. Fuera de ese horario contestamos al día siguiente.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Dirección del local",
    category: "Ubicación",
    content:
      "Estamos en Avenida Siempreviva 742, local 3, a dos cuadras de la estación. Hay estacionamiento medido en la cuadra.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Retiro en el local",
    category: "Ubicación",
    content:
      "Las compras se pueden retirar en el local desde el día hábil siguiente, con el número de pedido y el DNI del titular.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Medios de pago",
    category: "Medios de pago",
    content:
      "Aceptamos efectivo, transferencia bancaria, tarjetas de débito y tarjetas de crédito de todas las marcas.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Cuotas sin interés",
    category: "Medios de pago",
    content:
      "Tres cuotas sin interés con tarjetas de crédito bancarias en celulares y notebooks nuevos.",
    isActive: true,
    validFrom: -10,
    validUntil: 20,
  },
  {
    title: "Envíos a domicilio",
    category: "Envíos",
    content:
      "Enviamos a todo el país por correo. En la ciudad, el envío llega en 24 a 48 h hábiles.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Costo de envío",
    category: "Envíos",
    content:
      "El envío es gratis en compras de más de 150.000 pesos. Por debajo de ese monto se cotiza según el código postal.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Garantía de productos nuevos",
    category: "Garantía",
    content:
      "Los productos nuevos tienen 12 meses de garantía oficial del fabricante, con la factura de compra.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Garantía de reacondicionados",
    category: "Garantía",
    content:
      "Los reacondicionados tienen 6 meses de garantía del local. Se revisan y se prueban antes de la venta.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Cambios y devoluciones",
    category: "Devoluciones",
    content:
      "Aceptamos cambios dentro de los 10 días de la compra, con el producto sin uso y en su caja original.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  {
    title: "Servicio técnico",
    category: "Garantía",
    content:
      "El servicio técnico recibe equipos de lunes a viernes de 10 a 17 h. El diagnóstico tarda hasta 72 h.",
    isActive: true,
    validFrom: null,
    validUntil: null,
  },
  // Programada: empieza dentro de diez días.
  {
    title: "Horario especial de fin de año",
    category: "Horarios",
    content:
      "Durante las fiestas abrimos de 10 a 21 h de lunes a sábado. El 25 y el 1 permanecemos cerrados.",
    isActive: true,
    validFrom: 10,
    validUntil: 40,
  },
  // Vencida: terminó hace cinco días.
  {
    title: "Promoción de vuelta a clases",
    category: "Medios de pago",
    content:
      "Diez por ciento de descuento en tablets y notebooks pagando con transferencia.",
    isActive: true,
    validFrom: -40,
    validUntil: -5,
  },
  // Inactiva: vigente por fechas, desactivada a mano.
  {
    title: "Envíos en moto",
    category: "Envíos",
    content:
      "Envíos en moto en el día para pedidos confirmados antes de las 13 h, solo en la ciudad.",
    isActive: false,
    validFrom: null,
    validUntil: null,
  },
];

// --- Clientes y conversaciones ---

const FIRST_NAMES = [
  "Lucía",
  "Martín",
  "Sofía",
  "Julián",
  "Valentina",
  "Tomás",
  "Camila",
  "Mateo",
  "Florencia",
  "Nicolás",
] as const;
const LAST_NAMES = ["Ferreyra", "Olmedo", "Quiroga", "Salvatierra", "Benítez"];

export const PILOT_CLIENT_COUNT = 30;
export const PILOT_CONVERSATION_COUNT = 40;

// Dos inactivos y tres sin teléfono.
const INACTIVE_CLIENTS = new Set([12, 25]);
const CLIENTS_WITHOUT_PHONE = new Set([7, 17, 27]);

// Tríos de mensajes típicos de un comercio de tecnología: pregunta, respuesta, cierre.
const EXCHANGES = [
  [
    "Hola, ¿tienen el Aria 7 en stock?",
    "Hola, sí, nos quedan unidades en negro y en azul.",
    "Genial, paso mañana a buscarlo.",
  ],
  [
    "¿Hacen envíos al interior?",
    "Sí, enviamos a todo el país por correo.",
    "¿Cuánto tarda en llegar?",
  ],
  [
    "Buenas, ¿qué garantía tiene una notebook reacondicionada?",
    "Tiene 6 meses de garantía del local.",
    "Perfecto, gracias.",
  ],
  [
    "¿Aceptan tarjeta en cuotas?",
    "Sí, tres cuotas sin interés en celulares y notebooks nuevos.",
    "Buenísimo.",
  ],
  [
    "Mi auricular dejó de cargar, lo compré hace dos meses.",
    "Traelo al servicio técnico con la factura y lo revisamos.",
    "Dale, gracias.",
  ],
] as const;

const STATUSES = ["open", "pending", "closed"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PilotCounts = {
  products: number;
  activeProducts: number;
  refurbished: number;
  prices: number;
  productsWithPrice: number;
  productsWithHistory: number;
  balances: number;
  movements: number;
  entries: number;
  clients: number;
  conversations: number;
  messages: number;
};

// Recuentos esperados, derivados de las mismas listas que el seed inserta.
export function expectedPilotCounts(): PilotCounts {
  const withPrice = PILOT_PRODUCTS.filter((p) => p.prices.length > 0);
  const balances = PILOT_PRODUCTS.filter(
    (p) => p.stock !== "sin_stock_sin_fila",
  );
  return {
    products: PILOT_PRODUCTS.length,
    activeProducts: PILOT_PRODUCTS.filter((p) => p.isActive).length,
    refurbished: PILOT_PRODUCTS.filter((p) => p.condition === "refurbished")
      .length,
    prices: withPrice.reduce((total, p) => total + p.prices.length, 0),
    productsWithPrice: withPrice.length,
    productsWithHistory: withPrice.filter((p) => p.prices.length > 1).length,
    balances: balances.length,
    movements: balances.reduce(
      (total, p) => total + (p.stock === "disponible" ? 1 : 2),
      0,
    ),
    entries: PILOT_ENTRIES.length,
    clients: PILOT_CLIENT_COUNT,
    conversations: PILOT_CONVERSATION_COUNT,
    messages: Array.from({ length: PILOT_CONVERSATION_COUNT }, (_, index) =>
      messageCount(index),
    ).reduce((total, count) => total + count, 0),
  };
}

function messageCount(conversation: number): number {
  return 2 + (conversation % 5);
}

export async function seedPilot(
  db: Db,
  password: string,
  options: { now?: Date } = {},
): Promise<void> {
  await assertSeedableDatabase(db);
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `La contraseña del seed necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }
  const passwordHash = await hashPassword(password);
  const now = (options.now ?? new Date()).getTime();

  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({
        id: PILOT_ORGANIZATION_ID,
        name: PILOT_ORGANIZATION_NAME,
        timezone: PILOT_TIMEZONE,
      })
      .onConflictDoUpdate({
        target: organizations.id,
        set: { name: PILOT_ORGANIZATION_NAME, timezone: PILOT_TIMEZONE },
      });

    for (const user of PILOT_USERS) {
      const values = {
        email: user.email,
        name: user.name,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      };
      await tx
        .insert(users)
        .values({ id: user.id, ...values })
        .onConflictDoUpdate({ target: users.id, set: values });
      await tx
        .insert(organizationMembers)
        .values({
          organizationId: PILOT_ORGANIZATION_ID,
          userId: user.id,
          role: user.role,
        })
        .onConflictDoUpdate({
          target: organizationMembers.userId,
          set: { organizationId: PILOT_ORGANIZATION_ID, role: user.role },
        });
    }
  });

  const today = await todayIn(db, PILOT_TIMEZONE);

  await db.transaction(async (tx) => {
    for (const product of PILOT_PRODUCTS) {
      const productId = pilotProductId(product.index);
      await tx
        .insert(products)
        .values({
          id: productId,
          organizationId: PILOT_ORGANIZATION_ID,
          sku: product.sku,
          name: product.name,
          description: `${product.category} ${product.brand}, ${product.condition === "refurbished" ? "reacondicionado y probado" : "nuevo en caja cerrada"}.`,
          unit: "unidad",
          reorderPoint: String(PILOT_REORDER_POINT),
          brand: product.brand,
          category: product.category,
          condition: product.condition,
          isActive: product.isActive,
        })
        .onConflictDoNothing({ target: products.id });

      // product_prices es de solo inserción: cada precio es una fila y el vigente es el último.
      // El historial se separa por treinta días.
      if (product.prices.length > 0) {
        await tx
          .insert(productPrices)
          .values(
            product.prices.map((value, position) => ({
              id: pilotId(3, product.index * 3 + position),
              organizationId: PILOT_ORGANIZATION_ID,
              productId,
              amount: value,
              currency: PILOT_CURRENCY,
              createdBy: ADMIN_ID,
              createdAt: new Date(
                now -
                  (product.prices.length - 1 - position) * 30 * DAY_MS -
                  DAY_MS,
              ),
            })),
          )
          .onConflictDoNothing({ target: productPrices.id });
      }

      // El saldo sale de su cadena de movimientos, como en el seed de volumen.
      if (product.stock === "sin_stock_sin_fila") continue;
      const initial = 6 + (product.index % 12);
      const chain: { quantity: number; negative: boolean; reason: string }[] = [
        { quantity: initial, negative: false, reason: "Ingreso de mercadería" },
      ];
      if (product.stock === "bajo_stock") {
        const left = 1 + (product.index % PILOT_REORDER_POINT);
        chain.push({
          quantity: initial - left,
          negative: true,
          reason: "Ventas de la semana",
        });
      } else if (product.stock === "agotado") {
        chain.push({
          quantity: initial,
          negative: true,
          reason: "Ventas de la semana",
        });
      }
      let balance = 0;
      const movements = chain.map((step, position) => {
        balance += step.negative ? -step.quantity : step.quantity;
        return {
          id: pilotId(5, product.index * 2 + position),
          organizationId: PILOT_ORGANIZATION_ID,
          productId,
          type: step.negative
            ? ("adjustment_negative" as const)
            : ("adjustment_positive" as const),
          quantity: String(step.quantity),
          balanceAfter: String(balance),
          reason: step.reason,
          createdBy: ADMIN_ID,
          createdAt: new Date(now - (20 - position * 7) * DAY_MS),
        };
      });
      await tx
        .insert(inventoryMovements)
        .values(movements)
        .onConflictDoNothing({ target: inventoryMovements.id });
      await tx
        .insert(inventories)
        .values({
          id: pilotId(4, product.index),
          organizationId: PILOT_ORGANIZATION_ID,
          productId,
          quantityOnHand: String(balance),
        })
        .onConflictDoNothing({ target: inventories.productId });
    }

    for (const [index, entry] of PILOT_ENTRIES.entries()) {
      await tx
        .insert(knowledgeEntries)
        .values({
          id: pilotEntryId(index),
          organizationId: PILOT_ORGANIZATION_ID,
          title: entry.title,
          category: entry.category,
          content: entry.content,
          isActive: entry.isActive,
          validFrom:
            entry.validFrom === null ? null : shiftDay(today, entry.validFrom),
          validUntil:
            entry.validUntil === null
              ? null
              : shiftDay(today, entry.validUntil),
        })
        .onConflictDoNothing({ target: knowledgeEntries.id });
    }

    for (let index = 0; index < PILOT_CLIENT_COUNT; index++) {
      await tx
        .insert(clients)
        .values({
          id: pilotId(7, index),
          organizationId: PILOT_ORGANIZATION_ID,
          // El apellido corre una posición por decena, para que ningún nombre se repita.
          displayName: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[(index + Math.floor(index / 10)) % LAST_NAMES.length]}`,
          // Numeración inventada: ningún número sale de datos del negocio.
          phoneE164: CLIENTS_WITHOUT_PHONE.has(index)
            ? null
            : `+54911555${String(index + 1).padStart(5, "0")}`,
          notes:
            index % 6 === 0 ? "Prefiere que le escriban por la tarde." : null,
          isActive: !INACTIVE_CLIENTS.has(index),
        })
        .onConflictDoNothing({ target: clients.id });
    }

    for (let index = 0; index < PILOT_CONVERSATION_COUNT; index++) {
      const exchange = EXCHANGES[index % EXCHANGES.length]!;
      const count = messageCount(index);
      // Repartidas en los últimos 30 días; los mensajes, cada 20 minutos.
      const start = now - (1 + ((index * 7) % 30)) * DAY_MS;
      const sentAt = Array.from(
        { length: count },
        (_, position) => new Date(start + position * 20 * 60 * 1000),
      );
      const conversationId = pilotId(8, index);
      await tx
        .insert(conversations)
        .values({
          id: conversationId,
          organizationId: PILOT_ORGANIZATION_ID,
          // Una de cada ocho, sin cliente: el número que escribió no está en la cartera.
          clientId:
            index % 8 === 7 ? null : pilotId(7, index % PILOT_CLIENT_COUNT),
          channel: "whatsapp",
          status: STATUSES[index % STATUSES.length]!,
          startedAt: sentAt[0]!,
          lastMessageAt: sentAt.at(-1)!,
        })
        .onConflictDoNothing({ target: conversations.id });
      await tx
        .insert(messages)
        .values(
          sentAt.map((instant, position) => ({
            id: pilotId(9, index * 10 + position),
            organizationId: PILOT_ORGANIZATION_ID,
            conversationId,
            direction:
              position % 2 === 0 ? ("inbound" as const) : ("outbound" as const),
            sentAt: instant,
            bodyText:
              position < exchange.length
                ? exchange[position]!
                : position % 2 === 0
                  ? "¿Algo más que necesites saber?"
                  : "No, eso es todo, gracias.",
          })),
        )
        .onConflictDoNothing({ target: messages.id });
    }
  });
}

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!url) throw new Error("Falta DATABASE_URL: copiá .env.example a .env.");
  if (!password) {
    throw new Error("Falta SEED_USER_PASSWORD: copiá .env.example a .env.");
  }

  const db = createDb(url);
  try {
    await seedPilot(db, password);
    const counts = expectedPilotCounts();
    console.log(
      `Seed del piloto aplicado: ${PILOT_USERS.map((user) => user.email).join(", ")}; ` +
        `${counts.products} productos, ${counts.entries} entradas, ${counts.clients} clientes y ` +
        `${counts.conversations} conversaciones.`,
    );
  } finally {
    await db.$client.end();
  }
}

// Solo corre al ejecutarse con npm run db:seed:pilot; importarlo desde los tests no escribe nada.
if (process.argv[1]?.replaceAll("\\", "/").endsWith("seeds/pilot.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
