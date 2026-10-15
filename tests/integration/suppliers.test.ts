import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import {
  createSupplier,
  deactivateSupplier,
  getSupplier,
  listSupplierAudit,
  listSuppliers,
  reactivateSupplier,
  SUPPLIERS_PAGE_SIZE,
  updateSupplier,
  type SupplierInput,
} from "@/modules/purchasing";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Los proveedores contra PostgreSQL real (brief-22.2): las operaciones (AC-3), los rechazos (AC-4),
// la serialización (AC-5) y la lista con 2.000 proveedores (AC-7). Los helpers son los de
// cash.test.ts.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

// CUITs válidos, con su dígito verificador.
const CUIT_A = "20123456786";
const CUIT_B = "30712345671";

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
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${name}) returning id`,
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
  await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  return {
    orgA,
    orgB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

async function create(context: AuthContext, input: SupplierInput) {
  const result = await createSupplier(context, input);
  if (!result.ok) throw new Error(`alta rechazada: ${JSON.stringify(result)}`);
  return result.supplierId;
}

// Lo que quedó escrito, para comprobar que un rechazo no escribe ni audita.
async function snapshot() {
  const result = await getDb().execute<{
    suppliers: string;
    audits: number;
  }>(
    sql`select
          (select coalesce(string_agg(name || '|' || coalesce(phone_e164, '') || '|' ||
                  coalesce(email, '') || '|' || coalesce(cuit, '') || '|' || is_active::text,
                  ',' order by id), '') from suppliers) as suppliers,
          (select count(*)::int from audit_logs) as audits`,
  );
  return result.rows[0]!;
}

async function supplierAudits() {
  const result = await getDb().execute<{
    action: string;
    entity_id: string;
    diff: {
      before: Record<string, unknown> | null;
      after: Record<string, unknown>;
    };
  }>(
    sql`select action, entity_id, diff from audit_logs
        where entity_type = 'supplier' order by created_at, id`,
  );
  return result.rows;
}

// Bloqueos retenidos del test en curso, como en cash.test.ts.
const heldLocks: (() => Promise<void>)[] = [];

async function hold(...queries: SQL[]): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    for (const query of queries) await tx.execute(query);
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

describe("las operaciones (AC-3; D-5 y D-8)", () => {
  it(
    "crea, edita, desactiva y reactiva con su auditoría",
    async () => {
      const s = await seed();
      const id = await create(s.adminA, {
        name: "  Distribuidora Norte ",
        phone: "+54 9 11 5555-1234",
        email: " Ventas@Norte.com ",
        cuit: "20-12345678-6",
      });
      expect(await getSupplier(s.adminA, id)).toMatchObject({
        ok: true,
        supplier: {
          name: "Distribuidora Norte",
          phone: "+5491155551234",
          email: "ventas@norte.com",
          cuit: CUIT_A,
          isActive: true,
        },
      });

      // Vaciar el email lo lleva a nulo; el resto queda igual.
      expect(
        await updateSupplier(s.adminA, id, {
          name: "Distribuidora Norte SRL",
          phone: "+5491155551234",
          email: "",
          cuit: CUIT_A,
        }),
      ).toEqual({ ok: true, changed: true });
      expect(await deactivateSupplier(s.adminA, id)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await reactivateSupplier(s.adminA, id)).toEqual({
        ok: true,
        changed: true,
      });

      const audits = await supplierAudits();
      expect(audits.map((audit) => audit.action)).toEqual([
        "create",
        "update",
        "deactivate",
        "reactivate",
      ]);
      expect(audits.every((audit) => audit.entity_id === id)).toBe(true);
      expect(audits[0]!.diff).toEqual({
        before: null,
        after: {
          name: "Distribuidora Norte",
          phone: "+5491155551234",
          email: "ventas@norte.com",
          cuit: CUIT_A,
          isActive: true,
        },
      });
      expect(audits[1]!.diff).toEqual({
        before: { name: "Distribuidora Norte", email: "ventas@norte.com" },
        after: { name: "Distribuidora Norte SRL", email: null },
      });
      expect(audits[2]!.diff).toEqual({
        before: { isActive: true },
        after: { isActive: false },
      });

      // La historia, para la ficha, con el nombre del autor.
      const history = await listSupplierAudit(s.adminA, id, 1);
      expect(history).toMatchObject({ ok: true, total: 4 });
      if (history.ok) {
        expect(history.entries[0]!.actor).toMatchObject({
          kind: "user",
          name: "Ana",
        });
      }
    },
    TEST_TIMEOUT,
  );

  it("el alta solo con el nombre deja nulos los opcionales", async () => {
    const s = await seed();
    const id = await create(s.adminA, { name: "Solo nombre" });
    expect(await getSupplier(s.adminA, id)).toMatchObject({
      ok: true,
      supplier: { phone: null, email: null, cuit: null },
    });
  });

  it("un cambio que no cambia nada no escribe ni audita", async () => {
    const s = await seed();
    const id = await create(s.adminA, {
      name: "Norte",
      cuit: "20-12345678-6",
    });
    await deactivateSupplier(s.adminA, id);
    const before = await snapshot();
    // El mismo CUIT con otro formato es el mismo valor.
    expect(
      await updateSupplier(s.adminA, id, {
        name: " Norte ",
        cuit: "20 12345678 6",
      }),
    ).toEqual({ ok: true, changed: false });
    expect(await deactivateSupplier(s.adminA, id)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await snapshot()).toEqual(before);
  });

  it(
    "la lista ordena, filtra por estado, busca por nombre sin mayúsculas ni acentos y por CUIT, y pagina",
    async () => {
      const s = await seed();
      await create(s.adminA, { name: "Ávila Hermanos", cuit: CUIT_A });
      await create(s.adminA, { name: "bodega del sur" });
      const inactive = await create(s.adminA, {
        name: "Comercial 100%_Real",
        cuit: CUIT_B,
      });
      await deactivateSupplier(s.adminA, inactive);
      await create(s.adminB, { name: "Avila de otra organización" });

      const names = async (text: string) => {
        const result = await listSuppliers(s.adminA, {
          text,
          status: "active",
          page: 1,
        });
        if (!result.ok) throw new Error("lista rechazada");
        return result.suppliers.map((supplier) => supplier.name);
      };

      expect(await names("")).toEqual(["Ávila Hermanos", "bodega del sur"]);
      const all = await listSuppliers(s.adminA, {
        text: "",
        status: "all",
        page: 1,
      });
      expect(all.ok && all.suppliers.map((supplier) => supplier.name)).toEqual([
        "Ávila Hermanos",
        "bodega del sur",
        "Comercial 100%_Real",
      ]);
      const inactives = await listSuppliers(s.adminA, {
        text: "",
        status: "inactive",
        page: 1,
      });
      expect(
        inactives.ok && inactives.suppliers.map((supplier) => supplier.name),
      ).toEqual(["Comercial 100%_Real"]);

      // Parte del nombre, sin mayúsculas ni acentos, y solo de la organización.
      expect(await names("AVILA")).toEqual(["Ávila Hermanos"]);
      expect(await names("del")).toEqual(["bodega del sur"]);
      // `%` y `_` son literales.
      const literal = await listSuppliers(s.adminA, {
        text: "100%_",
        status: "all",
        page: 1,
      });
      expect(literal.ok && literal.total).toBe(1);
      const wildcard = await listSuppliers(s.adminA, {
        text: "%",
        status: "all",
        page: 1,
      });
      expect(wildcard.ok && wildcard.total).toBe(1);
      expect(await names("_")).toEqual([]);

      // El CUIT exacto, con o sin separadores.
      expect(await names("20-12345678-6")).toEqual(["Ávila Hermanos"]);
      expect(await names("20123456786")).toEqual(["Ávila Hermanos"]);
    },
    TEST_TIMEOUT,
  );

  it(
    "pagina de a 25 y una página fuera de rango da la última",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`insert into suppliers (organization_id, name)
            select ${s.orgA}, 'Proveedor ' || lpad(n::text, 3, '0')
            from generate_series(1, 30) as n`,
      );
      const second = await listSuppliers(s.adminA, {
        text: "",
        status: "active",
        page: 9,
      });
      expect(second).toMatchObject({ ok: true, total: 30, page: 2 });
      expect(second.ok && second.suppliers).toHaveLength(
        30 - SUPPLIERS_PAGE_SIZE,
      );
      expect(second.ok && second.suppliers[0]!.name).toBe("Proveedor 026");
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-4; D-7)", () => {
  it(
    "un viewer recibe FORBIDDEN en cada lectura y cada escritura, sin escribir",
    async () => {
      const s = await seed();
      const id = await create(s.adminA, { name: "Norte" });
      const before = await snapshot();
      const forbidden = { ok: false, code: "FORBIDDEN" };
      expect(
        await listSuppliers(s.viewerA, { text: "", status: "all", page: 1 }),
      ).toEqual(forbidden);
      expect(await getSupplier(s.viewerA, id)).toEqual(forbidden);
      expect(await listSupplierAudit(s.viewerA, id, 1)).toEqual(forbidden);
      expect(await createSupplier(s.viewerA, { name: "Sur" })).toEqual(
        forbidden,
      );
      expect(await updateSupplier(s.viewerA, id, { name: "Otro" })).toEqual(
        forbidden,
      );
      expect(await deactivateSupplier(s.viewerA, id)).toEqual(forbidden);
      expect(await reactivateSupplier(s.viewerA, id)).toEqual(forbidden);
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it("cada campo inválido, con su campo, sin escribir", async () => {
    const s = await seed();
    const id = await create(s.adminA, { name: "Norte" });
    const before = await snapshot();
    const cases: [SupplierInput, string[]][] = [
      [{ name: "   " }, ["name"]],
      [{ name: "a".repeat(121) }, ["name"]],
      [{ name: "Sur", phone: "011 5555-1234" }, ["phone"]],
      [{ name: "Sur", email: "ventas" }, ["email"]],
      [{ name: "Sur", email: `${"a".repeat(250)}@b.co` }, ["email"]],
      [{ name: "Sur", cuit: "20-12345678-0" }, ["cuit"]],
      [{ name: "Sur", cuit: "2012345678" }, ["cuit"]],
      [
        { name: "", phone: "x", email: "y", cuit: "z" },
        ["name", "phone", "email", "cuit"],
      ],
    ];
    for (const [input, fields] of cases) {
      expect(await createSupplier(s.adminA, input)).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields,
      });
      expect(await updateSupplier(s.adminA, id, input)).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields,
      });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("un id inválido o de otra organización", async () => {
    const s = await seed();
    const idB = await create(s.adminB, { name: "De B" });
    const before = await snapshot();
    for (const operation of [
      (id: string) => getSupplier(s.adminA, id),
      (id: string) => updateSupplier(s.adminA, id, { name: "X" }),
      (id: string) => deactivateSupplier(s.adminA, id),
      (id: string) => reactivateSupplier(s.adminA, id),
      (id: string) => listSupplierAudit(s.adminA, id, 1),
    ]) {
      expect(await operation("no-es-un-uuid")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
      expect(await operation(idB)).toEqual({ ok: false, code: "NOT_FOUND" });
    }
    expect(await snapshot()).toEqual(before);
  });

  it(
    "el nombre y el CUIT repetidos, también contra un inactivo, en el alta y en la edición",
    async () => {
      const s = await seed();
      const inactive = await create(s.adminA, {
        name: "Distribuidora Norte",
        cuit: CUIT_A,
      });
      await deactivateSupplier(s.adminA, inactive);
      const other = await create(s.adminA, { name: "Sur" });
      const before = await snapshot();

      expect(
        await createSupplier(s.adminA, { name: "DISTRIBUIDORA norte" }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "duplicate_name",
      });
      expect(
        await createSupplier(s.adminA, { name: "Otro", cuit: "20-12345678-6" }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "duplicate_cuit",
      });
      expect(
        await updateSupplier(s.adminA, other, { name: "distribuidora NORTE" }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "duplicate_name",
      });
      expect(
        await updateSupplier(s.adminA, other, { name: "Sur", cuit: CUIT_A }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "duplicate_cuit",
      });
      expect(await snapshot()).toEqual(before);

      // Otra organización puede repetirlos.
      await create(s.adminB, { name: "Distribuidora Norte", cuit: CUIT_A });
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-5; ADR 0023, punto 10; D-6)", () => {
  function lockSupplier(id: string) {
    return sql`select id from suppliers where id = ${id} for update`;
  }

  // Cada camino espera el FOR UPDATE retenido desde otra conexión: sin él, la escritura no
  // esperaría y waitForLockWaiters vencería.
  async function waitsForSupplierLock<T>(
    id: string,
    write: () => Promise<T>,
  ): Promise<T> {
    const release = await hold(lockSupplier(id));
    const writing = write();
    let settled = false;
    void writing.then(
      () => (settled = true),
      () => (settled = true),
    );
    await waitForLockWaiters(1);
    expect(settled).toBe(false);
    await release();
    return writing;
  }

  it(
    "la edición, la desactivación y la reactivación esperan el bloqueo del proveedor",
    async () => {
      const s = await seed();
      const id = await create(s.adminA, { name: "Norte" });
      expect(
        await waitsForSupplierLock(id, () =>
          updateSupplier(s.adminA, id, { name: "Norte SRL" }),
        ),
      ).toEqual({ ok: true, changed: true });
      expect(
        await waitsForSupplierLock(id, () => deactivateSupplier(s.adminA, id)),
      ).toEqual({ ok: true, changed: true });
      expect(
        await waitsForSupplierLock(id, () => reactivateSupplier(s.adminA, id)),
      ).toEqual({ ok: true, changed: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos ediciones simultáneas: la segunda audita como «antes» lo que dejó la primera",
    async () => {
      const s = await seed();
      const id = await create(s.adminA, { name: "Original" });
      const release = await hold(lockSupplier(id));
      const first = updateSupplier(s.adminA, id, { name: "Primera" });
      await waitForLockWaiters(1);
      const second = updateSupplier(s.adminA, id, { name: "Segunda" });
      await waitForLockWaiters(2);
      await release();
      expect(await Promise.all([first, second])).toEqual([
        { ok: true, changed: true },
        { ok: true, changed: true },
      ]);

      const updates = (await supplierAudits()).filter(
        (audit) => audit.action === "update",
      );
      expect(updates).toHaveLength(2);
      // created_at es la hora de inicio de cada transacción, no la de su escritura: el orden no se
      // lee de ahí. Una de las dos partió del original, y la otra, de lo que dejó esa. Sin el
      // FOR UPDATE, las dos tendrían «Original» como «antes».
      const firstWritten = updates.find(
        (audit) => audit.diff.before?.name === "Original",
      );
      const secondWritten = updates.find((audit) => audit !== firstWritten);
      expect(firstWritten).toBeDefined();
      expect(secondWritten!.diff.before).toEqual(firstWritten!.diff.after);
    },
    TEST_TIMEOUT,
  );

  // El UPDATE también espera una fila bloqueada, así que el caso de arriba no distingue el
  // FOR UPDATE de la lectura (mutación M2 de §Resultados). Este sí: sin él, las dos leerían
  // «activo», las dos escribirían y habría dos auditorías de una sola desactivación.
  it(
    "dos desactivaciones simultáneas: una cambia y audita, la otra no cambia nada",
    async () => {
      const s = await seed();
      const id = await create(s.adminA, { name: "Norte" });
      const release = await hold(lockSupplier(id));
      const first = deactivateSupplier(s.adminA, id);
      await waitForLockWaiters(1);
      const second = deactivateSupplier(s.adminA, id);
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results).toEqual(
        expect.arrayContaining([
          { ok: true, changed: true },
          { ok: true, changed: false },
        ]),
      );
      expect(
        (await supplierAudits()).filter(
          (audit) => audit.action === "deactivate",
        ),
      ).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "un alta que espera a otra con el mismo nombre termina en duplicate_name",
    async () => {
      const s = await seed();
      // Otra transacción insertó el nombre y no confirmó: el alta espera en el índice único.
      const release = await hold(
        sql`insert into suppliers (organization_id, name) values (${s.orgA}, 'Norte')`,
      );
      const creating = createSupplier(s.adminA, { name: "NORTE" });
      await waitForLockWaiters(1);
      await release();
      expect(await creating).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "duplicate_name",
      });
      expect((await supplierAudits()).length).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "un alta que espera a otra con el mismo CUIT termina en duplicate_cuit",
    async () => {
      const s = await seed();
      const release = await hold(
        sql`insert into suppliers (organization_id, name, cuit)
            values (${s.orgA}, 'Norte', ${CUIT_A})`,
      );
      const creating = createSupplier(s.adminA, { name: "Sur", cuit: CUIT_A });
      await waitForLockWaiters(1);
      await release();
      expect(await creating).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "duplicate_cuit",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos altas simultáneas con el mismo nombre: una creada y un duplicate_name",
    async () => {
      const s = await seed();
      const results = await Promise.all([
        createSupplier(s.adminA, { name: "Norte" }),
        createSupplier(s.adminA, { name: "norte" }),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, code: "BUSINESS_RULE_VIOLATION", rule: "duplicate_name" },
      ]);
      expect((await supplierAudits()).length).toBe(1);
    },
    TEST_TIMEOUT,
  );
});

describe("la lista con 2.000 proveedores (AC-7; D-10)", () => {
  // El umbral de 754 ms es el de la lista de clientes de la 13.2, que la 17.1 también usó: la lista
  // entera con búsqueda, en local, sin índice nuevo (regla 6).
  const THRESHOLD_MS = 754;

  it(
    "la lista con búsqueda por nombre y por CUIT queda bajo el umbral",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`insert into suppliers (organization_id, name, phone_e164, email, is_active)
            select ${s.orgA}, 'Proveedor ' || lpad(n::text, 4, '0') || ' Distribución',
                   '+54911' || lpad(n::text, 8, '0'), 'ventas' || n || '@ejemplo.com',
                   n % 5 <> 0
            from generate_series(1, 2000) as n`,
      );
      await getDb().execute(sql`analyze suppliers`);

      const queries = [
        { text: "", status: "all" as const, page: 40 },
        { text: "distribucion", status: "active" as const, page: 30 },
        { text: "0999", status: "all" as const, page: 1 },
        { text: "20-12345678-6", status: "all" as const, page: 1 },
      ];
      for (const query of queries) {
        // Una corrida previa calienta la caché: se mide la consulta, no el primer acceso.
        await listSuppliers(s.adminA, query);
        const started = performance.now();
        const result = await listSuppliers(s.adminA, query);
        const elapsed = performance.now() - started;
        expect(result.ok).toBe(true);
        expect(elapsed, JSON.stringify(query)).toBeLessThan(THRESHOLD_MS);
      }
    },
    TEST_TIMEOUT,
  );
});
