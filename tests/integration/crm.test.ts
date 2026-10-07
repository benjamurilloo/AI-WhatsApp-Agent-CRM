import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createClient,
  deactivateClient,
  getClient,
  listClientAudit,
  reactivateClient,
  searchClients,
  suggestClients,
  updateClient,
  type ClientInput,
  type ClientListFilters,
} from "@/modules/crm";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Servicio de clientes contra PostgreSQL real (brief-5.2): escrituras auditadas, CONFLICT por
// teléfono, autorización, aislamiento entre organizaciones, lista, auditoría y enmascarado (H-5).

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
  role: "admin" | "viewer",
  mustChangePassword = false,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${`Persona ${email}`}, ${mustChangePassword}) returning id`,
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

// Organización A con admin, viewer y un admin con contraseña pendiente; organización B con admin.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgA, "pendiente-a@example.com", "admin", true);
  await addUser(orgB, "admin-b@example.com", "admin");
  return {
    orgA,
    orgB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    pendingA: await contextFor("pendiente-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

const PHONE = "+5491155551234";

const ana: ClientInput = {
  displayName: "Ana Pérez",
  phone: "+54 9 11 5555-1234",
  notes: "Prefiere contacto por la tarde",
};

async function create(context: AuthContext, input: ClientInput = ana) {
  const result = await createClient(context, input);
  if (!result.ok) throw new Error(`alta rechazada: ${result.code}`);
  return result.clientId;
}

async function count(table: "clients" | "audit_logs") {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

async function auditRows() {
  const result = await getDb().execute(
    sql`select organization_id, actor_user_id, entity_type, entity_id, action, diff
        from audit_logs order by created_at, id`,
  );
  return result.rows;
}

async function clientRow(clientId: string) {
  const result = await getDb().execute(
    sql`select display_name, phone_e164, notes, is_active from clients where id = ${clientId}`,
  );
  return result.rows[0];
}

// Clientes por SQL, sin auditoría: preparan la lista.
async function insertClient(
  organizationId: string,
  displayName: string,
  phone: string | null = null,
  isActive = true,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, is_active)
        values (${organizationId}, ${displayName}, ${phone}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

const listDefaults: ClientListFilters = {
  text: "",
  activity: "active",
  page: 1,
};

async function listNames(
  context: AuthContext,
  filters: Partial<ClientListFilters>,
) {
  const result = await searchClients(context, { ...listDefaults, ...filters });
  if (!result.ok) throw new Error(`lista rechazada: ${result.code}`);
  return result.clients.map((client) => client.displayName);
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("createClient", () => {
  it("crea el cliente normalizado y lo audita en la misma transacción", async () => {
    const s = await seed();
    const clientId = await create(s.adminA, {
      ...ana,
      displayName: "  Ana Pérez ",
    });

    expect(await clientRow(clientId)).toEqual({
      display_name: "Ana Pérez",
      phone_e164: PHONE,
      notes: "Prefiere contacto por la tarde",
      is_active: true,
    });
    expect(await auditRows()).toEqual([
      {
        organization_id: s.orgA,
        actor_user_id: s.adminA.userId,
        entity_type: "client",
        entity_id: clientId,
        action: "create",
        diff: {
          before: null,
          after: {
            displayName: "Ana Pérez",
            phoneE164: PHONE,
            notes: "Prefiere contacto por la tarde",
            isActive: true,
          },
        },
      },
    ]);
  });

  it("acepta un cliente sin teléfono ni notas", async () => {
    const s = await seed();
    const clientId = await create(s.adminA, { displayName: "Bruno" });
    expect(await clientRow(clientId)).toEqual({
      display_name: "Bruno",
      phone_e164: null,
      notes: null,
      is_active: true,
    });
  });

  it("una entrada inválida devuelve los campos y no escribe nada", async () => {
    const s = await seed();
    expect(
      await createClient(s.adminA, {
        displayName: "",
        phone: "011 5555-1234",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["displayName", "phone"],
    });
    expect(await count("clients")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });

  it("un teléfono repetido, escrito de otra forma o de un inactivo, da CONFLICT sin auditoría", async () => {
    const s = await seed();
    const first = await create(s.adminA);
    for (const phone of [PHONE, "+54 (9) 11 5555.1234"]) {
      expect(
        await createClient(s.adminA, { displayName: "Otra", phone }),
      ).toEqual({ ok: false, code: "CONFLICT" });
    }
    await deactivateClient(s.adminA, first);
    expect(
      await createClient(s.adminA, { displayName: "Otra", phone: PHONE }),
    ).toEqual({ ok: false, code: "CONFLICT" });
    expect(await count("clients")).toBe(1);
    expect(await count("audit_logs")).toBe(2);
  });

  it("dos altas simultáneas con el mismo teléfono: exactamente una se crea", async () => {
    const s = await seed();
    const results = await Promise.all([
      createClient(s.adminA, ana),
      createClient(s.adminA, { displayName: "Otra", phone: PHONE }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, code: "CONFLICT" },
    ]);
    expect(await count("clients")).toBe(1);
    expect(await count("audit_logs")).toBe(1);
  });

  it("acepta el mismo teléfono en otra organización", async () => {
    const s = await seed();
    await create(s.adminA);
    await create(s.adminB);
    expect(await count("clients")).toBe(2);
  });

  it("viewer y contraseña pendiente reciben FORBIDDEN sin escribir", async () => {
    const s = await seed();
    for (const context of [s.viewerA, s.pendingA]) {
      expect(await createClient(context, ana)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    expect(await count("clients")).toBe(0);
  });

  it("si falla la auditoría, el cliente no persiste", async () => {
    const s = await seed();
    // Un actor inexistente hace fallar la clave foránea de audit_logs después del insert.
    const ghost: AuthContext = { ...s.adminA, userId: randomUUID() };
    await expect(createClient(ghost, ana)).rejects.toThrow();
    expect(await count("clients")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });
});

describe("updateClient", () => {
  it("audita solo los campos que cambiaron, también al quitar el teléfono", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    expect(
      await updateClient(s.adminA, clientId, {
        displayName: "Ana Pérez",
        phone: "",
        notes: "Prefiere contacto por la tarde",
      }),
    ).toEqual({ ok: true, changed: true });

    expect(await clientRow(clientId)).toMatchObject({ phone_e164: null });
    expect((await auditRows())[1]).toEqual({
      organization_id: s.orgA,
      actor_user_id: s.adminA.userId,
      entity_type: "client",
      entity_id: clientId,
      action: "update",
      diff: { before: { phoneE164: PHONE }, after: { phoneE164: null } },
    });
  });

  it("un cambio sin diferencias no escribe ni audita", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    expect(
      await updateClient(s.adminA, clientId, {
        ...ana,
        displayName: " Ana Pérez ",
        phone: "+549 11 5555 1234",
      }),
    ).toEqual({ ok: true, changed: false });
    expect(await count("audit_logs")).toBe(1);
  });

  it("edita un cliente inactivo", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    await deactivateClient(s.adminA, clientId);
    expect(
      await updateClient(s.adminA, clientId, { ...ana, notes: null }),
    ).toEqual({ ok: true, changed: true });
    expect(await clientRow(clientId)).toMatchObject({
      notes: null,
      is_active: false,
    });
  });

  it("el teléfono de otro cliente da CONFLICT sin cambios ni auditoría", async () => {
    const s = await seed();
    await create(s.adminA);
    const other = await create(s.adminA, {
      displayName: "Bruno",
      phone: "+5491155559999",
    });
    expect(
      await updateClient(s.adminA, other, {
        displayName: "Bruno Díaz",
        phone: "+54 9 11 5555-1234",
      }),
    ).toEqual({ ok: false, code: "CONFLICT" });
    expect(await clientRow(other)).toMatchObject({
      display_name: "Bruno",
      phone_e164: "+5491155559999",
    });
    expect(await count("audit_logs")).toBe(2);
  });

  it("valida la entrada y el id, y rechaza roles y otras organizaciones", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    expect(
      await updateClient(s.adminA, clientId, { ...ana, phone: "abc" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["phone"] });
    expect(await updateClient(s.adminA, "no-es-un-uuid", ana)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await updateClient(s.viewerA, clientId, ana)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await updateClient(s.adminB, clientId, ana)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await updateClient(s.adminA, randomUUID(), ana)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("deactivateClient y reactivateClient", () => {
  it("desactivan y reactivan con auditoría, y sin cambio no auditan", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    expect(await reactivateClient(s.adminA, clientId)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await deactivateClient(s.adminA, clientId)).toEqual({
      ok: true,
      changed: true,
    });
    expect(await deactivateClient(s.adminA, clientId)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await reactivateClient(s.adminA, clientId)).toEqual({
      ok: true,
      changed: true,
    });

    const rows = await auditRows();
    expect(rows.map((row) => [row.action, row.diff])).toEqual([
      ["create", expect.anything()],
      [
        "deactivate",
        { before: { isActive: true }, after: { isActive: false } },
      ],
      [
        "reactivate",
        { before: { isActive: false }, after: { isActive: true } },
      ],
    ]);
    expect(await clientRow(clientId)).toMatchObject({ is_active: true });
  });

  it("rechazan roles, ids inválidos y otras organizaciones", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    for (const action of [deactivateClient, reactivateClient]) {
      expect(await action(s.viewerA, clientId)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await action(s.pendingA, clientId)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await action(s.adminB, clientId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await action(s.adminA, "123")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
    }
    expect(await count("audit_logs")).toBe(1);
  });
});

describe("getClient", () => {
  it("admin y viewer leen el cliente; otra organización da NOT_FOUND", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    const forAdmin = await getClient(s.adminA, clientId);
    expect(forAdmin).toEqual({
      ok: true,
      client: {
        id: clientId,
        displayName: "Ana Pérez",
        phone: { kind: "full", e164: PHONE },
        notes: "Prefiere contacto por la tarde",
        isActive: true,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        tags: [],
      },
    });
    expect(await getClient(s.viewerA, clientId)).toMatchObject({
      ok: true,
      client: { phone: { kind: "masked", lastDigits: "1234" } },
    });
    expect(await getClient(s.adminB, clientId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await getClient(s.pendingA, clientId)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await getClient(s.adminA, "x")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });
});

describe("searchClients", () => {
  it("busca por prefijo de nombre sin distinguir mayúsculas, con % y _ literales", async () => {
    const s = await seed();
    await insertClient(s.orgA, "Ana Pérez");
    await insertClient(s.orgA, "anabel Ruiz");
    await insertClient(s.orgA, "Mariana");
    await insertClient(s.orgA, "50% Descuento");
    await insertClient(s.orgA, "5_0 Otro");
    await insertClient(s.orgB, "Ana de B");

    // Se ordena en JavaScript: el collation de la base ignora los espacios al ordenar (D-4).
    expect((await listNames(s.adminA, { text: " ANA " })).sort()).toEqual([
      "Ana Pérez",
      "anabel Ruiz",
    ]);
    expect(await listNames(s.adminA, { text: "Pérez" })).toEqual([]);
    expect(await listNames(s.adminA, { text: "50%" })).toEqual([
      "50% Descuento",
    ]);
    expect(await listNames(s.adminA, { text: "5_" })).toEqual(["5_0 Otro"]);
  });

  it("el prefijo del nombre entra en el Index Cond del índice normalizado (9.0.2, AC-4)", async () => {
    const s = await seed();
    await insertClient(s.orgA, "Ana Pérez");
    // Mismo razonamiento que el caso equivalente de catalog: hacen falta filas para que el
    // planificador tenga con qué decidir. Fixture sintético.
    await getDb().execute(
      sql`insert into clients (organization_id, display_name)
          select ${s.orgA}, 'Cliente '||g from generate_series(1, 2000) g`,
    );
    await getDb().execute(sql`analyze clients`);

    const plan = (
      await getDb().execute<{ "QUERY PLAN": string }>(
        sql`explain select id from clients
            where organization_id = ${s.orgA}
              and immutable_unaccent(lower(display_name)) like immutable_unaccent(lower('an%'))`,
      )
    ).rows
      .map((row) => row["QUERY PLAN"])
      .join("\n");

    // Lo que discrimina es la cota `~>=~` sobre la expresión, no que aparezca el nombre del índice:
    // ese índice empieza por organization_id y se usa igual sin normalizar, con el nombre en
    // `Filter`. Ver el comentario del caso equivalente en catalog.test.ts.
    expect(plan).toContain("clients_organization_display_name_unaccent_idx");
    expect(plan).toContain("immutable_unaccent(lower(display_name)) ~>=~");
  });

  it("no distingue acentos, en las dos direcciones (9.0.2)", async () => {
    const s = await seed();
    await insertClient(s.orgA, "José Ñandú");
    await insertClient(s.orgA, "Jose Simple");
    await insertClient(s.orgA, "Ángel");
    await insertClient(s.orgB, "José de B");

    // Sin acentos encuentra lo acentuado.
    expect((await listNames(s.adminA, { text: "jose" })).sort()).toEqual([
      "Jose Simple",
      "José Ñandú",
    ]);
    // Y con acentos encuentra lo que no los tiene: la normalización va en los dos lados.
    expect((await listNames(s.adminA, { text: "josé" })).sort()).toEqual([
      "Jose Simple",
      "José Ñandú",
    ]);
    expect(await listNames(s.adminA, { text: "angel" })).toEqual(["Ángel"]);
    // Sigue siendo prefijo, no "contiene": ampliar eso es otra subfase.
    expect(await listNames(s.adminA, { text: "andu" })).toEqual([]);
    // Y sigue sin cruzar organizaciones.
    expect(await listNames(s.adminB, { text: "jose" })).toEqual(["José de B"]);
  });

  it("el orden de la lista no cambió con la normalización (9.0.2, AC-6)", async () => {
    const s = await seed();
    await insertClient(s.orgA, "Bravo");
    await insertClient(s.orgA, "Ávila");
    await insertClient(s.orgA, "Avila");
    await insertClient(s.orgA, "Ángel");

    // El ORDEN sigue usando lower(display_name) a secas, sin normalizar acentos: la 9.0.2 cambió
    // la búsqueda, no el orden. Este caso fija la conducta actual para que no se mueva sin que
    // nos enteremos; unir "Avila" con "Ávila" al ordenar sería otra decisión de producto.
    expect(await listNames(s.adminA, {})).toEqual([
      "Ángel",
      "Avila",
      "Ávila",
      "Bravo",
    ]);
  });

  it("busca por teléfono completo escrito de cualquier forma, y no por fragmentos", async () => {
    const s = await seed();
    await insertClient(s.orgA, "Ana", PHONE);
    await insertClient(s.orgA, "Bruno", "+5491155559999");
    await insertClient(s.orgB, "Ana de B", PHONE);

    for (const text of [PHONE, "+54 9 11 5555-1234"]) {
      expect(await listNames(s.adminA, { text })).toEqual(["Ana"]);
      expect(await listNames(s.viewerA, { text })).toEqual(["Ana"]);
    }
    expect(await listNames(s.adminA, { text: "5555" })).toEqual([]);
    expect(await listNames(s.adminA, { text: "+5491155550000" })).toEqual([]);
  });

  it("filtra por actividad, con solo activos por defecto", async () => {
    const s = await seed();
    await insertClient(s.orgA, "Activo");
    await insertClient(s.orgA, "Inactivo", null, false);

    expect(await listNames(s.adminA, {})).toEqual(["Activo"]);
    expect(await listNames(s.adminA, { activity: "inactive" })).toEqual([
      "Inactivo",
    ]);
    expect(await listNames(s.adminA, { activity: "all" })).toEqual([
      "Activo",
      "Inactivo",
    ]);
  });

  it("ordena por nombre sin distinguir mayúsculas, con desempate estable, y pagina de a 25", async () => {
    const s = await seed();
    const ids: string[] = [];
    for (let i = 0; i < 27; i++) {
      ids.push(await insertClient(s.orgA, "Mismo nombre"));
    }
    await insertClient(s.orgA, "a primero");
    await insertClient(s.orgA, "B segundo");

    const first = await searchClients(s.adminA, listDefaults);
    const second = await searchClients(s.adminA, { ...listDefaults, page: 2 });
    const beyond = await searchClients(s.adminA, { ...listDefaults, page: 9 });
    if (!first.ok || !second.ok || !beyond.ok) throw new Error("rechazada");

    expect(first).toMatchObject({ total: 29, page: 1, pageCount: 2 });
    expect(first.clients).toHaveLength(25);
    expect(first.clients.slice(0, 2).map((c) => c.displayName)).toEqual([
      "a primero",
      "B segundo",
    ]);
    expect(second).toMatchObject({ total: 29, page: 2, pageCount: 2 });
    expect(beyond.page).toBe(2);
    expect(beyond.clients).toEqual(second.clients);
    expect(
      [...first.clients.slice(2), ...second.clients].map((c) => c.id),
    ).toEqual([...ids].sort());
  });

  it("sin clientes devuelve una página vacía; contraseña pendiente da FORBIDDEN", async () => {
    const s = await seed();
    expect(await searchClients(s.viewerA, listDefaults)).toEqual({
      ok: true,
      clients: [],
      total: 0,
      page: 1,
      pageCount: 1,
    });
    expect(await searchClients(s.pendingA, listDefaults)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});

describe("suggestClients (brief-15.2, D-6)", () => {
  async function suggested(context: AuthContext, text: string) {
    const result = await suggestClients(context, text);
    if (!result.ok) throw new Error(result.code);
    return result.clients;
  }

  it("sugiere por prefijo de nombre sin tildes ni mayúsculas, solo activos, de la organización y hasta 8", async () => {
    const s = await seed();
    await insertClient(s.orgA, "Ána Pérez", PHONE);
    await insertClient(s.orgA, "Anabel Ruiz");
    await insertClient(s.orgA, "Ana inactiva", null, false);
    await insertClient(s.orgA, "Mariana");
    await insertClient(s.orgB, "Ana de B");
    const names = (await suggested(s.viewerA, "ana")).map((c) => c.name);
    expect(names.sort()).toEqual(["Anabel Ruiz", "Ána Pérez"].sort());

    for (let i = 0; i < 10; i++) {
      await insertClient(s.orgA, `Bruno ${String(i).padStart(2, "0")}`);
    }
    expect(await suggested(s.adminA, "bru")).toHaveLength(8);
  });

  it("devuelve solo id y nombre, nunca el teléfono, también para un admin", async () => {
    const s = await seed();
    const id = await insertClient(s.orgA, "Ana Pérez", PHONE);
    for (const context of [s.adminA, s.viewerA]) {
      const clients = await suggested(context, "an");
      expect(clients).toEqual([{ id, name: "Ana Pérez" }]);
      expect(JSON.stringify(clients)).not.toContain("5555");
    }
  });

  it("no sugiere con menos de 2 caracteres ni con un texto que parece teléfono", async () => {
    const s = await seed();
    await insertClient(s.orgA, "Ana Pérez", PHONE);
    expect(await suggested(s.adminA, "a")).toEqual([]);
    expect(await suggested(s.adminA, "  ")).toEqual([]);
    expect(await suggested(s.adminA, "+54 9 11 5555-1234")).toEqual([]);
    expect(await suggested(s.adminA, "11")).toEqual([]);
  });

  it("una contraseña pendiente recibe FORBIDDEN", async () => {
    const s = await seed();
    expect(await suggestClients(s.pendingA, "ana")).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});

describe("teléfono para viewer (H-5, FR-CLI-06)", () => {
  // Los dígitos anteriores a los últimos 4 no pueden aparecer en ninguna forma.
  const HIDDEN = ["5491155551234", "549115555", "+549"];

  function expectNoFullPhone(response: unknown) {
    const json = JSON.stringify(response);
    for (const fragment of HIDDEN) expect(json).not.toContain(fragment);
  }

  it("la respuesta a viewer no contiene el número en la lectura ni en la lista", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);

    const detail = await getClient(s.viewerA, clientId);
    const list = await searchClients(s.viewerA, listDefaults);
    const byPhone = await searchClients(s.viewerA, {
      ...listDefaults,
      text: "+54 9 11 5555-1234",
    });
    expect(detail.ok && list.ok && byPhone.ok).toBe(true);
    if (byPhone.ok) expect(byPhone.total).toBe(1);
    for (const response of [detail, list, byPhone]) {
      expectNoFullPhone(response);
      expect(JSON.stringify(response)).toContain('"lastDigits":"1234"');
    }
  });

  it("la respuesta a admin sí contiene el número completo", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    const detail = await getClient(s.adminA, clientId);
    const list = await searchClients(s.adminA, listDefaults);
    for (const response of [detail, list]) {
      expect(JSON.stringify(response)).toContain(PHONE);
    }
  });
});

describe("listClientAudit (FR-AUD-02)", () => {
  it("devuelve los cambios del cliente, del más reciente al más antiguo, con autor", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    // Su alta no puede aparecer en el historial de Ana: el total queda en 3.
    await create(s.adminA, { displayName: "Bruno" });
    await updateClient(s.adminA, clientId, { ...ana, notes: "Otra nota" });
    await deactivateClient(s.adminA, clientId);

    const result = await listClientAudit(s.adminA, clientId, 1);
    if (!result.ok) throw new Error(result.code);
    expect(result).toMatchObject({ total: 3, page: 1, pageCount: 1 });
    expect(result.entries.map((entry) => entry.action)).toEqual([
      "deactivate",
      "update",
      "create",
    ]);
    expect(result.entries[0]).toMatchObject({
      entityType: "client",
      diff: { before: { isActive: true }, after: { isActive: false } },
      actor: {
        kind: "user",
        id: s.adminA.userId,
        name: "Persona admin-a@example.com",
      },
    });
  });

  // Una fila de servicio insertada por SQL, como fixture sintético: la escritura por servicio llega
  // en la 12.1.2 (brief-12.1, D-4).
  it("FR-AUD-03: una fila de servicio se entrega como servicio, sin nombre de usuario", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    const credential = await getDb().execute<{ id: string }>(
      sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
          values (${s.orgA}, 'emisor-a', 'ingest', ${randomUUID()}) returning id`,
    );
    const credentialId = credential.rows[0]!.id;
    await getDb().execute(
      sql`insert into audit_logs
            (organization_id, actor_credential_id, entity_type, entity_id, action, diff)
          values (${s.orgA}, ${credentialId}, 'client', ${clientId}, 'update',
            ${JSON.stringify({ before: { notes: null }, after: { notes: "x" } })}::jsonb)`,
    );

    const result = await listClientAudit(s.adminA, clientId, 1);
    if (!result.ok) throw new Error(result.code);
    expect(result.entries.map((entry) => entry.actor)).toEqual([
      { kind: "service", credentialId },
      {
        kind: "user",
        id: s.adminA.userId,
        name: "Persona admin-a@example.com",
      },
    ]);
  });

  it("solo admin de la propia organización", async () => {
    const s = await seed();
    const clientId = await create(s.adminA);
    expect(await listClientAudit(s.viewerA, clientId, 1)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await listClientAudit(s.pendingA, clientId, 1)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await listClientAudit(s.adminB, clientId, 1)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await listClientAudit(s.adminA, "nope", 1)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });
});
