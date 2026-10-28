import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  getConversationCounts,
  listConversations,
  listConversationTimeline,
  TIMELINE_PAGE_SIZE,
  type ConversationTimelineEntry,
} from "@/modules/conversations";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Las dos lecturas de la bandeja y del hilo de la 24.3 contra PostgreSQL real: las cantidades por
// estado y por pausa con los filtros de la lista, el filtro «Atención humana», y el hilo con las
// notas intercaladas, de a 50 y sin perder ni repetir una entrada en el borde (R-2). Para los dos
// roles y aisladas por organización.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
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
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${`Persona ${email}`}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
  return user.rows[0]!.id;
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
  const adminAId = await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgB, "admin-b@example.com", "admin");
  return {
    orgA,
    orgB,
    adminAId,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

async function insertConversation(
  organizationId: string,
  status: "open" | "pending" | "closed",
  options: { paused?: boolean; at?: string } = {},
) {
  const at = new Date(options.at ?? "2026-10-20T14:00:00.000Z");
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, channel, status, started_at, last_message_at, agent_paused_at)
        values (${organizationId}, 'whatsapp', ${status}, ${at}, ${at},
          ${options.paused ? at : null})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertMessage(
  organizationId: string,
  conversationId: string,
  sentAt: string,
  body: string,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
        values (${organizationId}, ${conversationId}, 'inbound', ${sentAt}::timestamptz, ${body})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertNote(
  organizationId: string,
  conversationId: string,
  actorUserId: string,
  createdAt: string,
  body: string,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversation_notes
          (organization_id, conversation_id, actor_user_id, body_text, created_at)
        values (${organizationId}, ${conversationId}, ${actorUserId}, ${body},
          ${createdAt}::timestamptz)
        returning id`,
  );
  return result.rows[0]!.id;
}

const noFilters = { from: "", to: "", channel: "all", clientId: "" };

const label = (entry: ConversationTimelineEntry) =>
  entry.type === "message" ? `m:${entry.body}` : `n:${entry.body}`;

// Recorre el hilo entero desde la página más reciente, como «Cargar anteriores».
async function readWholeTimeline(context: AuthContext, conversationId: string) {
  const pages: ConversationTimelineEntry[][] = [];
  let before = "";
  for (;;) {
    const result = await listConversationTimeline(context, conversationId, {
      before,
    });
    if (!result.ok) throw new Error(result.code);
    pages.unshift(result.entries);
    if (result.before === null) break;
    before = result.before;
  }
  return pages;
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

describe(
  "getConversationCounts y «Atención humana» (brief-24.3, D-1 y D-3)",
  {
    timeout: TEST_TIMEOUT,
  },
  () => {
    it("AC-1 y AC-2: cuenta por estado y por pausa, para los dos roles, sin otra organización", async () => {
      const s = await seed();
      await insertConversation(s.orgA, "open");
      await insertConversation(s.orgA, "open", { paused: true });
      await insertConversation(s.orgA, "open", { paused: true });
      await insertConversation(s.orgA, "pending");
      await insertConversation(s.orgA, "closed", { paused: true });
      await insertConversation(s.orgB, "open", { paused: true });
      await insertConversation(s.orgB, "pending");

      const expected = {
        open: { total: 3, paused: 2 },
        pending: { total: 1, paused: 0 },
        closed: { total: 1, paused: 1 },
      };
      for (const context of [s.adminA, s.viewerA]) {
        expect(await getConversationCounts(context, noFilters)).toEqual({
          ok: true,
          counts: expected,
        });
      }
      expect(await getConversationCounts(s.adminB, noFilters)).toEqual({
        ok: true,
        counts: {
          open: { total: 1, paused: 1 },
          pending: { total: 1, paused: 0 },
          closed: { total: 0, paused: 0 },
        },
      });
    });

    it("aplica el período y el cliente de la lista, y rechaza un período inválido", async () => {
      const s = await seed();
      await insertConversation(s.orgA, "open", { at: "2026-10-01T14:00:00Z" });
      await insertConversation(s.orgA, "open", {
        paused: true,
        at: "2026-10-20T14:00:00Z",
      });
      const counts = await getConversationCounts(s.adminA, {
        ...noFilters,
        from: "2026-10-15",
        to: "2026-10-31",
      });
      expect(counts).toEqual({
        ok: true,
        counts: {
          open: { total: 1, paused: 1 },
          pending: { total: 0, paused: 0 },
          closed: { total: 0, paused: 0 },
        },
      });
      expect(
        await getConversationCounts(s.adminA, {
          ...noFilters,
          from: "2026-10-31",
          to: "2026-10-01",
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["from", "to"],
      });
    });

    it("AC-2: el filtro de pausa se combina con el estado y no cruza organizaciones", async () => {
      const s = await seed();
      const pausedOpen = await insertConversation(s.orgA, "open", {
        paused: true,
      });
      const pausedClosed = await insertConversation(s.orgA, "closed", {
        paused: true,
      });
      await insertConversation(s.orgA, "open");
      await insertConversation(s.orgB, "open", { paused: true });

      const base = { ...noFilters, page: 1, agentPaused: true };
      const all = await listConversations(s.viewerA, {
        ...base,
        status: "all",
      });
      if (!all.ok) throw new Error(all.code);
      expect(all.conversations.map((c) => c.id).sort()).toEqual(
        [pausedOpen, pausedClosed].sort(),
      );
      const open = await listConversations(s.adminA, {
        ...base,
        status: "open",
      });
      if (!open.ok) throw new Error(open.code);
      expect(open.conversations.map((c) => c.id)).toEqual([pausedOpen]);
      expect(open.total).toBe(1);

      const unfiltered = await listConversations(s.adminA, {
        ...noFilters,
        page: 1,
        status: "all",
      });
      if (!unfiltered.ok) throw new Error(unfiltered.code);
      expect(unfiltered.total).toBe(3);
    });
  },
);

describe(
  "listConversationTimeline (brief-24.3, D-5)",
  {
    timeout: TEST_TIMEOUT,
  },
  () => {
    it("AC-4: intercala las notas por fecha, con autor, para los dos roles", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA, "open");
      await insertMessage(s.orgA, id, "2026-10-20T10:00:00Z", "hola");
      await insertNote(
        s.orgA,
        id,
        s.adminAId,
        "2026-10-20T10:05:00Z",
        "llamar mañana",
      );
      await insertMessage(s.orgA, id, "2026-10-20T10:10:00Z", "gracias");

      for (const context of [s.adminA, s.viewerA]) {
        const result = await listConversationTimeline(context, id, {
          before: "",
        });
        if (!result.ok) throw new Error(result.code);
        expect(result.entries.map(label)).toEqual([
          "m:hola",
          "n:llamar mañana",
          "m:gracias",
        ]);
        expect(result.before).toBeNull();
        const note = result.entries[1];
        expect(note?.type === "note" && note.author.name).toBe(
          "Persona admin-a@example.com",
        );
      }
    });

    it("R-2: una nota y un mensaje con la misma hora, en el borde de una página, no se pierden ni se repiten", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA, "open");
      // 60 mensajes, uno por minuto, y una nota a la misma hora que cada uno de los mensajes 10, 11
      // y 12: la entrada 50 desde el final es la nota 11, y el mensaje 11 va en la página anterior.
      const expected: string[] = [];
      for (let minute = 0; minute < 60; minute += 1) {
        const at = new Date(Date.UTC(2026, 9, 20, 10, minute)).toISOString();
        await insertMessage(s.orgA, id, at, `mensaje ${minute}`);
        expected.push(`m:mensaje ${minute}`);
        if (minute >= 10 && minute <= 12) {
          await insertNote(s.orgA, id, s.adminAId, at, `nota ${minute}`);
          expected.push(`n:nota ${minute}`);
        }
      }

      const pages = await readWholeTimeline(s.adminA, id);
      expect(pages.map((page) => page.length)).toEqual([
        63 - TIMELINE_PAGE_SIZE,
        TIMELINE_PAGE_SIZE,
      ]);
      expect(pages.flat().map(label)).toEqual(expected);
    });

    it("R-2: con un mensaje en el borde, la nota de su misma hora queda en la página más reciente y no se repite", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA, "open");
      // 60 mensajes y una nota a la misma hora que el 11: la entrada 50 desde el final es el
      // mensaje 11, y la nota, mayor que él, va en la primera página.
      const expected: string[] = [];
      for (let minute = 0; minute < 60; minute += 1) {
        const at = new Date(Date.UTC(2026, 9, 20, 10, minute)).toISOString();
        await insertMessage(s.orgA, id, at, `mensaje ${minute}`);
        expected.push(`m:mensaje ${minute}`);
        if (minute === 11) {
          await insertNote(s.orgA, id, s.adminAId, at, "nota 11");
          expected.push("n:nota 11");
        }
      }
      const pages = await readWholeTimeline(s.adminA, id);
      expect(pages.map((page) => page.length)).toEqual([11, 50]);
      expect(pages[1]![0] && label(pages[1]![0])).toBe("m:mensaje 11");
      expect(pages.flat().map(label)).toEqual(expected);
    });

    it("una conversación con más notas que mensajes pagina por las dos", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA, "open");
      const expected: string[] = [];
      for (let minute = 0; minute < 80; minute += 1) {
        const at = new Date(Date.UTC(2026, 9, 20, 10, minute)).toISOString();
        if (minute % 4 === 0) {
          await insertMessage(s.orgA, id, at, `mensaje ${minute}`);
          expected.push(`m:mensaje ${minute}`);
        } else {
          await insertNote(s.orgA, id, s.adminAId, at, `nota ${minute}`);
          expected.push(`n:nota ${minute}`);
        }
      }
      const pages = await readWholeTimeline(s.viewerA, id);
      expect(pages.map((page) => page.length)).toEqual([30, 50]);
      expect(pages.flat().map(label)).toEqual(expected);
    });

    it("una conversación sin mensajes muestra sus notas; otra organización y un cursor inválido no", async () => {
      const s = await seed();
      const id = await insertConversation(s.orgA, "closed");
      await insertNote(s.orgA, id, s.adminAId, "2026-10-20T10:00:00Z", "sola");
      const result = await listConversationTimeline(s.adminA, id, {
        before: "",
      });
      if (!result.ok) throw new Error(result.code);
      expect(result.entries.map(label)).toEqual(["n:sola"]);

      expect(
        await listConversationTimeline(s.adminB, id, { before: "" }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      expect(
        await listConversationTimeline(s.adminA, id, {
          before: "no-es{cursor",
        }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
      // Un cursor del timeline de mensajes de antes (fecha e id) no es del hilo intercalado.
      const old = Buffer.from(
        JSON.stringify([
          "2026-10-20T10:00:00.000000Z",
          "5eed0000-0000-4000-8000-000100000001",
        ]),
      ).toString("base64url");
      expect(
        await listConversationTimeline(s.adminA, id, { before: old }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    });
  },
);
