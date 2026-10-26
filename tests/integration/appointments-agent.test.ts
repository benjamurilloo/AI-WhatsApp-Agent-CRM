import { sql, type SQL } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { errorResponseSchema } from "@/app/api/read/v1/contract";
import { handleAppointmentSlotsV3 } from "@/app/api/read/v3/appointment-slots/handler";
import { appointmentSlotsResponseSchemaV3 } from "@/app/api/read/v3/contract";
import {
  addDays,
  applyAppointmentsTemplate,
  changeAppointmentStatus,
  createAppointment,
  getAppointment,
  getAppointmentCalendar,
  listAppointmentAudit,
  listAppointmentReasons,
  setAppointmentReasonActive,
} from "@/modules/appointments";
import { describeSlots, findLocalOf } from "@/modules/appointments/repository";
import { hashPassword, login } from "@/modules/auth";
import { createProduct, type ProductInput } from "@/modules/catalog";
import {
  createIngestionCredential,
  recordIngestionEventV2,
  type IngestionContext,
} from "@/modules/ingestion";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { exportClientData } from "../../scripts/client-data-export";
import { eraseClientData } from "../../scripts/client-data-delete";
import { resetDatabase } from "./reset-database";

// Los turnos del agente contra PostgreSQL real (brief-29.10.2, D-2 a D-8): la lectura de las franjas
// libres con la fecha de hoy, el horizonte, la anticipación, la ocupación y la hora que falta; el turno
// pedido por la ingestión con cada regla en su precedencia, el reenvío y el conflicto; el cupo con un
// pedido del agente y un alta de la app a la vez; la 0066 sin pasar por el servicio; la confirmación desde
// la app; el aislamiento; y los datos de un cliente. Los requests son sintéticos: nada de esto es
// evidencia de integración con el agente.

const BASE = "http://localhost/api/read";
const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 60000;
const TIMEZONE = "America/Argentina/Buenos_Aires";
const PHONE = "+5491155550001";
const OTHER_PHONE = "+5491155550002";
const UNKNOWN_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SOURCE = "agente-whatsapp";
let storedHash: string;
let eventCount = 0;

type Credential = { id: string; token: string };

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function count(query: SQL): Promise<number> {
  const result = await getDb().execute<{ n: number }>(query);
  return result.rows[0]!.n;
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`rechazado: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

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
): Promise<{ context: AuthContext; userId: string }> {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${email}, false) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${userId}, 'admin')`,
  );
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error("login rechazado");
  const auth = await getAuthContext(logged.token);
  if (!auth.ok) throw new Error("contexto rechazado");
  return { context: auth.context, userId };
}

// appointments y, con template, los valores del perfil iphone (30 minutos, cupo 1, cinco motivos).
async function activate(orgId: string, adminEmail: string, template = true) {
  const profile = getProfile("iphone")!;
  await getDb().transaction(async (tx) => {
    const activated = await activateCapability(tx, {
      organizationId: orgId,
      capability: "appointments",
      adminEmail,
    });
    if (!activated.ok) throw new Error(activated.code);
    if (template) {
      await applyAppointmentsTemplate(tx, {
        organizationId: orgId,
        actorUserId: activated.actorUserId,
        ...profile.appointments!,
      });
    }
  });
}

// Todos los días, de 10 a 12 y de 16 a 18, o el día entero.
async function openEveryDay(orgId: string, allDay = false) {
  for (let weekday = 1; weekday <= 7; weekday++) {
    await getDb().execute(
      allDay
        ? sql`insert into business_hours (organization_id, weekday, opens_1, closes_1)
              values (${orgId}, ${weekday}, '00:00', '23:59')`
        : sql`insert into business_hours (organization_id, weekday, opens_1, closes_1, opens_2, closes_2)
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

async function credential(
  organizationId: string,
  scope: "read" | "ingest",
): Promise<Credential> {
  const created = await createIngestionCredential(
    organizationId,
    SOURCE,
    scope,
  );
  if (!created.ok) throw new Error("credencial inválida");
  return { id: created.credentialId, token: created.token };
}

async function orgWith(name: string, email: string, capability = true) {
  const orgId = await returningId(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  const admin = await member(orgId, email);
  if (capability) await activate(orgId, email);
  await openEveryDay(orgId);
  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgId}, 'Lucía Pereyra', ${PHONE}) returning id`,
  );
  const reasons = capability
    ? ok(await listAppointmentReasons(admin.context)).reasons
    : [];
  const reader = await credential(orgId, "read");
  const ingest = await credential(orgId, "ingest");
  return {
    orgId,
    admin: admin.context,
    userId: admin.userId,
    clientId,
    reasonId: reasons[0]?.id ?? UNKNOWN_ID,
    reasons,
    reader,
    ingest: {
      organizationId: orgId,
      source: SOURCE,
      credentialId: ingest.id,
    } satisfies IngestionContext,
  };
}

async function localToday(timezone = TIMEZONE): Promise<string> {
  const result = await getDb().execute<{ today: string }>(
    sql`select to_char(now() at time zone ${timezone}, 'YYYY-MM-DD') as today`,
  );
  return result.rows[0]!.today;
}

async function seed() {
  const a = await orgWith("Local A", "admin-a@example.com");
  const b = await orgWith("Local B", "admin-b@example.com");
  const today = await localToday();
  return { ...a, b, today, future: addDays(today, 7) };
}

type Seed = Awaited<ReturnType<typeof seed>>;
type Org = Awaited<ReturnType<typeof orgWith>>;

// El instante en UTC de una fecha y una hora locales.
async function instantOf(date: string, time: string, timezone = TIMEZONE) {
  const result = await getDb().execute<{ instant: string }>(
    sql`select to_char(((${date}::date + ${time}::time) at time zone ${timezone}) at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"') as instant`,
  );
  return result.rows[0]!.instant;
}

function appointmentEvent(
  appointment: Record<string, unknown>,
  options: { eventId?: string; phone?: string } = {},
) {
  eventCount += 1;
  return {
    contract_version: "2",
    event_type: "appointment.requested",
    event_id: options.eventId ?? `evt-turno-${eventCount}`,
    occurred_at: new Date().toISOString(),
    client: { phone: options.phone ?? PHONE },
    appointment,
  };
}

function send(context: IngestionContext, payload: unknown) {
  return recordIngestionEventV2(context, JSON.stringify(payload), new Date());
}

async function request(
  o: Pick<Org, "ingest" | "reasonId">,
  date: string,
  time: string,
  extra: Record<string, unknown> = {},
  options: { eventId?: string; phone?: string; timezone?: string } = {},
) {
  return send(
    o.ingest,
    appointmentEvent(
      {
        reason_id: o.reasonId,
        starts_at: await instantOf(date, time, options.timezone),
        ...extra,
      },
      options,
    ),
  );
}

function rule(name: string) {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: name,
    recorded: true,
  };
}

function slotsRequest(query: string, token: string | null) {
  return handleAppointmentSlotsV3(
    new Request(`${BASE}/v3/appointment-slots${query}`, {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    }),
    new Date(),
  );
}

async function slots(query: string, token: string) {
  const response = await slotsRequest(query, token);
  expect(response.status).toBe(200);
  const parsed = appointmentSlotsResponseSchemaV3.safeParse(
    await response.json(),
  );
  if (!parsed.success) throw new Error("respuesta fuera del contrato");
  return parsed.data;
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

const local = (date: string, time: string) =>
  sql`((${date}::date + ${time}::time) at time zone ${TIMEZONE})`;

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

const savedEnv = {
  enabled: process.env.READ_API_ENABLED,
  allowed: process.env.READ_API_ALLOWED_CREDENTIALS,
};

function allow(...credentials: Credential[]) {
  process.env.READ_API_ENABLED = "true";
  process.env.READ_API_ALLOWED_CREDENTIALS = credentials
    .map((c) => c.id)
    .join(",");
}

let s: Seed;

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
  s = await seed();
  allow(s.reader, s.b.reader);
}, TEST_TIMEOUT);

afterEach(async () => {
  await Promise.all(heldLocks.splice(0).map((releaseLock) => releaseLock()));
  for (const [key, value] of [
    ["READ_API_ENABLED", savedEnv.enabled],
    ["READ_API_ALLOWED_CREDENTIALS", savedEnv.allowed],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterAll(async () => {
  await resetDatabase(getDb());
  await getDb().$client.end();
});

describe(
  "las franjas libres (AC-2, AC-8; D-2)",
  { timeout: TEST_TIMEOUT },
  () => {
    it("hoy, la duración, los motivos activos en su orden y las franjas libres con su desplazamiento", async () => {
      // El segundo motivo, inactivo: no aparece.
      ok(await setAppointmentReasonActive(s.admin, s.reasons[1]!.id, false));
      await insertDirect(s, local(s.future, "10:00"));
      await insertDirect(s, local(s.future, "10:30"), "requested");
      const cancelled = await insertDirect(s, local(s.future, "11:00"));
      ok(await changeAppointmentStatus(s.admin, cancelled, "cancelled"));
      const body = await slots(`?from=${s.future}&days=1`, s.reader.token);
      expect(body.today).toBe(s.today);
      expect(body.slot_minutes).toBe(30);
      expect(body.reasons).toEqual(
        s.reasons
          .filter((_, index) => index !== 1)
          .map((reason) => ({ reason_id: reason.id, name: reason.name })),
      );
      expect(body.days).toEqual([
        {
          date: s.future,
          slots: ["11:00", "11:30", "16:00", "16:30", "17:00", "17:30"].map(
            (start) => {
              const [h, m] = start.split(":").map(Number);
              const end = `${String(h! + (m === 30 ? 1 : 0)).padStart(2, "0")}:${m === 30 ? "00" : "30"}`;
              return {
                starts_at: `${s.future}T${start}:00-03:00`,
                ends_at: `${s.future}T${end}:00-03:00`,
              };
            },
          ),
        },
      ]);
    });

    it("sin from, desde hoy; days por defecto 7; nunca más allá de 14 días", async () => {
      const all = await slots("", s.reader.token);
      expect(all.days.length).toBeGreaterThan(0);
      expect(all.days[0]!.date >= s.today).toBe(true);
      expect(all.days.at(-1)!.date <= addDays(s.today, 6)).toBe(true);
      const edge = await slots(
        `?from=${addDays(s.today, 13)}&days=7`,
        s.reader.token,
      );
      expect(edge.days.map((day) => day.date)).toEqual([
        addDays(s.today, 13),
        addDays(s.today, 14),
      ]);
      const beyond = await slots(
        `?from=${addDays(s.today, 15)}&days=7`,
        s.reader.token,
      );
      expect(beyond).toMatchObject({ slot_minutes: 30, days: [] });
    });

    it("la anticipación: ninguna franja empieza antes de dos horas", async () => {
      await getDb().execute(
        sql`delete from business_hours where organization_id = ${s.orgId}`,
      );
      await openEveryDay(s.orgId, true);
      const before = Date.now();
      const body = await slots(`?days=2`, s.reader.token);
      const after = Date.now();
      const starts = body.days.flatMap((day) =>
        day.slots.map((slot) => Date.parse(slot.starts_at)),
      );
      const lead = 120 * 60 * 1000;
      expect(starts.every((start) => start >= before + lead)).toBe(true);
      // La primera es la primera de la grilla después de la anticipación: a lo sumo media hora más tarde.
      expect(starts[0]!).toBeLessThan(after + lead + 30 * 60 * 1000);
    });

    it("en otra zona, el desplazamiento de esa zona", async () => {
      await getDb().execute(
        sql`update organizations set timezone = 'Asia/Tokyo' where id = ${s.orgId}`,
      );
      const today = await localToday("Asia/Tokyo");
      const date = addDays(today, 3);
      const body = await slots(`?from=${date}&days=1`, s.reader.token);
      expect(body.today).toBe(today);
      expect(body.days[0]!.slots[0]).toEqual({
        starts_at: `${date}T10:00:00+09:00`,
        ends_at: `${date}T10:30:00+09:00`,
      });
    });

    it("la hora que falta no existe, y el desplazamiento cambia con el horario de verano", async () => {
      // Fechas fijas, en el repositorio: la lectura solo mira 14 días adelante.
      const ny = await describeSlots(
        "America/New_York",
        [
          { date: "2026-03-08", start: "01:30", end: "02:00" },
          { date: "2026-03-08", start: "02:30", end: "03:00" },
          { date: "2026-03-08", start: "03:00", end: "03:30" },
          { date: "2026-10-31", start: "10:00", end: "10:30" },
          { date: "2026-11-01", start: "10:00", end: "10:30" },
        ],
        0,
      );
      // 01:30 a 02:00 termina en la hora que falta, y 02:30 empieza en ella.
      expect(ny.map((slot) => slot.exists)).toEqual([
        false,
        false,
        true,
        true,
        true,
      ]);
      // El desplazamiento de las que existen: verano (-04:00) y, después del 1 de noviembre, -05:00.
      expect(
        ny
          .slice(2)
          .map(({ date, startOffset, endOffset }) => [
            date,
            startOffset,
            endOffset,
          ]),
      ).toEqual([
        ["2026-03-08", -240, -240],
        ["2026-10-31", -240, -240],
        ["2026-11-01", -300, -300],
      ]);
      const santiago = await describeSlots(
        "America/Santiago",
        [{ date: "2026-09-06", start: "00:00", end: "00:30" }],
        0,
      );
      expect(santiago[0]!.exists).toBe(false);
      // La lectura filtra solo por bookable: la hora que falta nunca se puede pedir, aunque esté en el
      // futuro y sin anticipación (H-6, AC-2). Fechas de 2027 para que estén en el futuro.
      const future = await describeSlots(
        "America/New_York",
        [
          { date: "2027-03-14", start: "01:30", end: "02:00" },
          { date: "2027-03-14", start: "02:30", end: "03:00" },
          { date: "2027-03-14", start: "03:00", end: "03:30" },
        ],
        0,
      );
      expect(future.map((slot) => slot.bookable)).toEqual([false, false, true]);
      const santiagoFuture = await describeSlots(
        "America/Santiago",
        [
          { date: "2027-09-05", start: "00:00", end: "00:30" },
          { date: "2027-09-05", start: "01:00", end: "01:30" },
        ],
        0,
      );
      expect(santiagoFuture.map((slot) => slot.bookable)).toEqual([
        false,
        true,
      ]);
      // La hora repetida del 1 de noviembre: de sus dos instantes, uno solo vuelve a la misma hora local.
      const exact = await getDb().transaction(async (tx) =>
        Promise.all(
          ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"].map(
            async (instant) =>
              (await findLocalOf(tx, instant, "America/New_York")).exact,
          ),
        ),
      );
      expect(exact.filter(Boolean)).toHaveLength(1);
    });

    it("sin la capacidad o sin valores: hoy y nada más", async () => {
      const off = await orgWith("Local C", "admin-c@example.com", false);
      const noSettings = await orgWith("Local D", "admin-d@example.com", false);
      await activate(noSettings.orgId, "admin-d@example.com", false);
      allow(off.reader, noSettings.reader);
      for (const reader of [off.reader, noSettings.reader]) {
        expect(await slots("", reader.token)).toEqual({
          contract_version: "3",
          today: s.today,
          slot_minutes: null,
          reasons: [],
          days: [],
        });
      }
    });

    it("los 400: from mal formado o anterior a hoy, days fuera de rango", async () => {
      for (const [query, field] of [
        ["?from=27-10-2026", "from"],
        ["?from=2026-02-30", "from"],
        [`?from=${addDays(s.today, -1)}`, "from"],
        ["?days=0", "days"],
        ["?days=8", "days"],
        ["?days=uno", "days"],
      ] as const) {
        const response = await slotsRequest(query, s.reader.token);
        expect(response.status, query).toBe(400);
        const body = await response.json();
        expect(errorResponseSchema.safeParse(body).success).toBe(true);
        expect(body.fields).toEqual([field]);
      }
    });

    it("D-7: el cuerpo no trae clientes, notas, turnos ni el cupo", async () => {
      await getDb().execute(
        sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
            created_by, confirmed_at, note)
          values (${s.orgId}, ${s.clientId}, ${s.reasonId}, ${local(s.future, "10:00")},
            ${local(s.future, "10:30")}, 'confirmed', ${s.userId}, now(), 'Viene con su hermana Marta')`,
      );
      const response = await slotsRequest(
        `?from=${s.future}&days=1`,
        s.reader.token,
      );
      const raw = await response.text();
      for (const secret of [
        "Lucía Pereyra",
        PHONE,
        "Marta",
        s.clientId,
        "capacity",
        "occupied",
      ]) {
        expect(raw).not.toContain(secret);
      }
    });

    it("cada organización lee las suyas", async () => {
      ok(
        await setAppointmentReasonActive(s.b.admin, s.b.reasons[0]!.id, false),
      );
      const a = await slots(`?from=${s.future}&days=1`, s.reader.token);
      const b = await slots(`?from=${s.future}&days=1`, s.b.reader.token);
      expect(a.reasons.map((reason) => reason.reason_id)).toContain(s.reasonId);
      expect(b.reasons.map((reason) => reason.reason_id)).not.toContain(
        s.b.reasonId,
      );
      expect(b.reasons.map((reason) => reason.reason_id)).not.toContain(
        s.reasonId,
      );
    });
  },
);

describe(
  "el turno pedido (AC-3, AC-4, AC-5; D-3)",
  { timeout: TEST_TIMEOUT },
  () => {
    it("queda pedido, con la credencial y el evento, auditado, y ocupa su franja", async () => {
      const product = ok(await createProduct(s.admin, productInput("IP13")));
      const result = await request(s, s.future, "16:00", {
        product_id: product.productId,
      });
      expect(result).toEqual({
        ok: true,
        result: "accepted",
        eventId: expect.any(String),
        appointment: {
          startsAt: `${s.future}T16:00:00-03:00`,
          endsAt: `${s.future}T16:30:00-03:00`,
        },
      });
      const rows = await getDb().execute<{
        id: string;
        status: string;
        created_by: string | null;
        created_by_credential_id: string;
        ingestion_event_id: string;
        product_id: string;
        note: string | null;
        event_status: string;
      }>(
        sql`select a.id, a.status::text as status, a.created_by, a.created_by_credential_id,
                 a.ingestion_event_id, a.product_id, a.note, e.status::text as event_status
            from appointments a join ingestion_events e on e.id = a.ingestion_event_id
           where a.organization_id = ${s.orgId}`,
      );
      expect(rows.rows).toEqual([
        {
          id: expect.any(String),
          status: "requested",
          created_by: null,
          created_by_credential_id: s.ingest.credentialId,
          ingestion_event_id: expect.any(String),
          product_id: product.productId,
          note: null,
          event_status: "processed",
        },
      ]);
      const audit = await getDb().execute<{
        actor_user_id: string | null;
        actor_credential_id: string;
        action: string;
      }>(
        sql`select actor_user_id, actor_credential_id, action from audit_logs
          where entity_type = 'appointment' and entity_id = ${rows.rows[0]!.id}`,
      );
      expect(audit.rows).toEqual([
        {
          actor_user_id: null,
          actor_credential_id: s.ingest.credentialId,
          action: "create",
        },
      ]);
      const body = await slots(`?from=${s.future}&days=1`, s.reader.token);
      expect(body.days[0]!.slots.map((slot) => slot.starts_at)).not.toContain(
        `${s.future}T16:00:00-03:00`,
      );
    });

    it("el reenvío idéntico da duplicate con la misma franja, y otro contenido da CONFLICT", async () => {
      const payload = appointmentEvent({
        reason_id: s.reasonId,
        starts_at: await instantOf(s.future, "16:30"),
      });
      const first = ok(await send(s.ingest, payload));
      const again = await send(s.ingest, payload);
      expect(again).toEqual({ ...first, result: "duplicate" });
      expect(
        await send(s.ingest, {
          ...payload,
          appointment: { ...payload.appointment, reason_id: s.reasons[1]!.id },
        }),
      ).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: false,
        reason: "event_payload_mismatch",
      });
      expect(
        await count(
          sql`select count(*)::int as n from appointments where organization_id = ${s.orgId}`,
        ),
      ).toBe(1);
    });

    it("not_offered: sin la capacidad, o sin valores", async () => {
      const off = await orgWith("Local C", "admin-c@example.com", false);
      expect(await request(off, s.future, "10:00")).toEqual(
        rule("not_offered"),
      );
      const noSettings = await orgWith("Local D", "admin-d@example.com", false);
      await activate(noSettings.orgId, "admin-d@example.com", false);
      expect(await request(noSettings, s.future, "10:00")).toEqual(
        rule("not_offered"),
      );
    });

    it("client_not_found y client_inactive, antes que el motivo", async () => {
      expect(
        await request(
          { ...s, reasonId: UNKNOWN_ID },
          s.future,
          "10:00",
          {},
          {
            phone: OTHER_PHONE,
          },
        ),
      ).toEqual(rule("client_not_found"));
      await getDb().execute(
        sql`update clients set is_active = false where id = ${s.clientId}`,
      );
      expect(
        await request({ ...s, reasonId: UNKNOWN_ID }, s.future, "10:00"),
      ).toEqual(rule("client_inactive"));
    });

    it("reason_not_found: inexistente, inactivo o de otra organización, antes que la referencia", async () => {
      ok(await setAppointmentReasonActive(s.admin, s.reasons[2]!.id, false));
      for (const reasonId of [UNKNOWN_ID, s.reasons[2]!.id, s.b.reasonId]) {
        expect(
          await request({ ...s, reasonId }, s.future, "10:00", {
            product_id: UNKNOWN_ID,
          }),
        ).toEqual(rule("reason_not_found"));
      }
    });

    it("reference_not_found: un producto o una unidad que no existen o son de otra organización", async () => {
      const other = ok(await createProduct(s.b.admin, productInput("B-1")));
      for (const reference of [
        { product_id: UNKNOWN_ID },
        { product_id: other.productId },
        { unit_id: UNKNOWN_ID },
      ]) {
        expect(await request(s, s.future, "10:00", reference)).toEqual(
          rule("reference_not_found"),
        );
      }
    });

    it("client_has_pending_request: uno pedido que no empezó lo frena; uno confirmado o uno pasado, no", async () => {
      await insertDirect(s, local(addDays(s.today, -1), "10:00"), "requested");
      await insertDirect(s, local(s.future, "17:00"));
      ok(await request(s, s.future, "10:00"));
      // Antes que la franja: esta ni siquiera existe.
      expect(await request(s, s.future, "13:00")).toEqual(
        rule("client_has_pending_request"),
      );
    });

    it("outside_hours: fuera de la grilla, fuera del inicio de una franja o con segundos", async () => {
      expect(await request(s, s.future, "13:00")).toEqual(
        rule("outside_hours"),
      );
      expect(await request(s, s.future, "10:15")).toEqual(
        rule("outside_hours"),
      );
      expect(await request(s, s.future, "10:00:30")).toEqual(
        rule("outside_hours"),
      );
      expect(await request(s, s.future, "11:30")).toMatchObject({ ok: true });
    });

    it("in_the_past, too_soon y too_far", async () => {
      expect(await request(s, addDays(s.today, -1), "10:00")).toEqual(
        rule("in_the_past"),
      );
      await getDb().execute(
        sql`delete from business_hours where organization_id = ${s.orgId}`,
      );
      await openEveryDay(s.orgId, true);
      // La próxima franja de la grilla del día entero empieza en menos de media hora.
      const now = (
        await getDb().execute<{ date: string; minutes: number }>(
          sql`select to_char(now() at time zone ${TIMEZONE}, 'YYYY-MM-DD') as date,
                   (extract(hour from now() at time zone ${TIMEZONE}) * 60
                    + extract(minute from now() at time zone ${TIMEZONE}))::int as minutes`,
        )
      ).rows[0]!;
      const next = Math.ceil((now.minutes + 1) / 30) * 30;
      const [date, time] =
        next > 23 * 60
          ? [addDays(now.date, 1), "00:00"]
          : [
              now.date,
              `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`,
            ];
      expect(await request(s, date, time)).toEqual(rule("too_soon"));
      expect(await request(s, addDays(s.today, 15), "10:00")).toEqual(
        rule("too_far"),
      );
      ok(await request(s, addDays(s.today, 14), "10:00"));
    });

    it("slot_full, y el reenvío de un 422 responde la misma regla aunque la franja se libere", async () => {
      const taken = await insertDirect(s, local(s.future, "16:00"));
      const payload = appointmentEvent({
        reason_id: s.reasonId,
        starts_at: await instantOf(s.future, "16:00"),
      });
      expect(await send(s.ingest, payload)).toEqual(rule("slot_full"));
      ok(await changeAppointmentStatus(s.admin, taken, "cancelled"));
      expect(await send(s.ingest, payload)).toEqual(rule("slot_full"));
      expect(
        await count(
          sql`select count(*)::int as n from appointments
            where organization_id = ${s.orgId} and created_by_credential_id is not null`,
        ),
      ).toBe(0);
    });

    it("la precedencia de los pares que las pruebas de arriba no separan", async () => {
      // not_offered antes que client_not_found: sin la capacidad, con un teléfono que no es de nadie.
      const off = await orgWith("Local C", "admin-c@example.com", false);
      expect(
        await request(off, s.future, "10:00", {}, { phone: OTHER_PHONE }),
      ).toEqual(rule("not_offered"));
      // in_the_past y too_far antes que slot_full: las dos franjas están ocupadas.
      await insertDirect(s, local(addDays(s.today, -1), "10:00"));
      await insertDirect(s, local(addDays(s.today, 15), "10:00"));
      expect(await request(s, addDays(s.today, -1), "10:00")).toEqual(
        rule("in_the_past"),
      );
      expect(await request(s, addDays(s.today, 15), "10:00")).toEqual(
        rule("too_far"),
      );
      // outside_hours antes que in_the_past: ayer, fuera de la grilla.
      expect(await request(s, addDays(s.today, -1), "13:00")).toEqual(
        rule("outside_hours"),
      );
      // reference_not_found antes que client_has_pending_request, con un producto inactivo.
      ok(await request(s, s.future, "10:00"));
      const product = ok(await createProduct(s.admin, productInput("IP14")));
      await getDb().execute(
        sql`update products set is_active = false where id = ${product.productId}`,
      );
      expect(
        await request(s, s.future, "10:30", { product_id: product.productId }),
      ).toEqual(rule("reference_not_found"));
      expect(await request(s, s.future, "10:30")).toEqual(
        rule("client_has_pending_request"),
      );
    });

    it("outside_hours por el horario de verano: la franja que termina en la hora que falta, y el instante de la hora repetida que no vuelve", async () => {
      // Nueva York, abierto el día entero. outside_hours va antes que too_far, así que una fecha de 2027
      // alcanza: la franja de 01:30 termina en la hora que falta; la de 03:00 existe y está lejos.
      await getDb().execute(
        sql`update organizations set timezone = 'America/New_York' where id = ${s.orgId}`,
      );
      await getDb().execute(
        sql`delete from business_hours where organization_id = ${s.orgId}`,
      );
      await openEveryDay(s.orgId, true);
      const at = (startsAt: string) =>
        send(
          s.ingest,
          appointmentEvent({ reason_id: s.reasonId, starts_at: startsAt }),
        );
      expect(await at("2027-03-14T06:30:00Z")).toEqual(rule("outside_hours"));
      expect(await at("2027-03-14T07:00:00Z")).toEqual(rule("too_far"));
      // La 01:30 del 1 de noviembre de 2026 pasa dos veces: uno solo de sus instantes es la franja. De a
      // uno, cancelando el que quede pedido: el pedido pendiente va antes que outside_hours.
      const repeated = [];
      for (const instant of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]) {
        repeated.push(await at(instant));
        const pending = await getDb().execute<{ id: string }>(
          sql`select id from appointments
            where organization_id = ${s.orgId} and status = 'requested'`,
        );
        for (const row of pending.rows) {
          ok(await changeAppointmentStatus(s.admin, row.id, "cancelled"));
        }
      }
      expect(
        repeated.filter(
          (result) =>
            !result.ok && "rule" in result && result.rule === "outside_hours",
        ),
      ).toHaveLength(1);
    });

    it("AC-5: un pedido del agente y un alta de la app a la vez en la última plaza dejan un turno", async () => {
      const otherClient = await returningId(
        sql`insert into clients (organization_id, display_name) values (${s.orgId}, 'Marta') returning id`,
      );
      const release = await hold(
        sql`select id from appointment_settings where organization_id = ${s.orgId} for update`,
      );
      const agent = request(s, s.future, "16:00");
      await waitForLockWaiters(1);
      const app = createAppointment(s.admin, {
        clientId: otherClient,
        reasonId: s.reasonId,
        date: s.future,
        start: "16:00",
        note: "",
      });
      await waitForLockWaiters(2);
      await release();
      const [fromAgent, fromApp] = await Promise.all([agent, app]);
      expect(fromAgent).toMatchObject({ ok: true });
      expect(fromApp).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "slot_full",
      });
      expect(
        await count(
          sql`select count(*)::int as n from appointments where organization_id = ${s.orgId}`,
        ),
      ).toBe(1);
    });
  },
);

describe(
  "la base, sin el servicio (AC-1, AC-6; D-4)",
  { timeout: TEST_TIMEOUT },
  () => {
    async function eventId() {
      return returningId(
        sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash, status, processed_at)
          values (${s.orgId}, ${SOURCE}, ${`evt-directo-${eventCount++}`}, 'appointment.requested', 'h', 'processed', now())
          returning id`,
      );
    }

    function insertByCredential(
      status: "requested" | "confirmed",
      options: { event: string | null; user: string | null },
    ) {
      return sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
          created_by, created_by_credential_id, ingestion_event_id, confirmed_at)
        values (${s.orgId}, ${s.clientId}, ${s.reasonId}, ${local(s.future, "10:00")},
          ${local(s.future, "10:30")}, ${status}, ${options.user}, ${s.ingest.credentialId},
          ${options.event}, ${status === "confirmed" ? sql`now()` : null})`;
    }

    it("un turno del agente nace pedido; un solo autor; credencial con evento", async () => {
      expect(
        await dbError(
          insertByCredential("confirmed", {
            event: await eventId(),
            user: null,
          }),
        ),
      ).toContain("un turno del agente nace pedido");
      expect(
        await dbError(
          insertByCredential("requested", {
            event: await eventId(),
            user: s.userId,
          }),
        ),
      ).toContain("appointments_one_creator");
      expect(
        await dbError(
          insertByCredential("requested", { event: null, user: null }),
        ),
      ).toContain("appointments_event_iff_credential");
      const event = await eventId();
      await getDb().execute(
        insertByCredential("requested", { event, user: null }),
      );
      expect(
        await dbError(insertByCredential("requested", { event, user: null })),
      ).toContain("appointments_ingestion_event_unique");
    });

    it("el autor y el evento no cambian después del alta", async () => {
      const result = ok(await request(s, s.future, "10:00"));
      expect(result.result).toBe("accepted");
      expect(
        await dbError(
          sql`update appointments set status = 'confirmed', confirmed_at = now(), created_by = ${s.userId}
            where organization_id = ${s.orgId}`,
        ),
      ).toContain("solo fija");
    });
  },
);

describe(
  "el turno pedido en la app (AC-7; D-5)",
  { timeout: TEST_TIMEOUT },
  () => {
    it("el calendario y el detalle muestran que lo pidió el agente, y un admin lo confirma o lo cancela", async () => {
      ok(await request(s, s.future, "10:00"));
      const calendar = ok(
        await getAppointmentCalendar(s.admin, { from: s.future, days: 1 }),
      ).calendar;
      const [requested] = calendar.days[0]!.appointments;
      expect(requested).toMatchObject({
        start: "10:00",
        status: "requested",
        byAgent: true,
      });
      const detail = ok(
        await getAppointment(s.admin, requested!.id),
      ).appointment;
      expect(detail).toMatchObject({
        createdBy: null,
        createdByName: null,
        createdByCredentialId: s.ingest.credentialId,
      });
      ok(await changeAppointmentStatus(s.admin, requested!.id, "confirmed"));
      const audit = ok(await listAppointmentAudit(s.admin, requested!.id, 1));
      expect(audit.entries.map((entry) => entry.actor.kind)).toEqual([
        "user",
        "service",
      ]);
      // Un turno que da una persona sigue siendo del equipo.
      const byApp = ok(
        await createAppointment(s.admin, {
          clientId: s.clientId,
          reasonId: s.reasonId,
          date: s.future,
          start: "11:00",
          note: "",
        }),
      );
      expect(
        ok(await getAppointment(s.admin, byApp.appointmentId)).appointment,
      ).toMatchObject({ createdBy: s.userId, createdByCredentialId: null });
      const second = ok(await request(s, addDays(s.future, 1), "10:00"));
      expect(second.result).toBe("accepted");
      // El segundo pedido del agente se cancela desde la app, y la historia lo muestra.
      const [secondId] = (
        await getDb().execute<{ id: string }>(
          sql`select id from appointments
              where organization_id = ${s.orgId} and status = 'requested'`,
        )
      ).rows.map((row) => row.id);
      ok(await changeAppointmentStatus(s.admin, secondId!, "cancelled"));
      expect(
        ok(await getAppointment(s.admin, secondId!)).appointment,
      ).toMatchObject({
        status: "cancelled",
        createdByCredentialId: s.ingest.credentialId,
      });
      const cancelAudit = ok(await listAppointmentAudit(s.admin, secondId!, 1));
      expect(cancelAudit.entries.map((entry) => entry.actor.kind)).toEqual([
        "user",
        "service",
      ]);
    });
  },
);

describe("los datos de un cliente (D-8)", { timeout: TEST_TIMEOUT }, () => {
  it("la exportación trae el turno pedido, y el vaciado no lo toca porque no tiene nota", async () => {
    ok(await request(s, s.future, "10:00"));
    const exported = await exportClientData(getDb(), s.orgId, s.clientId);
    expect(exported.appointments).toMatchObject([{ status: "requested" }]);
    const erased = await eraseClientData(getDb(), s.orgId, s.clientId);
    expect(erased.appointments).toBe(0);
    expect(
      await count(
        sql`select count(*)::int as n from appointments
            where client_id = ${s.clientId} and status::text = 'requested'`,
      ),
    ).toBe(1);
  });
});
