import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createProduct,
  deactivateProduct,
  reactivateProduct,
  updateProduct,
  type ProductInput,
} from "@/modules/catalog";
import { getProductStock, listProductStock } from "@/modules/inventory";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Servicio de catálogo contra PostgreSQL real (brief-4.2): escrituras auditadas, CONFLICT por SKU,
// autorización, aislamiento entre organizaciones, y lista y detalle con saldo y estado de stock.

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
        values (${email}, ${storedHash}, 'Persona', ${mustChangePassword}) returning id`,
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

const coffee: ProductInput = {
  sku: "CAF-250",
  name: "Café molido 250 g",
  description: "Tostado medio",
  unit: "unidad",
  reorderPoint: "5",
};

async function create(context: AuthContext, input: ProductInput = coffee) {
  const result = await createProduct(context, input);
  if (!result.ok) throw new Error(`alta rechazada: ${result.code}`);
  return result.productId;
}

async function count(table: "products" | "audit_logs") {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

async function auditRows() {
  const result = await getDb().execute(
    sql`select organization_id, actor_user_id, entity_type, entity_id, action, diff
        from audit_logs order by created_at`,
  );
  return result.rows;
}

async function productRow(productId: string) {
  const result = await getDb().execute(
    sql`select sku, name, description, unit, reorder_point, is_active
        from products where id = ${productId}`,
  );
  return result.rows[0];
}

// Productos y saldos por SQL, sin auditoría: preparan la lista.
async function insertProduct(
  organizationId: string,
  values: {
    sku: string;
    name: string;
    reorderPoint?: string;
    isActive?: boolean;
    balance?: string;
  },
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, reorder_point, is_active)
        values (${organizationId}, ${values.sku}, ${values.name}, ${values.reorderPoint ?? "10"},
                ${values.isActive ?? true})
        returning id`,
  );
  const productId = result.rows[0]!.id;
  if (values.balance !== undefined) {
    await getDb().execute(
      sql`insert into inventories (organization_id, product_id, quantity_on_hand)
          values (${organizationId}, ${productId}, ${values.balance})`,
    );
  }
  return productId;
}

const listDefaults = {
  text: "",
  stockStatus: "all",
  activity: "active",
  page: 1,
} as const;

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("createProduct", () => {
  it("crea el producto normalizado y lo audita en la misma transacción", async () => {
    const s = await seed();
    const productId = await create(s.adminA, {
      ...coffee,
      sku: " CAF-250 ",
      reorderPoint: "2,5",
    });

    expect(await productRow(productId)).toEqual({
      sku: "CAF-250",
      name: "Café molido 250 g",
      description: "Tostado medio",
      unit: "unidad",
      reorder_point: "2.500",
      is_active: true,
    });
    expect(await auditRows()).toEqual([
      {
        organization_id: s.orgA,
        actor_user_id: s.adminA.userId,
        entity_type: "product",
        entity_id: productId,
        action: "create",
        diff: {
          before: null,
          after: {
            sku: "CAF-250",
            name: "Café molido 250 g",
            description: "Tostado medio",
            unit: "unidad",
            reorderPoint: "2.500",
            isActive: true,
          },
        },
      },
    ]);
  });

  it("una entrada inválida devuelve los campos y no escribe nada", async () => {
    const s = await seed();
    expect(
      await createProduct(s.adminA, {
        ...coffee,
        sku: "CAF 250",
        reorderPoint: "-1",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["sku", "reorderPoint"],
    });
    expect(await count("products")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });

  it("un SKU repetido, también con otras mayúsculas, da CONFLICT sin auditoría", async () => {
    const s = await seed();
    await create(s.adminA);
    for (const sku of ["CAF-250", "caf-250"]) {
      expect(await createProduct(s.adminA, { ...coffee, sku })).toEqual({
        ok: false,
        code: "CONFLICT",
      });
    }
    expect(await count("products")).toBe(1);
    expect(await count("audit_logs")).toBe(1);
  });

  it("dos altas simultáneas con el mismo SKU: exactamente una se crea", async () => {
    const s = await seed();
    const results = await Promise.all([
      createProduct(s.adminA, coffee),
      createProduct(s.adminA, { ...coffee, sku: "caf-250" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, code: "CONFLICT" },
    ]);
    expect(await count("products")).toBe(1);
    expect(await count("audit_logs")).toBe(1);
  });

  it("acepta el mismo SKU en otra organización", async () => {
    const s = await seed();
    await create(s.adminA);
    await create(s.adminB);
    expect(await count("products")).toBe(2);
  });

  it("viewer y contraseña pendiente reciben FORBIDDEN sin escribir", async () => {
    const s = await seed();
    for (const context of [s.viewerA, s.pendingA]) {
      expect(await createProduct(context, coffee)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    expect(await count("products")).toBe(0);
  });

  it("si falla la auditoría, el producto no persiste", async () => {
    const s = await seed();
    // Un actor inexistente hace fallar la clave foránea de audit_logs después del insert.
    const ghost: AuthContext = { ...s.adminA, userId: randomUUID() };
    await expect(createProduct(ghost, coffee)).rejects.toThrow();
    expect(await count("products")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });
});

describe("updateProduct", () => {
  it("escribe y audita solo los campos que cambiaron", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    expect(
      await updateProduct(s.adminA, productId, {
        ...coffee,
        name: "Café molido 500 g",
        reorderPoint: "10",
      }),
    ).toEqual({ ok: true, changed: true });

    expect(await productRow(productId)).toMatchObject({
      name: "Café molido 500 g",
      reorder_point: "10.000",
    });
    const rows = await auditRows();
    expect(rows[1]).toMatchObject({
      action: "update",
      entity_id: productId,
      diff: {
        before: { name: "Café molido 250 g", reorderPoint: "5.000" },
        after: { name: "Café molido 500 g", reorderPoint: "10.000" },
      },
    });
  });

  it("sin diferencias reales no escribe ni audita", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    expect(
      await updateProduct(s.adminA, productId, {
        ...coffee,
        sku: " CAF-250 ",
        reorderPoint: "5,000",
      }),
    ).toEqual({ ok: true, changed: false });
    expect(await count("audit_logs")).toBe(1);
  });

  it("el SKU de otro producto da CONFLICT; cambiar las mayúsculas del propio, no", async () => {
    const s = await seed();
    const first = await create(s.adminA);
    const second = await create(s.adminA, { ...coffee, sku: "YER-500" });

    expect(
      await updateProduct(s.adminA, second, { ...coffee, sku: "caf-250" }),
    ).toEqual({ ok: false, code: "CONFLICT" });
    expect(await productRow(second)).toMatchObject({ sku: "YER-500" });
    expect(await count("audit_logs")).toBe(2);

    expect(
      await updateProduct(s.adminA, first, { ...coffee, sku: "caf-250" }),
    ).toEqual({ ok: true, changed: true });
  });

  it("edita un producto inactivo", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    await deactivateProduct(s.adminA, productId);
    expect(
      await updateProduct(s.adminA, productId, { ...coffee, unit: "kg" }),
    ).toEqual({ ok: true, changed: true });
  });

  it("producto de otra organización da NOT_FOUND; id inválido, VALIDATION_ERROR; viewer, FORBIDDEN", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    expect(await updateProduct(s.adminB, productId, coffee)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await updateProduct(s.adminA, "no-es-un-id", coffee)).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await updateProduct(s.viewerA, productId, coffee)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await productRow(productId)).toMatchObject({
      name: "Café molido 250 g",
    });
  });
});

describe("deactivateProduct y reactivateProduct", () => {
  it("desactivan y reactivan con auditoría; repetir no cambia nada", async () => {
    const s = await seed();
    const productId = await create(s.adminA);

    expect(await deactivateProduct(s.adminA, productId)).toEqual({
      ok: true,
      changed: true,
    });
    expect(await deactivateProduct(s.adminA, productId)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await reactivateProduct(s.adminA, productId)).toEqual({
      ok: true,
      changed: true,
    });

    const rows = await auditRows();
    expect(rows.slice(1)).toMatchObject([
      {
        action: "deactivate",
        diff: { before: { isActive: true }, after: { isActive: false } },
      },
      {
        action: "reactivate",
        diff: { before: { isActive: false }, after: { isActive: true } },
      },
    ]);
    expect(await productRow(productId)).toMatchObject({ is_active: true });
  });

  it("rechazan otra organización, id inválido, viewer y contraseña pendiente", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    for (const change of [deactivateProduct, reactivateProduct]) {
      expect(await change(s.adminB, productId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await change(s.adminA, "no-es-un-id")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
      for (const context of [s.viewerA, s.pendingA]) {
        expect(await change(context, productId)).toEqual({
          ok: false,
          code: "FORBIDDEN",
        });
      }
    }
    expect(await count("audit_logs")).toBe(1);
  });
});

describe("getProductStock", () => {
  it("un viewer lee el producto con su saldo y estado", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA, {
      sku: "CAF-250",
      name: "Café",
      reorderPoint: "10",
      balance: "6",
    });
    const result = await getProductStock(s.viewerA, productId);
    expect(result).toMatchObject({
      ok: true,
      product: {
        id: productId,
        quantityOnHand: "6.000",
        reorderPoint: "10.000",
        stockStatus: "bajo_stock",
      },
    });
  });

  it("sin fila de inventories el saldo es 0 y está sin stock", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA, {
      sku: "AZU-1K",
      name: "Azúcar",
    });
    expect(await getProductStock(s.adminA, productId)).toMatchObject({
      ok: true,
      product: { quantityOnHand: "0.000", stockStatus: "sin_stock" },
    });
  });

  it("otra organización da NOT_FOUND; id inválido, VALIDATION_ERROR; contraseña pendiente, FORBIDDEN", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA, {
      sku: "AZU-1K",
      name: "Azúcar",
    });
    expect(await getProductStock(s.adminB, productId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await getProductStock(s.adminA, "no-es-un-id")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await getProductStock(s.pendingA, productId)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});

describe("listProductStock", () => {
  async function seedList() {
    const s = await seed();
    await insertProduct(s.orgA, {
      sku: "CAF-250",
      name: "Café molido 250 g",
      balance: "6",
    });
    await insertProduct(s.orgA, {
      sku: "YER-500",
      name: "Yerba 500 g",
      balance: "48",
    });
    await insertProduct(s.orgA, { sku: "AZU-1K", name: "Azúcar 1 kg" });
    await insertProduct(s.orgA, {
      sku: "CAC-100",
      name: "Cacao 100% puro",
      isActive: false,
      balance: "3",
    });
    await insertProduct(s.orgB, {
      sku: "CAF-250",
      name: "Café de otra organización",
    });
    return s;
  }

  async function names(
    context: AuthContext,
    filters: Partial<typeof listDefaults> | Record<string, unknown> = {},
  ) {
    const result = await listProductStock(context, {
      ...listDefaults,
      ...filters,
    } as Parameters<typeof listProductStock>[1]);
    if (!result.ok) throw new Error(result.code);
    return result.products.map((product) => product.name);
  }

  it("por defecto muestra solo activos de la organización, ordenados por nombre, con estado", async () => {
    const s = await seedList();
    const result = await listProductStock(s.viewerA, listDefaults);
    expect(result).toMatchObject({
      ok: true,
      total: 3,
      page: 1,
      pageCount: 1,
      products: [
        {
          name: "Azúcar 1 kg",
          quantityOnHand: "0.000",
          stockStatus: "sin_stock",
        },
        {
          name: "Café molido 250 g",
          quantityOnHand: "6.000",
          stockStatus: "bajo_stock",
        },
        {
          name: "Yerba 500 g",
          quantityOnHand: "48.000",
          stockStatus: "disponible",
        },
      ],
    });
  });

  it("busca por prefijo de nombre o SKU exacto, sin distinguir mayúsculas", async () => {
    const s = await seedList();
    expect(await names(s.adminA, { text: "caf" })).toEqual([
      "Café molido 250 g",
    ]);
    expect(await names(s.adminA, { text: "  CAFÉ MOLIDO " })).toEqual([
      "Café molido 250 g",
    ]);
    expect(await names(s.adminA, { text: "yer-500" })).toEqual(["Yerba 500 g"]);
    // Ni "contiene" ni prefijo de SKU.
    expect(await names(s.adminA, { text: "500" })).toEqual([]);
    expect(await names(s.adminA, { text: "YER" })).toEqual(["Yerba 500 g"]);
    expect(await names(s.adminA, { text: "YER-5" })).toEqual([]);
  });

  it("el prefijo del nombre entra en el Index Cond del índice normalizado (9.0.2, AC-4)", async () => {
    const s = await seedList();
    // Hacen falta filas: con tres, el planificador elige cualquier índice para resolver solo
    // `organization_id` y deja el nombre en `Filter`. El fixture es sintético y su único fin es que
    // el planificador tenga con qué decidir.
    await getDb().execute(
      sql`insert into products (organization_id, sku, name, unit)
          select ${s.orgA}, 'VOL-'||g, 'Producto '||g, 'unidad'
          from generate_series(1, 2000) g`,
    );
    await getDb().execute(sql`analyze products`);

    const plan = (
      await getDb().execute<{ "QUERY PLAN": string }>(
        sql`explain select id from products
            where organization_id = ${s.orgA}
              and immutable_unaccent(lower(name)) like immutable_unaccent(lower('caf%'))`,
      )
    ).rows
      .map((row) => row["QUERY PLAN"])
      .join("\n");

    // La aserción que importa NO es que aparezca el nombre del índice: ese índice empieza por
    // organization_id, así que el planificador lo usa igual para resolver solo la organización,
    // con el nombre en `Filter`. Se verificó: quitando la normalización de la consulta, el plan
    // sigue nombrando el índice. Lo que discrimina es que el prefijo se convierta en cota del
    // índice (`~>=~`), y eso solo pasa si la expresión de la consulta es la del índice.
    expect(plan).toContain("products_organization_name_unaccent_idx");
    expect(plan).toContain("immutable_unaccent(lower(name)) ~>=~");

    // Lo que este caso NO prueba: que la consulta cumpla un umbral de tiempo con volumen real
    // (9.3), ni que consulta e índice compartan expresión — eso lo sostiene `searchNormalized`,
    // que las define una sola vez, no este test.
  });

  it("no distingue acentos, en las dos direcciones (9.0.2)", async () => {
    const s = await seedList();
    // Sin acentos encuentra lo acentuado.
    expect(await names(s.adminA, { text: "azucar" })).toEqual(["Azúcar 1 kg"]);
    expect(await names(s.adminA, { text: "cafe molido" })).toEqual([
      "Café molido 250 g",
    ]);
    // Y con acentos encuentra lo que no los tiene.
    expect(await names(s.adminA, { text: "yérba" })).toEqual(["Yerba 500 g"]);
    // Sigue siendo prefijo, no "contiene".
    expect(await names(s.adminA, { text: "zucar" })).toEqual([]);
  });

  it("trata % y _ como texto literal", async () => {
    const s = await seedList();
    expect(await names(s.adminA, { text: "%" })).toEqual([]);
    expect(await names(s.adminA, { text: "_" })).toEqual([]);
    expect(
      await names(s.adminA, { text: "cacao 100%", activity: "all" }),
    ).toEqual(["Cacao 100% puro"]);
    expect(
      await names(s.adminA, { text: "cacao 100_", activity: "all" }),
    ).toEqual([]);
  });

  it("filtra por estado de stock y por actividad", async () => {
    const s = await seedList();
    expect(await names(s.adminA, { stockStatus: "disponible" })).toEqual([
      "Yerba 500 g",
    ]);
    expect(await names(s.adminA, { stockStatus: "bajo_stock" })).toEqual([
      "Café molido 250 g",
    ]);
    expect(await names(s.adminA, { stockStatus: "sin_stock" })).toEqual([
      "Azúcar 1 kg",
    ]);
    expect(await names(s.adminA, { activity: "inactive" })).toEqual([
      "Cacao 100% puro",
    ]);
    expect(await names(s.adminA, { activity: "all" })).toHaveLength(4);
    expect(
      await names(s.adminA, { activity: "all", stockStatus: "bajo_stock" }),
    ).toEqual(["Cacao 100% puro", "Café molido 250 g"]);
  });

  it("pagina de a 25 contra la base y lleva una página fuera de rango a la última", async () => {
    const s = await seed();
    for (let i = 0; i < 26; i++) {
      await insertProduct(s.orgA, {
        sku: `P-${i}`,
        name: `Producto ${String(i).padStart(2, "0")}`,
      });
    }
    const result = await listProductStock(s.adminA, {
      ...listDefaults,
      page: 5,
    });
    expect(result).toMatchObject({
      ok: true,
      total: 26,
      page: 2,
      pageCount: 2,
    });
    expect(result.ok && result.products.map((p) => p.name)).toEqual([
      "Producto 25",
    ]);
  });

  it("una contraseña pendiente recibe FORBIDDEN", async () => {
    const s = await seedList();
    expect(await listProductStock(s.pendingA, listDefaults)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});
