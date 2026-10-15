import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El esquema de los proveedores contra PostgreSQL real (brief-22.2, AC-1): los privilegios, los
// CHECK, los índices únicos y el destino de las claves compuestas, probados con SQL directo y con
// el rol dueño, que es el que no frenan los privilegios. El dígito verificador del CUIT lo comprueba
// el servicio (D-2), no la base.

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

type SupplierColumns = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  cuit?: string | null;
  isActive?: boolean;
};

async function insertSupplier(organizationId: string, values: SupplierColumns) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name, phone_e164, email, cuit, is_active)
        values (${organizationId}, ${values.name ?? "Distribuidora Norte"},
                ${values.phone ?? null}, ${values.email ?? null}, ${values.cuit ?? null},
                ${values.isActive ?? true})
        returning id`,
  );
  return result.rows[0]!.id;
}

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; constraint: string | undefined }> {
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
      constraint: e.cause?.constraint ?? e.constraint,
    };
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los privilegios (AC-1; regla 8)", () => {
  it("crm_app lee, inserta y actualiza, pero no borra", async () => {
    const result = await getDb().execute<{ privilege: string }>(
      sql`select privilege_type as privilege from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'suppliers'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege)).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE",
    ]);
  });

  it("supplier es un valor de audit_entity_type", async () => {
    const result = await getDb().execute<{ ok: boolean }>(
      sql`select 'supplier' = any(enum_range(null::audit_entity_type)::text[]) as ok`,
    );
    expect(result.rows[0]!.ok).toBe(true);
  });
});

describe("los CHECK (AC-1; D-1)", () => {
  it.each([
    ["el nombre vacío", { name: "" }, "suppliers_name_length"],
    ["el nombre largo", { name: "a".repeat(121) }, "suppliers_name_length"],
    [
      "el nombre con espacios al borde",
      { name: " Norte" },
      "suppliers_name_trimmed",
    ],
    [
      "el teléfono sin +",
      { phone: "5491155551234" },
      "suppliers_phone_e164_format",
    ],
    [
      "el teléfono con separadores",
      { phone: "+54 9 11 5555-1234" },
      "suppliers_phone_e164_format",
    ],
    [
      "el email con mayúsculas",
      { email: "Ventas@norte.com" },
      "suppliers_email_format",
    ],
    ["el email sin @", { email: "ventas" }, "suppliers_email_format"],
    [
      "el email largo",
      { email: `${"a".repeat(250)}@b.co` },
      "suppliers_email_format",
    ],
    [
      "el CUIT con diez dígitos",
      { cuit: "2012345678" },
      "suppliers_cuit_format",
    ],
    ["el CUIT con guiones", { cuit: "20-12345678-6" }, "suppliers_cuit_format"],
    ["el CUIT con letras", { cuit: "2012345678X" }, "suppliers_cuit_format"],
  ] as const)("rechaza %s", async (_label, values, constraint) => {
    const org = await createOrganization("Negocio A");
    expect(await pgError(insertSupplier(org, values))).toEqual({
      code: "23514",
      constraint,
    });
  });

  it("acepta los límites y los nulos", async () => {
    const org = await createOrganization("Negocio A");
    await insertSupplier(org, {
      name: "a".repeat(120),
      phone: "+5491155551234",
      email: `${"a".repeat(248)}@b.com`,
      cuit: "20123456786",
    });
    await insertSupplier(org, { name: "Solo el nombre" });
  });
});

describe("los índices únicos (AC-1; D-2 y D-4)", () => {
  it("el nombre no se repite con otras mayúsculas, tampoco contra un inactivo", async () => {
    const org = await createOrganization("Negocio A");
    await insertSupplier(org, { name: "Distribuidora Norte", isActive: false });
    expect(
      await pgError(insertSupplier(org, { name: "DISTRIBUIDORA NORTE" })),
    ).toEqual({
      code: "23505",
      constraint: "suppliers_organization_name_lower_unique",
    });
  });

  it("el CUIT no se repite, tampoco contra un inactivo", async () => {
    const org = await createOrganization("Negocio A");
    await insertSupplier(org, {
      name: "Uno",
      cuit: "20123456786",
      isActive: false,
    });
    expect(
      await pgError(insertSupplier(org, { name: "Dos", cuit: "20123456786" })),
    ).toEqual({
      code: "23505",
      constraint: "suppliers_organization_cuit_unique",
    });
  });

  it("dos proveedores sin CUIT conviven, y otra organización repite nombre y CUIT", async () => {
    const orgA = await createOrganization("Negocio A");
    const orgB = await createOrganization("Negocio B");
    await insertSupplier(orgA, { name: "Uno" });
    await insertSupplier(orgA, { name: "Dos" });
    await insertSupplier(orgA, { name: "Tres", cuit: "20123456786" });
    await insertSupplier(orgB, { name: "Tres", cuit: "20123456786" });
  });

  it("el teléfono y el email no son únicos", async () => {
    const org = await createOrganization("Negocio A");
    await insertSupplier(org, {
      name: "Uno",
      phone: "+5491155551234",
      email: "ventas@norte.com",
    });
    await insertSupplier(org, {
      name: "Dos",
      phone: "+5491155551234",
      email: "ventas@norte.com",
    });
  });

  it("UNIQUE (organization_id, id) existe para las claves compuestas", async () => {
    const result = await getDb().execute<{ name: string }>(
      sql`select conname as name from pg_constraint
          where conrelid = 'suppliers'::regclass and contype = 'u'`,
    );
    expect(result.rows.map((row) => row.name)).toContain(
      "suppliers_organization_id_id_unique",
    );
  });
});
