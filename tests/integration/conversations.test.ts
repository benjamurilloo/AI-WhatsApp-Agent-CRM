import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  changeConversationStatus,
  getClientActivity,
  getConversation,
  listConversationMessages,
  listConversations,
  searchClientsByLastInteraction,
  type ConversationListFilters,
} from "@/modules/conversations";
import { getClientsByIds, listClientOrderKeys } from "@/modules/crm";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Servicio de conversaciones contra PostgreSQL real (brief-6.3): lista sin contenido, timeline por
// cursor, cambio de estado auditado, actividad del cliente, orden por última interacción,
// autorización y aislamiento entre organizaciones.

const PASSWORD = "contraseña-correcta-larga";
const TZ = "America/Argentina/Buenos_Aires";
let storedHash: string;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  role: "admin" | "viewer",
  mustChangePassword = false,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${`Persona ${email}`}, ${mustChangePassword}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgA, "pendiente-a@example.com", "admin", true);
  await addUser(orgB, "admin-b@example.com", "admin");
  return {
    orgA,
    orgB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    pendingA: await contextFor("pendiente-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

async function insertClient(
  organizationId: string,
  displayName: string,
  phone: string | null = null,
  isActive = true,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, is_active)
        values (${organizationId}, ${displayName}, ${phone}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

type SeedMessage = {
  at: string;
  direction?: "inbound" | "outbound";
  body?: string | null;
};

// Conversación con sus mensajes, con started_at y last_message_at tomados de ellos.
async function insertConversation(
  organizationId: string,
  options: {
    clientId?: string | null;
    status?: "open" | "pending" | "closed";
    messages: SeedMessage[];
  },
) {
  const times = options.messages.map((message) => message.at).sort();
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations (organization_id, client_id, channel, status, started_at, last_message_at)
        values (${organizationId}, ${options.clientId ?? null}, 'whatsapp', ${options.status ?? "open"},
                ${times[0] ?? "2026-09-01T00:00:00Z"}, ${times.at(-1) ?? null})
        returning id`,
  );
  const id = result.rows[0]!.id;
  for (const message of options.messages) {
    await getDb().execute(
      sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
          values (${organizationId}, ${id}, ${message.direction ?? "inbound"}, ${message.at},
                  ${message.body === undefined ? "Hola" : message.body})`,
    );
  }
  return id;
}

const noFilters: ConversationListFilters = {
  from: "",
  to: "",
  status: "all",
  channel: "all",
  clientId: "",
  page: 1,
};

async function list(
  context: AuthContext,
  filters: Partial<ConversationListFilters> = {},
) {
  const result = await listConversations(context, { ...noFilters, ...filters });
  if (!result.ok) throw new Error(`lista rechazada: ${result.code}`);
  return result;
}

async function statusOf(conversationId: string) {
  const result = await getDb().execute<{ status: string }>(
    sql`select status from conversations where id = ${conversationId}`,
  );
  return result.rows[0]!.status;
}

async function auditRows() {
  const result = await getDb().execute(
    sql`select organization_id, actor_user_id, entity_type, entity_id, action, diff
        from audit_logs order by created_at, id`,
  );
  return result.rows;
}

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("listConversations", () => {
  it("ordena por último mensaje con desempate por id, nombra al cliente y cuenta mensajes", async () => {
    const s = await seed();
    const ana = await insertClient(s.orgA, "Ana Pérez", "+5491155551234");
    const old = await insertConversation(s.orgA, {
      clientId: ana,
      status: "closed",
      messages: [
        { at: "2026-09-01T12:00:00Z" },
        { at: "2026-09-02T12:00:00Z" },
      ],
    });
    const recent = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-10T12:00:00Z" }],
    });
    const tieA = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-05T12:00:00Z" }],
    });
    const tieB = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-05T12:00:00Z" }],
    });
    await insertConversation(s.orgB, {
      messages: [{ at: "2026-09-11T12:00:00Z" }],
    });

    const result = await list(s.viewerA);
    const ties = [tieA, tieB].sort().reverse();
    expect(result.conversations.map((row) => row.id)).toEqual([
      recent,
      ...ties,
      old,
    ]);
    expect(result).toMatchObject({
      total: 4,
      page: 1,
      pageCount: 1,
      timezone: TZ,
      organizationHasConversations: true,
    });
    expect(result.conversations.at(-1)).toEqual({
      id: old,
      client: { id: ana, name: "Ana Pérez", isActive: true },
      channel: "whatsapp",
      status: "closed",
      startedAt: new Date("2026-09-01T12:00:00Z"),
      lastMessageAt: new Date("2026-09-02T12:00:00Z"),
      messageCount: 2,
    });
    expect(result.conversations[0]!.client).toBeNull();
  });

  it("no entrega el contenido de ningún mensaje ni el teléfono del cliente", async () => {
    const s = await seed();
    const ana = await insertClient(s.orgA, "Ana Pérez", "+5491155557788");
    await insertConversation(s.orgA, {
      clientId: ana,
      messages: [
        { at: "2026-09-01T12:00:00Z", body: "contenido-secreto-uno" },
        { at: "2026-09-02T12:00:00Z", body: "contenido-secreto-dos" },
      ],
    });
    for (const context of [s.adminA, s.viewerA]) {
      const serialized = JSON.stringify(await list(context));
      expect(serialized).not.toContain("contenido-secreto");
      expect(serialized).not.toContain("7788");
    }
  });

  it("filtra por estado, canal y cliente, también combinados", async () => {
    const s = await seed();
    const ana = await insertClient(s.orgA, "Ana");
    const beto = await insertClient(s.orgA, "Beto");
    const anaOpen = await insertConversation(s.orgA, {
      clientId: ana,
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    const anaClosed = await insertConversation(s.orgA, {
      clientId: ana,
      status: "closed",
      messages: [{ at: "2026-09-02T12:00:00Z" }],
    });
    await insertConversation(s.orgA, {
      clientId: beto,
      status: "closed",
      messages: [{ at: "2026-09-03T12:00:00Z" }],
    });

    const ids = async (filters: Partial<ConversationListFilters>) =>
      (await list(s.adminA, filters)).conversations.map((row) => row.id);
    expect(await ids({ clientId: ana })).toEqual([anaClosed, anaOpen]);
    expect(await ids({ clientId: ana, status: "closed" })).toEqual([anaClosed]);
    expect(await ids({ status: "pending" })).toEqual([]);
    expect(await ids({ channel: "whatsapp" })).toHaveLength(3);

    const empty = await list(s.adminA, { status: "pending" });
    expect(empty).toMatchObject({
      total: 0,
      page: 1,
      organizationHasConversations: true,
    });
    // Un cliente de otra organización no devuelve filas ajenas.
    const other = await insertClient(s.orgB, "Otra");
    expect(await ids({ clientId: other })).toEqual([]);
  });

  it("filtra el período en días de la organización, con el borde de medianoche", async () => {
    const s = await seed();
    // 23:30 del 9/9 en Buenos Aires es 02:30 UTC del 10/9.
    const lateNight = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-10T02:30:00Z" }],
    });
    // 00:00 del 10/9 local.
    const midnight = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-10T03:00:00Z" }],
    });
    // Sin mensajes: nunca entra en un período.
    await insertConversation(s.orgA, { messages: [] });

    const ids = async (from: string, to: string) =>
      (await list(s.adminA, { from, to })).conversations.map((row) => row.id);
    expect(await ids("2026-09-09", "2026-09-09")).toEqual([lateNight]);
    expect(await ids("2026-09-10", "")).toEqual([midnight]);
    expect(await ids("", "2026-09-09")).toEqual([lateNight]);
    expect((await list(s.adminA)).total).toBe(3);
  });

  it("interpreta el 19/10/2008 de Buenos Aires como un día de 23 horas", async () => {
    const s = await seed();
    // 23:30 del 19/10 local (UTC-2 desde el cambio) es 01:30 UTC del 20/10.
    const lastMinutes = await insertConversation(s.orgA, {
      messages: [{ at: "2008-10-20T01:30:00Z" }],
    });
    // 00:30 del 20/10 local es 02:30 UTC: ya es el día siguiente.
    await insertConversation(s.orgA, {
      messages: [{ at: "2008-10-20T02:30:00Z" }],
    });
    const result = await list(s.adminA, {
      from: "2008-10-19",
      to: "2008-10-19",
    });
    expect(result.conversations.map((row) => row.id)).toEqual([lastMinutes]);
  });

  it("pagina de a 25 y lleva una página fuera de rango a la última", async () => {
    const s = await seed();
    for (let i = 0; i < 27; i++) {
      await insertConversation(s.orgA, {
        messages: [{ at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() }],
      });
    }
    const last = await list(s.adminA, { page: 9 });
    expect(last).toMatchObject({ total: 27, page: 2, pageCount: 2 });
    expect(last.conversations).toHaveLength(2);
    expect((await list(s.adminA, { page: 1 })).conversations).toHaveLength(25);
  });

  it("distingue una organización sin conversaciones", async () => {
    const s = await seed();
    await insertConversation(s.orgB, {
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    expect(await list(s.adminA)).toMatchObject({
      total: 0,
      conversations: [],
      organizationHasConversations: false,
    });
  });

  it("rechaza filtros inválidos con sus campos y la contraseña pendiente", async () => {
    const s = await seed();
    expect(
      await listConversations(s.adminA, {
        ...noFilters,
        from: "2026-09-10",
        to: "2026-09-01",
        clientId: "x",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["from", "to", "clientId"],
    });
    expect(await listConversations(s.pendingA, noFilters)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});

describe("getConversation", () => {
  it("devuelve la cabecera sin teléfono, para admin y viewer", async () => {
    const s = await seed();
    const ana = await insertClient(s.orgA, "Ana", "+5491155559911", false);
    const id = await insertConversation(s.orgA, {
      clientId: ana,
      status: "pending",
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    for (const context of [s.adminA, s.viewerA]) {
      const result = await getConversation(context, id);
      expect(result).toEqual({
        ok: true,
        conversation: {
          id,
          client: { id: ana, name: "Ana", isActive: false },
          channel: "whatsapp",
          status: "pending",
          startedAt: new Date("2026-09-01T12:00:00Z"),
          lastMessageAt: new Date("2026-09-01T12:00:00Z"),
        },
        timezone: TZ,
      });
      expect(JSON.stringify(result)).not.toContain("9911");
    }
  });

  it("otra organización o inexistente da NOT_FOUND; un id inválido, VALIDATION_ERROR", async () => {
    const s = await seed();
    const foreign = await insertConversation(s.orgB, {
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    expect(await getConversation(s.adminA, foreign)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await getConversation(s.adminA, randomUUID())).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await getConversation(s.adminA, "123")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await getConversation(s.pendingA, foreign)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});

describe("listConversationMessages (D-2)", () => {
  async function page(context: AuthContext, id: string, before = "") {
    const result = await listConversationMessages(context, id, { before });
    if (!result.ok) throw new Error(`timeline rechazado: ${result.code}`);
    return result;
  }

  it("recorre 120 mensajes de a 50 con cursores, sin duplicados ni huecos", async () => {
    const s = await seed();
    const messages = Array.from({ length: 120 }, (_, i) => ({
      at: new Date(Date.UTC(2026, 8, 1, 10, i)).toISOString(),
      direction: (i % 2 === 0 ? "inbound" : "outbound") as
        "inbound" | "outbound",
      body: `mensaje ${i}`,
    }));
    const id = await insertConversation(s.orgA, { messages });

    const first = await page(s.viewerA, id);
    expect(first.messages).toHaveLength(50);
    expect(first.messages.map((m) => m.body)).toEqual(
      messages.slice(70).map((m) => m.body),
    );
    expect(first.messages[0]).toMatchObject({
      direction: "inbound",
      sentAt: new Date(messages[70]!.at),
    });
    const second = await page(s.viewerA, id, first.before!);
    const third = await page(s.viewerA, id, second.before!);
    expect(third.before).toBeNull();
    expect(
      [...third.messages, ...second.messages, ...first.messages].map(
        (m) => m.body,
      ),
    ).toEqual(messages.map((m) => m.body));
    expect(first.timezone).toBe(TZ);
  });

  it("un mensaje nuevo no corre la página siguiente", async () => {
    const s = await seed();
    const messages = Array.from({ length: 60 }, (_, i) => ({
      at: new Date(Date.UTC(2026, 8, 1, 10, i)).toISOString(),
      body: `mensaje ${i}`,
    }));
    const id = await insertConversation(s.orgA, { messages });
    const first = await page(s.adminA, id);
    await getDb().execute(
      sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
          values (${s.orgA}, ${id}, 'inbound', '2026-09-01T12:00:00Z', 'nuevo')`,
    );
    const second = await page(s.adminA, id, first.before!);
    expect(second.messages.map((m) => m.body)).toEqual(
      messages.slice(0, 10).map((m) => m.body),
    );
    expect(second.before).toBeNull();
  });

  it("mensajes con el mismo instante, incluso con microsegundos, se ordenan por id sin perderse", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA, { messages: [] });
    await getDb().execute(
      sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
          select ${s.orgA}, ${id}, 'inbound',
                 '2026-09-01T10:00:00.000001Z'::timestamptz + (g % 3) * interval '1 microsecond',
                 'm' || g
          from generate_series(1, 55) g`,
    );
    const first = await page(s.adminA, id);
    const second = await page(s.adminA, id, first.before!);
    const all = [...second.messages, ...first.messages];
    expect(all).toHaveLength(55);
    expect(new Set(all.map((m) => m.id)).size).toBe(55);
    const expected = await getDb().execute<{ id: string }>(
      sql`select id from messages where conversation_id = ${id} order by sent_at, id`,
    );
    expect(all.map((m) => m.id)).toEqual(expected.rows.map((row) => row.id));
  });

  it("devuelve los cuerpos tal cual, también nulos o con marcado", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA, {
      messages: [
        { at: "2026-09-01T10:00:00Z", body: "<script>alert(1)</script>" },
        { at: "2026-09-01T10:01:00Z", body: null },
      ],
    });
    expect((await page(s.adminA, id)).messages.map((m) => m.body)).toEqual([
      "<script>alert(1)</script>",
      null,
    ]);
  });

  it("una conversación sin mensajes da lista vacía y sin cursor", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA, { messages: [] });
    expect(await page(s.adminA, id)).toMatchObject({
      messages: [],
      before: null,
    });
  });

  it("rechaza cursores inválidos, y uno de otra conversación no trae filas ajenas", async () => {
    const s = await seed();
    const messages = Array.from({ length: 55 }, (_, i) => ({
      at: new Date(Date.UTC(2026, 8, 1, 10, i)).toISOString(),
      body: `propio ${i}`,
    }));
    const mine = await insertConversation(s.orgA, { messages });
    const other = await insertConversation(s.orgA, {
      messages: messages.map((m) => ({ ...m, body: "ajeno" })),
    });
    const cursor = (await page(s.adminA, other)).before!;
    const crossed = await page(s.adminA, mine, cursor);
    expect(crossed.messages.every((m) => m.body?.startsWith("propio"))).toBe(
      true,
    );

    expect(
      await listConversationMessages(s.adminA, mine, { before: "manipulado" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      await listConversationMessages(s.adminB, mine, { before: "" }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("changeConversationStatus (FR-CONV-03)", () => {
  it("cambia el estado y lo audita con el diff exacto; sin cambio no audita", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    expect(
      await changeConversationStatus(s.adminA, {
        conversationId: id,
        status: "closed",
      }),
    ).toEqual({ ok: true, changed: true });
    expect(await statusOf(id)).toBe("closed");
    expect(
      await changeConversationStatus(s.adminA, {
        conversationId: id,
        status: "closed",
      }),
    ).toEqual({ ok: true, changed: false });
    expect(await auditRows()).toEqual([
      {
        organization_id: s.orgA,
        actor_user_id: s.adminA.userId,
        entity_type: "conversation",
        entity_id: id,
        action: "status_change",
        diff: { before: { status: "open" }, after: { status: "closed" } },
      },
    ]);
  });

  it("viewer y contraseña pendiente dan FORBIDDEN; otra organización, NOT_FOUND", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    const input = { conversationId: id, status: "closed" };
    for (const context of [s.viewerA, s.pendingA]) {
      expect(await changeConversationStatus(context, input)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    expect(await changeConversationStatus(s.adminB, input)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await statusOf(id)).toBe("open");
    expect(await auditRows()).toEqual([]);
  });

  it("rechaza un estado desconocido y un id inválido", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    expect(
      await changeConversationStatus(s.adminA, {
        conversationId: id,
        status: "archived",
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["status"] });
    expect(
      await changeConversationStatus(s.adminA, {
        conversationId: "x",
        status: "closed",
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("si falla la auditoría, el estado no cambia", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    // Un actor inexistente hace fallar la clave foránea de audit_logs después del UPDATE.
    const ghost: AuthContext = { ...s.adminA, userId: randomUUID() };
    await expect(
      changeConversationStatus(ghost, { conversationId: id, status: "closed" }),
    ).rejects.toThrow();
    expect(await statusOf(id)).toBe("open");
    expect(await auditRows()).toEqual([]);
  });

  it("con un cambio simultáneo, la segunda escritura ve el estado de la primera (D-3)", async () => {
    const s = await seed();
    const id = await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const holding = new Promise<void>((resolve) => (locked = resolve));
    // Otra conexión toma la fila, la pasa a pending y retiene el bloqueo.
    const holder = getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select id from conversations where id = ${id} for update`,
      );
      await tx.execute(
        sql`update conversations set status = 'pending' where id = ${id}`,
      );
      locked();
      await released;
    });
    await holding;
    const change = changeConversationStatus(s.adminA, {
      conversationId: id,
      status: "closed",
    });
    // Espera a que el cambio quede bloqueado antes de soltar.
    const deadline = Date.now() + 5000;
    for (;;) {
      const waiting = await getDb().execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'`,
      );
      if (waiting.rows[0]!.waiting === 1) break;
      if (Date.now() > deadline)
        throw new Error("el cambio no quedó bloqueado");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    release();
    await holder;
    expect(await change).toEqual({ ok: true, changed: true });
    expect(await statusOf(id)).toBe("closed");
    expect((await auditRows())[0]).toMatchObject({
      diff: { before: { status: "pending" }, after: { status: "closed" } },
    });
  });
});

describe("getClientActivity (FR-CLI-04)", () => {
  it("devuelve la última interacción con su canal, independiente del filtro, y las conversaciones", async () => {
    const s = await seed();
    const ana = await insertClient(s.orgA, "Ana");
    const closed = await insertConversation(s.orgA, {
      clientId: ana,
      status: "closed",
      messages: [{ at: "2026-09-12T12:00:00Z" }],
    });
    const open = await insertConversation(s.orgA, {
      clientId: ana,
      messages: [
        { at: "2026-09-01T12:00:00Z" },
        { at: "2026-09-03T12:00:00Z" },
      ],
    });
    await insertConversation(s.orgA, {
      messages: [{ at: "2026-09-15T12:00:00Z" }],
    });

    const all = await getClientActivity(s.viewerA, ana, {
      status: "all",
      page: 1,
    });
    expect(all).toMatchObject({
      ok: true,
      lastInteraction: {
        at: new Date("2026-09-12T12:00:00Z"),
        channel: "whatsapp",
      },
      total: 2,
      clientHasConversations: true,
      timezone: TZ,
    });
    if (!all.ok) throw new Error("rechazado");
    expect(all.conversations.map((row) => [row.id, row.messageCount])).toEqual([
      [closed, 1],
      [open, 2],
    ]);

    const onlyOpen = await getClientActivity(s.adminA, ana, {
      status: "open",
      page: 1,
    });
    expect(onlyOpen).toMatchObject({
      total: 1,
      lastInteraction: { at: new Date("2026-09-12T12:00:00Z") },
    });
    const none = await getClientActivity(s.adminA, ana, {
      status: "pending",
      page: 1,
    });
    expect(none).toMatchObject({ total: 0, clientHasConversations: true });
  });

  it("un cliente sin conversaciones, o inactivo, se consulta igual", async () => {
    const s = await seed();
    const inactive = await insertClient(s.orgA, "Inactivo", null, false);
    expect(
      await getClientActivity(s.adminA, inactive, { status: "all", page: 1 }),
    ).toMatchObject({
      ok: true,
      lastInteraction: null,
      total: 0,
      conversations: [],
      clientHasConversations: false,
    });
  });

  it("un cliente de otra organización da NOT_FOUND y un estado inválido, VALIDATION_ERROR", async () => {
    const s = await seed();
    const foreign = await insertClient(s.orgB, "Ajeno");
    const own = await insertClient(s.orgA, "Propio");
    expect(
      await getClientActivity(s.adminA, foreign, { status: "all", page: 1 }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(
      await getClientActivity(s.adminA, own, { status: "x", page: 1 }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["status"] });
    expect(
      await getClientActivity(s.pendingA, own, { status: "all", page: 1 }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});

describe("searchClientsByLastInteraction (D-1)", () => {
  const filters = { text: "", activity: "all" as const, page: 1 };

  it("ordena por última interacción y deja al final a los clientes sin interacciones, por nombre", async () => {
    const s = await seed();
    const zoe = await insertClient(s.orgA, "Zoe");
    const ana = await insertClient(s.orgA, "ana");
    const bruno = await insertClient(s.orgA, "Bruno");
    const carla = await insertClient(s.orgA, "Carla");
    const dario = await insertClient(s.orgA, "Darío");
    await insertConversation(s.orgA, {
      clientId: carla,
      messages: [{ at: "2026-09-02T12:00:00Z" }],
    });
    await insertConversation(s.orgA, {
      clientId: zoe,
      messages: [{ at: "2026-09-10T12:00:00Z" }],
    });
    await insertConversation(s.orgA, {
      clientId: carla,
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    // Misma fecha: desempata el nombre.
    await insertConversation(s.orgA, {
      clientId: dario,
      messages: [{ at: "2026-09-02T12:00:00Z" }],
    });
    // Una conversación de otra organización no cuenta.
    await insertConversation(s.orgB, {
      messages: [{ at: "2026-09-20T12:00:00Z" }],
    });

    const result = await searchClientsByLastInteraction(s.adminA, filters);
    if (!result.ok) throw new Error("rechazado");
    expect(result.clients.map((client) => client.id)).toEqual([
      zoe,
      carla,
      dario,
      ana,
      bruno,
    ]);
    expect(result.clients.map((client) => client.lastInteractionAt)).toEqual([
      new Date("2026-09-10T12:00:00Z"),
      new Date("2026-09-02T12:00:00Z"),
      new Date("2026-09-02T12:00:00Z"),
      null,
      null,
    ]);
    expect(result).toMatchObject({
      total: 5,
      page: 1,
      pageCount: 1,
      timezone: TZ,
    });
  });

  it("busca por nombre y por teléfono completo, filtra por actividad y pagina", async () => {
    const s = await seed();
    for (let i = 0; i < 27; i++) {
      await insertClient(s.orgA, `Cliente ${String(i).padStart(2, "0")}`);
    }
    const ana = await insertClient(s.orgA, "Ana", "+5491155551234");
    await insertClient(s.orgA, "Anabel", null, false);

    const page2 = await searchClientsByLastInteraction(s.adminA, {
      ...filters,
      page: 9,
    });
    expect(page2).toMatchObject({ total: 29, page: 2, pageCount: 2 });
    if (!page2.ok) throw new Error("rechazado");
    expect(page2.clients).toHaveLength(4);

    const byName = await searchClientsByLastInteraction(s.adminA, {
      ...filters,
      text: "ana",
      activity: "active",
    });
    if (!byName.ok) throw new Error("rechazado");
    expect(byName.clients.map((client) => client.id)).toEqual([ana]);

    const byPhone = await searchClientsByLastInteraction(s.viewerA, {
      ...filters,
      text: "+54 9 11 5555-1234",
    });
    if (!byPhone.ok) throw new Error("rechazado");
    expect(byPhone.clients.map((client) => client.id)).toEqual([ana]);
  });

  it("H-5: a un viewer no le llega el teléfono completo", async () => {
    const s = await seed();
    const ana = await insertClient(s.orgA, "Ana", "+5491155551234");
    await insertConversation(s.orgA, {
      clientId: ana,
      messages: [{ at: "2026-09-01T12:00:00Z" }],
    });
    const viewer = await searchClientsByLastInteraction(s.viewerA, filters);
    const serialized = JSON.stringify(viewer);
    expect(serialized).not.toContain("5491155551234");
    expect(serialized).not.toContain("549115555");
    expect(serialized).toContain('"lastDigits":"1234"');
    const admin = await searchClientsByLastInteraction(s.adminA, filters);
    expect(JSON.stringify(admin)).toContain("+5491155551234");
    expect(await searchClientsByLastInteraction(s.pendingA, filters)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});

describe("crm: lecturas para conversations (D-1)", () => {
  it("listClientOrderKeys da los ids en orden de nombre, solo de la organización", async () => {
    const s = await seed();
    const beto = await insertClient(s.orgA, "Beto");
    const ana = await insertClient(s.orgA, "ana");
    await insertClient(s.orgB, "Aaron");
    const inactive = await insertClient(s.orgA, "Carla", null, false);
    expect(
      await listClientOrderKeys(s.viewerA, { text: "", activity: "all" }),
    ).toEqual({ ok: true, clientIds: [ana, beto, inactive] });
    expect(
      await listClientOrderKeys(s.viewerA, { text: "", activity: "inactive" }),
    ).toEqual({ ok: true, clientIds: [inactive] });
    expect(
      await listClientOrderKeys(s.pendingA, { text: "", activity: "all" }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("getClientsByIds respeta el orden pedido, omite ajenos y enmascara para viewer", async () => {
    const s = await seed();
    const ana = await insertClient(s.orgA, "Ana", "+5491155551234");
    const beto = await insertClient(s.orgA, "Beto");
    const foreign = await insertClient(s.orgB, "Ajeno");
    const result = await getClientsByIds(s.viewerA, [beto, foreign, ana, beto]);
    if (!result.ok) throw new Error("rechazado");
    expect(result.clients.map((client) => client.id)).toEqual([beto, ana]);
    expect(result.clients[1]!.phone).toEqual({
      kind: "masked",
      lastDigits: "1234",
    });
    expect(await getClientsByIds(s.viewerA, ["x"])).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await getClientsByIds(s.viewerA, [])).toEqual({
      ok: true,
      clients: [],
    });
  });
});
