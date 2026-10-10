import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  COSTS_PAGE_SIZE,
  getProductCostSummary,
  listProductAudit,
  listProductCosts,
  setProductCost,
  setProductPrice,
  type CostInput,
} from "@/modules/catalog";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Costo y margen contra PostgreSQL real (brief-18.2): la tabla de solo inserción (AC-1), fijar el
// costo con auditoría y concurrencia (AC-2 y AC-6), y las lecturas del vigente, del margen y del
// historial, solo para admin (AC-3). Los helpers son los de product-prices.test.ts.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 20000;
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
  mustChangePassword = false,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${name}, ${mustChangePassword}) returning id`,
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

async function insertProduct(
  organizationId: string,
  sku = "CAF-250",
  isActive = true,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, is_active)
        values (${organizationId}, ${sku}, 'Café molido 250 g', ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

// Organización A con admin, viewer y un admin con contraseña pendiente; B con su admin.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const adminAId = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  await addUser(orgA, "pendiente-a@example.com", "Pía", "admin", true);
  const adminBId = await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  return {
    orgA,
    orgB,
    adminAId,
    adminBId,
    productA: await insertProduct(orgA),
    productB: await insertProduct(orgB),
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    pendingA: await contextFor("pendiente-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

const cost = (
  amount: string,
  currency: string,
  expectedCostId = "",
): CostInput => ({ amount, currency, expectedCostId });

async function count(table: "product_costs" | "audit_logs") {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

async function costRows(productId: string) {
  const result = await getDb().execute<{ amount: string; currency: string }>(
    sql`select amount, currency from product_costs
        where product_id = ${productId} order by created_at, id`,
  );
  return result.rows;
}

async function auditRows() {
  const result = await getDb().execute<{
    entity_type: string;
    entity_id: string;
    action: string;
    diff: unknown;
  }>(
    sql`select entity_type, entity_id, action, diff from audit_logs order by created_at`,
  );
  return result.rows;
}

// Fila de costo por SQL, sin servicio ni auditoría: prepara historiales.
function insertCostRow(
  executor: { execute: (query: SQL) => Promise<unknown> },
  values: {
    organizationId: string;
    productId: string;
    createdBy: string;
    amount?: string;
    currency?: string;
    createdAt?: string;
  },
) {
  return executor.execute(
    sql`insert into product_costs (organization_id, product_id, amount, currency, created_by, created_at)
        values (${values.organizationId}, ${values.productId}, ${values.amount ?? "100"},
                ${values.currency ?? "ARS"}, ${values.createdBy},
                coalesce(${values.createdAt ?? null}::timestamptz, clock_timestamp()))`,
  );
}

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; message: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      message?: string;
      cause?: { code?: string; message?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      message: e.cause?.message ?? e.message ?? "",
    };
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

// Bloqueos retenidos del test en curso, como en inventory-concurrency (brief-4.3.2).
const heldLocks: (() => Promise<void>)[] = [];

async function hold(query: SQL): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await tx.execute(query);
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
  await getDb().$client.end();
});

describe("product_costs: esquema (AC-1)", () => {
  it("aplica los defaults y guarda el monto con dos decimales", async () => {
    const s = await seed();
    const result = await getDb().execute<{
      id: string;
      amount: string;
      after_start: boolean;
    }>(
      sql`insert into product_costs (organization_id, product_id, amount, currency, created_by)
          values (${s.orgA}, ${s.productA}, 210000, 'CLP', ${s.adminAId})
          returning id, amount, created_at >= now() as after_start`,
    );
    expect(result.rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.rows[0]!.amount).toBe("210000.00");
    expect(result.rows[0]!.after_start).toBe(true);
  });

  it("rechaza un monto que no es positivo o que no entra, y una moneda mal escrita", async () => {
    const s = await seed();
    const insert = (amount: string, currency: string) =>
      pgError(
        insertCostRow(getDb(), {
          organizationId: s.orgA,
          productId: s.productA,
          createdBy: s.adminAId,
          amount,
          currency,
        }),
      );
    expect((await insert("0", "ARS")).code).toBe("23514");
    expect((await insert("-1", "ARS")).code).toBe("23514");
    expect((await insert("1000000000000", "ARS")).code).toBe("22003");
    for (const currency of ["usd", "US", "USDX", ""]) {
      expect((await insert("1", currency)).code, currency).toBe("23514");
    }
    expect(await count("product_costs")).toBe(0);
  });

  it("un costo no puede apuntar al producto de otra organización (clave compuesta)", async () => {
    const s = await seed();
    const error = await pgError(
      insertCostRow(getDb(), {
        organizationId: s.orgA,
        productId: s.productB,
        createdBy: s.adminAId,
      }),
    );
    expect(error.code).toBe("23503");
    expect(error.message).toContain("product_costs_product_fk");
  });

  it("el índice del historial existe con su orden", async () => {
    const result = await getDb().execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes
          where tablename = 'product_costs' and indexname = 'product_costs_product_history_idx'`,
    );
    expect(result.rows[0]?.indexdef).toContain(
      "(organization_id, product_id, created_at DESC NULLS LAST)",
    );
  });

  it("cost_change es un valor del enum de auditoría", async () => {
    const result = await getDb().execute<{ ok: boolean }>(
      sql`select 'cost_change' = any(enum_range(null::audit_action)::text[]) as ok`,
    );
    expect(result.rows[0]!.ok).toBe(true);
  });
});

describe("product_costs: solo inserción (FR-PROD-20, AC-1)", () => {
  it("crm_app tiene exactamente SELECT e INSERT", async () => {
    const result = await getDb().execute<{ privilege: string }>(
      sql`select privilege_type as privilege from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'product_costs'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege)).toEqual([
      "INSERT",
      "SELECT",
    ]);
  });

  it("crm_app inserta y lee, y no puede actualizar ni borrar: 42501", async () => {
    const s = await seed();
    await asAppRole((tx) =>
      insertCostRow(tx, {
        organizationId: s.orgA,
        productId: s.productA,
        createdBy: s.adminAId,
      }),
    );
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(sql`update product_costs set amount = 1`),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await pgError(
          asAppRole((tx) => tx.execute(sql`delete from product_costs`)),
        )
      ).code,
    ).toBe("42501");
    expect(await costRows(s.productA)).toEqual([
      { amount: "100.00", currency: "ARS" },
    ]);
  });

  it("el rol dueño tampoco puede: el trigger rechaza UPDATE y DELETE con P0001", async () => {
    const s = await seed();
    await insertCostRow(getDb(), {
      organizationId: s.orgA,
      productId: s.productA,
      createdBy: s.adminAId,
    });
    const update = await pgError(
      getDb().execute(sql`update product_costs set amount = 1`),
    );
    expect(update.code).toBe("P0001");
    expect(update.message).toContain(
      "product_costs es de solo inserción: UPDATE",
    );
    const remove = await pgError(
      getDb().execute(sql`delete from product_costs`),
    );
    expect(remove.code).toBe("P0001");
    expect(remove.message).toContain(
      "product_costs es de solo inserción: DELETE",
    );
    expect(await costRows(s.productA)).toEqual([
      { amount: "100.00", currency: "ARS" },
    ]);
  });
});

describe("setProductCost (FR-PROD-19, AC-2 y AC-6)", () => {
  it("el admin fija el primer costo, con auditoría cost_change en la misma transacción", async () => {
    const s = await seed();
    const result = await setProductCost(
      s.adminA,
      s.productA,
      cost("210000", "CLP"),
    );
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      cost: { amount: "210000.00", currency: "CLP" },
    });
    expect(await costRows(s.productA)).toEqual([
      { amount: "210000.00", currency: "CLP" },
    ]);
    // El primer costo no tiene anterior: sus campos van en null, como el primer precio.
    expect(await auditRows()).toEqual([
      {
        entity_type: "product",
        entity_id: s.productA,
        action: "cost_change",
        diff: {
          before: { amount: null, currency: null },
          after: { amount: "210000.00", currency: "CLP" },
        },
      },
    ]);
  });

  it("un costo nuevo se agrega, el vigente es el último y el anterior queda", async () => {
    const s = await seed();
    const first = await setProductCost(
      s.adminA,
      s.productA,
      cost("60,5", "ARS"),
    );
    if (!first.ok) throw new Error(first.code);
    const second = await setProductCost(
      s.adminA,
      s.productA,
      cost("61", "ARS", first.cost.id),
    );
    expect(second).toMatchObject({
      ok: true,
      changed: true,
      cost: { amount: "61.00", currency: "ARS" },
    });
    expect(await costRows(s.productA)).toEqual([
      { amount: "60.50", currency: "ARS" },
      { amount: "61.00", currency: "ARS" },
    ]);
    expect((await auditRows())[1]!.diff).toEqual({
      before: { amount: "60.50", currency: "ARS" },
      after: { amount: "61.00", currency: "ARS" },
    });
  });

  it("el mismo monto y la misma moneda no escriben ni auditan", async () => {
    const s = await seed();
    const first = await setProductCost(s.adminA, s.productA, cost("15", "USD"));
    if (!first.ok) throw new Error(first.code);
    expect(
      await setProductCost(
        s.adminA,
        s.productA,
        cost("15,00", "USD", first.cost.id),
      ),
    ).toEqual({ ok: true, changed: false, cost: first.cost });
    expect(await count("product_costs")).toBe(1);
    expect(await count("audit_logs")).toBe(1);
  });

  it("un producto desactivado no admite costo nuevo", async () => {
    const s = await seed();
    const inactive = await insertProduct(s.orgA, "OLD-1", false);
    expect(await setProductCost(s.adminA, inactive, cost("10", "ARS"))).toEqual(
      {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_product",
      },
    );
    expect(await count("product_costs")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });

  it("CONFLICT si el costo vigente no es el que vio quien lo fija, también con el id en mayúsculas", async () => {
    const s = await seed();
    const first = await setProductCost(s.adminA, s.productA, cost("10", "ARS"));
    if (!first.ok) throw new Error(first.code);
    expect(
      await setProductCost(s.adminA, s.productA, cost("12", "ARS")),
    ).toEqual({ ok: false, code: "CONFLICT", currentCost: first.cost });
    expect(
      await setProductCost(
        s.adminA,
        s.productA.toUpperCase(),
        cost("12", "ARS"),
      ),
    ).toEqual({ ok: false, code: "CONFLICT", currentCost: first.cost });
    const second = await setProductCost(
      s.adminA,
      s.productA,
      cost("11", "ARS", first.cost.id),
    );
    if (!second.ok) throw new Error(second.code);
    expect(
      await setProductCost(
        s.adminA,
        s.productA,
        cost("12", "ARS", first.cost.id),
      ),
    ).toEqual({ ok: false, code: "CONFLICT", currentCost: second.cost });
    expect(await count("product_costs")).toBe(2);
  });

  it("solo un admin de la organización fija costos", async () => {
    const s = await seed();
    for (const context of [s.viewerA, s.pendingA]) {
      expect(
        await setProductCost(context, s.productA, cost("10", "ARS")),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
    }
    expect(
      await setProductCost(s.adminB, s.productA, cost("10", "ARS")),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await count("product_costs")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });

  it("rechaza el monto y la moneda con su motivo, y los ids inválidos sin campo", async () => {
    const s = await seed();
    expect(
      await setProductCost(s.adminA, s.productA, cost("300.000", "CLP")),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amountReason: "separator",
      currencyReason: null,
    });
    expect(
      await setProductCost(s.adminA, s.productA, cost("10", "KWD")),
    ).toMatchObject({
      fields: ["currency"],
      currencyReason: "too_many_decimals",
    });
    expect(
      await setProductCost(s.adminA, s.productA, cost("0", "ARS")),
    ).toMatchObject({ fields: ["amount"], amountReason: "zero" });
    expect(
      await setProductCost(s.adminA, "no-es-un-id", cost("10", "ARS")),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      await setProductCost(s.adminA, s.productA, cost("10", "ARS", "otro")),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    expect(await count("product_costs")).toBe(0);
  });

  it("el cambio de costo aparece en la auditoría del producto, que un viewer no lee", async () => {
    const s = await seed();
    await setProductCost(s.adminA, s.productA, cost("10", "ARS"));
    const audit = await listProductAudit(s.adminA, s.productA, 1);
    expect(audit.ok && audit.entries.map((entry) => entry.action)).toEqual([
      "cost_change",
    ]);
    expect(await listProductAudit(s.viewerA, s.productA, 1)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("fijar el costo no toca el precio", async () => {
    const s = await seed();
    await setProductPrice(s.adminA, s.productA, {
      amount: "121",
      currency: "ARS",
      expectedPriceId: "",
    });
    await setProductCost(s.adminA, s.productA, cost("60,50", "ARS"));
    const prices = await getDb().execute<{ amount: string }>(
      sql`select amount from product_prices where product_id = ${s.productA}`,
    );
    expect(prices.rows).toEqual([{ amount: "121.00" }]);
  });
});

describe("setProductCost con conexiones simultáneas (AC-2)", () => {
  it(
    "dos admins fijan el costo a la vez: uno se escribe y el otro recibe CONFLICT",
    async () => {
      const s = await seed();
      const release = await hold(
        sql`select id from products where id = ${s.productA} for update`,
      );
      const calls = [
        setProductCost(s.adminA, s.productA, cost("10", "ARS")),
        setProductCost(s.adminA, s.productA, cost("20", "ARS")),
      ];
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all(calls);

      const written = results.filter((result) => result.ok);
      const rejected = results.filter((result) => !result.ok);
      expect(written).toHaveLength(1);
      expect(rejected).toEqual([
        {
          ok: false,
          code: "CONFLICT",
          currentCost: written[0]!.ok ? written[0]!.cost : null,
        },
      ]);
      expect(await count("product_costs")).toBe(1);
      expect(await count("audit_logs")).toBe(1);
    },
    TEST_TIMEOUT,
  );
});

describe("lecturas de costo y margen (AC-3, FR-PROD-21)", () => {
  it("un viewer no lee el costo, el margen ni el historial; otra organización no ve el producto", async () => {
    const s = await seed();
    await insertCostRow(getDb(), {
      organizationId: s.orgA,
      productId: s.productA,
      createdBy: s.adminAId,
    });
    for (const context of [s.viewerA, s.pendingA]) {
      expect(await getProductCostSummary(context, s.productA)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await listProductCosts(context, s.productA, 1)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    expect(await getProductCostSummary(s.adminB, s.productA)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await listProductCosts(s.adminB, s.productA, 1)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await getProductCostSummary(s.adminA, "no-es-un-id")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });

  it("el resumen: el costo y el precio vigentes, y el margen del ADR 0019", async () => {
    const s = await seed();
    const base = { organizationId: s.orgA, createdBy: s.adminAId };
    await insertCostRow(getDb(), {
      ...base,
      productId: s.productA,
      amount: "50",
      createdAt: "2026-01-01T10:00:00Z",
    });
    await insertCostRow(getDb(), {
      ...base,
      productId: s.productA,
      amount: "60.50",
      createdAt: "2026-02-01T10:00:00Z",
    });
    await setProductPrice(s.adminA, s.productA, {
      amount: "121",
      currency: "ARS",
      expectedPriceId: "",
    });
    expect(await getProductCostSummary(s.adminA, s.productA)).toMatchObject({
      ok: true,
      product: { id: s.productA },
      cost: { amount: "60.50", currency: "ARS" },
      price: { amount: "121.00", currency: "ARS" },
      margin: {
        ok: true,
        currency: "ARS",
        amount: 6050n,
        marginTenths: 500n,
        markupTenths: 1000n,
      },
    });
  });

  it("sin precio, sin costo o con monedas distintas, el resumen dice por qué no hay margen", async () => {
    const s = await seed();
    const reason = async () => {
      const summary = await getProductCostSummary(s.adminA, s.productA);
      return summary.ok && !summary.margin.ok ? summary.margin.reason : null;
    };
    expect(await reason()).toBe("no_price");
    await setProductPrice(s.adminA, s.productA, {
      amount: "100",
      currency: "ARS",
      expectedPriceId: "",
    });
    expect(await reason()).toBe("no_cost");
    await setProductCost(s.adminA, s.productA, cost("40", "USD"));
    expect(await reason()).toBe("currency_mismatch");
  });

  it("el historial completo, paginado y con autor", async () => {
    const s = await seed();
    for (let day = 1; day <= COSTS_PAGE_SIZE + 1; day++) {
      await insertCostRow(getDb(), {
        organizationId: s.orgA,
        productId: s.productA,
        createdBy: s.adminAId,
        amount: String(day),
        createdAt: `2026-01-${String(day).padStart(2, "0")}T10:00:00Z`,
      });
    }
    const first = await listProductCosts(s.adminA, s.productA, 1);
    if (!first.ok) throw new Error(first.code);
    expect(first.total).toBe(COSTS_PAGE_SIZE + 1);
    expect(first.pageCount).toBe(2);
    expect(first.entries).toHaveLength(COSTS_PAGE_SIZE);
    expect(first.entries[0]).toMatchObject({
      amount: "26.00",
      author: { id: s.adminAId, name: "Ana" },
    });
    for (const page of [2, 99]) {
      const last = await listProductCosts(s.adminA, s.productA, page);
      expect(last.ok && last.page).toBe(2);
      expect(last.ok && last.entries.map((entry) => entry.amount)).toEqual([
        "1.00",
      ]);
    }
  });

  it("con la misma hora, el vigente desempata por id", async () => {
    const s = await seed();
    const at = "2026-03-01T10:00:00Z";
    for (const amount of ["1", "2", "3"]) {
      await insertCostRow(getDb(), {
        organizationId: s.orgA,
        productId: s.productA,
        createdBy: s.adminAId,
        amount,
        createdAt: at,
      });
    }
    const last = await getDb().execute<{ amount: string }>(
      sql`select amount from product_costs order by id desc limit 1`,
    );
    const summary = await getProductCostSummary(s.adminA, s.productA);
    expect(summary.ok && summary.cost?.amount).toBe(last.rows[0]!.amount);
  });
});
