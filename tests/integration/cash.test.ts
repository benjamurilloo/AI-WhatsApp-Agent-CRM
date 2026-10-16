import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  closeCashSession,
  createInitialPaymentMethods,
  createPaymentMethod,
  deactivatePaymentMethod,
  getCashSession,
  getCashState,
  getOpeningProposal,
  listCashSessionAudit,
  listCashSessions,
  listPaymentMethods,
  MAX_ACTIVE_PAYMENT_METHODS,
  openCashSession,
  parseCashSessionNumberSearch,
  previewCashClosing,
  reactivatePaymentMethod,
  recordCashMovement,
  renamePaymentMethod,
  type CashAmountInput,
} from "@/modules/cash";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Los medios de pago y la caja contra PostgreSQL real (brief-21.2): los medios (AC-2), la apertura,
// los movimientos y el cierre (AC-3), los rechazos (AC-4), la serialización (AC-5) y las lecturas
// (AC-6). Los helpers son los de sales.test.ts.

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
  name: string,
  role: "admin" | "viewer",
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${name}) returning id`,
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
  await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  return {
    orgA,
    orgB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

const ars = (amount: string): CashAmountInput => ({ currency: "ARS", amount });

async function open(
  context: AuthContext,
  rows: CashAmountInput[] = [ars("1000")],
) {
  const result = await openCashSession(context, { rows });
  if (!result.ok)
    throw new Error(`apertura rechazada: ${JSON.stringify(result)}`);
  return result.session;
}

async function move(
  context: AuthContext,
  sessionId: string,
  kind: "contribution" | "withdrawal",
  amount: string,
  { currency = "ARS", reason }: { currency?: string; reason?: string } = {},
) {
  return recordCashMovement(context, {
    sessionId,
    kind,
    currency,
    amount,
    reason:
      reason ?? (kind === "contribution" ? "change_fund" : "bank_deposit"),
  });
}

// Lo que quedó escrito, para comprobar que un rechazo no escribe, numera ni audita.
async function snapshot() {
  const result = await getDb().execute<{
    sessions: number;
    opening: number;
    closings: number;
    closing_amounts: number;
    movements: number;
    methods: number;
    audits: number;
    counter: number | null;
  }>(
    sql`select
          (select count(*)::int from cash_sessions) as sessions,
          (select count(*)::int from cash_session_opening_amounts) as opening,
          (select count(*)::int from cash_session_closings) as closings,
          (select count(*)::int from cash_session_closing_amounts) as closing_amounts,
          (select count(*)::int from cash_movements) as movements,
          (select count(*)::int from payment_methods) as methods,
          (select count(*)::int from audit_logs) as audits,
          (select max(last_number)::int from document_counters where kind = 'cash_session')
            as counter`,
  );
  return result.rows[0]!;
}

async function auditsOf(entityType: string) {
  const result = await getDb().execute<{
    action: string;
    entity_id: string;
    diff: { before: unknown; after: Record<string, unknown> };
  }>(
    sql`select action, entity_id, diff from audit_logs
        where entity_type = ${entityType} order by created_at, id`,
  );
  return result.rows;
}

// Bloqueos retenidos del test en curso, como en sales.test.ts.
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

function cashLock(organizationId: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`cash:${organizationId}`}, 0))`;
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterEach(async () => {
  await Promise.all(heldLocks.splice(0).map((releaseLock) => releaseLock()));
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los medios de pago (AC-2; ADR 0022, punto 10)", () => {
  it("crea la lista inicial con la lista vacía, sin Mercado Pago, y la audita", async () => {
    const s = await seed();
    expect(await createInitialPaymentMethods(s.adminA)).toEqual({
      ok: true,
      created: 4,
    });
    const listed = await listPaymentMethods(s.viewerA);
    if (!listed.ok) throw new Error("lista rechazada");
    expect(
      listed.paymentMethods.map(({ name, isCash, isActive }) => ({
        name,
        isCash,
        isActive,
      })),
    ).toEqual([
      { name: "Efectivo", isCash: true, isActive: true },
      { name: "Tarjeta de crédito", isCash: false, isActive: true },
      { name: "Tarjeta de débito", isCash: false, isActive: true },
      { name: "Transferencia", isCash: false, isActive: true },
    ]);
    // Un alta auditada por medio, en la misma transacción.
    const audits = await auditsOf("payment_method");
    expect(audits.map((row) => row.action)).toEqual([
      "create",
      "create",
      "create",
      "create",
    ]);
    expect(audits.map((row) => row.diff)).toContainEqual({
      before: null,
      after: { name: "Efectivo", isCash: true, isActive: true },
    });
    // Otra organización tiene su propia lista, vacía.
    const other = await listPaymentMethods(s.adminB);
    expect(other).toEqual({ ok: true, paymentMethods: [] });
  });

  it("con algún medio creado, aun inactivo, la lista inicial se rechaza sin escribir", async () => {
    const s = await seed();
    const created = await createPaymentMethod(s.adminA, {
      name: "Cheque",
      isCash: false,
    });
    if (!created.ok) throw new Error("alta rechazada");
    await deactivatePaymentMethod(s.adminA, created.paymentMethodId);
    const before = await snapshot();
    expect(await createInitialPaymentMethods(s.adminA)).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "list_not_empty",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("crea, renombra, desactiva y reactiva, con su auditoría", async () => {
    const s = await seed();
    const created = await createPaymentMethod(s.adminA, {
      name: "  Cheque  ",
      isCash: false,
    });
    if (!created.ok) throw new Error("alta rechazada");
    const id = created.paymentMethodId;
    expect(await renamePaymentMethod(s.adminA, id, { name: "Cheque" })).toEqual(
      {
        ok: true,
        changed: false,
      },
    );
    expect(
      await renamePaymentMethod(s.adminA, id, { name: "Cheque diferido" }),
    ).toEqual({ ok: true, changed: true });
    expect(await deactivatePaymentMethod(s.adminA, id)).toEqual({
      ok: true,
      changed: true,
    });
    expect(await deactivatePaymentMethod(s.adminA, id)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await reactivatePaymentMethod(s.adminA, id)).toEqual({
      ok: true,
      changed: true,
    });
    expect(
      (await auditsOf("payment_method")).map((row) => ({
        action: row.action,
        diff: row.diff,
      })),
    ).toEqual([
      {
        action: "create",
        diff: {
          before: null,
          after: { name: "Cheque", isCash: false, isActive: true },
        },
      },
      {
        action: "update",
        diff: {
          before: { name: "Cheque" },
          after: { name: "Cheque diferido" },
        },
      },
      {
        action: "deactivate",
        diff: { before: { isActive: true }, after: { isActive: false } },
      },
      {
        action: "reactivate",
        diff: { before: { isActive: false }, after: { isActive: true } },
      },
    ]);
  });

  it("rechaza un nombre repetido, también contra un inactivo y con otras mayúsculas", async () => {
    const s = await seed();
    const created = await createPaymentMethod(s.adminA, {
      name: "Cheque",
      isCash: false,
    });
    if (!created.ok) throw new Error("alta rechazada");
    await deactivatePaymentMethod(s.adminA, created.paymentMethodId);
    const before = await snapshot();
    expect(
      await createPaymentMethod(s.adminA, { name: "CHEQUE", isCash: true }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "duplicate_name",
    });
    const other = await createPaymentMethod(s.adminA, {
      name: "Vale",
      isCash: false,
    });
    if (!other.ok) throw new Error("alta rechazada");
    expect(
      await renamePaymentMethod(s.adminA, other.paymentMethodId, {
        name: "cheque",
      }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "duplicate_name",
    });
    // Solo el alta de «Vale» y su auditoría.
    expect(await snapshot()).toEqual({
      ...before,
      methods: before.methods + 1,
      audits: before.audits + 1,
    });
  });

  it(`hasta ${MAX_ACTIVE_PAYMENT_METHODS} activos: el alta y la reactivación se rechazan`, async () => {
    const s = await seed();
    const ids: string[] = [];
    for (let i = 1; i <= MAX_ACTIVE_PAYMENT_METHODS; i++) {
      const created = await createPaymentMethod(s.adminA, {
        name: `Medio ${i}`,
        isCash: false,
      });
      if (!created.ok) throw new Error("alta rechazada");
      ids.push(created.paymentMethodId);
    }
    expect(
      await createPaymentMethod(s.adminA, { name: "Uno más", isCash: false }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "limit_reached",
    });
    await deactivatePaymentMethod(s.adminA, ids[0]!);
    const created = await createPaymentMethod(s.adminA, {
      name: "Uno más",
      isCash: false,
    });
    expect(created.ok).toBe(true);
    expect(await reactivatePaymentMethod(s.adminA, ids[0]!)).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "limit_reached",
    });
  });

  it("un viewer no escribe, y un medio de otra organización no se encuentra", async () => {
    const s = await seed();
    await createInitialPaymentMethods(s.adminA);
    const listed = await listPaymentMethods(s.adminA);
    if (!listed.ok) throw new Error("lista rechazada");
    const id = listed.paymentMethods[0]!.id;
    const before = await snapshot();
    expect(await createInitialPaymentMethods(s.viewerA)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      await createPaymentMethod(s.viewerA, { name: "Vale", isCash: false }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      await renamePaymentMethod(s.viewerA, id, { name: "Contado" }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await deactivatePaymentMethod(s.viewerA, id)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await reactivatePaymentMethod(s.viewerA, id)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      await renamePaymentMethod(s.adminB, id, { name: "Contado" }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await deactivatePaymentMethod(s.adminB, id)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await deactivatePaymentMethod(s.adminA, "no-es-un-id")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(
      await createPaymentMethod(s.adminA, { name: " ", isCash: false }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["name"] });
    expect(
      await createPaymentMethod(s.adminA, {
        name: "x".repeat(41),
        isCash: false,
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["name"] });
    expect(await snapshot()).toEqual(before);
  });
});

describe("la apertura, los movimientos y el cierre (AC-3; ADR 0022, punto 8)", () => {
  it("abre C-000001 con su inicial, que acepta cero, y lo audita", async () => {
    const s = await seed();
    const session = await open(s.adminA, [
      { currency: "usd", amount: "0" },
      ars("10.000,50"),
    ]);
    expect(session).toMatchObject({ number: 1, displayNumber: "C-000001" });
    const state = await getCashState(s.adminA);
    if (!state.ok || !state.open) throw new Error("caja cerrada");
    expect(state.open.currencies).toEqual([
      {
        currency: "ARS",
        initial: "10000.50",
        receipts: "0.00",
        // Desde la 21.5 (brief-21.5, D-6).
        receiptVoids: "0.00",
        refunds: "0.00",
        refundVoids: "0.00",
        // Desde la 22.6 (brief-22.6, D-9).
        supplierPayments: "0.00",
        supplierPaymentVoids: "0.00",
        contributions: "0.00",
        withdrawals: "0.00",
        expected: "10000.50",
        counted: null,
        difference: null,
      },
      {
        currency: "USD",
        initial: "0.00",
        receipts: "0.00",
        // Desde la 21.5 (brief-21.5, D-6).
        receiptVoids: "0.00",
        refunds: "0.00",
        refundVoids: "0.00",
        // Desde la 22.6 (brief-22.6, D-9).
        supplierPayments: "0.00",
        supplierPaymentVoids: "0.00",
        contributions: "0.00",
        withdrawals: "0.00",
        expected: "0.00",
        counted: null,
        difference: null,
      },
    ]);
    expect(state.open.openedByName).toBe("Ana");
    expect(await auditsOf("cash_session")).toEqual([
      {
        action: "create",
        entity_id: session.id,
        diff: {
          before: null,
          after: { number: 1, opening_ARS: "10000.50", opening_USD: "0.00" },
        },
      },
    ]);
  });

  it("lo esperado suma y resta por moneda, sin mezclarlas; un aporte en otra moneda parte de cero", async () => {
    const s = await seed();
    const session = await open(s.adminA, [ars("1000")]);
    expect(
      await move(s.adminA, session.id, "contribution", "500"),
    ).toMatchObject({ ok: true });
    expect(
      await move(s.adminA, session.id, "withdrawal", "300", {
        reason: "owner_withdrawal",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await move(s.adminA, session.id, "contribution", "20", {
        currency: "USD",
        reason: "owner_contribution",
      }),
    ).toMatchObject({ ok: true });
    const state = await getCashState(s.viewerA);
    if (!state.ok || !state.open) throw new Error("caja cerrada");
    expect(
      state.open.currencies.map(({ currency, expected }) => ({
        currency,
        expected,
      })),
    ).toEqual([
      { currency: "ARS", expected: "1200.00" },
      { currency: "USD", expected: "20.00" },
    ]);
    expect(
      state.open.movements.map(
        ({ kind, reason, currency, amount, createdByName }) => ({
          kind,
          reason,
          currency,
          amount,
          createdByName,
        }),
      ),
    ).toEqual([
      {
        kind: "contribution",
        reason: "change_fund",
        currency: "ARS",
        amount: "500.00",
        createdByName: "Ana",
      },
      {
        kind: "withdrawal",
        reason: "owner_withdrawal",
        currency: "ARS",
        amount: "300.00",
        createdByName: "Ana",
      },
      {
        kind: "contribution",
        reason: "owner_contribution",
        currency: "USD",
        amount: "20.00",
        createdByName: "Ana",
      },
    ]);
    // Los movimientos no se auditan aparte (D-5): solo la apertura.
    expect(await auditsOf("cash_session")).toHaveLength(1);
  });

  it("un retiro que dejaría lo esperado negativo se rechaza con lo esperado, sin escribir", async () => {
    const s = await seed();
    const session = await open(s.adminA, [ars("100")]);
    await move(s.adminA, session.id, "withdrawal", "60");
    const before = await snapshot();
    expect(await move(s.adminA, session.id, "withdrawal", "40,01")).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "insufficient_cash",
      currency: "ARS",
      expected: "40.00",
    });
    // Una moneda sin inicial ni aportes tiene cero.
    expect(
      await move(s.adminA, session.id, "withdrawal", "1", { currency: "USD" }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "insufficient_cash",
      currency: "USD",
      expected: "0.00",
    });
    expect(await snapshot()).toEqual(before);
    // Hasta cero, sí.
    expect(await move(s.adminA, session.id, "withdrawal", "40")).toMatchObject({
      ok: true,
    });
  });

  it("cierra con lo contado y lo esperado de cada moneda, y lo audita", async () => {
    const s = await seed();
    const session = await open(s.adminA, [
      ars("1000"),
      { currency: "USD", amount: "10" },
    ]);
    await move(s.adminA, session.id, "contribution", "500");
    await move(s.adminA, session.id, "withdrawal", "200");
    const closed = await closeCashSession(s.adminA, {
      sessionId: session.id,
      rows: [
        ars("1290"),
        { currency: "USD", amount: "10" },
        { currency: "EUR", amount: "5" },
      ],
    });
    expect(closed).toEqual({ ok: true, session });
    const detail = await getCashSession(s.viewerA, session.id);
    if (!detail.ok) throw new Error("detalle rechazado");
    expect(detail.session.closedByName).toBe("Ana");
    expect(detail.session.closedAt).not.toBeNull();
    expect(
      detail.session.currencies.map(
        ({ currency, expected, counted, difference }) => ({
          currency,
          expected,
          counted,
          difference,
        }),
      ),
    ).toEqual(
      [
        // Una moneda que apareció al contar, con lo esperado en cero (D-4).
        {
          currency: "EUR",
          expected: "0.00",
          counted: "5.00",
          difference: { sign: "positive", amount: "5.00" },
        },
        {
          currency: "ARS",
          expected: "1300.00",
          counted: "1290.00",
          difference: { sign: "negative", amount: "10.00" },
        },
        {
          currency: "USD",
          expected: "10.00",
          counted: "10.00",
          difference: { sign: "zero", amount: "0.00" },
        },
      ].sort((a, b) => (a.currency < b.currency ? -1 : 1)),
    );
    const audits = await auditsOf("cash_session");
    expect(audits[1]).toEqual({
      action: "close",
      entity_id: session.id,
      diff: {
        before: {
          counted_ARS: null,
          expected_ARS: null,
          counted_EUR: null,
          expected_EUR: null,
          counted_USD: null,
          expected_USD: null,
        },
        after: {
          counted_ARS: "1290.00",
          expected_ARS: "1300.00",
          counted_EUR: "5.00",
          expected_EUR: "0.00",
          counted_USD: "10.00",
          expected_USD: "10.00",
        },
      },
    });
    const state = await getCashState(s.adminA);
    expect(state).toEqual({ ok: true, open: null, last: session });
  });

  it("el cierre exige contar cada moneda con inicial o movimientos, y acepta cero", async () => {
    const s = await seed();
    const session = await open(s.adminA, [ars("0")]);
    await move(s.adminA, session.id, "contribution", "5", { currency: "USD" });
    const before = await snapshot();
    expect(
      await closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [ars("0")],
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      reason: "missing",
      issues: [],
      missing: ["USD"],
    });
    expect(await snapshot()).toEqual(before);
    expect(
      await closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [ars("0"), { currency: "USD", amount: "0" }],
      }),
    ).toMatchObject({ ok: true });
  });

  it("la vista previa del cierre muestra la diferencia sin escribir nada", async () => {
    const s = await seed();
    const session = await open(s.adminA, [ars("100")]);
    const before = await snapshot();
    expect(
      await previewCashClosing(s.adminA, {
        sessionId: session.id,
        rows: [ars("90"), { currency: "USD", amount: "1" }],
      }),
    ).toEqual({
      ok: true,
      session,
      rows: [
        {
          currency: "ARS",
          expected: "100.00",
          counted: "90.00",
          difference: { sign: "negative", amount: "10.00" },
        },
        {
          currency: "USD",
          expected: "0.00",
          counted: "1.00",
          difference: { sign: "positive", amount: "1.00" },
        },
      ],
    });
    expect(
      await previewCashClosing(s.adminA, { sessionId: session.id, rows: [] }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      reason: "missing",
      issues: [],
      missing: ["ARS"],
    });
    expect(
      await previewCashClosing(s.viewerA, {
        sessionId: session.id,
        rows: [ars("100")],
      }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await snapshot()).toEqual(before);
    await closeCashSession(s.adminA, {
      sessionId: session.id,
      rows: [ars("100")],
    });
    expect(
      await previewCashClosing(s.adminA, {
        sessionId: session.id,
        rows: [ars("100")],
      }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_closed",
      session,
    });
  });

  it("la sesión siguiente se encadena y la apertura propone lo contado", async () => {
    const s = await seed();
    expect(await getOpeningProposal(s.adminA)).toEqual({
      ok: true,
      open: null,
      proposal: [],
    });
    const first = await open(s.adminA, [ars("100")]);
    expect(await getOpeningProposal(s.adminA)).toEqual({
      ok: true,
      open: first,
      proposal: [],
    });
    await closeCashSession(s.adminA, {
      sessionId: first.id,
      rows: [ars("95,5"), { currency: "USD", amount: "3" }],
    });
    expect(await getOpeningProposal(s.adminA)).toEqual({
      ok: true,
      open: null,
      proposal: [
        { currency: "ARS", amount: "95.50" },
        { currency: "USD", amount: "3.00" },
      ],
    });
    const second = await open(s.adminA, [ars("95.50")]);
    expect(second.displayNumber).toBe("C-000002");
    const chain = await getDb().execute<{ previous: string | null }>(
      sql`select previous_session_id as previous from cash_sessions where id = ${second.id}`,
    );
    expect(chain.rows[0]!.previous).toBe(first.id);
    // Otra organización numera aparte.
    expect((await open(s.adminB)).displayNumber).toBe("C-000001");
  });
});

describe("los rechazos (AC-4)", () => {
  it("una segunda apertura con la caja abierta: already_open, sin numerar", async () => {
    const s = await seed();
    const session = await open(s.adminA);
    const before = await snapshot();
    expect(await openCashSession(s.adminA, { rows: [ars("1")] })).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_open",
      session,
    });
    expect(await snapshot()).toEqual(before);
  });

  it("las filas de la apertura: sin filas, moneda desconocida o repetida, monto inválido", async () => {
    const s = await seed();
    const before = await snapshot();
    expect(
      await openCashSession(s.adminA, {
        rows: [{ currency: "", amount: "" }],
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      reason: "no_rows",
      issues: [],
      missing: [],
    });
    expect(
      await openCashSession(s.adminA, {
        rows: [
          { currency: "XYZ", amount: "1" },
          ars("1"),
          ars("2"),
          { currency: "USD", amount: "-1" },
          { currency: "EUR", amount: "" },
          { currency: "", amount: "5" },
          { currency: "CLP", amount: "1,5" },
        ],
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      reason: "rows",
      issues: [
        { position: 1, field: "currency", problem: "currency" },
        { position: 3, field: "currency", problem: "duplicate" },
        { position: 4, field: "amount", problem: "invalid" },
        { position: 5, field: "amount", problem: "required" },
        { position: 6, field: "currency", problem: "required" },
        { position: 7, field: "amount", problem: "separator" },
      ],
      missing: [],
    });
    expect(await snapshot()).toEqual(before);
  });

  it("los movimientos: campos inválidos, sesión cerrada, de otra organización o inexistente", async () => {
    const s = await seed();
    const session = await open(s.adminA);
    const before = await snapshot();
    expect(
      await recordCashMovement(s.adminA, {
        sessionId: session.id,
        kind: "expense",
        currency: "XYZ",
        amount: "",
        reason: "other",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["kind", "currency", "amount", "reason"],
    });
    expect(await move(s.adminA, session.id, "contribution", "0")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amount: "zero",
    });
    expect(
      await move(s.adminA, session.id, "contribution", "10", {
        reason: "bank_deposit",
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["reason"] });
    expect(await move(s.adminA, "no-es-un-id", "contribution", "10")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await move(s.adminB, session.id, "contribution", "10")).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await move(s.adminA, crypto.randomUUID(), "contribution", "10"),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await snapshot()).toEqual(before);

    await closeCashSession(s.adminA, {
      sessionId: session.id,
      rows: [ars("1000")],
    });
    const closed = await snapshot();
    expect(await move(s.adminA, session.id, "contribution", "10")).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_closed",
      session,
    });
    expect(
      await closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [ars("1000")],
      }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_closed",
      session,
    });
    expect(await snapshot()).toEqual(closed);
  });

  it("un aporte que pasaría lo que cabe en numeric(14, 2) se rechaza", async () => {
    const s = await seed();
    const session = await open(s.adminA, [ars("999999999999")]);
    expect(await move(s.adminA, session.id, "contribution", "1")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amount: "limit",
    });
  });

  it("un viewer no abre, no mueve ni cierra", async () => {
    const s = await seed();
    const session = await open(s.adminA);
    const before = await snapshot();
    expect(await openCashSession(s.viewerA, { rows: [ars("1")] })).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await move(s.viewerA, session.id, "contribution", "1")).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      await closeCashSession(s.viewerA, {
        sessionId: session.id,
        rows: [ars("1000")],
      }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await getOpeningProposal(s.viewerA)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await snapshot()).toEqual(before);
  });
});

describe("la serialización (AC-5; ADR 0022, punto 4)", () => {
  // Cada camino espera el bloqueo de cobros retenido desde otra conexión: sin él, la escritura no
  // esperaría y waitForLockWaiters vencería.
  async function waitsForCashLock<T>(
    organizationId: string,
    write: () => Promise<T>,
  ): Promise<T> {
    const release = await hold(cashLock(organizationId));
    const writing = write();
    let settled = false;
    void writing.then(
      () => (settled = true),
      () => (settled = true),
    );
    await waitForLockWaiters(1);
    expect(settled).toBe(false);
    await release();
    return writing;
  }

  it(
    "la apertura, los movimientos, el cierre y los medios de pago esperan el bloqueo",
    async () => {
      const s = await seed();
      const session = await waitsForCashLock(s.orgA, () =>
        openCashSession(s.adminA, { rows: [ars("100")] }),
      );
      if (!session.ok) throw new Error("apertura rechazada");
      const id = session.session.id;
      expect(
        await waitsForCashLock(s.orgA, () =>
          move(s.adminA, id, "contribution", "10"),
        ),
      ).toMatchObject({ ok: true });
      expect(
        await waitsForCashLock(s.orgA, () =>
          move(s.adminA, id, "withdrawal", "10"),
        ),
      ).toMatchObject({ ok: true });
      expect(
        await waitsForCashLock(s.orgA, () =>
          closeCashSession(s.adminA, { sessionId: id, rows: [ars("100")] }),
        ),
      ).toMatchObject({ ok: true });
      expect(
        await waitsForCashLock(s.orgA, () =>
          createInitialPaymentMethods(s.adminA),
        ),
      ).toMatchObject({ ok: true });
      const created = await waitsForCashLock(s.orgA, () =>
        createPaymentMethod(s.adminA, { name: "Vale", isCash: false }),
      );
      if (!created.ok) throw new Error("alta rechazada");
      expect(
        await waitsForCashLock(s.orgA, () =>
          renamePaymentMethod(s.adminA, created.paymentMethodId, {
            name: "Vale de compra",
          }),
        ),
      ).toMatchObject({ ok: true, changed: true });
      expect(
        await waitsForCashLock(s.orgA, () =>
          deactivatePaymentMethod(s.adminA, created.paymentMethodId),
        ),
      ).toMatchObject({ ok: true, changed: true });
      expect(
        await waitsForCashLock(s.orgA, () =>
          reactivatePaymentMethod(s.adminA, created.paymentMethodId),
        ),
      ).toMatchObject({ ok: true, changed: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "el bloqueo es por organización: la caja de otra no espera",
    async () => {
      const s = await seed();
      await hold(cashLock(s.orgA));
      expect(
        await openCashSession(s.adminB, { rows: [ars("1")] }),
      ).toMatchObject({
        ok: true,
      });
    },
    TEST_TIMEOUT,
  );

  // Los escenarios simultáneos son deterministas (revisión independiente de la 21.2, R-6): el
  // bloqueo se retiene desde otra conexión hasta que las dos escrituras esperan, en orden de
  // llegada, y se libera. Sin el bloqueo, las dos leerían el mismo estado.
  async function queued<A, B>(
    organizationId: string,
    first: () => Promise<A>,
    second: () => Promise<B>,
  ): Promise<[A, B]> {
    const release = await hold(cashLock(organizationId));
    const a = first();
    await waitForLockWaiters(1);
    const b = second();
    await waitForLockWaiters(2);
    await release();
    return Promise.all([a, b]);
  }

  it(
    "dos aperturas en cola: una sesión y un already_open",
    async () => {
      const s = await seed();
      const [opened, rejected] = await queued(
        s.orgA,
        () => openCashSession(s.adminA, { rows: [ars("1")] }),
        () => openCashSession(s.adminA, { rows: [ars("2")] }),
      );
      expect(opened).toMatchObject({
        ok: true,
        session: { displayNumber: "C-000001" },
      });
      expect(rejected).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_open",
        session: { displayNumber: "C-000001" },
      });
      // La segunda no tomó número.
      const after = await snapshot();
      expect(after.sessions).toBe(1);
      expect(after.counter).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "un movimiento antes que el cierre, en cola: el arqueo lo cuenta",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [ars("100")]);
      const [moved, closed] = await queued(
        s.orgA,
        () => move(s.adminA, session.id, "contribution", "50"),
        () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [ars("150")],
          }),
      );
      expect(moved).toMatchObject({ ok: true });
      expect(closed).toMatchObject({ ok: true });
      const detail = await getCashSession(s.adminA, session.id);
      if (!detail.ok) throw new Error("detalle rechazado");
      expect(detail.session.currencies[0]).toMatchObject({
        expected: "150.00",
        counted: "150.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "un cierre antes que el movimiento, en cola: el movimiento se rechaza y no cae en otra sesión",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [ars("100")]);
      const [closed, moved] = await queued(
        s.orgA,
        () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [ars("100")],
          }),
        () => move(s.adminA, session.id, "contribution", "50"),
      );
      expect(closed).toMatchObject({ ok: true });
      expect(moved).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_closed",
        session,
      });
      expect((await snapshot()).movements).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "dos retiros en cola que juntos dejarían lo esperado negativo: uno y un insufficient_cash",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [ars("100")]);
      const [first, second] = await queued(
        s.orgA,
        () => move(s.adminA, session.id, "withdrawal", "70"),
        () => move(s.adminA, session.id, "withdrawal", "70"),
      );
      expect(first).toMatchObject({ ok: true });
      expect(second).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_cash",
        currency: "ARS",
        expected: "30.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "si el índice de la primera sesión se dispara, la respuesta es already_open",
    async () => {
      const s = await seed();
      const owner = await getDb().execute<{ id: string }>(
        sql`select id from users where email = 'admin-a@example.com'`,
      );
      // El contador nace en 0, para poder retenerlo antes de la primera sesión.
      await getDb().execute(
        sql`insert into document_counters (organization_id, kind, last_number)
            values (${s.orgA}, 'cash_session', 0)`,
      );
      const release = await hold(
        sql`select 1 from document_counters where kind = 'cash_session' for update`,
      );
      const opening = openCashSession(s.adminA, { rows: [ars("2")] });
      await waitForLockWaiters(1);
      // Una primera sesión por un camino que no toma el bloqueo.
      await getDb().execute(
        sql`insert into cash_sessions (organization_id, number, opened_by)
            values (${s.orgA}, 99, ${owner.rows[0]!.id})`,
      );
      await release();
      expect(await opening).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_open",
        session: { number: 99 },
      });
      expect((await snapshot()).counter).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "si el índice de la cadena se dispara, la respuesta es already_open y no se consume número",
    async () => {
      const s = await seed();
      // Una primera sesión, cerrada, crea la fila del contador para poder retenerla.
      const first = await open(s.adminA, [ars("1")]);
      await closeCashSession(s.adminA, {
        sessionId: first.id,
        rows: [ars("1")],
      });
      // Con el contador retenido, la apertura ya tomó el bloqueo y vio la caja cerrada. Mientras
      // tanto aparece una sesión siguiente por un camino que no toma el bloqueo, y la apertura choca
      // con cash_sessions_previous_unique al insertar: el rescate es una defensa de respaldo.
      const release = await hold(
        sql`select 1 from document_counters where kind = 'cash_session' for update`,
      );
      const opening = openCashSession(s.adminA, { rows: [ars("2")] });
      await waitForLockWaiters(1);
      await getDb().execute(
        sql`insert into cash_sessions (organization_id, number, previous_session_id, opened_by)
            select organization_id, 99, id, opened_by from cash_sessions where id = ${first.id}`,
      );
      await release();
      expect(await opening).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_open",
        session: { number: 99, displayNumber: "C-000099" },
      });
      expect((await snapshot()).counter).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "si otro cierre escribió antes sus filas por moneda, la respuesta es already_closed",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [ars("1")]);
      const owner = await getDb().execute<{ opened_by: string }>(
        sql`select opened_by from cash_sessions where id = ${session.id}`,
      );
      // Un cierre completo sin confirmar, por un camino que no toma el bloqueo: el del servicio
      // espera en la clave primaria de sus filas por moneda y choca ahí (R-7).
      const release = await hold(
        sql`insert into cash_session_closing_amounts (organization_id, session_id, currency,
                                                      counted, expected)
            values (${s.orgA}, ${session.id}, 'ARS', '1', '1')`,
        sql`insert into cash_session_closings (organization_id, session_id, closed_by)
            values (${s.orgA}, ${session.id}, ${owner.rows[0]!.opened_by})`,
      );
      const closing = closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [ars("1")],
      });
      await waitForLockWaiters(1);
      await release();
      expect(await closing).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_closed",
        session,
      });
      expect((await snapshot()).closing_amounts).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "si el único del cierre se dispara, la respuesta es already_closed",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [ars("1")]);
      const owner = await getDb().execute<{ opened_by: string }>(
        sql`select opened_by from cash_sessions where id = ${session.id}`,
      );
      // Otra transacción, sin el bloqueo, retiene la sesión y deja su cierre sin confirmar: el
      // cierre del servicio no lo ve, escribe sus filas por moneda y espera la sesión en su clave
      // foránea. Al confirmarse el otro, choca con cash_session_closings_session_unique.
      const release = await hold(
        sql`select 1 from cash_sessions where id = ${session.id} for update`,
        sql`insert into cash_session_closings (organization_id, session_id, closed_by)
            values (${s.orgA}, ${session.id}, ${owner.rows[0]!.opened_by})`,
      );
      const closing = closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [ars("1")],
      });
      await waitForLockWaiters(1);
      await release();
      expect(await closing).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_closed",
        session,
      });
      expect((await snapshot()).closing_amounts).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe("las correcciones de la revisión independiente", () => {
  it("R-5: si lo esperado cambió desde la confirmación, el cierre no se guarda", async () => {
    const s = await seed();
    const session = await open(s.adminA, [ars("100")]);
    // Lo que mostró la confirmación.
    const shown = [{ currency: "ARS", amount: "100.00" }];
    // Mientras tanto, otro admin registra un aporte.
    await move(s.adminA, session.id, "contribution", "10");
    const before = await snapshot();
    expect(
      await closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [ars("100")],
        confirmedExpected: shown,
      }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "expected_changed",
    });
    expect(await snapshot()).toEqual(before);
    // Con lo esperado de ahora, sí.
    expect(
      await closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [ars("110")],
        confirmedExpected: [{ currency: "ARS", amount: "110.00" }],
      }),
    ).toMatchObject({ ok: true });
  });

  it("R-2: la apertura acepta lo que propone en una moneda sin decimales", async () => {
    const s = await seed();
    const first = await open(s.adminA, [{ currency: "CLP", amount: "7400" }]);
    await closeCashSession(s.adminA, {
      sessionId: first.id,
      rows: [{ currency: "CLP", amount: "7400" }, ars("10,5")],
    });
    const proposal = await getOpeningProposal(s.adminA);
    if (!proposal.ok) throw new Error("propuesta rechazada");
    expect(proposal.proposal).toEqual([
      { currency: "ARS", amount: "10.50" },
      { currency: "CLP", amount: "7400" },
    ]);
    expect(
      await openCashSession(s.adminA, { rows: proposal.proposal }),
    ).toMatchObject({ ok: true, session: { displayNumber: "C-000002" } });
  });
});

describe("las lecturas (AC-6)", () => {
  it("la lista de sesiones, de la más nueva a la más vieja, con la diferencia y la búsqueda", async () => {
    const s = await seed();
    const first = await open(s.adminA, [ars("100")]);
    await closeCashSession(s.adminA, {
      sessionId: first.id,
      rows: [ars("90")],
    });
    const second = await open(s.adminA, [ars("90")]);
    const page = await listCashSessions(s.viewerA, { number: "", page: 1 });
    if (!page.ok) throw new Error("lista rechazada");
    expect(page.total).toBe(2);
    expect(page.sessions.map((row) => row.displayNumber)).toEqual([
      "C-000002",
      "C-000001",
    ]);
    expect(page.sessions[0]).toMatchObject({
      id: second.id,
      closedAt: null,
      closedByName: null,
      openedByName: "Ana",
      differences: [],
    });
    expect(page.sessions[1]!.differences).toEqual([
      { currency: "ARS", sign: "negative", amount: "10.00" },
    ]);
    for (const text of ["C-000001", "c1", "000001", "1"]) {
      const found = await listCashSessions(s.viewerA, {
        number: text,
        page: 1,
      });
      if (!found.ok) throw new Error("lista rechazada");
      expect(
        found.sessions.map((row) => row.id),
        text,
      ).toEqual([first.id]);
    }
    expect(
      await listCashSessions(s.viewerA, { number: "V-000001", page: 1 }),
    ).toMatchObject({ ok: true, sessions: [], total: 0 });
    // Otra organización no ve estas sesiones.
    expect(
      await listCashSessions(s.adminB, { number: "", page: 1 }),
    ).toMatchObject({ total: 0 });
    expect(await getCashSession(s.adminB, first.id)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("los dos roles ven la historia de una sesión: la apertura y el cierre", async () => {
    const s = await seed();
    const session = await open(s.adminA, [ars("100")]);
    await closeCashSession(s.adminA, {
      sessionId: session.id,
      rows: [ars("100")],
    });
    for (const context of [s.adminA, s.viewerA]) {
      const history = await listCashSessionAudit(context, session.id, 1);
      if (!history.ok) throw new Error("historia rechazada");
      expect(history.entries.map((entry) => entry.action).sort()).toEqual([
        "close",
        "create",
      ]);
      expect(history.entries[0]!.actor).toMatchObject({ name: "Ana" });
    }
    expect(await listCashSessionAudit(s.adminB, session.id, 1)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("el número de búsqueda de una sesión", () => {
    expect(parseCashSessionNumberSearch("C-000045")).toBe(45);
    expect(parseCashSessionNumberSearch(" c45 ")).toBe(45);
    expect(parseCashSessionNumberSearch("0")).toBeNull();
    expect(parseCashSessionNumberSearch("A-000045")).toBeNull();
  });
});
