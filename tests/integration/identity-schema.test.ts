import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de identidad de la 3.1 contra PostgreSQL real, con SQL directo.
// Cada invariante se prueba intentando violarlo y comprobando el código de error.

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgErrorCode(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const withCode = error as { code?: string; cause?: { code?: string } };
    return withCode.cause?.code ?? withCode.code ?? "sin código";
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

async function createUser(email = "ana@example.com") {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, 'hash-sintetico', 'Ana') returning id`,
  );
  return result.rows[0]!.id;
}

async function createOrganization(name = "Negocio A") {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("base de test", () => {
  it("la suite corre contra la base _test, no contra la de desarrollo", async () => {
    const result = await getDb().execute<{ name: string }>(
      sql`select current_database() as name`,
    );
    expect(result.rows[0]?.name).toMatch(/_test$/);
  });

  it("existen exactamente las tablas de identidad, sesión, auditoría, catálogo, inventario, clientes, conversaciones e ingestión", async () => {
    const result = await getDb().execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(result.rows.map((row) => row.tablename)).toEqual([
      "audit_logs",
      "business_hour_exceptions",
      "business_hours",
      // La caja del efectivo (brief-21.2).
      "cash_movements",
      "cash_session_closing_amounts",
      "cash_session_closings",
      "cash_session_opening_amounts",
      "cash_sessions",
      "client_tag_assignments",
      "client_tags",
      "clients",
      "conversation_notes",
      "conversations",
      "document_counters",
      "ingestion_credentials",
      "ingestion_events",
      "ingestion_rate_windows",
      "inventories",
      "inventory_movements",
      "knowledge_entries",
      "login_attempts",
      "messages",
      "order_lines",
      "orders",
      "organization_members",
      "organizations",
      // Los medios de pago (brief-21.2).
      "payment_methods",
      "product_costs",
      "product_images",
      "product_prices",
      "products",
      // Los cobros (brief-21.3) y la anulación de un cobro (brief-21.5).
      "receipt_voids",
      "receipts",
      // La devolución y su anulación (brief-21.5).
      "refund_voids",
      "refunds",
      "sale_lines",
      "sale_voids",
      "sales",
      "sessions",
      // Los proveedores (brief-22.2).
      "suppliers",
      "users",
    ]);
  });

  it("aplicar las migraciones otra vez no hace nada", async () => {
    const journal = JSON.parse(
      readFileSync("drizzle/meta/_journal.json", "utf8"),
    ) as { entries: unknown[] };
    await migrate(getDb(), { migrationsFolder: "drizzle" });
    const result = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    // Una fila por migración versionada, ni una más.
    expect(result.rows[0]?.count).toBe(journal.entries.length);
  });

  it("un test escribe datos", async () => {
    await createOrganization("Dato de otro test");
  });

  it("el test siguiente no ve los datos del anterior", async () => {
    const result = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from organizations`,
    );
    expect(result.rows[0]?.count).toBe(0);
  });
});

describe("users", () => {
  it("aplica los defaults", async () => {
    // Con execute crudo, drizzle devuelve timestamptz como texto: se compara en SQL contra now().
    const result = await getDb().execute<{
      id: string;
      must_change_password: boolean;
      is_active: boolean;
      timestamps_now: boolean;
    }>(
      sql`insert into users (email, password_hash, name)
          values ('ana@example.com', 'hash-sintetico', 'Ana')
          returning id, must_change_password, is_active,
            (created_at = now() and updated_at = now()) as timestamps_now`,
    );
    const user = result.rows[0]!;
    expect(user.id).toMatch(uuidPattern);
    expect(user.must_change_password).toBe(false);
    expect(user.is_active).toBe(true);
    expect(user.timestamps_now).toBe(true);
  });

  it("rechaza un email repetido", async () => {
    await createUser("ana@example.com");
    expect(await pgErrorCode(createUser("ana@example.com"))).toBe("23505");
  });

  it("rechaza un email repetido con otras mayúsculas", async () => {
    await createUser("ana@example.com");
    expect(await pgErrorCode(createUser("Ana@Example.COM"))).toBe("23505");
  });

  it("rechaza columnas obligatorias en NULL", async () => {
    expect(
      await pgErrorCode(
        getDb().execute(
          sql`insert into users (email, password_hash, name) values ('b@example.com', 'hash', null)`,
        ),
      ),
    ).toBe("23502");
    expect(
      await pgErrorCode(
        getDb().execute(
          sql`insert into users (email, password_hash, name) values ('b@example.com', null, 'B')`,
        ),
      ),
    ).toBe("23502");
    expect(
      await pgErrorCode(
        getDb().execute(
          sql`insert into users (email, password_hash, name) values (null, 'hash', 'B')`,
        ),
      ),
    ).toBe("23502");
  });
});

describe("organizations", () => {
  it("aplica los defaults", async () => {
    const result = await getDb().execute<{
      id: string;
      timezone: string;
      timestamps_now: boolean;
    }>(
      sql`insert into organizations (name) values ('Negocio A')
          returning id, timezone,
            (created_at = now() and updated_at = now()) as timestamps_now`,
    );
    const organization = result.rows[0]!;
    expect(organization.id).toMatch(uuidPattern);
    expect(organization.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(organization.timestamps_now).toBe(true);
  });

  it("rechaza un nombre NULL", async () => {
    expect(
      await pgErrorCode(
        getDb().execute(sql`insert into organizations (name) values (null)`),
      ),
    ).toBe("23502");
  });
});

describe("organization_members", () => {
  it("acepta una membresía válida con cada rol", async () => {
    const organizationId = await createOrganization();
    for (const [email, role] of [
      ["admin@example.com", "admin"],
      ["viewer@example.com", "viewer"],
    ] as const) {
      const userId = await createUser(email);
      const result = await getDb().execute<{ id: string; role: string }>(
        sql`insert into organization_members (organization_id, user_id, role)
            values (${organizationId}, ${userId}, ${role}) returning id, role`,
      );
      expect(result.rows[0]?.id).toMatch(uuidPattern);
      expect(result.rows[0]?.role).toBe(role);
    }
  });

  it("rechaza una segunda membresía del mismo usuario (ADR 0010)", async () => {
    const userId = await createUser();
    const first = await createOrganization("Negocio A");
    const second = await createOrganization("Negocio B");
    await getDb().execute(
      sql`insert into organization_members (organization_id, user_id, role)
          values (${first}, ${userId}, 'admin')`,
    );
    expect(
      await pgErrorCode(
        getDb().execute(
          sql`insert into organization_members (organization_id, user_id, role)
              values (${second}, ${userId}, 'viewer')`,
        ),
      ),
    ).toBe("23505");
  });

  it("rechaza un rol fuera de admin y viewer", async () => {
    const userId = await createUser();
    const organizationId = await createOrganization();
    expect(
      await pgErrorCode(
        getDb().execute(
          sql`insert into organization_members (organization_id, user_id, role)
              values (${organizationId}, ${userId}, 'owner')`,
        ),
      ),
    ).toBe("22P02");
  });

  it("rechaza un rol NULL", async () => {
    const userId = await createUser();
    const organizationId = await createOrganization();
    expect(
      await pgErrorCode(
        getDb().execute(
          sql`insert into organization_members (organization_id, user_id, role)
              values (${organizationId}, ${userId}, null)`,
        ),
      ),
    ).toBe("23502");
  });

  it("rechaza una organización inexistente", async () => {
    const userId = await createUser();
    expect(
      await pgErrorCode(
        getDb().execute(
          sql`insert into organization_members (organization_id, user_id, role)
              values (gen_random_uuid(), ${userId}, 'admin')`,
        ),
      ),
    ).toBe("23503");
  });

  it("rechaza un usuario inexistente", async () => {
    const organizationId = await createOrganization();
    expect(
      await pgErrorCode(
        getDb().execute(
          sql`insert into organization_members (organization_id, user_id, role)
              values (${organizationId}, gen_random_uuid(), 'admin')`,
        ),
      ),
    ).toBe("23503");
  });
});
