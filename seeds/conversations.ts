import { sql } from "drizzle-orm";
import { conversations, messages } from "@/modules/conversations/schema";
import { clients } from "@/modules/crm/schema";
import { type Db, type DbTransaction } from "@/shared/db";
import { isSeedableDatabase, SEED_ORGANIZATION_ID } from "./basic";

// Seed de conversaciones sintéticas para desarrollo (brief-6.2, D-1 y D-2), sobre la organización
// del seed básico. Lo llama npm run db:seed; los end-to-end no lo usan.
// Las fechas son relativas a referenceDate y quedan fijadas en la primera corrida: messages es de
// solo inserción, así que una corrida posterior no toca mensajes ni fechas y solo repone el estado
// de las conversaciones y los datos de los clientes.

type Direction = "inbound" | "outbound";
type Status = "open" | "pending" | "closed";

type SeedMessage = {
  // Día relativo a referenceDate (0 es ese día), o una fecha absoluta YYYY-MM-DD.
  day: number | string;
  // Hora local de la organización, HH:MM.
  time: string;
  direction: Direction;
  body: string | null;
};

type SeedConversation = {
  client: number | null;
  status: Status;
  messages: SeedMessage[];
};

// Teléfonos y nombres sintéticos: ningún dato real.
export const SEED_CLIENTS = [
  {
    displayName: "Ana Sintética",
    phoneE164: "+5491155550101",
    notes: null,
    isActive: true,
  },
  {
    displayName: "Bruno Ejemplo",
    phoneE164: "+5491155550102",
    notes: null,
    isActive: true,
  },
  { displayName: "Carla Prueba", phoneE164: null, notes: null, isActive: true },
  {
    displayName: "Diego Ficticio",
    phoneE164: "+5491155550104",
    notes: "Prefiere que le escriban por la tarde.",
    isActive: true,
  },
  {
    displayName: "Elena Demo",
    phoneE164: "+5491155550105",
    notes: null,
    isActive: true,
  },
  {
    displayName: "Federico Inactivo",
    phoneE164: "+5491155550106",
    notes: null,
    isActive: false,
  },
] as const;

export const MARKUP_BODY =
  "<script>alert(1)</script> <b>negrita</b> &amp; \"comillas\" y 'apóstrofes'";

const LONG_BODY = Array.from(
  { length: 30 },
  (_, i) => `Línea ${i + 1} de un mensaje largo de prueba.`,
).join(" ");

export const SEED_CONVERSATIONS: SeedConversation[] = [
  {
    client: 0,
    status: "open",
    messages: [
      {
        day: -1,
        time: "10:02",
        direction: "inbound",
        body: "Hola, ¿tienen stock del café en grano?",
      },
      {
        day: -1,
        time: "10:05",
        direction: "outbound",
        body: "¡Hola Ana! Sí, nos quedan 12 bolsas.",
      },
      {
        day: -1,
        time: "10:07",
        direction: "inbound",
        body: "Perfecto, paso mañana. 🙌",
      },
    ],
  },
  {
    // Primer entrante sin respuesta.
    client: 1,
    status: "pending",
    messages: [
      {
        day: -3,
        time: "16:40",
        direction: "inbound",
        body: "Buenas, ¿hacen envíos a Córdoba?",
      },
      {
        day: -3,
        time: "16:41",
        direction: "inbound",
        body: "Es para un pedido grande.",
      },
    ],
  },
  {
    // Sin cliente.
    client: null,
    status: "open",
    messages: [
      {
        day: -2,
        time: "09:15",
        direction: "inbound",
        body: "Hola, vi su publicación y quería consultar precios.",
      },
      {
        day: -2,
        time: "09:30",
        direction: "outbound",
        body: "¡Hola! Te paso la lista de precios actualizada.",
      },
    ],
  },
  {
    // Sin cliente.
    client: null,
    status: "closed",
    messages: [
      {
        day: -10,
        time: "18:00",
        direction: "inbound",
        body: "¿Abren los domingos?",
      },
      {
        day: -10,
        time: "18:20",
        direction: "outbound",
        body: "No, de lunes a sábado de 9 a 19.",
      },
    ],
  },
  {
    // Proactiva: solo salientes.
    client: 2,
    status: "closed",
    messages: [
      {
        day: -5,
        time: "11:00",
        direction: "outbound",
        body: "Carla, tu pedido ya está listo para retirar.",
      },
      {
        day: -5,
        time: "11:01",
        direction: "outbound",
        body: "Te esperamos hasta las 19.",
      },
    ],
  },
  {
    // Cruza la medianoche local.
    client: 3,
    status: "open",
    messages: [
      {
        day: -4,
        time: "23:50",
        direction: "inbound",
        body: "Una consulta rápida antes de dormir.",
      },
      {
        day: -3,
        time: "00:10",
        direction: "outbound",
        body: "Contame, Diego.",
      },
      {
        day: -3,
        time: "00:12",
        direction: "inbound",
        body: "Quería saber:\n- precio\n- disponibilidad",
      },
    ],
  },
  {
    // Entre las 21:00 y las 23:59 locales: en UTC ya es el día siguiente.
    client: 4,
    status: "pending",
    messages: [
      {
        day: -6,
        time: "22:45",
        direction: "inbound",
        body: "Mensaje nocturno: en UTC ya es otro día.",
      },
      {
        day: -6,
        time: "22:50",
        direction: "outbound",
        body: "Recibido, te respondemos mañana.",
      },
    ],
  },
  {
    // Cuerpos que la UI tiene que mostrar como texto (6.4).
    client: 4,
    status: "open",
    messages: [
      { day: -7, time: "14:00", direction: "inbound", body: MARKUP_BODY },
      {
        day: -7,
        time: "14:05",
        direction: "outbound",
        body: "Texto con marcado recibido como texto.",
      },
      { day: -7, time: "14:06", direction: "inbound", body: null },
      { day: -7, time: "14:10", direction: "inbound", body: LONG_BODY },
      { day: -7, time: "14:12", direction: "outbound", body: "Gracias 😊👍" },
    ],
  },
  {
    // Cliente inactivo.
    client: 5,
    status: "closed",
    messages: [
      {
        day: -25,
        time: "12:00",
        direction: "inbound",
        body: "Quiero darme de baja.",
      },
      {
        day: -25,
        time: "12:30",
        direction: "outbound",
        body: "Listo, Federico.",
      },
    ],
  },
  {
    // 19/10/2008 en Buenos Aires: día de 23 horas (a las 00:00 se pasó a las 01:00). Fecha absoluta.
    client: 0,
    status: "closed",
    messages: [
      {
        day: "2008-10-18",
        time: "23:30",
        direction: "inbound",
        body: "Consulta de la noche del cambio de horario.",
      },
      {
        day: "2008-10-19",
        time: "01:15",
        direction: "outbound",
        body: "Respuesta después del cambio de horario.",
      },
      {
        day: "2008-10-19",
        time: "23:45",
        direction: "inbound",
        body: "Último mensaje del día de 23 horas.",
      },
    ],
  },
];

// Ids fijos: la idempotencia se sostiene con ellos, porque external_ref queda nulo.
function seedId(kind: 1 | 2 | 3, index: number): string {
  return `5eed0000-0000-4000-8000-000${kind}${String(index + 1).padStart(8, "0")}`;
}

export const seedClientId = (index: number) => seedId(1, index);
export const seedConversationId = (index: number) => seedId(2, index);

export async function assertSeedableDatabase(db: Db): Promise<void> {
  const current = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  const name = current.rows[0]?.name ?? "";
  if (!isSeedableDatabase(name)) {
    throw new Error(
      `El seed solo corre contra una base _dev, _test o _e2e, no contra "${name}".`,
    );
  }
}

// Día de hoy (YYYY-MM-DD) en la zona de la organización.
export async function todayIn(db: Db, timezone: string): Promise<string> {
  const result = await db.execute<{ today: string }>(
    sql`select (now() at time zone ${timezone})::date::text as today`,
  );
  return result.rows[0]!.today;
}

// Convierte horas locales "YYYY-MM-DD HH:MM" a instantes con la zona IANA, en PostgreSQL.
export async function localTimesToUtc(
  executor: Db | DbTransaction,
  timezone: string,
  locals: string[],
): Promise<Date[]> {
  if (locals.length === 0) return [];
  const result = await executor.execute<{ utc: string }>(
    sql`select to_char((local::timestamp at time zone ${timezone}) at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"') as utc
        from jsonb_array_elements_text(${JSON.stringify(locals)}::jsonb)
             with ordinality as t(local, position)
        order by position`,
  );
  return result.rows.map((row) => new Date(row.utc));
}

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export async function organizationTimezone(
  db: Db,
  organizationId: string,
): Promise<string> {
  const result = await db.execute<{ timezone: string }>(
    sql`select timezone from organizations where id = ${organizationId}`,
  );
  const timezone = result.rows[0]?.timezone;
  if (!timezone) {
    throw new Error(
      "Falta la organización del seed básico: corré seedBasic antes.",
    );
  }
  return timezone;
}

export async function seedConversations(
  db: Db,
  options: { referenceDate?: string } = {},
): Promise<void> {
  await assertSeedableDatabase(db);
  const timezone = await organizationTimezone(db, SEED_ORGANIZATION_ID);
  const referenceDate = options.referenceDate ?? (await todayIn(db, timezone));

  const flat = SEED_CONVERSATIONS.flatMap(
    (conversation) => conversation.messages,
  );
  const instants = await localTimesToUtc(
    db,
    timezone,
    flat.map((message) => {
      const day =
        typeof message.day === "string"
          ? message.day
          : shiftDay(referenceDate, message.day);
      return `${day} ${message.time}`;
    }),
  );

  await db.transaction(async (tx) => {
    for (const [index, client] of SEED_CLIENTS.entries()) {
      const values = { ...client };
      await tx
        .insert(clients)
        .values({
          id: seedClientId(index),
          organizationId: SEED_ORGANIZATION_ID,
          ...values,
        })
        .onConflictDoUpdate({ target: clients.id, set: values });
    }

    let messageIndex = 0;
    for (const [index, conversation] of SEED_CONVERSATIONS.entries()) {
      const sentAt = conversation.messages.map(() => instants[messageIndex++]!);
      const times = sentAt.map((instant) => instant.getTime());
      const id = seedConversationId(index);
      // started_at y last_message_at salen de los mismos mensajes que se insertan (DataModel).
      await tx
        .insert(conversations)
        .values({
          id,
          organizationId: SEED_ORGANIZATION_ID,
          clientId:
            conversation.client === null
              ? null
              : seedClientId(conversation.client),
          channel: "whatsapp",
          status: conversation.status,
          startedAt: new Date(Math.min(...times)),
          lastMessageAt: new Date(Math.max(...times)),
        })
        .onConflictDoUpdate({
          target: conversations.id,
          set: { status: conversation.status },
        });

      // Solo inserción: un mensaje existente no se toca.
      await tx
        .insert(messages)
        .values(
          conversation.messages.map((message, position) => ({
            id: seedId(3, messageIndex - sentAt.length + position),
            organizationId: SEED_ORGANIZATION_ID,
            conversationId: id,
            direction: message.direction,
            sentAt: sentAt[position]!,
            bodyText: message.body,
          })),
        )
        .onConflictDoNothing({ target: messages.id });
    }
  });
}
