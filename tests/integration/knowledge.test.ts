import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createKnowledgeEntry,
  deactivateKnowledgeEntry,
  getKnowledgeEntry,
  listKnowledgeAudit,
  listKnowledgeCategories,
  listKnowledgeEntries,
  reactivateKnowledgeEntry,
  updateKnowledgeEntry,
  type KnowledgeInput,
  type KnowledgeStatusFilter,
} from "@/modules/knowledge";
import {
  updateEntryActive,
  updateEntryValues,
} from "@/modules/knowledge/repository";
import { knowledgeSearchCondition } from "@/modules/knowledge/schema";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Información del negocio contra PostgreSQL real (brief-11.2): privilegios, escrituras de admin
// auditadas (FR-INFO-01), vigencia en la zona de la organización (FR-INFO-03), búsqueda por
// palabras con su índice (FR-INFO-02) y aislamiento entre organizaciones (AC-6).

const PASSWORD = "contraseña-correcta-larga";
let storedHash: string;

async function createOrganization(name: string, timezone?: string) {
  const result = await getDb().execute<{ id: string }>(
    timezone
      ? sql`insert into organizations (name, timezone) values (${name}, ${timezone}) returning id`
      : sql`insert into organizations (name) values (${name}) returning id`,
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
        values (${email}, ${storedHash}, 'Persona') returning id`,
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

// Organización A (zona por defecto, Buenos Aires) con admin y viewer; organización B con admin.
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

const hours: KnowledgeInput = {
  title: "Horario de atención",
  category: "Horarios",
  content: "Lunes a viernes de 9 a 18.\nSábados de 9 a 13.",
  validFrom: null,
  validUntil: null,
};

async function create(context: AuthContext, input: Partial<KnowledgeInput>) {
  const result = await createKnowledgeEntry(context, { ...hours, ...input });
  if (!result.ok) throw new Error(`alta rechazada: ${result.code}`);
  return result.entryId;
}

async function count(table: "knowledge_entries" | "audit_logs") {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

async function auditRows() {
  const result = await getDb().execute(
    sql`select organization_id, entity_type, entity_id, action, diff
        from audit_logs order by created_at`,
  );
  return result.rows;
}

// El día de hoy en una zona, desplazado, calculado por PostgreSQL como lo hace el servicio.
async function dayIn(timezone: string, offset = 0): Promise<string> {
  const result = await getDb().execute<{ day: string }>(
    sql`select ((now() at time zone ${timezone})::date + ${offset}::int)::text as day`,
  );
  return result.rows[0]!.day;
}

async function titles(
  context: AuthContext,
  filters: { text?: string; status?: KnowledgeStatusFilter; page?: number },
) {
  const result = await listKnowledgeEntries(context, {
    text: filters.text ?? "",
    status: filters.status ?? "all",
    page: filters.page ?? 1,
  });
  if (!result.ok) throw new Error(`lista rechazada: ${result.code}`);
  return result.entries.map((entry) => entry.title);
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

async function pgError(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code ?? "sin código";
  }
  throw new Error("la consulta no falló");
}

beforeEach(async () => {
  storedHash ??= await hashPassword(PASSWORD);
  await resetDatabase(getDb());
});

describe("knowledge_entries: esquema y privilegios (AC-1)", () => {
  it("FR-INFO-01: crm_app tiene exactamente SELECT, INSERT y UPDATE: ningún camino borra una entrada", async () => {
    const result = await getDb().execute<{ privilege: string }>(
      sql`select privilege_type as privilege from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'knowledge_entries'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege)).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE",
    ]);
  });

  it("FR-INFO-01: crm_app inserta, lee y actualiza, y no puede borrar: 42501", async () => {
    const s = await seed();
    await asAppRole((tx) =>
      tx.execute(
        sql`insert into knowledge_entries (organization_id, title, category, content)
            values (${s.orgA}, 'Envíos', 'Envíos', 'A todo el país')`,
      ),
    );
    await asAppRole((tx) =>
      tx.execute(sql`update knowledge_entries set content = 'Solo CABA'`),
    );
    expect(
      await pgError(
        asAppRole((tx) => tx.execute(sql`delete from knowledge_entries`)),
      ),
    ).toBe("42501");
    expect(await count("knowledge_entries")).toBe(1);
  });

  it("la base rechaza una vigencia invertida y los textos fuera de límite: 23514", async () => {
    const s = await seed();
    const insert = (values: {
      title?: string;
      content?: string;
      from?: string;
      until?: string;
    }) =>
      getDb().execute(
        sql`insert into knowledge_entries
              (organization_id, title, category, content, valid_from, valid_until)
            values (${s.orgA}, ${values.title ?? "Título"}, 'Categoría',
              ${values.content ?? "Contenido"}, ${values.from ?? null}, ${values.until ?? null})`,
      );
    expect(
      await pgError(insert({ from: "2026-12-26", until: "2026-12-24" })),
    ).toBe("23514");
    expect(await pgError(insert({ title: "" }))).toBe("23514");
    expect(await pgError(insert({ content: "x".repeat(4001) }))).toBe("23514");
    await insert({ from: "2026-12-24", until: "2026-12-24" });
    expect(await count("knowledge_entries")).toBe(1);
  });
});

describe("FR-INFO-01: escrituras de admin, auditadas (AC-2)", () => {
  it("FR-INFO-01: crear guarda los valores recortados y audita el alta", async () => {
    const s = await seed();
    const entryId = await create(s.adminA, {
      title: "  Medios de pago ",
      category: " Pagos ",
      content: " Efectivo y transferencia. ",
      validFrom: "2026-12-01",
    });
    const found = await getKnowledgeEntry(s.adminA, entryId);
    expect(found.ok && found.entry).toMatchObject({
      title: "Medios de pago",
      category: "Pagos",
      content: "Efectivo y transferencia.",
      isActive: true,
      validFrom: "2026-12-01",
      validUntil: null,
    });
    expect(await auditRows()).toEqual([
      {
        organization_id: s.orgA,
        entity_type: "knowledge_entry",
        entity_id: entryId,
        action: "create",
        diff: {
          before: null,
          after: {
            title: "Medios de pago",
            category: "Pagos",
            content: "Efectivo y transferencia.",
            validFrom: "2026-12-01",
            validUntil: null,
            isActive: true,
          },
        },
      },
    ]);
  });

  it("FR-INFO-01: un viewer no crea, no edita, no desactiva, no reactiva ni ve la auditoría, y nada se escribe", async () => {
    const s = await seed();
    const entryId = await create(s.adminA, {});
    expect((await createKnowledgeEntry(s.viewerA, hours)).ok).toBe(false);
    expect(await createKnowledgeEntry(s.viewerA, hours)).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      await updateKnowledgeEntry(s.viewerA, entryId, {
        ...hours,
        content: "Cambiado",
      }),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(await deactivateKnowledgeEntry(s.viewerA, entryId)).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await reactivateKnowledgeEntry(s.viewerA, entryId)).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await listKnowledgeAudit(s.viewerA, entryId, 1)).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await listKnowledgeCategories(s.viewerA)).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await count("knowledge_entries")).toBe(1);
    expect(await count("audit_logs")).toBe(1);
    // Leer sí puede.
    expect((await getKnowledgeEntry(s.viewerA, entryId)).ok).toBe(true);
  });

  it("FR-INFO-01: editar audita solo lo que cambió, con el antes real; sin diferencias no escribe", async () => {
    const s = await seed();
    const entryId = await create(s.adminA, {});
    expect(
      await updateKnowledgeEntry(s.adminA, entryId, {
        ...hours,
        content: "Lunes a sábados de 9 a 13.",
        validUntil: "2026-12-31",
      }),
    ).toEqual({ ok: true, changed: true });
    expect(
      await updateKnowledgeEntry(s.adminA, entryId, {
        ...hours,
        title: "  Horario de atención ",
        content: "Lunes a sábados de 9 a 13.",
        validUntil: "2026-12-31",
      }),
    ).toEqual({ ok: true, changed: false });
    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      action: "update",
      diff: {
        before: { content: hours.content, validUntil: null },
        after: {
          content: "Lunes a sábados de 9 a 13.",
          validUntil: "2026-12-31",
        },
      },
    });
  });

  it("FR-INFO-01: un id en mayúsculas edita y audita con el id de la base (lección M-3 de la 11.1)", async () => {
    const s = await seed();
    const entryId = await create(s.adminA, {});
    expect(
      await updateKnowledgeEntry(s.adminA, entryId.toUpperCase(), {
        ...hours,
        content: "Otro",
      }),
    ).toEqual({ ok: true, changed: true });
    expect(
      await deactivateKnowledgeEntry(s.adminA, entryId.toUpperCase()),
    ).toEqual({ ok: true, changed: true });
    const rows = await auditRows();
    expect(rows.map((row) => row.entity_id)).toEqual([
      entryId,
      entryId,
      entryId,
    ]);
  });

  it("FR-INFO-01: un título repetido da CONFLICT, con otras mayúsculas y frente a una inactiva", async () => {
    const s = await seed();
    const first = await create(s.adminA, {});
    await deactivateKnowledgeEntry(s.adminA, first);
    expect(
      await createKnowledgeEntry(s.adminA, {
        ...hours,
        title: "HORARIO DE ATENCIÓN",
      }),
    ).toEqual({ ok: false, code: "CONFLICT" });

    const second = await create(s.adminA, { title: "Envíos" });
    expect(
      await updateKnowledgeEntry(s.adminA, second, {
        ...hours,
        title: "horario de atención",
      }),
    ).toEqual({ ok: false, code: "CONFLICT" });
    const found = await getKnowledgeEntry(s.adminA, second);
    expect(found.ok && found.entry.title).toBe("Envíos");
    // Alta y desactivación de la primera, alta de la segunda: los CONFLICT no auditan.
    expect(await count("audit_logs")).toBe(3);
    // Otra organización puede usar el mismo título.
    expect((await createKnowledgeEntry(s.adminB, hours)).ok).toBe(true);
  });

  it("FR-INFO-01: las validaciones nombran los campos y no escriben nada", async () => {
    const s = await seed();
    expect(
      await createKnowledgeEntry(s.adminA, {
        ...hours,
        title: " ",
        validFrom: "2026-12-26",
        validUntil: "2026-12-24",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["title", "validUntil"],
    });
    expect(await count("knowledge_entries")).toBe(0);
  });

  it("FR-INFO-01: desactivar y reactivar se auditan; repetir no escribe", async () => {
    const s = await seed();
    const entryId = await create(s.adminA, {});
    expect(await deactivateKnowledgeEntry(s.adminA, entryId)).toEqual({
      ok: true,
      changed: true,
    });
    expect(await deactivateKnowledgeEntry(s.adminA, entryId)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await reactivateKnowledgeEntry(s.adminA, entryId)).toEqual({
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
    const audit = await listKnowledgeAudit(s.adminA, entryId, 1);
    expect(audit.ok && audit.entries.map((entry) => entry.action)).toEqual([
      "reactivate",
      "deactivate",
      "create",
    ]);
    expect(audit.ok && audit.entries[0]!.actor.name).toBe("Persona");
  });
});

describe("FR-INFO-03: vigencia en la zona de la organización (AC-3)", () => {
  it("FR-INFO-03: cada entrada tiene su estado, y la lectura de vigentes devuelve exactamente las que corresponden", async () => {
    const s = await seed();
    const tz = "America/Argentina/Buenos_Aires";
    const today = await dayIn(tz);
    const tomorrow = await dayIn(tz, 1);
    const yesterday = await dayIn(tz, -1);
    await create(s.adminA, { title: "Sin fechas" });
    await create(s.adminA, { title: "Desde hoy", validFrom: today });
    await create(s.adminA, { title: "Desde mañana", validFrom: tomorrow });
    await create(s.adminA, { title: "Hasta hoy", validUntil: today });
    await create(s.adminA, { title: "Hasta ayer", validUntil: yesterday });
    await create(s.adminA, {
      title: "Solo hoy",
      validFrom: today,
      validUntil: today,
    });
    const inactive = await create(s.adminA, { title: "Inactiva vigente" });
    await deactivateKnowledgeEntry(s.adminA, inactive);

    const all = await listKnowledgeEntries(s.adminA, {
      text: "",
      status: "all",
      page: 1,
    });
    const statuses = Object.fromEntries(
      all.ok ? all.entries.map((entry) => [entry.title, entry.status]) : [],
    );
    expect(statuses).toEqual({
      "Sin fechas": "current",
      "Desde hoy": "current",
      "Desde mañana": "scheduled",
      "Hasta hoy": "current",
      "Hasta ayer": "expired",
      "Solo hoy": "current",
      "Inactiva vigente": "inactive",
    });
    expect((await titles(s.adminA, { status: "current" })).sort()).toEqual([
      "Desde hoy",
      "Hasta hoy",
      "Sin fechas",
      "Solo hoy",
    ]);
    expect(await titles(s.adminA, { status: "scheduled" })).toEqual([
      "Desde mañana",
    ]);
    expect(await titles(s.adminA, { status: "expired" })).toEqual([
      "Hasta ayer",
    ]);
    expect(await titles(s.adminA, { status: "inactive" })).toEqual([
      "Inactiva vigente",
    ]);
  });

  it("FR-INFO-03: «hoy» es el de la zona de cada organización, no el de UTC ni el del servidor", async () => {
    // Kiritimati va 14 horas adelante de UTC y Pago Pago, 11 atrás. A cualquier hora, el día de al
    // menos una de las dos difiere del de UTC: si el servicio calculara «hoy» en UTC, alguno de los
    // dos casos de abajo fallaría, sea la hora que sea cuando corra el test.
    await seed();
    const ahead = await createOrganization("Adelante", "Pacific/Kiritimati");
    const behind = await createOrganization("Atrás", "Pacific/Pago_Pago");
    await addUser(ahead, "admin-adelante@example.com", "admin");
    await addUser(behind, "admin-atras@example.com", "admin");
    const adminAhead = await contextFor("admin-adelante@example.com");
    const adminBehind = await contextFor("admin-atras@example.com");

    await create(adminAhead, {
      title: "Empieza hoy allá",
      validFrom: await dayIn("Pacific/Kiritimati"),
    });
    await create(adminBehind, {
      title: "Termina hoy allá",
      validUntil: await dayIn("Pacific/Pago_Pago"),
    });

    expect(await titles(adminAhead, { status: "current" })).toEqual([
      "Empieza hoy allá",
    ]);
    expect(await titles(adminBehind, { status: "current" })).toEqual([
      "Termina hoy allá",
    ]);
  });
});

describe("FR-INFO-02: búsqueda por palabras (AC-4)", () => {
  async function seedSearch() {
    const s = await seed();
    await create(s.adminA, {
      title: "Medios de pago",
      category: "Pagos",
      content: "Efectivo, débito y transferencia bancaria.",
    });
    await create(s.adminA, {
      title: "Envíos al interior",
      category: "Envíos",
      content: "Por correo, con seguimiento. Se paga por transferencia.",
    });
    await create(s.adminA, {
      title: "Transferencias",
      category: "Pagos",
      content: "Alias y CBU en la factura.",
    });
    await create(s.adminB, {
      title: "Transferencia en B",
      category: "Pagos",
      content: "Solo de la otra organización.",
    });
    return s;
  }

  it("FR-INFO-02: encuentra por prefijo de palabras de título, categoría y contenido, sin acentos y con todas las palabras", async () => {
    const s = await seedSearch();
    expect((await titles(s.adminA, { text: "envios" })).sort()).toEqual([
      "Envíos al interior",
    ]);
    expect((await titles(s.adminA, { text: "PAGOS" })).sort()).toEqual([
      "Medios de pago",
      "Transferencias",
    ]);
    expect((await titles(s.adminA, { text: "debi" })).sort()).toEqual([
      "Medios de pago",
    ]);
    expect(await titles(s.adminA, { text: "correo transfer" })).toEqual([
      "Envíos al interior",
    ]);
    // El prefijo va desde el comienzo de cada palabra (límite de D-6, igual que en productos).
    expect(await titles(s.adminA, { text: "ferencia" })).toEqual([]);
  });

  it("FR-INFO-02: una coincidencia en el título sale antes que una solo en el contenido", async () => {
    const s = await seedSearch();
    expect(await titles(s.adminA, { text: "transferencia" })).toEqual([
      "Transferencias",
      "Envíos al interior",
      "Medios de pago",
    ]);
  });

  // El parser `simple` deja una URL entera como un solo lexema, con su comilla: es el caso que
  // ejercita el escape de searchQuery contra PostgreSQL. La barra invertida, en cambio, nunca
  // sobrevive como lexema, así que su escape es defensivo (revisión independiente, m-5).
  it("FR-INFO-02: una palabra con comilla se busca escapada y se encuentra", async () => {
    const s = await seedSearch();
    await create(s.adminA, {
      title: "Catálogo en línea",
      category: "Web",
      content: "Mirá el catálogo en tienda.com/ver'todo?x=1 cuando quieras.",
    });
    expect(await titles(s.adminA, { text: "tienda.com/ver'todo?x=1" })).toEqual(
      ["Catálogo en línea"],
    );
  });

  it("FR-INFO-02: los caracteres de tsquery y de LIKE no producen errores", async () => {
    const s = await seedSearch();
    for (const text of [
      "a & b",
      "!pago",
      "pago:*",
      "(pago",
      "o'higgins",
      "\\",
      "%_",
    ]) {
      const result = await listKnowledgeEntries(s.adminA, {
        text,
        status: "all",
        page: 1,
      });
      expect(result.ok, text).toBe(true);
    }
    // `!` no es negación: busca «pago», que es prefijo del título de una y de la categoría de otra.
    // Si fuera sintaxis, devolvería la que no tiene «pago».
    expect((await titles(s.adminA, { text: "!pago" })).sort()).toEqual([
      "Medios de pago",
      "Transferencias",
    ]);
  });

  it("FR-INFO-02: la búsqueda usa el índice GIN de la columna generada", async () => {
    const s = await seed();
    // Con pocas filas el planificador recorre la tabla sin mirar ningún índice. El fixture es
    // sintético y su único fin es que el planificador tenga con qué decidir.
    await getDb().execute(
      sql`insert into knowledge_entries (organization_id, title, category, content)
          select ${s.orgA}, 'Entrada '||g, 'Categoría '||(g % 20), 'Contenido número '||g
          from generate_series(1, 5000) g`,
    );
    // La lista pendiente de GIN encarece el índice hasta un vacuum (brief-11.1, §Resultados).
    await getDb().execute(
      sql`select gin_clean_pending_list('knowledge_entries_search_idx')`,
    );
    await getDb().execute(sql`analyze knowledge_entries`);

    // La condición sale de la misma función que usa el repositorio.
    const plan = (
      await getDb().execute<{ "QUERY PLAN": string }>(
        sql`explain select id from knowledge_entries
            where organization_id = ${s.orgA}
              and ${knowledgeSearchCondition("horario feriado")}`,
      )
    ).rows
      .map((row) => row["QUERY PLAN"])
      .join("\n");

    expect(plan).toContain("Bitmap Index Scan on knowledge_entries_search_idx");
    expect(plan).toMatch(/Index Cond: \(search @@/);
  });

  it("FR-INFO-02: pagina de a 25 contra la base, con orden estable, y lleva una página fuera de rango a la última", async () => {
    const s = await seed();
    for (let i = 1; i <= 26; i++) {
      await create(s.adminA, {
        title: `Entrada ${String(i).padStart(2, "0")}`,
      });
    }
    const first = await listKnowledgeEntries(s.adminA, {
      text: "",
      status: "all",
      page: 1,
    });
    const last = await listKnowledgeEntries(s.adminA, {
      text: "",
      status: "all",
      page: 99,
    });
    expect(
      first.ok && [first.total, first.pageCount, first.entries.length],
    ).toEqual([26, 2, 25]);
    expect(last.ok && [last.page, last.entries.map((e) => e.title)]).toEqual([
      2,
      ["Entrada 26"],
    ]);
  });
});

describe("aislamiento entre organizaciones (AC-6)", () => {
  it("una entrada de otra organización no se lee, no se escribe, no aparece y da NOT_FOUND", async () => {
    const s = await seed();
    const foreign = await create(s.adminB, { title: "Secreto de B" });
    await create(s.adminB, { category: "Categoría de B", title: "Otra de B" });
    await create(s.adminA, {});

    expect(await getKnowledgeEntry(s.adminA, foreign)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await updateKnowledgeEntry(s.adminA, foreign, {
        ...hours,
        title: "Robado",
      }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await deactivateKnowledgeEntry(s.adminA, foreign)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await listKnowledgeAudit(s.adminA, foreign, 1)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await titles(s.adminA, {})).toEqual(["Horario de atención"]);
    expect(await titles(s.adminA, { text: "secreto" })).toEqual([]);
    const categories = await listKnowledgeCategories(s.adminA);
    expect(categories.ok && categories.categories).toEqual(["Horarios"]);
    // La entrada de B sigue intacta.
    const found = await getKnowledgeEntry(s.adminB, foreign);
    expect(found.ok && [found.entry.title, found.entry.isActive]).toEqual([
      "Secreto de B",
      true,
    ]);
  });

  // Por el servicio, una entrada ajena da NOT_FOUND antes de llegar a la escritura, así que ese
  // caso pasaría igual sin el filtro de organización en el WHERE (revisión independiente, m-4). Acá
  // se llama al repositorio directamente, como en organization-isolation.test.ts (9.0.1).
  it("las escrituras del repositorio filtran por organización: con otra, lanzan y no tocan la fila", async () => {
    const s = await seed();
    const foreign = await create(s.adminB, { title: "Secreto de B" });
    await expect(
      getDb().transaction((tx) =>
        updateEntryValues(tx, s.orgA, foreign, { title: "Robado" }),
      ),
    ).rejects.toThrow("updateEntryValues");
    await expect(
      getDb().transaction((tx) =>
        updateEntryActive(tx, s.orgA, foreign, false),
      ),
    ).rejects.toThrow("updateEntryActive");
    const found = await getKnowledgeEntry(s.adminB, foreign);
    expect(found.ok && [found.entry.title, found.entry.isActive]).toEqual([
      "Secreto de B",
      true,
    ]);
  });

  it("un id que no es UUID da VALIDATION_ERROR sin fields", async () => {
    const s = await seed();
    for (const result of [
      await getKnowledgeEntry(s.adminA, "no-es-un-id"),
      await updateKnowledgeEntry(s.adminA, "no-es-un-id", hours),
      await reactivateKnowledgeEntry(s.adminA, "no-es-un-id"),
      await listKnowledgeAudit(s.adminA, "no-es-un-id", 1),
    ]) {
      expect(result).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    }
  });
});
