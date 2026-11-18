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
  getServiceOrderCounts,
  listServiceOrders,
} from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Los cuatro contadores del listado de órdenes (brief-24.9.1, D-2, AC-3, AC-4 y AC-5) y el buscador
// por número o por equipo (D-3, AC-7), contra PostgreSQL real.
//
// El conjunto está **armado a mano con INSERT**, no con los flujos del módulo: así cada fila dice en
// una línea qué tipo, qué estado y qué presupuesto tiene, que es exactamente lo que los contadores
// leen, y entran combinaciones que el flujo tardaría muchos pasos en alcanzar. Las fechas de cada
// estado las pone `dates()` siguiendo las mismas restricciones que la base verifica, así que una
// fila inventada que el sistema no podría producir **hace fallar el INSERT**, no la aserción.

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

type Kind = "customer_device" | "own_unit" | "warranty_claim";
type Status =
  | "received"
  | "sent"
  | "quoted"
  | "approved"
  | "rejected"
  | "repaired"
  | "delivered"
  | "cancelled";

// El conjunto se arma **caminando la máquina de estados**, no fabricando filas: el trigger
// `service_orders_guard_change` no deja nacer una orden en un estado que no sea el suyo, ni cambiar
// de estado tocando otras columnas que las de esa transición. Es lo que hace honesto al fixture: una
// combinación que el sistema no podría producir **hace fallar el UPDATE**, no la aserción. Camina con
// SQL en vez de con las funciones del módulo para no arrastrar la maquinaria de ventas y de reclamos
// que la entrega real usa, y que estos contadores no leen.

type Seed = {
  orgA: string;
  admin: AuthContext;
  viewer: AuthContext;
  adminB: AuthContext;
  modelId: string;
  otherModelId: string;
  clientId: string;
  technicianId: string;
  otherTechnicianId: string;
  unitIds: string[];
};

let numbers = 0;
let saleNumbers = 0;

async function advance(id: string, status: Status, sets: SQL[]) {
  await getDb().execute(
    sql`update service_orders
        set status = ${status}::service_order_status, ${sql.join(sets, sql`, `)}
        where id = ${id}`,
  );
}

async function insertOrder(
  s: Seed,
  row: {
    kind: Kind;
    status: Status;
    quote?: string;
    modelId?: string;
    technicianId?: string;
    unitId?: string;
    claimOf?: string;
  },
): Promise<string> {
  const { kind, status } = row;
  const technicianId = row.technicianId ?? s.technicianId;
  const own = kind === "own_unit";
  // El nacimiento: una orden de cliente y un reclamo nacen recibidos; una unidad propia nace ya
  // mandada al técnico, porque no hay nada que presupuestarle a nadie (brief-29.6.2, D-3).
  const id = await returningId(sql`
    insert into service_orders (
      organization_id, number, kind, client_id, unit_id, claim_service_order_id, model_id,
      reported_issue, status, technician_id, sent_at, created_by
    ) values (
      ${s.orgA},
      ${++numbers},
      ${kind}::service_order_kind,
      ${own ? null : s.clientId},
      ${own ? (row.unitId ?? null) : null},
      ${kind === "warranty_claim" ? (row.claimOf ?? null) : null},
      ${row.modelId ?? s.modelId},
      'Prueba de contadores.',
      ${own ? "sent" : "received"}::service_order_status,
      ${own ? technicianId : null},
      ${own ? sql`now()` : null},
      ${s.admin.userId}
    ) returning id`);
  if (status === "cancelled") {
    await advance(id, "cancelled", [
      sql`cancelled_at = now()`,
      sql`cancel_reason = 'entered_by_mistake'`,
    ]);
    return id;
  }
  if (own) {
    if (status === "repaired") {
      await advance(id, "repaired", [
        sql`technician_currency = 'USD'`,
        sql`technician_total = '30.00'`,
        sql`repaired_at = now()`,
      ]);
    }
    return id;
  }
  if (status === "received") return id;
  await advance(id, "sent", [
    sql`technician_id = ${technicianId}`,
    sql`sent_at = now()`,
  ]);
  if (status === "sent") return id;
  // Un reclamo no se presupuesta: va de mandado a reparado y de ahí a entregado, sin cobrar nada.
  if (kind === "warranty_claim") {
    await advance(id, "repaired", [sql`repaired_at = now()`]);
    if (status === "delivered") {
      await advance(id, "delivered", [sql`delivered_at = now()`]);
    }
    return id;
  }
  await advance(id, "quoted", [
    sql`customer_currency = 'USD'`,
    sql`customer_total = ${row.quote ?? "80.00"}`,
    sql`technician_currency = 'USD'`,
    sql`technician_total = '30.00'`,
    sql`quoted_at = now()`,
  ]);
  if (status === "quoted") return id;
  await advance(id, "approved", [sql`approved_at = now()`]);
  if (status === "approved") return id;
  await advance(id, "repaired", [sql`repaired_at = now()`]);
  if (status === "repaired") return id;
  // La entrega **exige** la venta: el CHECK `service_orders_sale_delivered` es un si y solo si
  // —hay venta exactamente cuando una orden de cliente se entrega después de repararse—, así que la
  // base no deja entregar sin ella. Es también lo que hace exacto el «Ver venta» del próximo paso.
  const saleId = await returningId(
    sql`insert into sales (organization_id, number, currency, total, created_by)
        values (${s.orgA}, ${++saleNumbers}, 'USD', ${row.quote ?? "80.00"}, ${s.admin.userId})
        returning id`,
  );
  await advance(id, "delivered", [
    sql`delivered_at = now()`,
    sql`sale_id = ${saleId}`,
  ]);
  return id;
}

async function seed(): Promise<Seed> {
  numbers = 0;
  saleNumbers = 0;
  const orgA = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone A', 'USD') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone B', 'USD') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com", "admin");
  const viewer = await member(orgA, "viewer-a@example.com", "viewer");
  const adminB = await member(orgB, "admin-b@example.com", "admin");
  await activateRepairs(orgA, "admin-a@example.com");
  await activateRepairs(orgB, "admin-b@example.com");

  const model = ok(
    await createModel(admin, { name: "iPhone 13", brand: "Apple" }),
  );
  const other = ok(
    await createModel(admin, { name: "Samsung Galaxy", brand: "Samsung" }),
  );
  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name) values (${orgA}, 'Ana Cliente') returning id`,
  );
  const technician = ok(await createSupplier(admin, { name: "Técnico Uno" }));
  ok(await setSupplierTechnician(admin, technician.supplierId, true));
  const second = ok(await createSupplier(admin, { name: "Técnico Dos" }));
  ok(await setSupplierTechnician(admin, second.supplierId, true));

  // Dos unidades propias: las órdenes de unidad propia necesitan una de verdad (CHECK kind_subject),
  // y el índice parcial deja a lo sumo una abierta por unidad.
  const productId = await returningId(
    sql`insert into products (organization_id, sku, name, tracking)
        values (${orgA}, 'SKU-1', 'iPhone 13 usado', 'unit') returning id`,
  );
  const unitIds: string[] = [];
  for (const serial of ["IMEIUNO", "IMEIDOS"]) {
    unitIds.push(
      await returningId(
        sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type, created_by)
            values (${orgA}, ${productId}, ${serial}, '450.00', 'USD', 'manual', ${admin.userId}) returning id`,
      ),
    );
  }

  return {
    orgA,
    admin,
    viewer,
    adminB,
    modelId: model.modelId,
    otherModelId: other.modelId,
    clientId,
    technicianId: technician.supplierId,
    otherTechnicianId: second.supplierId,
    unitIds,
  };
}

// El conjunto de prueba, contado a mano una sola vez y reusado por las aserciones:
//
//   #  tipo             estado      presupuesto   en curso  presupuestar  entregar  garantías
//   1  customer_device  received    —                 sí         no          no        no
//   2  customer_device  sent        sin                sí         SÍ          no        no
//   3  customer_device  quoted      con                sí         no          no        no
//   4  customer_device  repaired    con                sí         no          SÍ        no
//   5  customer_device  delivered   con                no         no          no        no
//   6  customer_device  delivered   con                no         no          no        no
//   7  customer_device  delivered   con                no         no          no        no
//   8  customer_device  cancelled   —                 no         no          no        no
//   9  own_unit         sent        —                 sí         no          no        no
//  10  own_unit         repaired    —                 no         no          NO        no
//  11  warranty_claim   sent        —                 sí         no          no        SÍ
//  12  warranty_claim   repaired    —                 sí         no          SÍ        SÍ
//  13  warranty_claim   delivered   —                 no         no          no        no
//
// Las tres entregadas existen porque **cada reclamo abierto necesita su propio equipo reclamado**:
// el índice único parcial `service_orders_claim_order_open_unique` deja a lo sumo un reclamo abierto
// por orden, y un reclamo nace abierto aunque después se entregue.
//
// Totales: en curso 7 · para presupuestar 1 · listas para entregar 2 · garantías abiertas 2.
const ESPERADO = {
  open: 7,
  toQuote: 1,
  readyToDeliver: 2,
  openClaims: 2,
};

async function fixture(s: Seed) {
  await insertOrder(s, { kind: "customer_device", status: "received" });
  await insertOrder(s, { kind: "customer_device", status: "sent" });
  await insertOrder(s, {
    kind: "customer_device",
    status: "quoted",
    quote: "80.00",
  });
  await insertOrder(s, {
    kind: "customer_device",
    status: "repaired",
    quote: "80.00",
  });
  const delivered = await insertOrder(s, {
    kind: "customer_device",
    status: "delivered",
    quote: "80.00",
  });
  const secondDelivered = await insertOrder(s, {
    kind: "customer_device",
    status: "delivered",
    quote: "80.00",
  });
  const thirdDelivered = await insertOrder(s, {
    kind: "customer_device",
    status: "delivered",
    quote: "80.00",
  });
  await insertOrder(s, { kind: "customer_device", status: "cancelled" });
  await insertOrder(s, {
    kind: "own_unit",
    status: "sent",
    unitId: s.unitIds[0],
  });
  await insertOrder(s, {
    kind: "own_unit",
    status: "repaired",
    unitId: s.unitIds[1],
  });
  await insertOrder(s, {
    kind: "warranty_claim",
    status: "sent",
    claimOf: delivered,
  });
  await insertOrder(s, {
    kind: "warranty_claim",
    status: "repaired",
    claimOf: secondDelivered,
  });
  await insertOrder(s, {
    kind: "warranty_claim",
    status: "delivered",
    claimOf: thirdDelivered,
  });
}

const SIN_FILTROS = {
  kind: "all" as const,
  number: "",
  technicianId: "",
  searchModels: true,
};

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

afterAll(async () => {
  await resetDatabase(getDb());
});

describe("los cuatro contadores del listado (24.9.1, D-2)", () => {
  let s: Seed;

  beforeEach(async () => {
    await resetDatabase(getDb());
    s = await seed();
    await fixture(s);
  }, TEST_TIMEOUT);

  it(
    "cuenta cada tarjeta sobre el conjunto armado a mano (AC-3)",
    async () => {
      expect(
        ok(await getServiceOrderCounts(s.admin, SIN_FILTROS)).counts,
      ).toEqual(ESPERADO);
    },
    TEST_TIMEOUT,
  );

  it(
    "los ve igual un viewer, que también los mira (AC-3)",
    async () => {
      expect(
        ok(await getServiceOrderCounts(s.viewer, SIN_FILTROS)).counts,
      ).toEqual(ESPERADO);
    },
    TEST_TIMEOUT,
  );

  it(
    "no cuenta nada de otra organización",
    async () => {
      expect(
        ok(await getServiceOrderCounts(s.adminB, SIN_FILTROS)).counts,
      ).toEqual({ open: 0, toQuote: 0, readyToDeliver: 0, openClaims: 0 });
    },
    TEST_TIMEOUT,
  );

  it(
    "«Para presupuestar» no cuenta una orden del mismo técnico ya presupuestada (AC-5)",
    async () => {
      const counts = ok(
        await getServiceOrderCounts(s.admin, {
          ...SIN_FILTROS,
          technicianId: s.technicianId,
        }),
      ).counts;
      // La #2 está en el técnico sin presupuesto y la #3 está presupuestada: solo la primera cuenta.
      expect(counts.toQuote).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "«Listas para entregar» nunca cuenta una unidad propia reparada (AC-3)",
    async () => {
      const counts = ok(
        await getServiceOrderCounts(s.admin, {
          ...SIN_FILTROS,
          kind: "own_unit",
        }),
      ).counts;
      // La #9 está reparada, y una unidad propia reparada ya terminó (brief-29.6.2, D-3).
      expect(counts.readyToDeliver).toBe(0);
      expect(counts.open).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "responden al filtro por técnico y al de tipo, y no al estado (AC-4)",
    async () => {
      const sinTecnico = ok(
        await getServiceOrderCounts(s.admin, {
          ...SIN_FILTROS,
          technicianId: s.otherTechnicianId,
        }),
      ).counts;
      // Ninguna orden es del segundo técnico.
      expect(sinTecnico).toEqual({
        open: 0,
        toQuote: 0,
        readyToDeliver: 0,
        openClaims: 0,
      });
      const reclamos = ok(
        await getServiceOrderCounts(s.admin, {
          ...SIN_FILTROS,
          kind: "warranty_claim",
        }),
      ).counts;
      expect(reclamos).toEqual({
        open: 2,
        toQuote: 0,
        readyToDeliver: 1,
        openClaims: 2,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "no cambian al pasar de página, porque no se cuentan sobre la página (AC-4)",
    async () => {
      const primera = ok(
        await getServiceOrderCounts(s.admin, SIN_FILTROS),
      ).counts;
      const segunda = ok(
        await getServiceOrderCounts(s.admin, SIN_FILTROS),
      ).counts;
      // La función ni siquiera recibe la página: el tipo la excluye. Esto lo deja escrito.
      expect(primera).toEqual(segunda);
      expect(primera).toEqual(ESPERADO);
    },
    TEST_TIMEOUT,
  );

  it(
    "un técnico que no es un uuid da cuatro ceros en vez de romperse",
    async () => {
      expect(
        ok(
          await getServiceOrderCounts(s.admin, {
            ...SIN_FILTROS,
            technicianId: "no-soy-un-uuid",
          }),
        ).counts,
      ).toEqual({ open: 0, toQuote: 0, readyToDeliver: 0, openClaims: 0 });
    },
    TEST_TIMEOUT,
  );
});

describe("el buscador por número o por equipo (24.9.1, D-3)", () => {
  let s: Seed;

  beforeEach(async () => {
    await resetDatabase(getDb());
    s = await seed();
    await fixture(s);
    // Una orden más, de otro modelo, para que buscar por equipo distinga.
    await insertOrder(s, {
      kind: "customer_device",
      status: "received",
      modelId: s.otherModelId,
    });
  }, TEST_TIMEOUT);

  const buscar = async (text: string, context = s.admin) =>
    ok(
      await listServiceOrders(context, {
        status: "all",
        kind: "all",
        number: text,
        technicianId: "",
        searchModels: true,
        page: 1,
      }),
    );

  it(
    "encuentra por número de orden",
    async () => {
      const found = await buscar("OS-000001");
      expect(found.total).toBe(1);
      expect(found.orders[0]!.displayNumber).toBe("OS-000001");
    },
    TEST_TIMEOUT,
  );

  it(
    "encuentra por modelo del equipo, sin distinguir mayúsculas (AC-7)",
    async () => {
      const found = await buscar("samsung");
      expect(found.total).toBe(1);
      expect(found.orders[0]!.modelName).toBe("Samsung Galaxy");
      const todos = await buscar("iphone");
      expect(todos.total).toBe(13);
    },
    TEST_TIMEOUT,
  );

  it(
    "un texto que no es un número ni un modelo no encuentra nada, en vez de devolver todo",
    async () => {
      expect((await buscar("no existe este equipo")).total).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "no devuelve nada de otra organización (AC-7)",
    async () => {
      expect((await buscar("iphone", s.adminB)).total).toBe(0);
      expect((await buscar("OS-000001", s.adminB)).total).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "el buscador global sigue encontrando solo por número: no pasa searchModels",
    async () => {
      const found = ok(
        await listServiceOrders(s.admin, {
          status: "all",
          number: "samsung",
          page: 1,
        }),
      );
      expect(found.total).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "los contadores responden a lo buscado, igual que la tabla (AC-4)",
    async () => {
      const counts = ok(
        await getServiceOrderCounts(s.admin, {
          ...SIN_FILTROS,
          number: "samsung",
        }),
      ).counts;
      expect(counts).toEqual({
        open: 1,
        toQuote: 0,
        readyToDeliver: 0,
        openClaims: 0,
      });
    },
    TEST_TIMEOUT,
  );
});
