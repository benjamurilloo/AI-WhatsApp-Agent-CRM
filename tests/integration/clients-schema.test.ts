import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de clientes de la 5.1 contra PostgreSQL real, con SQL directo.
// Cada invariante se prueba intentando violarlo y comprobando el SQLSTATE.

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; constraint: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      constraint: e.cause?.constraint ?? e.constraint ?? "",
    };
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

async function codeOf(query: SQL) {
  return (await pgError(getDb().execute(query))).code;
}

// Ejecuta como crm_app, el rol restringido que la aplicación usará al conectarse con él (ADR 0013).
function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

async function seed() {
  const organizations = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio A'), ('Negocio B') returning id`,
  );
  return {
    orgA: organizations.rows[0]!.id,
    orgB: organizations.rows[1]!.id,
  };
}

async function createClient(
  executor: Db | DbTransaction,
  organizationId: string,
  phone: string | null = "+5491155551234",
  isActive = true,
) {
  const result = await executor.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, is_active)
        values (${organizationId}, 'Ana Pérez', ${phone}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("clients: esquema", () => {
  it("aplica los defaults y admite teléfono y notas nulos", async () => {
    const s = await seed();
    const result = await getDb().execute<{
      id: string;
      phone_e164: string | null;
      notes: string | null;
      is_active: boolean;
      timestamps_now: boolean;
    }>(
      sql`insert into clients (organization_id, display_name)
          values (${s.orgA}, 'Ana Pérez')
          returning id, phone_e164, notes, is_active,
            (created_at = now() and updated_at = now()) as timestamps_now`,
    );
    expect(result.rows[0]).toEqual({
      id: expect.stringMatching(uuidPattern),
      phone_e164: null,
      notes: null,
      is_active: true,
      timestamps_now: true,
    });
  });

  it("rechaza columnas obligatorias en NULL", async () => {
    const s = await seed();
    for (const query of [
      sql`insert into clients (organization_id, display_name) values (null, 'Ana')`,
      sql`insert into clients (organization_id, display_name) values (${s.orgA}, null)`,
      sql`insert into clients (organization_id, display_name, is_active) values (${s.orgA}, 'Ana', null)`,
    ]) {
      expect(await codeOf(query)).toBe("23502");
    }
  });

  it("rechaza una organización inexistente y no deja borrar la de un cliente", async () => {
    const s = await seed();
    expect((await pgError(createClient(getDb(), randomUUID()))).code).toBe(
      "23503",
    );
    await createClient(getDb(), s.orgA);
    expect(
      await codeOf(sql`delete from organizations where id = ${s.orgA}`),
    ).toBe("23001");
  });
});

describe("clients: unicidad del teléfono (ADR 0007)", () => {
  it("rechaza un teléfono repetido en la organización", async () => {
    const s = await seed();
    await createClient(getDb(), s.orgA);
    expect(await pgError(createClient(getDb(), s.orgA))).toEqual({
      code: "23505",
      constraint: "clients_organization_phone_unique",
    });
  });

  it("rechaza el teléfono de un cliente inactivo, al insertar y al actualizar (D-3)", async () => {
    const s = await seed();
    await createClient(getDb(), s.orgA, "+5491155551234", false);
    expect(
      (await pgError(createClient(getDb(), s.orgA, "+5491155551234"))).code,
    ).toBe("23505");
    const other = await createClient(getDb(), s.orgA, "+5491155559999");
    expect(
      await codeOf(
        sql`update clients set phone_e164 = '+5491155551234' where id = ${other}`,
      ),
    ).toBe("23505");
  });

  it("acepta el mismo teléfono en otra organización", async () => {
    const s = await seed();
    await createClient(getDb(), s.orgA);
    await createClient(getDb(), s.orgB);
    const result = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from clients where phone_e164 = '+5491155551234'`,
    );
    expect(result.rows[0]?.count).toBe(2);
  });

  it("acepta varios clientes sin teléfono en la misma organización", async () => {
    const s = await seed();
    await createClient(getDb(), s.orgA, null);
    await createClient(getDb(), s.orgA, null);
    const result = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from clients where phone_e164 is null`,
    );
    expect(result.rows[0]?.count).toBe(2);
  });
});

describe("clients: formato E.164 (D-1)", () => {
  it("acepta teléfonos E.164 canónicos", async () => {
    const s = await seed();
    for (const phone of ["+12", "+5491155551234", "+123456789012345"]) {
      await createClient(getDb(), s.orgA, phone);
    }
  });

  it("rechaza teléfonos fuera de formato, al insertar y al actualizar", async () => {
    const s = await seed();
    for (const phone of [
      "",
      "+",
      "+1",
      "5491155551234",
      "+54 9 11 5555-1234",
      "+54-9-11-5555-1234",
      "+(54)91155551234",
      "+05491155551234",
      "+1234567890123456",
      " +5491155551234",
      "+5491155551234\n",
      "+54911５5551234",
    ]) {
      expect(await pgError(createClient(getDb(), s.orgA, phone))).toEqual({
        code: "23514",
        constraint: "clients_phone_e164_format",
      });
    }
    const id = await createClient(getDb(), s.orgA);
    expect(
      await codeOf(
        sql`update clients set phone_e164 = '+54 9 11 5555-1234' where id = ${id}`,
      ),
    ).toBe("23514");
  });
});

describe("clients: escritura completa para crm_app", () => {
  it("crm_app lee, inserta, actualiza y borra clientes", async () => {
    const s = await seed();
    await asAppRole(async (tx) => {
      const id = await createClient(tx, s.orgA);
      await tx.execute(
        sql`update clients set display_name = 'Ana María Pérez', is_active = false where id = ${id}`,
      );
      const read = await tx.execute<{
        display_name: string;
        is_active: boolean;
      }>(sql`select display_name, is_active from clients where id = ${id}`);
      expect(read.rows).toEqual([
        { display_name: "Ana María Pérez", is_active: false },
      ]);
      await tx.execute(sql`delete from clients where id = ${id}`);
    });
    const result = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from clients`,
    );
    expect(result.rows[0]?.count).toBe(0);
  });
});
