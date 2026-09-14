import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  authorize,
  changeMemberRole,
  createMember,
  deactivateMember,
  getAppFrame,
  getAuthContext,
  getMember,
  listMembers,
  reactivateMember,
  type AuthContext,
} from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Gestión de miembros contra PostgreSQL real (brief-3.7): alta con contraseña inicial, cambios de
// rol y estado auditados, regla del último admin con concurrencia y aislamiento entre organizaciones.

const PASSWORD = "contraseña-correcta-larga";
let storedHash: string;
let consoleCalls: unknown[][] = [];

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function createUser(
  email: string,
  options: {
    name?: string;
    isActive?: boolean;
    mustChangePassword?: boolean;
  } = {},
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, is_active, must_change_password)
        values (${email}, ${storedHash}, ${options.name ?? "Persona"}, ${options.isActive ?? true},
                ${options.mustChangePassword ?? false})
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

async function tokenFor(email: string, password = PASSWORD) {
  const result = await login({ email, password, ip: null });
  if (!result.ok) throw new Error(`login rechazado: ${result.code}`);
  return result.token;
}

async function contextFor(email: string): Promise<AuthContext> {
  const result = await getAuthContext(await tokenFor(email));
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function count(query: ReturnType<typeof sql>) {
  const result = await getDb().execute<{ count: number }>(query);
  return result.rows[0]!.count;
}

const auditCount = () =>
  count(sql`select count(*)::int as count from audit_logs`);

async function auditRows() {
  const result = await getDb().execute(
    sql`select organization_id, actor_user_id, entity_type, entity_id, action, diff
        from audit_logs order by created_at`,
  );
  return result.rows;
}

async function memberState(memberId: string) {
  const role = await getDb().execute<{ role: string; user_id: string }>(
    sql`select role, user_id from organization_members where id = ${memberId}`,
  );
  const user = await getDb().execute<{ is_active: boolean }>(
    sql`select is_active from users where id = ${role.rows[0]!.user_id}`,
  );
  return { role: role.rows[0]!.role, isActive: user.rows[0]!.is_active };
}

// Texto de todas las filas de todas las tablas de public, para buscar un valor en claro.
async function allStoredText() {
  const tables = await getDb().execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  let text = "";
  for (const { tablename } of tables.rows) {
    const rows = await getDb().execute<{ content: string | null }>(
      sql.raw(
        `select string_agg(row_to_json(t)::text, '') as content from "public"."${tablename}" t`,
      ),
    );
    text += rows.rows[0]?.content ?? "";
  }
  return text;
}

// Organización A con un admin y un viewer; organización B con un admin.
async function seedTwoOrganizations() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const adminA = await createUser("admin-a@example.com", { name: "Ana" });
  const viewerA = await createUser("viewer-a@example.com", { name: "Bruno" });
  const adminB = await createUser("admin-b@example.com", { name: "Carla" });
  return {
    orgA,
    orgB,
    adminA,
    viewerA,
    adminAMember: await addMember(orgA, adminA, "admin"),
    viewerAMember: await addMember(orgA, viewerA, "viewer"),
    adminBMember: await addMember(orgB, adminB, "admin"),
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
  consoleCalls = [];
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("createMember", () => {
  it("crea usuario, membresía y auditoría en la misma operación", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");

    const result = await createMember(context, {
      name: "  Pablo Díaz  ",
      email: "  Pablo@Example.com ",
      role: "viewer",
    });
    expect(result).toMatchObject({ ok: true, name: "Pablo Díaz" });
    if (!result.ok) return;

    const user = await getDb().execute(
      sql`select email, name, must_change_password, is_active, password_hash like '$argon2id$%' as argon2
          from users where id = ${result.userId}`,
    );
    expect(user.rows).toEqual([
      {
        email: "pablo@example.com",
        name: "Pablo Díaz",
        must_change_password: true,
        is_active: true,
        argon2: true,
      },
    ]);
    const member = await getDb().execute(
      sql`select organization_id, user_id, role from organization_members where id = ${result.memberId}`,
    );
    expect(member.rows).toEqual([
      { organization_id: seed.orgA, user_id: result.userId, role: "viewer" },
    ]);
    expect(await auditRows()).toEqual([
      {
        organization_id: seed.orgA,
        actor_user_id: seed.adminA,
        entity_type: "organization_member",
        entity_id: result.memberId,
        action: "create",
        diff: {
          before: null,
          after: { userId: result.userId, role: "viewer", isActive: true },
        },
      },
    ]);
  });

  it("el usuario creado ingresa con la contraseña inicial y queda bloqueado hasta cambiarla", async () => {
    await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    const result = await createMember(context, {
      name: "Pablo",
      email: "pablo@example.com",
      role: "admin",
    });
    if (!result.ok) throw new Error(result.code);

    const created = await getAuthContext(
      await tokenFor("pablo@example.com", result.initialPassword),
    );
    expect(created).toMatchObject({
      ok: true,
      context: { role: "admin", mustChangePassword: true },
    });
    if (!created.ok) return;
    expect(authorize(created.context)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    await expect(
      listMembers(created.context, { role: "all", status: "all", page: 1 }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("un email existente con otras mayúsculas da CONFLICT sin escribir nada", async () => {
    await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    await expect(
      createMember(context, {
        name: "Otra",
        email: "VIEWER-A@example.com",
        role: "viewer",
      }),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
    // Un email de otra organización también está tomado: el email es global.
    await expect(
      createMember(context, {
        name: "Otra",
        email: "admin-b@example.com",
        role: "viewer",
      }),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });

    expect(await count(sql`select count(*)::int as count from users`)).toBe(3);
    expect(
      await count(sql`select count(*)::int as count from organization_members`),
    ).toBe(3);
    expect(await auditCount()).toBe(0);
  });

  it("dos altas concurrentes con el mismo email: una crea y la otra da CONFLICT, sin huérfanos", async () => {
    await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    const results = await Promise.all([
      createMember(context, {
        name: "Nueva",
        email: "Nueva@Example.com",
        role: "viewer",
      }),
      createMember(context, {
        name: "Nueva",
        email: "nueva@example.com",
        role: "admin",
      }),
    ]);

    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(results.find((result) => !result.ok)).toEqual({
      ok: false,
      code: "CONFLICT",
    });
    expect(
      await count(
        sql`select count(*)::int as count from users where lower(email) = 'nueva@example.com'`,
      ),
    ).toBe(1);
    expect(
      await count(sql`select count(*)::int as count from organization_members`),
    ).toBe(4);
    expect(await auditCount()).toBe(1);
  });

  it("una entrada inválida da VALIDATION_ERROR con los campos, sin escribir nada", async () => {
    await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    await expect(
      createMember(context, {
        name: "   ",
        email: "no-es-un-email",
        role: "owner",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["name", "email", "role"],
    });
    await expect(
      createMember(context, {
        name: "x".repeat(201),
        email: "valido@example.com",
        role: "viewer",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["name"],
    });
    expect(await count(sql`select count(*)::int as count from users`)).toBe(3);
    expect(await auditCount()).toBe(0);
  });

  it("la contraseña inicial no queda en ninguna tabla, auditoría ni log", async () => {
    await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    const result = await createMember(context, {
      name: "Pablo",
      email: "pablo@example.com",
      role: "viewer",
    });
    if (!result.ok) throw new Error(result.code);

    const stored = await allStoredText();
    expect(stored).toContain("pablo@example.com");
    expect(stored).not.toContain(result.initialPassword);
    expect(stored).not.toContain(result.initialPassword.replaceAll("-", ""));
    expect(JSON.stringify(consoleCalls)).not.toContain(result.initialPassword);
  });
});

describe("cambio de rol, desactivación y reactivación", () => {
  it("cambiar el rol lo guarda y audita el diff exacto", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");

    await expect(
      changeMemberRole(context, seed.viewerAMember, "admin"),
    ).resolves.toEqual({ ok: true, changed: true });
    expect(await memberState(seed.viewerAMember)).toEqual({
      role: "admin",
      isActive: true,
    });
    expect(await auditRows()).toEqual([
      {
        organization_id: seed.orgA,
        actor_user_id: seed.adminA,
        entity_type: "organization_member",
        entity_id: seed.viewerAMember,
        action: "role_change",
        diff: { before: { role: "viewer" }, after: { role: "admin" } },
      },
    ]);
  });

  it("desactivar borra las sesiones del usuario y reactivar lo habilita, cada uno auditado", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    const viewerToken = await tokenFor("viewer-a@example.com");

    await expect(
      deactivateMember(context, seed.viewerAMember),
    ).resolves.toEqual({ ok: true, changed: true });
    expect(await memberState(seed.viewerAMember)).toEqual({
      role: "viewer",
      isActive: false,
    });
    expect(
      await count(
        sql`select count(*)::int as count from sessions where user_id = ${seed.viewerA}`,
      ),
    ).toBe(0);
    await expect(getAuthContext(viewerToken)).resolves.toEqual({
      ok: false,
      code: "UNAUTHENTICATED",
    });
    // La sesión del admin que actuó no se toca.
    await expect(
      listMembers(context, { role: "all", status: "all", page: 1 }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      reactivateMember(context, seed.viewerAMember),
    ).resolves.toEqual({ ok: true, changed: true });
    expect(await memberState(seed.viewerAMember)).toMatchObject({
      isActive: true,
    });
    await expect(tokenFor("viewer-a@example.com")).resolves.toBeTypeOf(
      "string",
    );

    const rows = await auditRows();
    expect(rows.map((row) => [row.action, row.diff])).toEqual([
      [
        "deactivate",
        { before: { isActive: true }, after: { isActive: false } },
      ],
      [
        "reactivate",
        { before: { isActive: false }, after: { isActive: true } },
      ],
    ]);
  });

  it("una operación sin cambio real devuelve éxito sin escribir auditoría", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");

    await expect(
      changeMemberRole(context, seed.viewerAMember, "viewer"),
    ).resolves.toEqual({ ok: true, changed: false });
    await expect(
      reactivateMember(context, seed.viewerAMember),
    ).resolves.toEqual({ ok: true, changed: false });
    await deactivateMember(context, seed.viewerAMember);
    await expect(
      deactivateMember(context, seed.viewerAMember),
    ).resolves.toEqual({ ok: true, changed: false });
    expect(await auditCount()).toBe(1);
  });
});

describe("regla del último admin", () => {
  it("quitar el rol o desactivar al único admin activo da BUSINESS_RULE_VIOLATION sin escribir", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");

    await expect(
      changeMemberRole(context, seed.adminAMember, "viewer"),
    ).resolves.toEqual({ ok: false, code: "BUSINESS_RULE_VIOLATION" });
    await expect(deactivateMember(context, seed.adminAMember)).resolves.toEqual(
      { ok: false, code: "BUSINESS_RULE_VIOLATION" },
    );
    expect(await memberState(seed.adminAMember)).toEqual({
      role: "admin",
      isActive: true,
    });
    expect(await auditCount()).toBe(0);
  });

  it("un segundo admin inactivo no cuenta", async () => {
    const seed = await seedTwoOrganizations();
    const inactive = await createUser("inactivo@example.com", {
      isActive: false,
    });
    const inactiveMember = await addMember(seed.orgA, inactive, "admin");
    const context = await contextFor("admin-a@example.com");

    await expect(
      changeMemberRole(context, seed.adminAMember, "viewer"),
    ).resolves.toEqual({ ok: false, code: "BUSINESS_RULE_VIOLATION" });
    // Tocar al admin inactivo no afecta la regla.
    await expect(
      changeMemberRole(context, inactiveMember, "viewer"),
    ).resolves.toEqual({ ok: true, changed: true });
  });

  it("con otro admin activo, un admin puede quitarse el rol a sí mismo", async () => {
    const seed = await seedTwoOrganizations();
    const second = await createUser("admin-a2@example.com");
    await addMember(seed.orgA, second, "admin");
    const context = await contextFor("admin-a@example.com");

    await expect(
      changeMemberRole(context, seed.adminAMember, "viewer"),
    ).resolves.toEqual({ ok: true, changed: true });
    await expect(
      getAuthContext(await tokenFor("admin-a@example.com")),
    ).resolves.toMatchObject({
      ok: true,
      context: { role: "viewer" },
    });
  });

  it("dos admins que se quitan el rol a la vez, en dos conexiones: exactamente uno lo logra", async () => {
    const seed = await seedTwoOrganizations();
    const second = await createUser("admin-a2@example.com");
    const secondMember = await addMember(seed.orgA, second, "admin");
    const contextA = await contextFor("admin-a@example.com");
    const contextA2 = await contextFor("admin-a2@example.com");

    // Una tercera conexión retiene el bloqueo de la organización: las dos escrituras quedan
    // esperando a la vez y compiten cuando se libera.
    let lockTaken!: () => void;
    let release!: () => void;
    const taken = new Promise<void>((resolve) => (lockTaken = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const holder = getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select id from organizations where id = ${seed.orgA} for update`,
      );
      lockTaken();
      await released;
    });
    await taken;

    let settled = 0;
    const changes = [
      changeMemberRole(contextA, seed.adminAMember, "viewer"),
      changeMemberRole(contextA2, secondMember, "viewer"),
    ].map((change) => change.finally(() => settled++));

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(settled).toBe(0);

    release();
    await holder;
    const results = await Promise.all(changes);

    expect(results).toContainEqual({ ok: true, changed: true });
    expect(results).toContainEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
    });
    expect(
      await count(
        sql`select count(*)::int as count from organization_members m
            where m.organization_id = ${seed.orgA} and m.role = 'admin'`,
      ),
    ).toBe(1);
    expect(await auditCount()).toBe(1);
  });
});

describe("autorización y aislamiento", () => {
  it("un viewer y un actor con contraseña pendiente reciben FORBIDDEN en todos los casos de uso", async () => {
    const seed = await seedTwoOrganizations();
    const pending = await createUser("pendiente@example.com", {
      mustChangePassword: true,
    });
    await addMember(seed.orgA, pending, "admin");

    for (const email of ["viewer-a@example.com", "pendiente@example.com"]) {
      const context = await contextFor(email);
      const forbidden = { ok: false, code: "FORBIDDEN" };
      await expect(
        listMembers(context, { role: "all", status: "all", page: 1 }),
      ).resolves.toEqual(forbidden);
      await expect(getMember(context, seed.viewerAMember)).resolves.toEqual(
        forbidden,
      );
      await expect(
        createMember(context, {
          name: "X",
          email: "x@example.com",
          role: "viewer",
        }),
      ).resolves.toEqual(forbidden);
      await expect(
        changeMemberRole(context, seed.adminAMember, "viewer"),
      ).resolves.toEqual(forbidden);
      await expect(
        deactivateMember(context, seed.adminAMember),
      ).resolves.toEqual(forbidden);
      await expect(
        reactivateMember(context, seed.adminAMember),
      ).resolves.toEqual(forbidden);
    }
    expect(await count(sql`select count(*)::int as count from users`)).toBe(4);
    expect(await auditCount()).toBe(0);
  });

  it("un admin cuyo rol se quitó después de resolver la sesión recibe FORBIDDEN al escribir", async () => {
    const seed = await seedTwoOrganizations();
    const second = await createUser("admin-a2@example.com");
    await addMember(seed.orgA, second, "admin");
    const stale = await contextFor("admin-a@example.com");
    await getDb().execute(
      sql`update organization_members set role = 'viewer' where id = ${seed.adminAMember}`,
    );

    await expect(
      createMember(stale, { name: "X", email: "x@example.com", role: "admin" }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    await expect(
      changeMemberRole(stale, seed.viewerAMember, "admin"),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await auditCount()).toBe(0);
  });

  it("un miembro de otra organización da NOT_FOUND al leerlo, cambiarle el rol, desactivarlo o reactivarlo", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    const notFound = { ok: false, code: "NOT_FOUND" };

    await expect(getMember(context, seed.adminBMember)).resolves.toEqual(
      notFound,
    );
    await expect(
      changeMemberRole(context, seed.adminBMember, "viewer"),
    ).resolves.toEqual(notFound);
    await expect(deactivateMember(context, seed.adminBMember)).resolves.toEqual(
      notFound,
    );
    await expect(reactivateMember(context, seed.adminBMember)).resolves.toEqual(
      notFound,
    );
    await expect(deactivateMember(context, randomUUID())).resolves.toEqual(
      notFound,
    );
    await expect(deactivateMember(context, "no-es-un-uuid")).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });

    expect(await memberState(seed.adminBMember)).toEqual({
      role: "admin",
      isActive: true,
    });
    expect(await auditCount()).toBe(0);
  });

  it("getMember devuelve nombre, email, estado y si es el propio usuario", async () => {
    const seed = await seedTwoOrganizations();
    const context = await contextFor("admin-a@example.com");
    await expect(getMember(context, seed.adminAMember)).resolves.toMatchObject({
      ok: true,
      member: {
        id: seed.adminAMember,
        name: "Ana",
        email: "admin-a@example.com",
        role: "admin",
        isActive: true,
        isSelf: true,
      },
    });
  });

  it("getAppFrame devuelve organización, nombre y rol del usuario", async () => {
    await seedTwoOrganizations();
    const context = await contextFor("viewer-a@example.com");
    await expect(getAppFrame(context)).resolves.toEqual({
      organizationName: "Negocio A",
      userName: "Bruno",
      role: "viewer",
    });
  });
});

describe("listMembers", () => {
  it("filtra, ordena por nombre y pagina de a 25, solo con la propia organización y sin hashes", async () => {
    const seed = await seedTwoOrganizations();
    // 30 viewers más en A, uno de cada tres inactivo.
    for (let i = 1; i <= 30; i++) {
      const user = await createUser(`extra${i}@example.com`, {
        name: `Extra ${String(i).padStart(2, "0")}`,
        isActive: i % 3 !== 0,
      });
      await addMember(seed.orgA, user, "viewer");
    }
    const context = await contextFor("admin-a@example.com");

    const all = await listMembers(context, {
      role: "all",
      status: "all",
      page: 1,
    });
    if (!all.ok) throw new Error(all.code);
    expect(all).toMatchObject({ total: 32, page: 1, pageCount: 2 });
    expect(all.members).toHaveLength(25);
    expect(all.members.slice(0, 3).map((member) => member.name)).toEqual([
      "Ana",
      "Bruno",
      "Extra 01",
    ]);
    expect(all.members[0]).toMatchObject({ isSelf: true, role: "admin" });

    const second = await listMembers(context, {
      role: "all",
      status: "all",
      page: 2,
    });
    expect(second).toMatchObject({ ok: true, page: 2 });
    if (second.ok) expect(second.members).toHaveLength(7);

    const everyMember = [...all.members, ...(second.ok ? second.members : [])];
    expect(everyMember.map((member) => member.email)).not.toContain(
      "admin-b@example.com",
    );
    const serialized = JSON.stringify(everyMember);
    expect(serialized).not.toContain("$argon2");
    expect(serialized).not.toContain("passwordHash");

    const activeDefault = await listMembers(context, {
      role: "all",
      status: "active",
      page: 1,
    });
    expect(activeDefault).toMatchObject({ ok: true, total: 22 });

    const inactiveViewers = await listMembers(context, {
      role: "viewer",
      status: "inactive",
      page: 1,
    });
    expect(inactiveViewers).toMatchObject({ ok: true, total: 10 });

    const admins = await listMembers(context, {
      role: "admin",
      status: "all",
      page: 1,
    });
    if (admins.ok) {
      expect(admins.members.map((member) => member.email)).toEqual([
        "admin-a@example.com",
      ]);
    }
  });
});
