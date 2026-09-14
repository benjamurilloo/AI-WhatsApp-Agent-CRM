import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { authorize, getAuthContext, getMember } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Contexto autenticado, guardas y aislamiento entre organizaciones contra PostgreSQL real (brief-3.4).

const PASSWORD = "contraseña-correcta-larga";
let storedHash: string;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function createUser(
  email: string,
  options: { mustChangePassword?: boolean } = {},
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, 'Persona', ${options.mustChangePassword ?? false})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function addMember(
  organizationId: string,
  userId: string,
  role: "admin" | "viewer",
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${userId}, ${role}) returning id`,
  );
  return result.rows[0]!.id;
}

async function tokenFor(email: string) {
  const result = await login({ email, password: PASSWORD, ip: null });
  if (!result.ok) throw new Error(`login rechazado: ${result.code}`);
  return result.token;
}

async function contextFor(email: string) {
  const result = await getAuthContext(await tokenFor(email));
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

// Dos organizaciones con un admin y un viewer cada una.
async function seedTwoOrganizations() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const adminA = await createUser("admin-a@example.com");
  const viewerA = await createUser("viewer-a@example.com");
  const adminB = await createUser("admin-b@example.com");
  return {
    orgA,
    orgB,
    adminA,
    adminAMember: await addMember(orgA, adminA, "admin"),
    viewerAMember: await addMember(orgA, viewerA, "viewer"),
    adminBMember: await addMember(orgB, adminB, "admin"),
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("getAuthContext", () => {
  it("devuelve organización y rol de la membresía", async () => {
    const seed = await seedTwoOrganizations();
    const token = await tokenFor("admin-a@example.com");
    const result = await getAuthContext(token);
    expect(result).toMatchObject({
      ok: true,
      context: {
        userId: seed.adminA,
        organizationId: seed.orgA,
        role: "admin",
        mustChangePassword: false,
      },
    });
    if (result.ok) {
      expect(result.context.sessionExpiresAt).toBeInstanceOf(Date);
      expect(Object.isFrozen(result.context)).toBe(true);
    }
  });

  it("rechaza token ausente, inválido o expirado", async () => {
    await seedTwoOrganizations();
    const token = await tokenFor("admin-a@example.com");
    await getDb().execute(
      sql`update sessions set expires_at = now() - interval '1 second'`,
    );
    for (const candidate of [undefined, null, "", "no-es-un-token", token]) {
      await expect(getAuthContext(candidate)).resolves.toEqual({
        ok: false,
        code: "UNAUTHENTICATED",
      });
    }
  });

  it("rechaza a un usuario con sesión válida pero sin membresía", async () => {
    await createUser("sin-organizacion@example.com");
    const token = await tokenFor("sin-organizacion@example.com");
    await expect(getAuthContext(token)).resolves.toEqual({
      ok: false,
      code: "UNAUTHENTICATED",
    });
  });

  it("rechaza a un usuario desactivado", async () => {
    const seed = await seedTwoOrganizations();
    const token = await tokenFor("admin-a@example.com");
    await getDb().execute(
      sql`update users set is_active = false where id = ${seed.adminA}`,
    );
    await expect(getAuthContext(token)).resolves.toEqual({
      ok: false,
      code: "UNAUTHENTICATED",
    });
  });

  it("un cambio de rol rige en el request siguiente sin revocar la sesión", async () => {
    const seed = await seedTwoOrganizations();
    const token = await tokenFor("admin-a@example.com");
    await getDb().execute(
      sql`update organization_members set role = 'viewer' where id = ${seed.adminAMember}`,
    );
    await expect(getAuthContext(token)).resolves.toMatchObject({
      ok: true,
      context: { role: "viewer" },
    });
  });

  it("quitar la membresía da UNAUTHENTICATED en el request siguiente", async () => {
    const seed = await seedTwoOrganizations();
    const token = await tokenFor("admin-a@example.com");
    await getDb().execute(
      sql`delete from organization_members where id = ${seed.adminAMember}`,
    );
    await expect(getAuthContext(token)).resolves.toEqual({
      ok: false,
      code: "UNAUTHENTICATED",
    });
  });
});

describe("getMember y aislamiento entre organizaciones", () => {
  it("un admin obtiene un miembro de su organización", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    await expect(getMember(context, seed.viewerAMember)).resolves.toMatchObject(
      {
        ok: true,
        member: { id: seed.viewerAMember, role: "viewer" },
      },
    );
  });

  it("un viewer recibe FORBIDDEN", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("viewer-a@example.com");
    await expect(getMember(context, seed.adminAMember)).resolves.toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("un viewer recibe FORBIDDEN también sobre un miembro de otra organización", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("viewer-a@example.com");
    await expect(getMember(context, seed.adminBMember)).resolves.toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("un miembro de otra organización da NOT_FOUND, igual que uno inexistente", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    const otherOrganization = await getMember(context, seed.adminBMember);
    const nonexistent = await getMember(context, randomUUID());
    expect(otherOrganization).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(nonexistent).toEqual(otherOrganization);
  });

  it("un id con formato inválido da VALIDATION_ERROR", async () => {
    await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    await expect(getMember(context, "no-es-un-uuid")).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });
});

describe("must_change_password", () => {
  it("obtiene contexto, pero authorize y getMember dan FORBIDDEN", async () => {
    const orgA = await createOrganization("Negocio A");
    const adminId = await createUser("pendiente@example.com", {
      mustChangePassword: true,
    });
    const memberId = await addMember(orgA, adminId, "admin");

    const context = await contextFor("pendiente@example.com");
    expect(context.mustChangePassword).toBe(true);
    expect(authorize(context)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(authorize(context, { role: "admin" })).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    await expect(getMember(context, memberId)).resolves.toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});
