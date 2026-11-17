import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { createModel, createServiceProduct } from "@/modules/catalog";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import { createSupplier, setSupplierTechnician } from "@/modules/purchasing";
import {
  applyRepairTypeTemplate,
  approveServiceOrder,
  createServiceOrder,
  listRepairTypes,
  listServiceOrders,
  listTechnicianWork,
  markServiceOrderRepaired,
  quoteServiceOrder,
  sendServiceOrder,
  setRepairPrice,
  TECHNICIAN_WORK_LIMIT,
} from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Los trabajos reparados de un técnico (brief-24.8.2-b, D-4) y el filtro por técnico de la lista de
// reparaciones (D-5), contra PostgreSQL real: qué devuelve cada uno, a quién se lo niega y qué plan
// usa la lectura nueva (AC-14, medición 2).

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 60000;
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function member(
  orgId: string,
  email: string,
  role: "admin" | "viewer",
): Promise<AuthContext> {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${email}, false) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${userId}, ${role})`,
  );
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error("login rechazado");
  const auth = await getAuthContext(logged.token);
  if (!auth.ok) throw new Error("contexto rechazado");
  return auth.context;
}

// Lo mismo que hace org:capability --profile iphone.
async function activateRepairs(organizationId: string, adminEmail: string) {
  const profile = getProfile("iphone")!;
  return getDb().transaction(async (tx) => {
    let actorUserId = "";
    for (const capability of profile.capabilities) {
      const activated = await activateCapability(tx, {
        organizationId,
        capability,
        adminEmail,
      });
      if (!activated.ok) throw new Error(activated.code);
      actorUserId = activated.actorUserId;
    }
    await applyRepairTypeTemplate(tx, {
      organizationId,
      actorUserId,
      repairTypes: profile.repairTypes,
    });
    await createServiceProduct(tx, { organizationId, actorUserId });
  });
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`rechazado: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone A', 'USD') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone B', 'USD') returning id`,
  );
  const orgC = await returningId(
    sql`insert into organizations (name) values ('Sin reparaciones') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com", "admin");
  const viewer = await member(orgA, "viewer-a@example.com", "viewer");
  const adminB = await member(orgB, "admin-b@example.com", "admin");
  const adminC = await member(orgC, "admin-c@example.com", "admin");
  await activateRepairs(orgA, "admin-a@example.com");
  await activateRepairs(orgB, "admin-b@example.com");

  const model = ok(
    await createModel(admin, { name: "iPhone 13", brand: "Apple" }),
  );
  const types = ok(await listRepairTypes(admin));
  const battery = types.types.find(
    (type) => type.name === "Cambio de batería",
  )!.id;
  ok(
    await setRepairPrice(admin, {
      repairTypeId: battery,
      modelId: model.modelId,
      price: "80",
      priceCurrency: "USD",
      cost: "35",
      costCurrency: "USD",
    }),
  );
  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name) values (${orgA}, 'Ana Cliente') returning id`,
  );
  const technician = ok(await createSupplier(admin, { name: "Técnico Uno" }));
  ok(await setSupplierTechnician(admin, technician.supplierId, true));
  const other = ok(await createSupplier(admin, { name: "Técnico Dos" }));
  ok(await setSupplierTechnician(admin, other.supplierId, true));

  return {
    orgA,
    admin,
    viewer,
    adminB,
    adminC,
    modelId: model.modelId,
    battery,
    clientId,
    technicianId: technician.supplierId,
    otherTechnicianId: other.supplierId,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

// Una orden reparada por el técnico que se pida, con su costo.
async function repairedOrder(
  s: Seed,
  technicianId: string,
  serial: string,
  cost = "35",
) {
  const created = ok(
    await createServiceOrder(s.admin, {
      clientId: s.clientId,
      modelId: s.modelId,
      deviceSerial: serial,
      reportedIssue: "La batería dura poco.",
    }),
  );
  const id = created.order.id;
  ok(await sendServiceOrder(s.admin, id, technicianId));
  ok(
    await quoteServiceOrder(s.admin, id, {
      customerCurrency: "USD",
      technicianCurrency: "USD",
      lines: [{ repairTypeId: s.battery, price: "80", cost }],
    }),
  );
  ok(await approveServiceOrder(s.admin, id));
  ok(await markServiceOrderRepaired(s.admin, id));
  return created.order;
}

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los trabajos reparados de un técnico (AC-5; D-4)", () => {
  it(
    "trae el número, el modelo, los tipos de reparación y el costo, del más nuevo al más viejo",
    async () => {
      const s = await seed();
      const primera = await repairedOrder(s, s.technicianId, "356789012345678");
      const segunda = await repairedOrder(
        s,
        s.technicianId,
        "356789012345679",
        "50",
      );
      // De otro técnico: no tiene que aparecer.
      await repairedOrder(s, s.otherTechnicianId, "356789012345680");

      const result = ok(await listTechnicianWork(s.admin, s.technicianId));
      expect(result.total).toBe(2);
      expect(result.items.map((item) => item.id)).toEqual([
        segunda.id,
        primera.id,
      ]);
      const [nueva] = result.items;
      expect(nueva!.displayNumber).toBe(segunda.displayNumber);
      expect(nueva!.modelName).toBe("iPhone 13");
      expect(nueva!.repairTypes).toEqual(["Cambio de batería"]);
      expect(nueva!.currency).toBe("USD");
      expect(nueva!.total).toBe("50.00");
      expect(nueva!.repairedAt).toBeInstanceOf(Date);
    },
    TEST_TIMEOUT,
  );

  it(
    "una orden que todavía no se reparó no cuenta, y un técnico sin trabajo devuelve cero",
    async () => {
      const s = await seed();
      const created = ok(
        await createServiceOrder(s.admin, {
          clientId: s.clientId,
          modelId: s.modelId,
          deviceSerial: "356789012345681",
          reportedIssue: "No carga.",
        }),
      );
      ok(await sendServiceOrder(s.admin, created.order.id, s.technicianId));

      const result = ok(await listTechnicianWork(s.admin, s.technicianId));
      expect(result).toMatchObject({ ok: true, total: 0, items: [] });
    },
    TEST_TIMEOUT,
  );

  it(
    "no pasa de su tope, aunque el total cuente todas",
    async () => {
      const s = await seed();
      for (let n = 0; n < TECHNICIAN_WORK_LIMIT + 2; n += 1) {
        await repairedOrder(s, s.technicianId, `35678901234600${n}`);
      }
      const result = ok(await listTechnicianWork(s.admin, s.technicianId));
      expect(result.total).toBe(TECHNICIAN_WORK_LIMIT + 2);
      expect(result.items).toHaveLength(TECHNICIAN_WORK_LIMIT);
    },
    TEST_TIMEOUT,
  );

  it(
    "un viewer, otra organización y una sin la capacidad no reciben ningún dato (AC-11)",
    async () => {
      const s = await seed();
      await repairedOrder(s, s.technicianId, "356789012345678");

      expect(await listTechnicianWork(s.viewer, s.technicianId)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      // Otra organización con la capacidad: el técnico no es suyo, así que no tiene trabajo.
      expect(
        ok(await listTechnicianWork(s.adminB, s.technicianId)),
      ).toMatchObject({ total: 0, items: [] });
      expect(await listTechnicianWork(s.adminC, s.technicianId)).toMatchObject({
        ok: false,
        code: "NOT_FOUND",
      });
      // Un id que no es un uuid no rompe la ficha.
      expect(await listTechnicianWork(s.admin, "no-es-un-uuid")).toMatchObject({
        ok: false,
        code: "NOT_FOUND",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la lista de reparaciones filtrada por técnico (D-5)", () => {
  it(
    "devuelve solo las de ese técnico, y un id que no existe no devuelve nada",
    async () => {
      const s = await seed();
      const suya = await repairedOrder(s, s.technicianId, "356789012345678");
      const ajena = await repairedOrder(
        s,
        s.otherTechnicianId,
        "356789012345679",
      );

      const filtradas = ok(
        await listServiceOrders(s.admin, {
          status: "all",
          kind: "all",
          number: "",
          technicianId: s.technicianId,
          page: 1,
        }),
      );
      expect(filtradas.total).toBe(1);
      expect(filtradas.orders.map((order) => order.id)).toEqual([suya.id]);

      const todas = ok(
        await listServiceOrders(s.admin, {
          status: "all",
          kind: "all",
          number: "",
          technicianId: "",
          page: 1,
        }),
      );
      expect(todas.total).toBe(2);
      expect(todas.orders.map((order) => order.id).sort()).toEqual(
        [suya.id, ajena.id].sort(),
      );

      // Un id que no es un uuid devuelve la página vacía, no un error de la base.
      const rota = ok(
        await listServiceOrders(s.admin, {
          status: "all",
          kind: "all",
          number: "",
          technicianId: "no-es-un-uuid",
          page: 1,
        }),
      );
      expect(rota).toMatchObject({ total: 0, orders: [] });
    },
    TEST_TIMEOUT,
  );

  it(
    "se combina con el estado y no cruza organizaciones",
    async () => {
      const s = await seed();
      await repairedOrder(s, s.technicianId, "356789012345678");
      const enCurso = ok(
        await createServiceOrder(s.admin, {
          clientId: s.clientId,
          modelId: s.modelId,
          deviceSerial: "356789012345682",
          reportedIssue: "No carga.",
        }),
      );
      ok(await sendServiceOrder(s.admin, enCurso.order.id, s.technicianId));

      const reparadas = ok(
        await listServiceOrders(s.admin, {
          status: "repaired",
          kind: "all",
          number: "",
          technicianId: s.technicianId,
          page: 1,
        }),
      );
      expect(reparadas.total).toBe(1);
      expect(reparadas.orders[0]!.status).toBe("repaired");

      const abiertas = ok(
        await listServiceOrders(s.admin, {
          status: "open",
          kind: "all",
          number: "",
          technicianId: s.technicianId,
          page: 1,
        }),
      );
      // «En curso» incluye a la reparada: abierta es todo lo que no se entregó ni se canceló.
      expect(abiertas.orders.map((order) => order.id)).toContain(
        enCurso.order.id,
      );
      expect(abiertas.total).toBe(2);

      // Otra organización no ve ninguna, aunque pase el id del técnico.
      const deB = ok(
        await listServiceOrders(s.adminB, {
          status: "all",
          kind: "all",
          number: "",
          technicianId: s.technicianId,
          page: 1,
        }),
      );
      expect(deB.total).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

// La medición 2 del brief (AC-14): el plan de la lectura nueva sobre un técnico con muchas órdenes.
// Lo que falla si la consulta recorre la tabla entera es el `Seq Scan`, que es la condición de
// detención 4.
// 10.000 órdenes reparadas más, casi todas de otro técnico: la forma real de un taller con varios,
// que es donde se nota si la lectura usa el índice por técnico o recorre todo.
async function tenThousandMore(s: Seed, orderId: string): Promise<void> {
  await getDb().execute(sql`alter table service_orders disable trigger user`);
  await getDb().execute(
    sql`insert into service_orders (organization_id, number, kind, client_id, model_id,
          reported_issue, technician_id, customer_currency, customer_total,
          technician_currency, technician_total, sent_at, quoted_at, approved_at, repaired_at,
          created_by, status)
        select organization_id, 1000 + n, kind, client_id, model_id, reported_issue,
          case when n % 500 = 0 then ${s.technicianId}::uuid else ${s.otherTechnicianId}::uuid end,
          customer_currency, customer_total, technician_currency, technician_total,
          sent_at, quoted_at, approved_at, repaired_at - (n || ' minutes')::interval,
          created_by, status
        from service_orders, generate_series(1, 10000) as n
        where id = ${orderId}`,
  );
  await getDb().execute(sql`alter table service_orders enable trigger user`);
  await getDb().execute(sql`analyze service_orders`);
}

describe("el plan de los trabajos reparados (AC-14)", () => {
  it(
    "usa un índice por técnico y no recorre toda la tabla",
    async () => {
      const s = await seed();
      const orden = await repairedOrder(s, s.technicianId, "356789012345678");
      // 10.000 órdenes reparadas más, casi todas de otro técnico: la forma real de un taller con
      // varios, que es donde se nota si la lectura usa el índice por técnico o recorre todo.
      await tenThousandMore(s, orden.id);

      const plan = await getDb().execute<{ "QUERY PLAN": string }>(
        sql`explain (analyze, buffers)
            select id, number, model_id, technician_currency, technician_total, repaired_at
            from service_orders
            where organization_id = ${s.orgA} and technician_id = ${s.technicianId}
              and repaired_at is not null and technician_total is not null
            order by repaired_at desc, number desc
            limit ${TECHNICIAN_WORK_LIMIT}`,
      );
      const text = plan.rows.map((row) => row["QUERY PLAN"]).join("\n");
      // El índice parcial `service_orders_technician_idx (organization_id, technician_id)`, que
      // la 29.6 ya había creado: la lectura nueva no necesita ninguno propio.
      expect(text).toContain("service_orders_technician_idx");
      expect(text).not.toContain("Seq Scan on service_orders");

      const result = ok(await listTechnicianWork(s.admin, s.technicianId));
      expect(result.total).toBe(21);
      expect(result.items).toHaveLength(TECHNICIAN_WORK_LIMIT);
    },
    TEST_TIMEOUT,
  );

  // La lectura modificada del otro módulo: `technician_id` entró en `listConditions`, que es el
  // `where` de `countServiceOrders` y de `findServiceOrders`, las dos consultas de /reparaciones.
  // Las dos se miden acá: es la lectura a la que lleva el enlace de la ficha del técnico.
  it(
    "la lista de /reparaciones filtrada por técnico usa el índice en las dos consultas",
    async () => {
      const s = await seed();
      const orden = await repairedOrder(s, s.technicianId, "356789012345678");
      await tenThousandMore(s, orden.id);

      // El SQL se transcribe —el repositorio no expone su builder—, con las condiciones de
      // `listConditions` para «Todas» y el orden de `findServiceOrders`.
      const planes = await Promise.all([
        getDb().execute<{ "QUERY PLAN": string }>(
          sql`explain (analyze, buffers)
              select count(*) from service_orders
              where organization_id = ${s.orgA} and technician_id = ${s.technicianId}`,
        ),
        getDb().execute<{ "QUERY PLAN": string }>(
          sql`explain (analyze, buffers)
              select id, number, status, kind, created_at
              from service_orders
              where organization_id = ${s.orgA} and technician_id = ${s.technicianId}
              order by created_at desc, id desc
              limit 25 offset 0`, // SERVICE_ORDERS_PAGE_SIZE
        ),
      ]);
      for (const plan of planes) {
        const text = plan.rows.map((row) => row["QUERY PLAN"]).join("\n");
        expect(text).toContain("service_orders_technician_idx");
        expect(text).not.toContain("Seq Scan on service_orders");
      }

      // Y la lista real, con el filtro que usa la pantalla: las 21 órdenes de este técnico, que
      // entran en la primera página de 25. El universo es el mismo que cuenta la tarjeta de la ficha.
      const lista = ok(
        await listServiceOrders(s.admin, {
          status: "all",
          kind: "all",
          number: "",
          technicianId: s.technicianId,
          page: 1,
        }),
      );
      expect(lista.total).toBe(21);
      expect(lista.orders).toHaveLength(21);
    },
    TEST_TIMEOUT,
  );
});
