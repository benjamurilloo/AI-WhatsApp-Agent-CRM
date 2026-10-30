import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { countUpcomingAppointmentsByClient } from "@/modules/appointments";
import { hashPassword, login } from "@/modules/auth";
import {
  countOpenConversationsByClient,
  searchClientsByLastInteraction,
} from "@/modules/conversations";
import { findClientByPhone } from "@/modules/crm";
import { countOpenOrdersByClient } from "@/modules/orders";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import {
  countOpenServiceOrdersByClient,
  listClientIdsWithOpenServiceOrders,
} from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Las lecturas nuevas de la lista de clientes contra PostgreSQL real (brief-24.4.2, D-1, D-3, D-4 y
// D-8): «En curso» por módulo, los clientes con reparaciones abiertas, las vistas y el filtro por
// última interacción, y el cliente por teléfono del aviso de duplicado. Cada una con su rol, su
// capacidad y sin cruzar la organización. El saldo está en client-accounts.test.ts.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  role: "admin" | "viewer",
) {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${email}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${userId}, ${role})`,
  );
  return userId;
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function addClient(
  organizationId: string,
  name: string,
  phone: string | null = null,
  active = true,
) {
  return returningId(
    sql`insert into clients (organization_id, display_name, phone_e164, is_active)
        values (${organizationId}, ${name}, ${phone}, ${active}) returning id`,
  );
}

async function capability(
  organizationId: string,
  name: string,
  userId: string,
) {
  await getDb().execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${organizationId}, ${name}, ${userId})`,
  );
}

// Un pedido directo en la base: nace pendiente, y el estado se cambia después con las fechas que
// pide (orders_status_dates).
async function addOrder(
  organizationId: string,
  number: number,
  clientId: string,
  userId: string,
  status: "pending" | "confirmed" | "delivered" | "cancelled",
) {
  const id = await returningId(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${organizationId}, ${number}, ${clientId}, 'ARS', '100.00', ${userId})
        returning id`,
  );
  if (status === "cancelled") {
    await getDb().execute(
      sql`update orders set status = 'cancelled', cancelled_at = now() where id = ${id}`,
    );
  }
  // Uno entregado pasa antes por confirmado: el trigger no deja saltear la transición.
  if (status === "confirmed" || status === "delivered") {
    await getDb().execute(
      sql`update orders set status = 'confirmed', confirmed_at = now() where id = ${id}`,
    );
  }
  if (status === "delivered") {
    await getDb().execute(
      sql`update orders set status = 'delivered', delivered_at = now() where id = ${id}`,
    );
  }
}

async function addServiceOrder(
  organizationId: string,
  number: number,
  clientId: string,
  userId: string,
) {
  await getDb().execute(
    sql`with m as (
          insert into product_models (organization_id, name)
          values (${organizationId}, ${`iPhone ${number}`}) returning id
        )
        insert into service_orders (organization_id, number, client_id, model_id, device_serial,
                                    reported_issue, created_by)
        select ${organizationId}, ${number}, ${clientId}, m.id, '356938035643809', 'No carga',
          ${userId} from m`,
  );
}

async function addAppointment(
  organizationId: string,
  clientId: string,
  reasonId: string,
  userId: string,
  startsAt: SQL,
  status: "requested" | "confirmed" | "cancelled",
) {
  // Nace pedido o confirmado; uno cancelado se cancela después.
  const id = await returningId(
    sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
          created_by, confirmed_at)
        values (${organizationId}, ${clientId}, ${reasonId}, ${startsAt},
          ${startsAt} + interval '30 minutes',
          ${status === "cancelled" ? "requested" : status}, ${userId},
          ${status === "confirmed" ? sql`now()` : null})
        returning id`,
  );
  if (status === "cancelled") {
    await getDb().execute(
      sql`update appointments set status = 'cancelled', cancelled_at = now() where id = ${id}`,
    );
  }
}

async function addConversation(
  organizationId: string,
  clientId: string,
  status: "open" | "pending" | "closed",
  lastMessageAt: SQL,
) {
  await getDb().execute(
    sql`insert into conversations (organization_id, client_id, channel, status, started_at,
          last_message_at)
        values (${organizationId}, ${clientId}, 'whatsapp', ${status}, ${lastMessageAt},
          ${lastMessageAt})`,
  );
}

// A con admin, viewer y tres clientes; B con su admin y un cliente con el mismo teléfono que uno de A.
async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name) values ('Negocio A') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name) values ('Negocio B') returning id`,
  );
  const adminAId = await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  const adminBId = await addUser(orgB, "admin-b@example.com", "admin");
  const ana = await addClient(orgA, "Ana", "+5491155550001");
  const beto = await addClient(orgA, "Beto", "+5491155550002", false);
  const carla = await addClient(orgA, "Carla");
  const berta = await addClient(orgB, "Berta", "+5491155550001");
  return {
    orgA,
    orgB,
    adminAId,
    adminBId,
    ana,
    beto,
    carla,
    berta,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("«En curso» de la lista de clientes (brief-24.4.2, D-3)", () => {
  it(
    "cuenta los pedidos pendientes y confirmados, sin los entregados ni los cancelados",
    async () => {
      const s = await seed();
      await addOrder(s.orgA, 1, s.ana, s.adminAId, "pending");
      await addOrder(s.orgA, 2, s.ana, s.adminAId, "confirmed");
      await addOrder(s.orgA, 3, s.ana, s.adminAId, "delivered");
      await addOrder(s.orgA, 4, s.beto, s.adminAId, "cancelled");
      await addOrder(s.orgB, 1, s.berta, s.adminBId, "pending");

      for (const context of [s.adminA, s.viewerA]) {
        const result = await countOpenOrdersByClient(context, [
          s.ana,
          s.beto,
          s.carla,
          s.berta,
        ]);
        if (!result.ok) throw new Error(`rechazado: ${result.code}`);
        expect([...result.counts]).toEqual([[s.ana, 2]]);
      }
      expect(await countOpenOrdersByClient(s.adminA, ["no-es-un-id"])).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "las reparaciones abiertas, solo con repairs, por página y en toda la organización",
    async () => {
      const s = await seed();
      await addServiceOrder(s.orgA, 1, s.ana, s.adminAId);
      await addServiceOrder(s.orgA, 2, s.ana, s.adminAId);
      await addServiceOrder(s.orgB, 1, s.berta, s.adminBId);

      // Sin la capacidad, ninguna lectura.
      expect(
        await countOpenServiceOrdersByClient(s.adminA, [s.ana]),
      ).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await listClientIdsWithOpenServiceOrders(s.adminA)).toMatchObject({
        ok: false,
        code: "NOT_FOUND",
      });

      await capability(s.orgA, "repairs", s.adminAId);
      const counts = await countOpenServiceOrdersByClient(s.viewerA, [
        s.ana,
        s.carla,
        s.berta,
      ]);
      if (!counts.ok) throw new Error(`rechazado: ${counts.code}`);
      expect([...counts.counts]).toEqual([[s.ana, 2]]);

      for (const context of [s.adminA, s.viewerA]) {
        const ids = await listClientIdsWithOpenServiceOrders(context);
        if (!ids.ok) throw new Error(`rechazado: ${ids.code}`);
        expect([...ids.clientIds]).toEqual([s.ana]);
      }

      // Una orden cancelada ya no está abierta.
      await getDb().execute(
        sql`update service_orders set status = 'cancelled', cancel_reason = 'customer_withdrew',
              cancelled_at = now()
            where organization_id = ${s.orgA} and number = 2`,
      );
      const after = await countOpenServiceOrdersByClient(s.adminA, [s.ana]);
      if (!after.ok) throw new Error("rechazado");
      expect([...after.counts]).toEqual([[s.ana, 1]]);
    },
    TEST_TIMEOUT,
  );

  it(
    "los turnos pedidos o confirmados desde hoy, solo con appointments",
    async () => {
      const s = await seed();
      const reasonId = await returningId(
        sql`insert into appointment_reasons (organization_id, name)
            values (${s.orgA}, 'Retiro') returning id`,
      );
      await addAppointment(
        s.orgA,
        s.ana,
        reasonId,
        s.adminAId,
        sql`now() + interval '2 days'`,
        "requested",
      );
      await addAppointment(
        s.orgA,
        s.ana,
        reasonId,
        s.adminAId,
        sql`now() + interval '3 days'`,
        "confirmed",
      );
      await addAppointment(
        s.orgA,
        s.ana,
        reasonId,
        s.adminAId,
        sql`now() + interval '4 days'`,
        "cancelled",
      );
      await addAppointment(
        s.orgA,
        s.carla,
        reasonId,
        s.adminAId,
        sql`now() - interval '3 days'`,
        "confirmed",
      );

      // Un turno de Berta, en B: no cuenta para A aunque se pida su id.
      const reasonB = await returningId(
        sql`insert into appointment_reasons (organization_id, name)
            values (${s.orgB}, 'Retiro') returning id`,
      );
      await addAppointment(
        s.orgB,
        s.berta,
        reasonB,
        s.adminBId,
        sql`now() + interval '2 days'`,
        "requested",
      );

      expect(
        await countUpcomingAppointmentsByClient(s.adminA, [s.ana]),
      ).toMatchObject({ ok: false, code: "NOT_FOUND" });
      await capability(s.orgA, "appointments", s.adminAId);
      for (const context of [s.adminA, s.viewerA]) {
        const result = await countUpcomingAppointmentsByClient(context, [
          s.ana,
          s.carla,
          s.berta,
        ]);
        if (!result.ok) throw new Error(`rechazado: ${result.code}`);
        expect([...result.counts]).toEqual([[s.ana, 2]]);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "las conversaciones abiertas o pendientes, sin las cerradas ni las de otra organización",
    async () => {
      const s = await seed();
      await addConversation(s.orgA, s.ana, "open", sql`now()`);
      await addConversation(s.orgA, s.ana, "pending", sql`now()`);
      await addConversation(s.orgA, s.beto, "closed", sql`now()`);
      await addConversation(s.orgB, s.berta, "open", sql`now()`);

      for (const context of [s.adminA, s.viewerA]) {
        const result = await countOpenConversationsByClient(context, [
          s.ana,
          s.beto,
          s.berta,
        ]);
        if (!result.ok) throw new Error(`rechazado: ${result.code}`);
        expect([...result.counts]).toEqual([[s.ana, 2]]);
      }
    },
    TEST_TIMEOUT,
  );
});

describe("las vistas y la última interacción (brief-24.4.2, D-1 y D-4)", () => {
  it(
    "cuenta cada vista sobre el filtro, recorta la lista con la elegida y filtra por interacción",
    async () => {
      const s = await seed();
      await addConversation(
        s.orgA,
        s.ana,
        "open",
        sql`now() - interval '2 days'`,
      );
      await addConversation(
        s.orgA,
        s.carla,
        "closed",
        sql`now() - interval '20 days'`,
      );
      const base = {
        text: "",
        activity: "all" as const,
        page: 1,
        tagId: null,
        kind: null,
        province: null,
        segment: null,
      };
      const views = {
        with_balance: new Set([s.ana, s.berta]),
        with_repairs: new Set([s.carla]),
      };

      const all = await searchClientsByLastInteraction(s.viewerA, base, {
        views,
      });
      if (!all.ok) throw new Error("rechazado");
      expect(all.scopeTotal).toBe(3);
      expect(all.total).toBe(3);
      // Berta es de otra organización: no cuenta aunque esté en el conjunto.
      expect(all.viewCounts).toEqual({ with_balance: 1, with_repairs: 1 });

      const withBalance = await searchClientsByLastInteraction(s.adminA, base, {
        views,
        view: "with_balance",
      });
      if (!withBalance.ok) throw new Error("rechazado");
      expect(withBalance.clients.map((client) => client.id)).toEqual([s.ana]);
      expect(withBalance.scopeTotal).toBe(3);

      const lastWeek = await searchClientsByLastInteraction(
        s.adminA,
        {
          ...base,
          interaction: { since: new Date(Date.now() - 7 * 86400000) },
        },
        { views },
      );
      if (!lastWeek.ok) throw new Error("rechazado");
      expect(lastWeek.clients.map((client) => client.id)).toEqual([s.ana]);
      expect(lastWeek.viewCounts).toEqual({ with_balance: 1, with_repairs: 0 });

      const none = await searchClientsByLastInteraction(s.adminA, {
        ...base,
        interaction: "none",
      });
      if (!none.ok) throw new Error("rechazado");
      expect(none.clients.map((client) => client.id)).toEqual([s.beto]);
    },
    TEST_TIMEOUT,
  );
});

describe("el cliente por teléfono del aviso de duplicado (brief-24.4.2, D-8)", () => {
  it(
    "un admin encuentra al cliente de su organización, activo o no; un viewer no",
    async () => {
      const s = await seed();
      expect(await findClientByPhone(s.adminA, "+54 9 11 5555-0001")).toEqual({
        ok: true,
        client: {
          id: s.ana,
          displayName: "Ana",
          phoneE164: "+5491155550001",
          isActive: true,
        },
      });
      expect(await findClientByPhone(s.adminA, "+5491155550002")).toEqual({
        ok: true,
        client: {
          id: s.beto,
          displayName: "Beto",
          phoneE164: "+5491155550002",
          isActive: false,
        },
      });
      // El mismo número en B es de Berta, no de Ana.
      expect(await findClientByPhone(s.adminB, "+5491155550001")).toMatchObject(
        { ok: true, client: { id: s.berta } },
      );
      expect(await findClientByPhone(s.adminA, "+5491100000000")).toEqual({
        ok: true,
        client: null,
      });
      expect(await findClientByPhone(s.viewerA, "+5491155550001")).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await findClientByPhone(s.adminA, "1155550001")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
    },
    TEST_TIMEOUT,
  );
});
