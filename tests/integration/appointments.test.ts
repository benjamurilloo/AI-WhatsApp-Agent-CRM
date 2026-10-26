import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addDays,
  applyAppointmentsTemplate,
  changeAppointmentStatus,
  createAppointment,
  createAppointmentReason,
  getAppointment,
  getAppointmentCalendar,
  getAppointmentForm,
  listAppointmentAudit,
  listAppointmentReasons,
  listClientAppointments,
  moveAppointmentReason,
  renameAppointmentReason,
  saveAppointmentSettings,
  setAppointmentReasonActive,
  type AppointmentInput,
} from "@/modules/appointments";
import { hashPassword, login } from "@/modules/auth";
import { createProduct, type ProductInput } from "@/modules/catalog";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import { slotExists } from "@/modules/appointments/repository";
import { getDb } from "@/shared/db";
import { exportClientData } from "../../scripts/client-data-export";
import {
  eraseClientData,
  reportClientData,
} from "../../scripts/client-data-delete";
import { resetDatabase } from "./reset-database";

// Los turnos contra PostgreSQL real (brief-29.10, D-7): las franjas que salen del horario con sus
// excepciones, el alta con cada rechazo, el cupo con dos altas simultáneas y el bloqueo sostenido desde
// una tercera conexión, las transiciones, el trigger y los CHECK de la 0065 con filas escritas directo
// en la base, los turnos que quedan fuera después de un cambio (U-5), roles, capacidad, aislamiento,
// auditoría, la copia del perfil y el vaciado y la exportación de un cliente con turnos (D-6).

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
const TIMEZONE = "America/Argentina/Buenos_Aires";
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`rechazado: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

// El mensaje de PostgreSQL de una escritura directa que la base rechaza.
async function dbError(query: SQL): Promise<string> {
  try {
    await getDb().execute(query);
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error("la base aceptó la escritura");
}

async function member(
  orgId: string,
  email: string,
  role: "admin" | "viewer",
): Promise<{ context: AuthContext; userId: string }> {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${email}, false) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${userId}, ${role})`,
  );
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error("login rechazado");
  const auth = await getAuthContext(logged.token);
  if (!auth.ok) throw new Error("contexto rechazado");
  return { context: auth.context, userId };
}

// appointments y los valores del perfil, como hace org:capability. Sin template, la capacidad sola.
async function activate(
  organizationId: string,
  adminEmail: string,
  template = true,
) {
  const profile = getProfile("iphone")!;
  await getDb().transaction(async (tx) => {
    const activated = await activateCapability(tx, {
      organizationId,
      capability: "appointments",
      adminEmail,
    });
    if (!activated.ok) throw new Error(activated.code);
    if (template) {
      await applyAppointmentsTemplate(tx, {
        organizationId,
        actorUserId: activated.actorUserId,
        ...profile.appointments!,
      });
    }
  });
}

// Todos los días, de 10 a 12 y de 16 a 18.
async function openEveryDay(orgId: string) {
  for (let weekday = 1; weekday <= 7; weekday++) {
    await getDb().execute(
      sql`insert into business_hours (organization_id, weekday, opens_1, closes_1, opens_2, closes_2)
          values (${orgId}, ${weekday}, '10:00', '12:00', '16:00', '18:00')`,
    );
  }
}

function productInput(sku: string): ProductInput {
  return {
    sku,
    name: `Producto ${sku}`,
    description: null,
    unit: "unidad",
    reorderPoint: "0",
    brand: null,
    category: null,
    condition: "new",
    barcode: null,
    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    location: null,
    shelf: null,
  };
}

async function orgWith(name: string, email: string) {
  const orgId = await returningId(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  const admin = await member(orgId, email, "admin");
  await activate(orgId, email);
  await openEveryDay(orgId);
  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name) values (${orgId}, 'Lucía') returning id`,
  );
  const reasons = ok(await listAppointmentReasons(admin.context)).reasons;
  return {
    orgId,
    admin: admin.context,
    userId: admin.userId,
    clientId,
    reasonId: reasons[0]!.id,
  };
}

async function seed() {
  const a = await orgWith("Local A", "admin-a@example.com");
  const viewer = await member(a.orgId, "viewer-a@example.com", "viewer");
  const b = await orgWith("Local B", "admin-b@example.com");
  const today = (
    await getDb().execute<{ today: string }>(
      sql`select to_char(now() at time zone ${TIMEZONE}, 'YYYY-MM-DD') as today`,
    )
  ).rows[0]!.today;
  return { ...a, viewer: viewer.context, b, today, future: addDays(today, 7) };
}

type Seed = Awaited<ReturnType<typeof seed>>;

function input(
  s: Pick<Seed, "clientId" | "reasonId">,
  date: string,
  start: string,
  extra: Partial<AppointmentInput> = {},
): AppointmentInput {
  return {
    clientId: s.clientId,
    reasonId: s.reasonId,
    date,
    start,
    note: "",
    ...extra,
  };
}

// Un turno escrito directo en la base, por ejemplo en el pasado, que el servicio no deja dar.
function insertDirect(
  s: Pick<Seed, "orgId" | "clientId" | "reasonId" | "userId">,
  startsAt: SQL,
  status: "requested" | "confirmed" = "confirmed",
): Promise<string> {
  return returningId(
    sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
          created_by, confirmed_at)
        values (${s.orgId}, ${s.clientId}, ${s.reasonId}, ${startsAt}, ${startsAt} + interval '30 minutes',
          ${status}, ${s.userId}, ${status === "confirmed" ? sql`now()` : null})
        returning id`,
  );
}

async function audits(entityType: string) {
  const result = await getDb().execute<{
    action: string;
    entity_id: string;
    diff: {
      before: Record<string, unknown> | null;
      after: Record<string, unknown>;
    };
  }>(
    sql`select action, entity_id, diff from audit_logs
        where entity_type = ${entityType} order by created_at, id`,
  );
  return result.rows;
}

const heldLocks: (() => Promise<void>)[] = [];

async function hold(...queries: SQL[]): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    for (const query of queries) await tx.execute(query);
    taken();
    await released;
  });
  await lockTaken;
  const releaseLock = async () => {
    release();
    await holder;
  };
  heldLocks.push(releaseLock);
  return releaseLock;
}

async function waitForLockWaiters(expected: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let waiting = -1;
  while (Date.now() < deadline) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    waiting = result.rows[0]!.waiting;
    if (waiting === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${expected} conexiones en un bloqueo y hay ${waiting}`,
  );
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterEach(async () => {
  await Promise.all(heldLocks.splice(0).map((releaseLock) => releaseLock()));
});

afterAll(async () => {
  await resetDatabase(getDb());
  await getDb().$client.end();
});

describe("las franjas y el alta (AC-2, AC-3)", () => {
  it(
    "las franjas salen del horario de cada fecha, con su excepción, y un admin da un turno en una libre",
    async () => {
      const s = await seed();
      const closed = addDays(s.future, 1);
      const special = addDays(s.future, 2);
      await getDb().execute(
        sql`insert into business_hour_exceptions (organization_id, date, reason)
            values (${s.orgId}, ${closed}, 'Feriado')`,
      );
      await getDb().execute(
        sql`insert into business_hour_exceptions (organization_id, date, opens_1, closes_1, reason)
            values (${s.orgId}, ${special}, '09:00', '10:00', 'Inventario')`,
      );
      const before = ok(
        await getAppointmentCalendar(s.admin, { from: s.future, days: 7 }),
      ).calendar;
      expect(before.hoursConfigured).toBe(true);
      expect(before.settings).toEqual({ slotMinutes: 30, capacity: 1 });
      expect(before.days).toHaveLength(7);
      expect(before.days[0]!.slots.map((slot) => slot.start)).toEqual([
        "10:00",
        "10:30",
        "11:00",
        "11:30",
        "16:00",
        "16:30",
        "17:00",
        "17:30",
      ]);
      expect(before.days[0]!.slots.every((slot) => slot.free)).toBe(true);
      expect(before.days[1]).toMatchObject({
        date: closed,
        open: false,
        specialReason: "Feriado",
        slots: [],
      });
      expect(
        before.days[2]!.slots.map((slot) => [slot.start, slot.end]),
      ).toEqual([
        ["09:00", "09:30"],
        ["09:30", "10:00"],
      ]);

      const created = ok(
        await createAppointment(
          s.admin,
          input(s, s.future, "10:30", { note: "  Quiere ver el 15 Pro  " }),
        ),
      );
      const after = ok(
        await getAppointmentCalendar(s.admin, { from: s.future, days: 1 }),
      ).calendar;
      expect(after.days[0]!.slots[1]).toMatchObject({
        start: "10:30",
        occupied: 1,
        free: false,
      });
      expect(after.days[0]!.appointments).toEqual([
        {
          id: created.appointmentId,
          start: "10:30",
          end: "11:00",
          status: "confirmed",
          clientName: "Lucía",
          reasonName: "Ver o comprar un equipo",
          outsideHours: false,
          overCapacity: false,
        },
      ]);
      const detail = ok(
        await getAppointment(s.admin, created.appointmentId),
      ).appointment;
      expect(detail).toMatchObject({
        date: s.future,
        start: "10:30",
        end: "11:00",
        status: "confirmed",
        note: "Quiere ver el 15 Pro",
        started: false,
        reference: null,
        createdByName: "admin-a@example.com",
      });
      expect(detail.confirmedAt).not.toBeNull();
      expect(await audits("appointment")).toEqual([
        {
          action: "create",
          entity_id: created.appointmentId,
          diff: {
            before: null,
            after: {
              clientId: s.clientId,
              reasonId: s.reasonId,
              date: s.future,
              start: "10:30",
              end: "11:00",
              status: "confirmed",
            },
          },
        },
      ]);
      // El formulario ofrece solo las franjas libres de la fecha.
      const form = ok(
        await getAppointmentForm(s.admin, { date: s.future }),
      ).form;
      expect(form.freeSlots.map((slot) => slot.start)).not.toContain("10:30");
      expect(form.freeSlots).toHaveLength(7);
      expect(form.maxDate).toBe(addDays(s.today, 90));
    },
    TEST_TIMEOUT,
  );

  it(
    "rechaza fuera de horario, en una franja llena, en una que ya empezó y más allá del horizonte, cada uno con su motivo",
    async () => {
      const s = await seed();
      ok(await createAppointment(s.admin, input(s, s.future, "10:00")));
      const rule = (value: string) => ({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: value,
      });
      // 13:00 cae entre los tramos; 10:15 no es el inicio de una franja.
      expect(
        await createAppointment(s.admin, input(s, s.future, "13:00")),
      ).toEqual(rule("outside_hours"));
      expect(
        await createAppointment(s.admin, input(s, s.future, "10:15")),
      ).toEqual(rule("outside_hours"));
      expect(
        await createAppointment(s.admin, input(s, s.future, "10:00")),
      ).toEqual(rule("slot_full"));
      expect(
        await createAppointment(
          s.admin,
          input(s, addDays(s.today, -1), "10:00"),
        ),
      ).toEqual(rule("in_the_past"));
      expect(
        await createAppointment(
          s.admin,
          input(s, addDays(s.today, 91), "10:00"),
        ),
      ).toEqual(rule("too_far"));
      ok(
        await createAppointment(
          s.admin,
          input(s, addDays(s.today, 90), "10:00"),
        ),
      );
      await getDb().execute(
        sql`update clients set is_active = false where id = ${s.clientId}`,
      );
      expect(
        await createAppointment(s.admin, input(s, s.future, "11:00")),
      ).toEqual(rule("client_inactive"));
      await getDb().execute(
        sql`update clients set is_active = true where id = ${s.clientId}`,
      );
      ok(await setAppointmentReasonActive(s.admin, s.reasonId, false));
      expect(
        await createAppointment(s.admin, input(s, s.future, "11:00")),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["reason"] });
      ok(await setAppointmentReasonActive(s.admin, s.reasonId, true));
      expect(
        await createAppointment(
          s.admin,
          input(s, s.future, "11:00", { note: "x".repeat(501) }),
        ),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["note"] });
      expect(
        await createAppointment(
          s.admin,
          input(s, s.future, "11:00", {
            clientId: s.b.clientId,
          }),
        ),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["client"] });
      expect(
        await createAppointment(
          s.admin,
          input(s, "2026-02-30", "25:00", { clientId: "x" }),
        ),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["client", "date", "start"],
      });
      // Una organización con la capacidad y sin valores no da turnos.
      const bare = await returningId(
        sql`insert into organizations (name) values ('Sin valores') returning id`,
      );
      const bareAdmin = await member(bare, "bare@example.com", "admin");
      await activate(bare, "bare@example.com", false);
      await openEveryDay(bare);
      const bareClient = await returningId(
        sql`insert into clients (organization_id, display_name) values (${bare}, 'Ana') returning id`,
      );
      const bareReason = ok(
        await createAppointmentReason(bareAdmin.context, { name: "Visita" }),
      ).reasonId;
      expect(
        await createAppointment(
          bareAdmin.context,
          input(
            { clientId: bareClient, reasonId: bareReason },
            s.future,
            "10:00",
          ),
        ),
      ).toEqual(rule("not_configured"));
      // Ninguno de los rechazos escribió.
      const count = await getDb().execute<{ n: number }>(
        sql`select count(*)::int as n from appointments`,
      );
      expect(count.rows[0]!.n).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "la referencia es un producto activo o una unidad, nunca las dos",
    async () => {
      const s = await seed();
      const product = ok(
        await createProduct(s.admin, productInput("IP15")),
      ).productId;
      const created = ok(
        await createAppointment(
          s.admin,
          input(s, s.future, "10:00", { productId: product }),
        ),
      );
      expect(
        ok(await getAppointment(s.admin, created.appointmentId)).appointment
          .reference,
      ).toEqual({ kind: "product", id: product, label: "Producto IP15" });
      expect(
        await createAppointment(
          s.admin,
          input(s, s.future, "10:30", {
            productId: product,
            unitId: product,
          }),
        ),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["reference"] });
      await getDb().execute(
        sql`update products set is_active = false where id = ${product}`,
      );
      expect(
        await createAppointment(
          s.admin,
          input(s, s.future, "10:30", { productId: product }),
        ),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["reference"] });
      // La referencia guardada se sigue mostrando.
      expect(
        ok(await getAppointment(s.admin, created.appointmentId)).appointment
          .reference,
      ).toMatchObject({ kind: "product", id: product });
    },
    TEST_TIMEOUT,
  );
});

describe("la zona de la organización y el horario de verano (AC-2, D-7)", () => {
  it(
    "el turno se guarda y se muestra en la zona de la organización, no en la de Buenos Aires",
    async () => {
      const s = await seed();
      // Tokio, a doce horas de Buenos Aires y sin horario de verano.
      await getDb().execute(
        sql`update organizations set timezone = 'Asia/Tokyo' where id = ${s.orgId}`,
      );
      const today = (
        await getDb().execute<{ today: string }>(
          sql`select to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as today`,
        )
      ).rows[0]!.today;
      const date = addDays(today, 7);
      const created = ok(
        await createAppointment(s.admin, input(s, date, "10:00")),
      );
      const stored = await getDb().execute<{ utc: string }>(
        sql`select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc
            from appointments where id = ${created.appointmentId}`,
      );
      expect(stored.rows[0]!.utc).toBe(`${date} 01:00`);
      expect(
        ok(await getAppointment(s.admin, created.appointmentId)).appointment,
      ).toMatchObject({ date, start: "10:00", end: "10:30" });
      const calendar = ok(
        await getAppointmentCalendar(s.admin, { from: date, days: 1 }),
      ).calendar;
      expect(calendar.timezone).toBe("Asia/Tokyo");
      expect(calendar.days[0]!.appointments).toMatchObject([
        { start: "10:00", end: "10:30" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un cambio de horario de verano: la misma hora local cambia de instante, y la hora que falta no existe",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`update organizations set timezone = 'America/New_York' where id = ${s.orgId}`,
      );
      // Fechas fijas: el horario de verano de Nueva York terminó el 1 de noviembre de 2026 a las 2 y
      // empezó el 8 de marzo a las 2, cuando las 2 pasaron a ser las 3.
      const zone = "America/New_York";
      for (const date of ["2026-10-31", "2026-11-01"]) {
        await insertDirect(
          s,
          sql`((${date}::date + '10:00'::time) at time zone ${zone})`,
        );
      }
      const utc = await getDb().execute<{ utc: string }>(
        sql`select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc
            from appointments where organization_id = ${s.orgId} order by starts_at`,
      );
      expect(utc.rows.map((row) => row.utc)).toEqual([
        "2026-10-31 14:00",
        "2026-11-01 15:00",
      ]);
      const calendar = ok(
        await getAppointmentCalendar(s.admin, { from: "2026-10-31", days: 7 }),
      ).calendar;
      expect(
        calendar.days.flatMap((day) =>
          day.appointments.map((row) => [day.date, row.start, row.end]),
        ),
      ).toEqual([
        ["2026-10-31", "10:00", "10:30"],
        ["2026-11-01", "10:00", "10:30"],
      ]);

      const exists = (date: string, start: string, end: string) =>
        getDb().transaction((tx) =>
          slotExists(tx, { date, start, end, timezone: zone }),
        );
      expect(await exists("2026-03-08", "01:30", "02:00")).toBe(false);
      expect(await exists("2026-03-08", "02:30", "03:00")).toBe(false);
      expect(await exists("2026-03-08", "03:00", "03:30")).toBe(true);
      expect(await exists("2026-03-07", "02:30", "03:00")).toBe(true);
      // La hora que se repite existe: las 1 y media del 1 de noviembre.
      expect(await exists("2026-11-01", "01:30", "02:00")).toBe(true);
      // En Santiago de Chile el cambio es a la medianoche: el 6 de septiembre de 2026 no tuvo las 0.
      expect(
        await getDb().transaction((tx) =>
          slotExists(tx, {
            date: "2026-09-06",
            start: "00:00",
            end: "00:30",
            timezone: "America/Santiago",
          }),
        ),
      ).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    "sin el horario semanal entero, el calendario y el formulario dicen que no está cargado",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`delete from business_hours where organization_id = ${s.orgId} and weekday = 7`,
      );
      expect(
        ok(await getAppointmentCalendar(s.admin, { from: s.future, days: 1 }))
          .calendar.hoursConfigured,
      ).toBe(false);
      expect(
        ok(await getAppointmentForm(s.admin, { date: s.future })).form
          .hoursConfigured,
      ).toBe(false);
      expect(
        ok(await getAppointmentForm(s.b.admin, { date: s.future })).form
          .hoursConfigured,
      ).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

describe("el cupo (AC-4)", () => {
  it(
    "dos altas simultáneas en la última plaza de una franja dejan un solo turno",
    async () => {
      const s = await seed();
      const otherClient = await returningId(
        sql`insert into clients (organization_id, display_name) values (${s.orgId}, 'Marta') returning id`,
      );
      const release = await hold(
        sql`select id from appointment_settings where organization_id = ${s.orgId} for update`,
      );
      const first = createAppointment(s.admin, input(s, s.future, "16:00"));
      await waitForLockWaiters(1);
      const second = createAppointment(
        s.admin,
        input(s, s.future, "16:00", { clientId: otherClient }),
      );
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, code: "BUSINESS_RULE_VIOLATION", rule: "slot_full" },
      ]);
      const count = await getDb().execute<{ n: number }>(
        sql`select count(*)::int as n from appointments where organization_id = ${s.orgId}`,
      );
      expect(count.rows[0]!.n).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "con cupo 2 caben dos, y un pedido ocupa su plaza",
    async () => {
      const s = await seed();
      ok(
        await saveAppointmentSettings(s.admin, {
          slotMinutes: "30",
          capacity: "2",
        }),
      );
      await insertDirect(
        s,
        sql`((${s.future}::date + '17:00'::time) at time zone ${TIMEZONE})`,
        "requested",
      );
      ok(await createAppointment(s.admin, input(s, s.future, "17:00")));
      expect(
        await createAppointment(s.admin, input(s, s.future, "17:00")),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "slot_full",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("las transiciones (AC-5)", () => {
  it(
    "confirmar, cancelar, atendido y ausente, con su auditoría, y ninguna otra",
    async () => {
      const s = await seed();
      const future = ok(
        await createAppointment(s.admin, input(s, s.future, "10:00")),
      ).appointmentId;
      const requested = await insertDirect(
        s,
        sql`((${s.future}::date + '11:00'::time) at time zone ${TIMEZONE})`,
        "requested",
      );
      const past = await insertDirect(s, sql`now() - interval '2 hours'`);
      const missed = await insertDirect(s, sql`now() - interval '1 day'`);
      const rule = (value: string) => ({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: value,
      });

      expect(
        await changeAppointmentStatus(s.admin, future, "attended"),
      ).toEqual(rule("not_started"));
      expect(await changeAppointmentStatus(s.admin, future, "no_show")).toEqual(
        rule("not_started"),
      );
      expect(
        await changeAppointmentStatus(s.admin, future, "confirmed"),
      ).toEqual(rule("transition_not_allowed"));
      ok(await changeAppointmentStatus(s.admin, requested, "confirmed"));
      ok(await changeAppointmentStatus(s.admin, past, "attended"));
      ok(await changeAppointmentStatus(s.admin, missed, "no_show"));
      ok(await changeAppointmentStatus(s.admin, future, "cancelled"));
      for (const id of [future, past, missed]) {
        for (const to of ["confirmed", "cancelled", "attended"] as const) {
          expect(await changeAppointmentStatus(s.admin, id, to)).toEqual(
            rule("transition_not_allowed"),
          );
        }
      }
      // La franja del cancelado queda libre.
      ok(await createAppointment(s.admin, input(s, s.future, "10:00")));

      const rows = await getDb().execute<{
        id: string;
        status: string;
        dates: string;
      }>(
        sql`select id, status::text as status,
              concat_ws(',', case when confirmed_at is not null then 'confirmed' end,
                case when cancelled_at is not null then 'cancelled' end,
                case when attended_at is not null then 'attended' end,
                case when no_show_at is not null then 'no_show' end) as dates
            from appointments where id in (${future}, ${requested}, ${past}, ${missed})`,
      );
      expect(
        Object.fromEntries(
          rows.rows.map((row) => [row.id, `${row.status}:${row.dates}`]),
        ),
      ).toEqual({
        [future]: "cancelled:confirmed,cancelled",
        [requested]: "confirmed:confirmed",
        [past]: "attended:confirmed,attended",
        [missed]: "no_show:confirmed,no_show",
      });
      const changes = (await audits("appointment")).filter(
        (entry) => entry.action === "status_change",
      );
      expect(changes.map((entry) => entry.diff)).toEqual([
        { before: { status: "requested" }, after: { status: "confirmed" } },
        { before: { status: "confirmed" }, after: { status: "attended" } },
        { before: { status: "confirmed" }, after: { status: "no_show" } },
        { before: { status: "confirmed" }, after: { status: "cancelled" } },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("la base (AC-1, AC-5, AC-9)", () => {
  it(
    "el trigger y los CHECK de la 0065, sin pasar por el servicio",
    async () => {
      const s = await seed();
      const id = await insertDirect(
        s,
        sql`((${s.future}::date + '10:00'::time) at time zone ${TIMEZONE})`,
      );
      const values = (status: string, extra: SQL = sql``) =>
        sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
              created_by ${extra})
            values (${s.orgId}, ${s.clientId}, ${s.reasonId}, now() + interval '1 day',
              now() + interval '1 day 30 minutes', ${status}, ${s.userId}`;

      expect(
        await dbError(sql`delete from appointments where id = ${id}`),
      ).toBe("appointments no se borra: un turno se cancela");
      expect(
        await dbError(sql`${values("cancelled", sql`, cancelled_at`)}, now())`),
      ).toBe("un turno nace pedido o confirmado");
      expect(await dbError(sql`${values("confirmed")})`)).toMatch(
        /appointments_status_dates/,
      );
      expect(
        await dbError(
          sql`update appointments set status = 'requested', confirmed_at = null where id = ${id}`,
        ),
      ).toBe("appointments: transición confirmed -> requested no permitida");
      // Las otras transiciones prohibidas, en la base sin pasar por canTransition (revisión
      // independiente, N-5).
      const past = sql`now() - interval '1 hour'`;
      const cancelled = await insertDirect(s, past);
      await getDb().execute(
        sql`update appointments set status = 'cancelled', cancelled_at = now() where id = ${cancelled}`,
      );
      expect(
        await dbError(
          sql`update appointments set status = 'confirmed', confirmed_at = now() where id = ${cancelled}`,
        ),
      ).toBe("appointments: transición cancelled -> confirmed no permitida");
      const attended = await insertDirect(s, past);
      await getDb().execute(
        sql`update appointments set status = 'attended', attended_at = now() where id = ${attended}`,
      );
      expect(
        await dbError(
          sql`update appointments set status = 'cancelled', cancelled_at = now() where id = ${attended}`,
        ),
      ).toBe("appointments: transición attended -> cancelled no permitida");
      const requested = await insertDirect(s, past, "requested");
      expect(
        await dbError(
          sql`update appointments set status = 'attended', attended_at = now() where id = ${requested}`,
        ),
      ).toBe("appointments: transición requested -> attended no permitida");
      expect(
        await dbError(
          sql`update appointments set status = 'cancelled', cancelled_at = now(),
                starts_at = starts_at + interval '30 minutes',
                ends_at = ends_at + interval '30 minutes'
              where id = ${id}`,
        ),
      ).toBe(
        "appointments: la transición confirmed -> cancelled solo fija {cancelled_at}",
      );
      expect(
        await dbError(
          sql`update appointments set status = 'attended', attended_at = now() where id = ${id}`,
        ),
      ).toBe(
        "appointments: un turno que no empezó no se marca atendido ni ausente",
      );
      expect(
        await dbError(
          sql`update appointments set note = 'otra' where id = ${id}`,
        ),
      ).toBe("appointments: sin cambio de estado no cambia nada");
      // El vaciado (D-6): la nota a nulo, sin cambio de estado, es lo único que pasa.
      await getDb().execute(
        sql`update appointments set note = null where id = ${id}`,
      );

      const product = ok(
        await createProduct(s.admin, productInput("REF")),
      ).productId;
      expect(
        await dbError(
          sql`${values("requested", sql`, product_id, unit_id`)}, ${product}, ${product})`,
        ),
      ).toMatch(/appointments_single_reference/);
      expect(
        await dbError(
          sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status, created_by)
              values (${s.orgId}, ${s.clientId}, ${s.reasonId}, now() + interval '1 day', now() + interval '1 day',
                'requested', ${s.userId})`,
        ),
      ).toMatch(/appointments_ends_after_start/);
      expect(
        await dbError(
          sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status, created_by)
              values (${s.orgId}, ${s.b.clientId}, ${s.reasonId}, now() + interval '1 day',
                now() + interval '1 day 30 minutes', 'requested', ${s.userId})`,
        ),
      ).toMatch(/appointments_client_fk/);
      expect(
        await dbError(
          sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status, created_by)
              values (${s.orgId}, ${s.clientId}, ${s.b.reasonId}, now() + interval '1 day',
                now() + interval '1 day 30 minutes', 'requested', ${s.userId})`,
        ),
      ).toMatch(/appointments_reason_fk/);
      expect(
        await dbError(
          sql`update appointment_settings set slot_minutes = 25 where organization_id = ${s.orgId}`,
        ),
      ).toMatch(/appointment_settings_slot_minutes_allowed/);
      expect(
        await dbError(
          sql`update appointment_settings set capacity = 0 where organization_id = ${s.orgId}`,
        ),
      ).toMatch(/appointment_settings_capacity_range/);
      expect(
        await dbError(
          sql`insert into appointment_reasons (organization_id, name) values (${s.orgId}, ' Otro ')`,
        ),
      ).toMatch(/appointment_reasons_name_length/);
    },
    TEST_TIMEOUT,
  );
});

describe("los turnos que quedan fuera (AC-6, U-5)", () => {
  it(
    "un cambio de cupo, de horario o de duración no mueve ni cancela turnos, y el calendario los marca",
    async () => {
      const s = await seed();
      ok(
        await saveAppointmentSettings(s.admin, {
          slotMinutes: "30",
          capacity: "2",
        }),
      );
      const first = ok(
        await createAppointment(s.admin, input(s, s.future, "10:00")),
      ).appointmentId;
      const second = ok(
        await createAppointment(s.admin, input(s, s.future, "10:00")),
      ).appointmentId;
      ok(
        await saveAppointmentSettings(s.admin, {
          slotMinutes: "30",
          capacity: "1",
        }),
      );
      let day = ok(
        await getAppointmentCalendar(s.admin, { from: s.future, days: 1 }),
      ).calendar.days[0]!;
      expect(day.slots[0]).toMatchObject({
        start: "10:00",
        occupied: 2,
        overCapacity: true,
        free: false,
      });
      expect(
        day.appointments.map((item) => [item.id, item.overCapacity]),
      ).toEqual([
        [first, true],
        [second, true],
      ]);
      // Cancelar uno lo saca de la cuenta.
      ok(await changeAppointmentStatus(s.admin, second, "cancelled"));
      // El local deja de abrir a la mañana, y las franjas pasan a una hora.
      await getDb().execute(
        sql`update business_hours set opens_1 = '16:00', closes_1 = '18:00', opens_2 = null, closes_2 = null
            where organization_id = ${s.orgId}`,
      );
      ok(
        await saveAppointmentSettings(s.admin, {
          slotMinutes: "60",
          capacity: "1",
        }),
      );
      day = ok(
        await getAppointmentCalendar(s.admin, { from: s.future, days: 1 }),
      ).calendar.days[0]!;
      expect(day.slots.map((slot) => [slot.start, slot.end])).toEqual([
        ["16:00", "17:00"],
        ["17:00", "18:00"],
      ]);
      expect(day.appointments).toMatchObject([
        {
          id: first,
          status: "confirmed",
          start: "10:00",
          end: "10:30",
          outsideHours: true,
          overCapacity: false,
        },
        { id: second, status: "cancelled", outsideHours: false },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("la configuración, el perfil, los roles y el aislamiento (AC-7, AC-8, AC-9)", () => {
  it(
    "la copia del perfil crea los valores y los motivos de ejemplo, auditados, y no pisa nada la segunda vez",
    async () => {
      const s = await seed();
      const settings = await getDb().execute(
        sql`select slot_minutes, capacity, is_example from appointment_settings where organization_id = ${s.orgId}`,
      );
      expect(settings.rows).toEqual([
        { slot_minutes: 30, capacity: 1, is_example: true },
      ]);
      const reasons = ok(await listAppointmentReasons(s.admin)).reasons;
      expect(reasons.map((reason) => [reason.name, reason.isExample])).toEqual([
        ["Ver o comprar un equipo", true],
        ["Entregar un usado", true],
        ["Reparación o diagnóstico", true],
        ["Retirar un equipo", true],
        ["Otro", true],
      ]);
      expect(
        (await audits("appointment_settings")).map((entry) => entry.diff.after),
      ).toEqual([
        { slotMinutes: 30, capacity: 1, isExample: true, origen: "perfil" },
        { slotMinutes: 30, capacity: 1, isExample: true, origen: "perfil" },
      ]);
      const again = await getDb().transaction((tx) =>
        applyAppointmentsTemplate(tx, {
          organizationId: s.orgId,
          actorUserId: s.userId,
          slotMinutes: 60,
          capacity: 3,
          reasons: ["Otro", "Nuevo"],
        }),
      );
      expect(again).toEqual({
        settingsCreated: false,
        created: ["Nuevo"],
        skipped: ["Otro"],
      });
      // Guardar los valores apaga la marca de ejemplo.
      ok(
        await saveAppointmentSettings(s.admin, {
          slotMinutes: "30",
          capacity: "1",
        }),
      );
      const saved = await getDb().execute(
        sql`select slot_minutes, capacity, is_example from appointment_settings where organization_id = ${s.orgId}`,
      );
      expect(saved.rows).toEqual([
        { slot_minutes: 30, capacity: 1, is_example: false },
      ]);
      expect(
        await saveAppointmentSettings(s.admin, {
          slotMinutes: "25",
          capacity: "21",
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["slotMinutes", "capacity"],
      });
      // Los motivos: alta, nombre repetido, renombre, orden.
      const added = ok(
        await createAppointmentReason(s.admin, { name: "Cotizar" }),
      ).reasonId;
      expect(
        await createAppointmentReason(s.admin, { name: "cotizar" }),
      ).toEqual({ ok: false, code: "CONFLICT", field: "name" });
      expect(
        await renameAppointmentReason(s.admin, added, { name: "otro" }),
      ).toEqual({ ok: false, code: "CONFLICT", field: "name" });
      ok(
        await renameAppointmentReason(s.admin, added, {
          name: "Cotizar un usado",
        }),
      );
      ok(await moveAppointmentReason(s.admin, added, "up"));
      const names = ok(await listAppointmentReasons(s.admin)).reasons.map(
        (reason) => reason.name,
      );
      expect(names.slice(-2)).toEqual(["Cotizar un usado", "Nuevo"]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un viewer ve el calendario, el turno y su historia, y las acciones lo rechazan; otra organización no ve nada",
    async () => {
      const s = await seed();
      const id = ok(
        await createAppointment(s.admin, input(s, s.future, "10:00")),
      ).appointmentId;
      ok(await getAppointmentCalendar(s.viewer, { from: s.future, days: 7 }));
      expect(
        ok(await getAppointment(s.viewer, id)).appointment.clientName,
      ).toBe("Lucía");
      expect(
        ok(await listAppointmentAudit(s.viewer, id, 1)).entries,
      ).toHaveLength(1);
      expect(
        ok(await listClientAppointments(s.viewer, s.clientId)).appointments,
      ).toMatchObject([
        { id, status: "confirmed", reasonName: "Ver o comprar un equipo" },
      ]);
      const forbidden = { ok: false, code: "FORBIDDEN" };
      expect(
        await createAppointment(s.viewer, input(s, s.future, "11:00")),
      ).toEqual(forbidden);
      expect(await changeAppointmentStatus(s.viewer, id, "cancelled")).toEqual(
        forbidden,
      );
      expect(
        await saveAppointmentSettings(s.viewer, {
          slotMinutes: "30",
          capacity: "1",
        }),
      ).toEqual(forbidden);
      expect(await listAppointmentReasons(s.viewer)).toEqual(forbidden);
      expect(await createAppointmentReason(s.viewer, { name: "X" })).toEqual(
        forbidden,
      );
      expect(await getAppointmentForm(s.viewer, {})).toEqual(forbidden);

      // Otra organización: el turno no existe, y su calendario está vacío.
      const notFound = { ok: false, code: "NOT_FOUND" };
      expect(await getAppointment(s.b.admin, id)).toEqual(notFound);
      expect(await changeAppointmentStatus(s.b.admin, id, "cancelled")).toEqual(
        notFound,
      );
      expect(await listAppointmentAudit(s.b.admin, id, 1)).toEqual(notFound);
      const other = ok(
        await getAppointmentCalendar(s.b.admin, { from: s.future, days: 1 }),
      ).calendar;
      expect(other.days[0]!.appointments).toEqual([]);
      expect(other.days[0]!.slots[0]).toMatchObject({
        occupied: 0,
        free: true,
      });

      // Sin la capacidad, nada existe.
      const plain = await returningId(
        sql`insert into organizations (name) values ('Sin turnos') returning id`,
      );
      const plainAdmin = await member(plain, "plain@example.com", "admin");
      for (const result of [
        await getAppointmentCalendar(plainAdmin.context, {
          from: s.future,
          days: 1,
        }),
        await getAppointment(plainAdmin.context, id),
        await getAppointmentForm(plainAdmin.context, {}),
        await listClientAppointments(plainAdmin.context, s.clientId),
        await listAppointmentReasons(plainAdmin.context),
        // Las escrituras también (revisión independiente, N-7).
        await createAppointment(
          plainAdmin.context,
          input(s, s.future, "10:30"),
        ),
        await changeAppointmentStatus(plainAdmin.context, id, "cancelled"),
        await saveAppointmentSettings(plainAdmin.context, {
          slotMinutes: "30",
          capacity: "1",
        }),
        await createAppointmentReason(plainAdmin.context, { name: "X" }),
      ]) {
        expect(result).toEqual(notFound);
      }

      // Al final del calendario, el rango no se lee (revisión independiente, N-4).
      expect(
        await getAppointmentCalendar(s.admin, { from: "9999-12-31", days: 7 }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    },
    TEST_TIMEOUT,
  );
});

describe("los datos de un cliente (AC-10, D-6)", () => {
  it(
    "el vaciado deja la nota en nulo y el turno queda; un cliente con turnos no se borra; la exportación los trae",
    async () => {
      const s = await seed();
      const id = ok(
        await createAppointment(
          s.admin,
          input(s, s.future, "10:00", { note: "Lucía viene con su hermana" }),
        ),
      ).appointmentId;
      const report = await reportClientData(getDb(), s.orgId, s.clientId);
      expect(report.appointments).toBe(1);
      expect(report.deletable).toBe(false);
      const exported = await exportClientData(getDb(), s.orgId, s.clientId);
      expect(exported.appointments).toMatchObject([
        {
          id,
          reason: "Ver o comprar un equipo",
          note: "Lucía viene con su hermana",
          status: "confirmed",
        },
      ]);
      const erased = await eraseClientData(getDb(), s.orgId, s.clientId);
      expect(erased.appointments).toBe(1);
      const row = await getDb().execute<{
        note: string | null;
        status: string;
      }>(
        sql`select note, status::text as status from appointments where id = ${id}`,
      );
      expect(row.rows).toEqual([{ note: null, status: "confirmed" }]);
      // Una segunda corrida no encuentra nada que vaciar.
      expect(
        (await eraseClientData(getDb(), s.orgId, s.clientId)).appointments,
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
