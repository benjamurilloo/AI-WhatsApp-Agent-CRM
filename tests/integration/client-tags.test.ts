import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { searchClientsByLastInteraction } from "@/modules/conversations";
import {
  assignClientTag,
  createClientTag,
  createSuggestedClientTags,
  deactivateClientTag,
  getClient,
  getClientsByIds,
  listActiveClientTags,
  listClientAudit,
  listClientTags,
  MAX_ACTIVE_TAGS,
  MAX_TAGS_PER_CLIENT,
  reactivateClientTag,
  removeClientTag,
  searchClients,
  SUGGESTED_TAGS,
  updateClientTag,
  type ClientListFilters,
} from "@/modules/crm";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Etiquetas de clientes contra PostgreSQL real (brief-16.1): esquema y privilegios (AC-1),
// aislamiento en la base (AC-2), catálogo (AC-3, FR-CLI-08), sugeridas (AC-4), asignaciones
// (AC-5, FR-CLI-09), inactivas (AC-6), filtro de la lista (AC-7, FR-CLI-10), límites (AC-8) y el
// enmascarado del teléfono, que no cambia (AC-13).

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
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${`Persona ${email}`}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
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
  await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgB, "admin-b@example.com", "admin");
  return {
    orgA,
    orgB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

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

async function newTag(
  context: AuthContext,
  name: string,
  color: string | null = null,
) {
  const result = await createClientTag(context, { name, color });
  if (!result.ok) throw new Error(`etiqueta rechazada: ${result.code}`);
  return result.tagId;
}

async function tagAudit(entityType: "client" | "client_tag") {
  const result = await getDb().execute<{
    entity_id: string;
    action: string;
    diff: unknown;
  }>(
    sql`select entity_id, action, diff from audit_logs
        where entity_type = ${entityType} order by created_at, id`,
  );
  return result.rows;
}

async function count(table: "client_tags" | "client_tag_assignments") {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

const listDefaults: ClientListFilters = {
  text: "",
  activity: "active",
  page: 1,
};

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("esquema y privilegios (AC-1)", () => {
  it("crm_app tiene SELECT, INSERT y UPDATE sobre client_tags, sin DELETE", async () => {
    const result = await getDb().execute<{ privilege_type: string }>(
      sql`select privilege_type from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'client_tags'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege_type)).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE",
    ]);
  });

  it("crm_app tiene SELECT, INSERT y DELETE sobre client_tag_assignments, sin UPDATE", async () => {
    const result = await getDb().execute<{ privilege_type: string }>(
      sql`select privilege_type from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'client_tag_assignments'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege_type)).toEqual([
      "DELETE",
      "INSERT",
      "SELECT",
    ]);
  });

  it("con el rol de la aplicación, borrar una etiqueta o modificar una asignación lo rechaza la base", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const clientId = await insertClient(s.orgA, "Ana");
    await assignClientTag(s.adminA, clientId, tagId);

    await expect(
      asAppRole((tx) => tx.execute(sql`delete from client_tags`)),
    ).rejects.toThrow();
    await expect(
      asAppRole((tx) =>
        tx.execute(sql`update client_tag_assignments set created_at = now()`),
      ),
    ).rejects.toThrow();
    expect(await count("client_tags")).toBe(1);
  });

  // Revisión independiente de la 16.1.1, hallazgo 3: el índice y los enums, contra el catálogo.
  it("existen el índice por etiqueta y los valores nuevos de los enums de auditoría", async () => {
    const indexes = await getDb().execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes
           where tablename = 'client_tag_assignments'
             and indexname = 'client_tag_assignments_organization_tag_idx'`,
    );
    expect(indexes.rows.map((row) => row.indexdef)).toEqual([
      expect.stringContaining("(organization_id, tag_id)"),
    ]);

    const enums = await getDb().execute<{ type: string; label: string }>(
      sql`select t.typname as type, e.enumlabel as label
            from pg_enum e join pg_type t on t.oid = e.enumtypid
           where (t.typname, e.enumlabel) in
                 (('audit_entity_type', 'client_tag'), ('audit_action', 'tag_change'))
           order by t.typname`,
    );
    expect(enums.rows).toEqual([
      { type: "audit_action", label: "tag_change" },
      { type: "audit_entity_type", label: "client_tag" },
    ]);
  });

  it("el CHECK rechaza un color fuera de la paleta y un nombre vacío o de más de 40", async () => {
    const s = await seed();
    for (const [name, color] of [
      ["Rosa", "pink"],
      ["", "gray"],
      ["x".repeat(41), "gray"],
    ]) {
      await expect(
        getDb().execute(
          sql`insert into client_tags (organization_id, name, color)
              values (${s.orgA}, ${name}, ${color})`,
        ),
        `${name}/${color}`,
      ).rejects.toThrow();
    }
    expect(await count("client_tags")).toBe(0);
  });

  it("el nombre es único por organización sin distinguir mayúsculas, y se repite entre organizaciones", async () => {
    const s = await seed();
    await getDb().execute(
      sql`insert into client_tags (organization_id, name) values (${s.orgA}, 'Reclamo')`,
    );
    await expect(
      getDb().execute(
        sql`insert into client_tags (organization_id, name) values (${s.orgA}, 'RECLAMO')`,
      ),
    ).rejects.toThrow();
    await getDb().execute(
      sql`insert into client_tags (organization_id, name) values (${s.orgB}, 'Reclamo')`,
    );
    expect(await count("client_tags")).toBe(2);
  });
});

describe("aislamiento por organización en la base (AC-2, invariante 1)", () => {
  it("una asignación entre un cliente y una etiqueta de organizaciones distintas la rechaza PostgreSQL", async () => {
    const s = await seed();
    const tagB = await newTag(s.adminB, "Reclamo");
    const clientA = await insertClient(s.orgA, "Ana");

    // Con la organización del cliente, la etiqueta no es de esa organización.
    await expect(
      getDb().execute(
        sql`insert into client_tag_assignments (organization_id, client_id, tag_id)
            values (${s.orgA}, ${clientA}, ${tagB})`,
      ),
    ).rejects.toThrow();
    // Con la organización de la etiqueta, el cliente no es de esa organización.
    await expect(
      getDb().execute(
        sql`insert into client_tag_assignments (organization_id, client_id, tag_id)
            values (${s.orgB}, ${clientA}, ${tagB})`,
      ),
    ).rejects.toThrow();
    expect(await count("client_tag_assignments")).toBe(0);
  });

  it("el servicio no pone la etiqueta de otra organización ni toca su catálogo", async () => {
    const s = await seed();
    const tagB = await newTag(s.adminB, "Reclamo");
    const clientA = await insertClient(s.orgA, "Ana");

    expect(await assignClientTag(s.adminA, clientA, tagB)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await updateClientTag(s.adminA, tagB, { name: "Otra", color: "red" }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await deactivateClientTag(s.adminA, tagB)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    const listed = await listClientTags(s.adminA);
    expect(listed.ok && listed.tags).toEqual([]);
  });
});

describe("FR-CLI-08: catálogo de etiquetas (AC-3)", () => {
  it("un admin crea una etiqueta, auditada como create; sin color, gris", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "  Interesado  ");

    const listed = await listClientTags(s.adminA);
    expect(listed.ok && listed.tags).toEqual([
      expect.objectContaining({
        id: tagId,
        name: "Interesado",
        color: "gray",
        isActive: true,
        activeClients: 0,
      }),
    ]);
    expect(await tagAudit("client_tag")).toEqual([
      {
        entity_id: tagId,
        action: "create",
        diff: {
          before: null,
          after: { name: "Interesado", color: "gray", isActive: true },
        },
      },
    ]);
  });

  it("un nombre repetido, también frente a una inactiva, da CONFLICT y no escribe", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    await deactivateClientTag(s.adminA, tagId);

    expect(await createClientTag(s.adminA, { name: "reclamo" })).toEqual({
      ok: false,
      code: "CONFLICT",
    });
    const other = await newTag(s.adminA, "Interesado");
    expect(
      await updateClientTag(s.adminA, other, { name: "RECLAMO", color: "red" }),
    ).toEqual({ ok: false, code: "CONFLICT" });
    expect(await count("client_tags")).toBe(2);
  });

  it("nombre vacío, de más de 40 o color fuera de la paleta: VALIDATION_ERROR con el campo", async () => {
    const s = await seed();
    expect(await createClientTag(s.adminA, { name: "   " })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["name"],
    });
    expect(
      await createClientTag(s.adminA, { name: "x".repeat(41), color: "pink" }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["name", "color"],
    });
    expect(await count("client_tags")).toBe(0);
  });

  it("editar cambia solo lo que cambió y lo audita; sin cambios no escribe", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo", "gray");

    expect(
      await updateClientTag(s.adminA, tagId, { name: "Reclamo", color: "red" }),
    ).toEqual({ ok: true, changed: true });
    expect(
      await updateClientTag(s.adminA, tagId, { name: "Reclamo", color: "red" }),
    ).toEqual({ ok: true, changed: false });

    const audit = await tagAudit("client_tag");
    expect(audit.map((row) => [row.action, row.diff])).toEqual([
      ["create", expect.anything()],
      ["update", { before: { color: "gray" }, after: { color: "red" } }],
    ]);
  });

  it("desactivar y reactivar se auditan, y repetirlos no escribe", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");

    expect(await deactivateClientTag(s.adminA, tagId)).toEqual({
      ok: true,
      changed: true,
    });
    expect(await deactivateClientTag(s.adminA, tagId)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await reactivateClientTag(s.adminA, tagId)).toEqual({
      ok: true,
      changed: true,
    });
    const audit = await tagAudit("client_tag");
    expect(audit.map((row) => [row.action, row.diff])).toEqual([
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
  });

  it("un viewer lee el catálogo y no escribe nada en él", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");

    const listed = await listClientTags(s.viewerA);
    expect(listed.ok && listed.tags.map((tag) => tag.name)).toEqual([
      "Reclamo",
    ]);
    const forbidden = { ok: false, code: "FORBIDDEN" };
    expect(await createClientTag(s.viewerA, { name: "Otra" })).toEqual(
      forbidden,
    );
    expect(
      await updateClientTag(s.viewerA, tagId, { name: "Otra", color: "red" }),
    ).toEqual(forbidden);
    expect(await deactivateClientTag(s.viewerA, tagId)).toEqual(forbidden);
    expect(await reactivateClientTag(s.viewerA, tagId)).toEqual(forbidden);
    expect(await createSuggestedClientTags(s.viewerA)).toEqual(forbidden);
    expect(await count("client_tags")).toBe(1);
  });

  it("el catálogo cuenta solo los clientes activos que tienen cada etiqueta", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const ana = await insertClient(s.orgA, "Ana");
    const beto = await insertClient(s.orgA, "Beto");
    await assignClientTag(s.adminA, ana, tagId);
    await assignClientTag(s.adminA, beto, tagId);
    await getDb().execute(
      sql`update clients set is_active = false where id = ${beto}`,
    );

    const listed = await listClientTags(s.adminA);
    expect(listed.ok && listed.tags[0]!.activeClients).toBe(1);
  });
});

describe("D-3: las etiquetas sugeridas (AC-4)", () => {
  it("con el catálogo vacío crea las cuatro, cada una auditada", async () => {
    const s = await seed();

    expect(await createSuggestedClientTags(s.adminA)).toEqual({
      ok: true,
      created: 4,
    });
    const listed = await listClientTags(s.adminA);
    expect(
      listed.ok &&
        listed.tags.map((tag) => ({ name: tag.name, color: tag.color })),
    ).toEqual(
      [...SUGGESTED_TAGS].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      ),
    );
    const audit = await tagAudit("client_tag");
    expect(audit.map((row) => row.action)).toEqual([
      "create",
      "create",
      "create",
      "create",
    ]);
  });

  it("con alguna etiqueta, aunque esté inactiva, da CONFLICT y no escribe", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Mayorista");
    await deactivateClientTag(s.adminA, tagId);

    expect(await createSuggestedClientTags(s.adminA)).toEqual({
      ok: false,
      code: "CONFLICT",
    });
    expect(await count("client_tags")).toBe(1);
  });

  it("solo mira el catálogo de su organización", async () => {
    const s = await seed();
    await newTag(s.adminB, "Interesado");

    expect(await createSuggestedClientTags(s.adminA)).toEqual({
      ok: true,
      created: 4,
    });
  });
});

describe("FR-CLI-09: poner y quitar etiquetas (AC-5)", () => {
  it("poner y quitar escriben un tag_change en el historial del cliente, con el nombre de entonces", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const clientId = await insertClient(s.orgA, "Ana");

    expect(await assignClientTag(s.adminA, clientId, tagId)).toEqual({
      ok: true,
      changed: true,
    });
    await updateClientTag(s.adminA, tagId, { name: "Queja", color: "red" });
    expect(await removeClientTag(s.adminA, clientId, tagId)).toEqual({
      ok: true,
      changed: true,
    });

    expect(await tagAudit("client")).toEqual([
      {
        entity_id: clientId,
        action: "tag_change",
        diff: { before: { tag: null }, after: { tag: "Reclamo" } },
      },
      {
        entity_id: clientId,
        action: "tag_change",
        diff: { before: { tag: "Queja" }, after: { tag: null } },
      },
    ]);
    const history = await listClientAudit(s.adminA, clientId, 1);
    expect(history.ok && history.entries.map((entry) => entry.action)).toEqual([
      "tag_change",
      "tag_change",
    ]);
  });

  it("son idempotentes: repetir no escribe ni audita", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const clientId = await insertClient(s.orgA, "Ana");

    await assignClientTag(s.adminA, clientId, tagId);
    expect(await assignClientTag(s.adminA, clientId, tagId)).toEqual({
      ok: true,
      changed: false,
    });
    await removeClientTag(s.adminA, clientId, tagId);
    expect(await removeClientTag(s.adminA, clientId, tagId)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await tagAudit("client")).toHaveLength(2);
  });

  it("las etiquetas salen con el cliente, por nombre", async () => {
    const s = await seed();
    const reclamo = await newTag(s.adminA, "Reclamo", "red");
    const interesado = await newTag(s.adminA, "interesado", "blue");
    const clientId = await insertClient(s.orgA, "Ana");
    await assignClientTag(s.adminA, clientId, reclamo);
    await assignClientTag(s.adminA, clientId, interesado);

    const found = await getClient(s.adminA, clientId);
    expect(found.ok && found.client.tags).toEqual([
      { id: interesado, name: "interesado", color: "blue", isActive: true },
      { id: reclamo, name: "Reclamo", color: "red", isActive: true },
    ]);
    const byIds = await getClientsByIds(s.adminA, [clientId]);
    expect(byIds.ok && byIds.clients[0]!.tags).toHaveLength(2);
  });

  it("un viewer ve las etiquetas y no puede ponerlas ni quitarlas (D-5)", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const clientId = await insertClient(s.orgA, "Ana");
    await assignClientTag(s.adminA, clientId, tagId);

    const found = await getClient(s.viewerA, clientId);
    expect(found.ok && found.client.tags.map((tag) => tag.name)).toEqual([
      "Reclamo",
    ]);
    const forbidden = { ok: false, code: "FORBIDDEN" };
    expect(await removeClientTag(s.viewerA, clientId, tagId)).toEqual(
      forbidden,
    );
    expect(await assignClientTag(s.viewerA, clientId, tagId)).toEqual(
      forbidden,
    );
    expect(await count("client_tag_assignments")).toBe(1);
  });

  it("ids inválidos dan VALIDATION_ERROR y un cliente ajeno NOT_FOUND", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const clientB = await insertClient(s.orgB, "Beto");

    expect(await assignClientTag(s.adminA, "no-es-un-id", tagId)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await assignClientTag(s.adminA, clientB, tagId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await count("client_tag_assignments")).toBe(0);
  });
});

describe("D-8: etiquetas inactivas (AC-6)", () => {
  it("no se ofrece ni se pone; el cliente que la tenía la conserva, inactiva, y se puede quitar", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const ana = await insertClient(s.orgA, "Ana");
    const beto = await insertClient(s.orgA, "Beto");
    await assignClientTag(s.adminA, ana, tagId);
    await deactivateClientTag(s.adminA, tagId);

    const active = await listActiveClientTags(s.adminA);
    expect(active.ok && active.tags).toEqual([]);
    expect(await assignClientTag(s.adminA, beto, tagId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    const found = await getClient(s.adminA, ana);
    expect(found.ok && found.client.tags).toEqual([
      expect.objectContaining({ id: tagId, isActive: false }),
    ]);
    expect(await removeClientTag(s.adminA, ana, tagId)).toEqual({
      ok: true,
      changed: true,
    });
  });

  // Revisión independiente de la 16.1.1, hallazgo 4: sin bloquear la etiqueta al leerla, la
  // asignación la veía activa, esperaba en la clave foránea y la ponía igual.
  it("poner una etiqueta mientras se desactiva espera y la encuentra inactiva", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const ana = await insertClient(s.orgA, "Ana");

    // Una desactivación en curso, como la de setTagActive: bloquea la fila y la cambia.
    let taken!: () => void;
    let release!: () => void;
    const lockTaken = new Promise<void>((resolve) => (taken = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const holder = getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select id from client_tags where id = ${tagId} for update`,
      );
      await tx.execute(
        sql`update client_tags set is_active = false where id = ${tagId}`,
      );
      taken();
      await released;
    });
    await lockTaken;

    const assigning = assignClientTag(s.adminA, ana, tagId);
    const deadline = Date.now() + 5000;
    for (;;) {
      const waiting = await getDb().execute<{ count: number }>(
        sql`select count(*)::int as count from pg_stat_activity
             where datname = current_database() and wait_event_type = ${"Lock"}`,
      );
      if (waiting.rows[0]!.count === 1) break;
      if (Date.now() > deadline) throw new Error("la asignación no esperó");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    release();
    await holder;

    expect(await assigning).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await count("client_tag_assignments")).toBe(0);
  });

  it("filtrar por una etiqueta inactiva se ignora", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const ana = await insertClient(s.orgA, "Ana");
    await insertClient(s.orgA, "Beto");
    await assignClientTag(s.adminA, ana, tagId);
    await deactivateClientTag(s.adminA, tagId);

    const page = await searchClients(s.adminA, { ...listDefaults, tagId });
    expect(page.ok && page.total).toBe(2);
  });
});

describe("FR-CLI-10: filtro de la lista por etiqueta (AC-7)", () => {
  async function filterSeed() {
    const s = await seed();
    const reclamo = await newTag(s.adminA, "Reclamo");
    const ana = await insertClient(s.orgA, "Ana", "+5491155551111");
    const beto = await insertClient(s.orgA, "Beto");
    const carla = await insertClient(s.orgA, "Carla");
    const dario = await insertClient(s.orgA, "Darío", null, false);
    for (const clientId of [ana, carla, dario]) {
      await assignClientTag(s.adminA, clientId, reclamo);
    }
    return { ...s, reclamo, ana, beto, carla, dario };
  }

  it("searchClients devuelve solo los que la tienen, combinado con la actividad y el texto", async () => {
    const s = await filterSeed();

    const page = await searchClients(s.adminA, {
      ...listDefaults,
      tagId: s.reclamo,
    });
    expect(page.ok && page.clients.map((client) => client.displayName)).toEqual(
      ["Ana", "Carla"],
    );
    expect(page.ok && page.total).toBe(2);

    const all = await searchClients(s.adminA, {
      ...listDefaults,
      activity: "all",
      tagId: s.reclamo,
    });
    expect(all.ok && all.total).toBe(3);

    const byText = await searchClients(s.adminA, {
      ...listDefaults,
      text: "car",
      tagId: s.reclamo,
    });
    expect(
      byText.ok && byText.clients.map((client) => client.displayName),
    ).toEqual(["Carla"]);
  });

  it("la lista por última interacción filtra igual, en los tres órdenes", async () => {
    const s = await filterSeed();

    for (const sort of ["last_interaction", "name_asc", "name_desc"] as const) {
      const page = await searchClientsByLastInteraction(s.adminA, {
        ...listDefaults,
        sort,
        tagId: s.reclamo,
      });
      expect(page.ok && page.total, sort).toBe(2);
      expect(
        page.ok && page.clients.map((client) => client.displayName).sort(),
        sort,
      ).toEqual(["Ana", "Carla"]);
    }
    // Revisión independiente de la 16.1.1, hallazgo 2: el orden por nombre se compara tal cual.
    for (const [sort, expected] of [
      ["name_asc", ["Ana", "Carla"]],
      ["name_desc", ["Carla", "Ana"]],
    ] as const) {
      const page = await searchClientsByLastInteraction(s.adminA, {
        ...listDefaults,
        sort,
        tagId: s.reclamo,
      });
      expect(
        page.ok && page.clients.map((client) => client.displayName),
        sort,
      ).toEqual(expected);
    }
  });

  it("pagina sobre los que tienen la etiqueta, sin repetir ni perder clientes", async () => {
    const s = await seed();
    const reclamo = await newTag(s.adminA, "Reclamo");
    const tagged: string[] = [];
    for (let i = 1; i <= 27; i++) {
      const name = `Cliente ${String(i).padStart(2, "0")}`;
      tagged.push(name);
      await assignClientTag(
        s.adminA,
        await insertClient(s.orgA, name),
        reclamo,
      );
      await insertClient(s.orgA, `Otro ${String(i).padStart(2, "0")}`);
    }

    const crmPage = await searchClients(s.adminA, {
      ...listDefaults,
      tagId: reclamo,
      page: 2,
    });
    expect(crmPage.ok && crmPage.total).toBe(27);
    expect(
      crmPage.ok && crmPage.clients.map((client) => client.displayName),
    ).toEqual(["Cliente 26", "Cliente 27"]);

    for (const sort of ["last_interaction", "name_asc", "name_desc"] as const) {
      const pages = [];
      for (const page of [1, 2]) {
        const result = await searchClientsByLastInteraction(s.adminA, {
          ...listDefaults,
          sort,
          tagId: reclamo,
          page,
        });
        expect(result.ok && result.total, sort).toBe(27);
        pages.push(
          result.ok ? result.clients.map((client) => client.displayName) : [],
        );
      }
      expect(
        pages.map((page) => page.length),
        sort,
      ).toEqual([25, 2]);
      expect(pages.flat().sort(), sort).toEqual(tagged);
      if (sort === "name_desc") {
        expect(pages[1]).toEqual(["Cliente 02", "Cliente 01"]);
      }
    }
  });

  it("un id ajeno, inexistente o mal formado se ignora", async () => {
    const s = await filterSeed();
    const tagB = await newTag(s.adminB, "Reclamo");

    for (const tagId of [
      tagB,
      "00000000-0000-4000-8000-000000000000",
      "no-es-un-id",
    ]) {
      const page = await searchClients(s.adminA, { ...listDefaults, tagId });
      expect(page.ok && page.total, tagId).toBe(3);
    }
  });
});

describe("D-11: límites (AC-8)", () => {
  it(`hasta ${MAX_ACTIVE_TAGS} etiquetas activas por organización, también al reactivar`, async () => {
    const s = await seed();
    const values = Array.from(
      { length: MAX_ACTIVE_TAGS },
      (_, i) => sql`(${s.orgA}, ${`Etiqueta ${i}`})`,
    );
    await getDb().execute(
      sql`insert into client_tags (organization_id, name) values ${sql.join(values, sql`, `)}`,
    );
    const inactive = await getDb().execute<{ id: string }>(
      sql`insert into client_tags (organization_id, name, is_active)
          values (${s.orgA}, 'Vieja', false) returning id`,
    );

    expect(await createClientTag(s.adminA, { name: "Una más" })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      limit: "organization",
    });
    expect(await reactivateClientTag(s.adminA, inactive.rows[0]!.id)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      limit: "organization",
    });
    expect(await createSuggestedClientTags(s.adminA)).toEqual({
      ok: false,
      code: "CONFLICT",
    });
  });

  it(`hasta ${MAX_TAGS_PER_CLIENT} etiquetas por cliente`, async () => {
    const s = await seed();
    const clientId = await insertClient(s.orgA, "Ana");
    for (let i = 0; i < MAX_TAGS_PER_CLIENT; i++) {
      const tagId = await newTag(s.adminA, `Etiqueta ${i}`);
      expect(await assignClientTag(s.adminA, clientId, tagId)).toEqual({
        ok: true,
        changed: true,
      });
    }
    const extra = await newTag(s.adminA, "Una más");

    expect(await assignClientTag(s.adminA, clientId, extra)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      limit: "client",
    });
    expect(await count("client_tag_assignments")).toBe(MAX_TAGS_PER_CLIENT);
  });
});

describe("invariante 5: el enmascarado del teléfono no cambia (AC-13)", () => {
  it("un viewer recibe el teléfono enmascarado en la lista filtrada por etiqueta", async () => {
    const s = await seed();
    const tagId = await newTag(s.adminA, "Reclamo");
    const clientId = await insertClient(s.orgA, "Ana", "+5491155551111");
    await assignClientTag(s.adminA, clientId, tagId);

    const page = await searchClientsByLastInteraction(s.viewerA, {
      ...listDefaults,
      tagId,
    });
    expect(page.ok && page.clients[0]!.phone).toEqual({
      kind: "masked",
      lastDigits: "1111",
    });
    expect(JSON.stringify(page)).not.toContain("+5491155551111");
  });
});
