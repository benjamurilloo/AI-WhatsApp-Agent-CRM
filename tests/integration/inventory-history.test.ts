import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  adjustStock,
  listStockMovements,
  type MovementHistoryFilters,
} from "@/modules/inventory";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Historial de movimientos contra PostgreSQL real (brief-4.3.3): orden, paginación en SQL,
// filtros por tipo y período en la zona de la organización, autor, autorización y aislamiento.

const PASSWORD = "contraseña-correcta-larga";
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

async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  await addUser(orgA, "admin-a@example.com", "Ana Pérez", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera Lectora", "viewer");
  await addUser(orgA, "pendiente-a@example.com", "Pedro", "admin", true);
  await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  return {
    orgA,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    pendingA: await contextFor("pendiente-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

async function insertProduct(organizationId: string, isActive = true) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, is_active)
        values (${organizationId}, 'CAF-250', 'Café molido 250 g', ${isActive})
        returning id`,
  );
  return result.rows[0]!.id;
}

// Movimiento por SQL con fecha explícita, para ubicarlo en el borde de un período.
async function insertMovement(
  context: AuthContext,
  productId: string,
  createdAt: string,
  type: "adjustment_positive" | "adjustment_negative" = "adjustment_positive",
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into inventory_movements
          (organization_id, product_id, type, quantity, balance_after, reason, created_by, created_at)
        values (${context.organizationId}, ${productId}, ${type}, 1, 1, 'Conteo',
          ${context.userId}, ${createdAt})
        returning id`,
  );
  return result.rows[0]!.id;
}

function filters(
  overrides: Partial<MovementHistoryFilters> = {},
): MovementHistoryFilters {
  return { type: "all", from: "", to: "", page: 1, ...overrides };
}

async function idsFor(
  context: AuthContext,
  productId: string,
  overrides: Partial<MovementHistoryFilters>,
) {
  const result = await listStockMovements(
    context,
    productId,
    filters(overrides),
  );
  if (!result.ok) throw new Error(`historial rechazado: ${result.code}`);
  return result.movements.map((movement) => movement.id);
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("listStockMovements: contenido y orden", () => {
  it("un producto sin movimientos da una página vacía con la zona de la organización", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    expect(await listStockMovements(s.adminA, productId, filters())).toEqual({
      ok: true,
      movements: [],
      total: 0,
      page: 1,
      pageCount: 1,
      timezone: "America/Argentina/Buenos_Aires",
      productHasMovements: false,
    });
  });

  it("devuelve los ajustes del más reciente al más antiguo, con saldo, motivo y autor", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    await adjustStock(s.adminA, productId, {
      type: "adjustment_positive",
      quantity: "10",
      expectedQuantityOnHand: "0",
      reason: "Conteo",
    });
    await adjustStock(s.adminA, productId, {
      type: "adjustment_negative",
      quantity: "4",
      expectedQuantityOnHand: "10",
      reason: "Rotura",
    });

    const result = await listStockMovements(s.viewerA, productId, filters());
    expect(result).toMatchObject({
      ok: true,
      total: 2,
      page: 1,
      pageCount: 1,
      productHasMovements: true,
    });
    if (!result.ok) return;
    expect(result.movements).toEqual([
      {
        id: expect.any(String),
        type: "adjustment_negative",
        quantity: "4.000",
        balanceAfter: "6.000",
        reason: "Rotura",
        createdAt: expect.any(Date),
        author: { id: s.adminA.userId, name: "Ana Pérez" },
      },
      {
        id: expect.any(String),
        type: "adjustment_positive",
        quantity: "10.000",
        balanceAfter: "10.000",
        reason: "Conteo",
        createdAt: expect.any(Date),
        author: { id: s.adminA.userId, name: "Ana Pérez" },
      },
    ]);
  });

  it("con la misma fecha desempata por id descendente", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    const first = await insertMovement(
      s.adminA,
      productId,
      "2026-09-10T12:00:00Z",
    );
    const second = await insertMovement(
      s.adminA,
      productId,
      "2026-09-10T12:00:00Z",
    );
    expect(await idsFor(s.adminA, productId, {})).toEqual(
      [first, second].sort().reverse(),
    );
  });

  it("muestra el nombre del autor aunque el usuario esté desactivado", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    await insertMovement(s.adminA, productId, "2026-09-10T12:00:00Z");
    await getDb().execute(
      sql`update users set is_active = false where id = ${s.adminA.userId}`,
    );
    const result = await listStockMovements(s.viewerA, productId, filters());
    expect(result.ok && result.movements[0]!.author).toEqual({
      id: s.adminA.userId,
      name: "Ana Pérez",
    });
  });
});

describe("listStockMovements: paginación", () => {
  it("pagina de a 25 en SQL y lleva una página fuera de rango a la última o a la primera", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    await getDb().execute(
      sql`insert into inventory_movements
            (organization_id, product_id, type, quantity, balance_after, reason, created_by, created_at)
          select ${s.orgA}, ${productId}, 'adjustment_positive', i, i, 'Conteo', ${s.adminA.userId},
            timestamptz '2026-09-01 12:00:00Z' + i * interval '1 minute'
          from generate_series(1, 30) as i`,
    );

    const page = async (value: number) => {
      const result = await listStockMovements(
        s.adminA,
        productId,
        filters({ page: value }),
      );
      if (!result.ok) throw new Error(result.code);
      return {
        page: result.page,
        pageCount: result.pageCount,
        total: result.total,
        quantities: result.movements.map((m) => m.quantity),
      };
    };

    const first = await page(1);
    expect(first).toMatchObject({ page: 1, pageCount: 2, total: 30 });
    expect(first.quantities).toHaveLength(25);
    expect(first.quantities[0]).toBe("30.000");
    expect(first.quantities[24]).toBe("6.000");

    const second = await page(2);
    expect(second.quantities).toEqual([
      "5.000",
      "4.000",
      "3.000",
      "2.000",
      "1.000",
    ]);
    expect(await page(99)).toEqual(second);
    expect(await page(0)).toEqual(first);
    expect(await page(-3)).toEqual(first);
    expect(await page(Number.NaN)).toEqual(first);
  });
});

describe("listStockMovements: filtros", () => {
  it("filtra por tipo y rechaza un tipo desconocido", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    const positive = await insertMovement(
      s.adminA,
      productId,
      "2026-09-10T12:00:00Z",
    );
    const negative = await insertMovement(
      s.adminA,
      productId,
      "2026-09-10T13:00:00Z",
      "adjustment_negative",
    );
    expect(
      await idsFor(s.adminA, productId, { type: "adjustment_positive" }),
    ).toEqual([positive]);
    expect(
      await idsFor(s.adminA, productId, { type: "adjustment_negative" }),
    ).toEqual([negative]);
    expect(
      await listStockMovements(s.adminA, productId, filters({ type: "sale" })),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["type"] });
  });

  it("el período usa días de la zona de la organización, con fin semiabierto", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    // 23:59:59 del 9 y 00:00:00 del 10 en Buenos Aires (UTC−3).
    const lastSecond = await insertMovement(
      s.adminA,
      productId,
      "2026-09-10T02:59:59Z",
    );
    const midnight = await insertMovement(
      s.adminA,
      productId,
      "2026-09-10T03:00:00Z",
    );

    expect(
      await idsFor(s.adminA, productId, {
        from: "2026-09-09",
        to: "2026-09-09",
      }),
    ).toEqual([lastSecond]);
    expect(await idsFor(s.adminA, productId, { from: "2026-09-10" })).toEqual([
      midnight,
    ]);
    expect(await idsFor(s.adminA, productId, { to: "2026-09-09" })).toEqual([
      lastSecond,
    ]);

    // Con otra zona en la organización, los mismos instantes caen en otro día.
    await getDb().execute(
      sql`update organizations set timezone = 'UTC' where id = ${s.orgA}`,
    );
    const utc = await listStockMovements(
      s.adminA,
      productId,
      filters({ from: "2026-09-10", to: "2026-09-10" }),
    );
    expect(utc).toMatchObject({ ok: true, total: 2, timezone: "UTC" });
  });

  it("un día con cambio de horario histórico incluye exactamente sus movimientos", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    // El 19/10/2008 Buenos Aires adelantó la hora a UTC−2: el día duró 23 horas y terminó
    // a las 02:00 UTC del 20. Con un desfase fijo de −3, las 02:30 UTC caerían todavía en el 19.
    const lateOnDay = await insertMovement(
      s.adminA,
      productId,
      "2008-10-20T01:30:00Z",
    );
    const nextDay = await insertMovement(
      s.adminA,
      productId,
      "2008-10-20T02:30:00Z",
    );
    const before = await insertMovement(
      s.adminA,
      productId,
      "2008-10-19T02:59:59Z",
    );

    expect(
      await idsFor(s.adminA, productId, {
        from: "2008-10-19",
        to: "2008-10-19",
      }),
    ).toEqual([lateOnDay]);
    expect(
      await idsFor(s.adminA, productId, {
        from: "2008-10-20",
        to: "2008-10-20",
      }),
    ).toEqual([nextDay]);
    expect(
      await idsFor(s.adminA, productId, {
        from: "2008-10-18",
        to: "2008-10-18",
      }),
    ).toEqual([before]);
  });

  it("sin resultados por filtros, productHasMovements distingue del producto vacío", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    await insertMovement(s.adminA, productId, "2026-09-10T12:00:00Z");
    expect(
      await listStockMovements(
        s.adminA,
        productId,
        filters({ from: "2030-01-01" }),
      ),
    ).toMatchObject({ ok: true, total: 0, productHasMovements: true });
  });

  it("fechas inválidas o un período invertido dan VALIDATION_ERROR con sus campos", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    const cases: [Partial<MovementHistoryFilters>, string[]][] = [
      [{ from: "2026-02-30" }, ["from"]],
      [{ to: "15/09/2026" }, ["to"]],
      [{ from: "2026-09-15", to: "2026-09-14" }, ["from", "to"]],
      [{ type: "", from: "ayer", to: "0000-01-01" }, ["type", "from", "to"]],
    ];
    for (const [overrides, fields] of cases) {
      expect(
        await listStockMovements(s.adminA, productId, filters(overrides)),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields });
    }
  });
});

describe("listStockMovements: autorización y aislamiento", () => {
  it("contraseña pendiente da FORBIDDEN", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    expect(await listStockMovements(s.pendingA, productId, filters())).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("otra organización o un producto inexistente dan NOT_FOUND, y un id inválido VALIDATION_ERROR", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    await insertMovement(s.adminA, productId, "2026-09-10T12:00:00Z");
    expect(await listStockMovements(s.adminB, productId, filters())).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await listStockMovements(s.adminA, randomUUID(), filters())).toEqual(
      { ok: false, code: "NOT_FOUND" },
    );
    expect(
      await listStockMovements(s.adminA, "no-es-un-id", filters()),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("un producto desactivado conserva su historial visible", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA, false);
    await insertMovement(s.adminA, productId, "2026-09-10T12:00:00Z");
    expect(
      await listStockMovements(s.viewerA, productId, filters()),
    ).toMatchObject({ ok: true, total: 1 });
  });
});
