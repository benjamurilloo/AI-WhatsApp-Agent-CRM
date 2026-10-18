import { execFileSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  addOption,
  applyAttributeTemplate,
  createAttribute,
  createModel,
  createProduct,
  deactivateProduct,
  getProductVariants,
  listAttributes,
  listModels,
  moveAttribute,
  moveModel,
  moveOption,
  reactivateProduct,
  searchProducts,
  setAttributeActive,
  setModelActive,
  updateOption,
  updateProduct,
  type ProductInput,
} from "@/modules/catalog";
import {
  activateCapability,
  getAppFrame,
  getAuthContext,
  getProfile,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import { listProductStock } from "@/modules/inventory";
import { getDb } from "@/shared/db";
import { DEMO_IPHONE_CATALOG, demoProduct } from "../../seeds/demo-iphone";
import { resetDatabase } from "./reset-database";

// La capacidad variants contra PostgreSQL real (brief-29.2, D-11): el esquema y los privilegios, la
// activación con la copia del perfil en una transacción, el servicio con y sin la capacidad, el
// duplicado de variante (también con dos altas simultáneas), el aislamiento entre organizaciones y
// los dos scripts de operador.

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
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, 'Persona', false) returning id`,
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

async function activateIphone(organizationId: string, adminEmail: string) {
  const profile = getProfile("iphone")!;
  return getDb().transaction(async (tx) => {
    const activated = await activateCapability(tx, {
      organizationId,
      capability: "variants",
      adminEmail,
    });
    if (!activated.ok) return activated;
    const copied = await applyAttributeTemplate(tx, {
      organizationId,
      actorUserId: activated.actorUserId,
      attributes: profile.attributes,
    });
    return { ...activated, copied };
  });
}

// Organización A con la capacidad y el perfil, con admin y viewer; B con la capacidad; C sin ella.
async function seed() {
  const orgA = await createOrganization("Tienda A");
  const orgB = await createOrganization("Tienda B");
  const orgC = await createOrganization("Negocio C");
  await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgB, "admin-b@example.com", "admin");
  await addUser(orgC, "admin-c@example.com", "admin");
  await activateIphone(orgA, "admin-a@example.com");
  await activateIphone(orgB, "admin-b@example.com");
  return {
    orgA,
    orgB,
    orgC,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
    adminC: await contextFor("admin-c@example.com"),
  };
}

function product(
  sku: string,
  overrides: Partial<ProductInput> = {},
): ProductInput {
  return {
    sku,
    name: `Producto ${sku}`,
    description: null,
    unit: "unidad",
    reorderPoint: "0",
    brand: null,
    category: null,
    condition: "new",
    barcode: null,
    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    location: null,
    shelf: null,
    ...overrides,
  };
}

// Los ids de capacidad y color, y de una opción por etiqueta.
async function attributeIds(context: AuthContext) {
  const listed = await listAttributes(context);
  if (!listed.ok) throw new Error(listed.code);
  const byKey = (key: string) =>
    listed.definitions.find((definition) => definition.key === key)!;
  const capacity = byKey("capacidad");
  const color = byKey("color");
  const box = byKey("trae_caja");
  const option = (definition: typeof capacity, label: string) =>
    definition.options.find((candidate) => candidate.label === label)!.id;
  return { capacity, color, box, option };
}

async function newModel(context: AuthContext, name: string) {
  const created = await createModel(context, { name, brand: "Apple" });
  if (!created.ok) throw new Error(`modelo rechazado: ${created.code}`);
  return created.modelId;
}

async function variantOf(
  context: AuthContext,
  modelId: string,
  capacityLabel: string,
  colorLabel: string,
) {
  const ids = await attributeIds(context);
  return {
    modelId,
    attributes: {
      [ids.capacity.id]: ids.option(ids.capacity, capacityLabel),
      [ids.color.id]: ids.option(ids.color, colorLabel),
    },
  };
}

// drizzle-orm envuelve el error de pg; el código queda en la causa.
async function pgError(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code ?? "sin código";
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
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

describe("el esquema (D-11)", () => {
  it("los privilegios de crm_app en las tablas nuevas", async () => {
    const result = await getDb().execute<{ table: string; privileges: string }>(
      sql`select table_name as table, string_agg(privilege_type, ',' order by privilege_type) as privileges
          from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name in
            ('organization_capabilities', 'product_models', 'attribute_definitions', 'attribute_options', 'attribute_values')
          group by table_name order by table_name`,
    );
    expect(result.rows).toEqual([
      { table: "attribute_definitions", privileges: "INSERT,SELECT,UPDATE" },
      { table: "attribute_options", privileges: "INSERT,SELECT,UPDATE" },
      { table: "attribute_values", privileges: "DELETE,INSERT,SELECT,UPDATE" },
      { table: "organization_capabilities", privileges: "INSERT,SELECT" },
      { table: "product_models", privileges: "INSERT,SELECT,UPDATE" },
    ]);
  });

  it("un valor lleva exactamente una columna, y su opción es de su definición", async () => {
    const { orgA, adminA } = await seed();
    const ids = await attributeIds(adminA);
    const created = await createProduct(adminA, product("ACC-1"));
    if (!created.ok) throw new Error(created.code);
    const insert = (columns: ReturnType<typeof sql>) =>
      getDb().execute(
        sql`insert into attribute_values (organization_id, product_id, definition_id, text_value, boolean_value, option_id)
            values (${orgA}, ${created.productId}, ${ids.color.id}, ${columns})`,
      );
    expect(await pgError(insert(sql`null, null, null`))).toBe("23514");
    expect(
      await pgError(
        insert(sql`'Azul', null, ${ids.option(ids.color, "Azul")}`),
      ),
    ).toBe("23514");
    // La opción «128 GB» es de la capacidad, no del color.
    expect(
      await pgError(
        insert(sql`null, null, ${ids.option(ids.capacity, "128 GB")}`),
      ),
    ).toBe("23503");
  });

  it("un atributo de variante es de opciones y obligatorio", async () => {
    const { orgA } = await seed();
    expect(
      await pgError(
        getDb().execute(
          sql`insert into attribute_definitions (organization_id, entity, key, name, type, is_required, is_variant)
              values (${orgA}, 'product', 'nota', 'Nota', 'text', true, true)`,
        ),
      ),
    ).toBe("23514");
  });

  it("un producto no apunta al modelo de otra organización", async () => {
    const { orgB, adminA, adminB } = await seed();
    const modelA = await newModel(adminA, "iPhone 13");
    const created = await createProduct(adminB, product("B-1"));
    if (!created.ok) throw new Error(created.code);
    expect(
      await pgError(
        getDb().execute(
          sql`update products set model_id = ${modelA} where id = ${created.productId} and organization_id = ${orgB}`,
        ),
      ),
    ).toBe("23503");
  });
});

describe("la activación y el perfil (AC-4)", () => {
  it("activa, copia el perfil y audita, en una transacción; la segunda vez no hace nada", async () => {
    const { orgA, adminA } = await seed();
    expect(await hasCapability(orgA, "variants")).toBe(true);
    expect((await getAppFrame(adminA)).capabilities).toEqual(["variants"]);
    const again = await activateIphone(orgA, "admin-a@example.com");
    expect(again).toMatchObject({
      ok: true,
      status: "already_active",
      copied: { created: [], skipped: ["capacidad", "color", "trae_caja"] },
    });
    const audits = await getDb().execute<{ entity: string; total: number }>(
      sql`select entity_type as entity, count(*)::int as total from audit_logs
          where organization_id = ${orgA} and entity_type in ('organization_capability', 'attribute_definition')
          group by entity_type order by entity_type::text`,
    );
    expect(audits.rows).toEqual([
      { entity: "attribute_definition", total: 3 },
      { entity: "organization_capability", total: 1 },
    ]);
    const options = await getDb().execute<{ total: number }>(
      sql`select count(*)::int as total from attribute_options where organization_id = ${orgA}`,
    );
    expect(options.rows[0]!.total).toBe(5 + 22);
  });

  it("un correo que no es de un admin activo no activa nada", async () => {
    const { orgC } = await seed();
    await addUser(orgC, "viewer-c@example.com", "viewer");
    for (const email of [
      "viewer-c@example.com",
      "admin-a@example.com",
      "nadie@example.com",
    ]) {
      const result = await getDb().transaction((tx) =>
        activateCapability(tx, {
          organizationId: orgC,
          capability: "variants",
          adminEmail: email,
        }),
      );
      expect(result).toEqual({ ok: false, code: "FORBIDDEN" });
    }
    expect(await hasCapability(orgC, "variants")).toBe(false);
  });

  it("si la copia del perfil falla, la capacidad no queda activada", async () => {
    const { orgC } = await seed();
    await expect(
      getDb().transaction(async (tx) => {
        const activated = await activateCapability(tx, {
          organizationId: orgC,
          capability: "variants",
          adminEmail: "admin-c@example.com",
        });
        if (!activated.ok) throw new Error(activated.code);
        await applyAttributeTemplate(tx, {
          organizationId: orgC,
          actorUserId: activated.actorUserId,
          attributes: [
            {
              key: "color",
              name: "Color",
              type: "text",
              isRequired: true,
              isVariant: true,
              options: [],
            },
          ],
        });
      }),
    ).rejects.toThrow("plantilla inválida");
    expect(await hasCapability(orgC, "variants")).toBe(false);
    const audits = await getDb().execute<{ total: number }>(
      sql`select count(*)::int as total from audit_logs where organization_id = ${orgC}`,
    );
    expect(audits.rows[0]!.total).toBe(0);
  });
});

describe("sin la capacidad (AC-3)", () => {
  it("el producto se crea y se edita como antes, y lo de la capacidad da NOT_FOUND", async () => {
    const { orgC, adminC } = await seed();
    const created = await createProduct(adminC, product("C-1"));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(
      await updateProduct(
        adminC,
        created.productId,
        product("C-1", { name: "Otro" }),
      ),
    ).toEqual({ ok: true, changed: true });
    expect(
      await createProduct(
        adminC,
        product("C-2", { variant: { modelId: "", attributes: {} } }),
      ),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await listModels(adminC)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await listAttributes(adminC)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await createModel(adminC, { name: "X", brand: null })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await getProductVariants(adminC, [
        { id: created.productId, modelId: null },
      ]),
    ).toBeNull();
    expect((await getAppFrame(adminC)).capabilities).toEqual([]);
    // H-10 de la revisión: un viewer recibe NOT_FOUND como el admin, no FORBIDDEN.
    await addUser(orgC, "viewer-c@example.com", "viewer");
    const viewerC = await contextFor("viewer-c@example.com");
    expect(await createModel(viewerC, { name: "X", brand: null })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await listModels(viewerC)).toEqual({ ok: false, code: "NOT_FOUND" });
    // H-11: sin la capacidad, el filtro por modelo se ignora, como antes.
    const listed = await searchProducts(adminC, {
      text: "",
      activity: "all",
      modelId: "00000000-0000-4000-8000-000000000000",
    });
    expect(listed.ok && listed.products.map((row) => row.sku)).toEqual(["C-1"]);
  });
});

describe("modelos, atributos y productos (AC-1, AC-6)", () => {
  it("crea un producto con modelo y variante, y lo audita como valores planos", async () => {
    const { orgA, adminA } = await seed();
    const modelId = await newModel(adminA, "iPhone 13");
    const created = await createProduct(adminA, {
      ...product("IP13-128-AZU-N"),
      variant: await variantOf(adminA, modelId, "128 GB", "Azul"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const views = await getProductVariants(adminA, [
      { id: created.productId, modelId },
    ]);
    expect(views?.get(created.productId)).toMatchObject({
      model: { id: modelId, name: "iPhone 13" },
      attributes: [
        { name: "Capacidad", value: "128 GB", isVariant: true },
        { name: "Color", value: "Azul", isVariant: true },
      ],
    });
    const audit = await getDb().execute<{
      diff: { after: Record<string, unknown> };
    }>(
      sql`select diff from audit_logs where organization_id = ${orgA}
          and entity_type = 'product' and entity_id = ${created.productId}`,
    );
    expect(audit.rows[0]!.diff.after).toMatchObject({
      modelo: "iPhone 13",
      "atributo.capacidad": "128 GB",
      "atributo.color": "Azul",
      "atributo.trae_caja": null,
    });
    const filtered = await searchProducts(adminA, {
      text: "",
      activity: "all",
      modelId,
    });
    expect(filtered.ok && filtered.products.map((row) => row.id)).toEqual([
      created.productId,
    ]);
  });

  it("los obligatorios se exigen con modelo; un accesorio sin modelo no los necesita", async () => {
    const { adminA } = await seed();
    const ids = await attributeIds(adminA);
    const modelId = await newModel(adminA, "iPhone 15");
    expect(
      await createProduct(adminA, {
        ...product("IP15-SIN-COLOR"),
        variant: {
          modelId,
          attributes: { [ids.capacity.id]: ids.option(ids.capacity, "128 GB") },
        },
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [],
      variantFields: [`atributo:${ids.color.id}`],
    });
    expect(
      await createProduct(adminA, {
        ...product("FUNDA-1"),
        variant: { modelId: "", attributes: { [ids.box.id]: "si" } },
      }),
    ).toMatchObject({ ok: true });
  });

  it("rechaza el duplicado de variante, también al cambiar la condición y al reactivar", async () => {
    const { adminA } = await seed();
    const modelId = await newModel(adminA, "iPhone 13");
    const blue = await variantOf(adminA, modelId, "128 GB", "Azul");
    const first = await createProduct(adminA, {
      ...product("A-NEW"),
      variant: blue,
    });
    if (!first.ok) throw new Error(first.code);
    const duplicate = await createProduct(adminA, {
      ...product("A-DUP"),
      variant: blue,
    });
    expect(duplicate).toEqual({
      ok: false,
      code: "CONFLICT",
      field: "variant",
      duplicate: { id: first.productId, name: "Producto A-NEW" },
    });
    // La misma variante reacondicionada es otro producto.
    const refurbished = await createProduct(adminA, {
      ...product("A-REF", { condition: "refurbished" }),
      variant: blue,
    });
    if (!refurbished.ok) throw new Error(refurbished.code);
    // Pasarlo a nuevo lo volvería un duplicado, aunque la variante no cambie.
    expect(
      await updateProduct(
        adminA,
        refurbished.productId,
        product("A-REF", { condition: "new" }),
      ),
    ).toMatchObject({ ok: false, code: "CONFLICT", field: "variant" });
    // Desactivado, ya no choca; reactivarlo con el otro activo, sí.
    await deactivateProduct(adminA, first.productId);
    const again = await createProduct(adminA, {
      ...product("A-AGAIN"),
      variant: blue,
    });
    expect(again.ok).toBe(true);
    expect(await reactivateProduct(adminA, first.productId)).toMatchObject({
      ok: false,
      code: "CONFLICT",
      field: "variant",
    });
  });

  it("desactivar un atributo de variante no impide editar los que pasan a coincidir; guardar sin cambios no reescribe", async () => {
    const { orgA, adminA } = await seed();
    const modelId = await newModel(adminA, "iPhone 13");
    const ids = await attributeIds(adminA);
    const blue = await createProduct(adminA, {
      ...product("H6-AZU"),
      variant: await variantOf(adminA, modelId, "128 GB", "Azul"),
    });
    const pink = await createProduct(adminA, {
      ...product("H6-ROS"),
      variant: await variantOf(adminA, modelId, "128 GB", "Rosa"),
    });
    if (!blue.ok || !pink.ok) throw new Error("alta rechazada");
    const valueIds = async () =>
      (
        await getDb().execute<{ id: string }>(
          sql`select id from attribute_values where organization_id = ${orgA}
              and product_id = ${pink.productId} order by id`,
        )
      ).rows.map((row) => row.id);
    const before = await valueIds();

    // H-7: guardar el mismo producto con los mismos valores no escribe ni audita.
    const same = await updateProduct(adminA, pink.productId, {
      ...product("H6-ROS"),
      variant: await variantOf(adminA, modelId, "128 GB", "Rosa"),
    });
    expect(same).toEqual({ ok: true, changed: false });
    expect(await valueIds()).toEqual(before);

    // H-6: sin «Color», los dos coinciden; corregir el nombre de uno no cambia su identidad.
    expect(await setAttributeActive(adminA, ids.color.id, false)).toMatchObject(
      { ok: true },
    );
    expect(
      await updateProduct(
        adminA,
        pink.productId,
        product("H6-ROS", { name: "iPhone 13 rosa" }),
      ),
    ).toEqual({ ok: true, changed: true });
    // Reactivar sí se comprueba: el otro sigue activo, del mismo modelo y la misma condición.
    await deactivateProduct(adminA, blue.productId);
    expect(await reactivateProduct(adminA, blue.productId)).toMatchObject({
      ok: false,
      code: "CONFLICT",
      field: "variant",
    });
  });

  it("dos altas simultáneas de la misma variante: entra una sola", async () => {
    const { adminA } = await seed();
    const modelId = await newModel(adminA, "iPhone 14");
    const variant = await variantOf(adminA, modelId, "256 GB", "Medianoche");
    const results = await Promise.all([
      createProduct(adminA, { ...product("C-1"), variant }),
      createProduct(adminA, { ...product("C-2"), variant }),
      createProduct(adminA, { ...product("C-3"), variant }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => !result.ok && result.code === "CONFLICT"),
    ).toHaveLength(2);
  });

  it("editar sin el modelo conserva los valores; un modelo desactivado no se asigna", async () => {
    const { adminA } = await seed();
    const modelId = await newModel(adminA, "iPhone 12");
    const created = await createProduct(adminA, {
      ...product("IP12"),
      variant: await variantOf(adminA, modelId, "64 GB", "Negro"),
    });
    if (!created.ok) throw new Error(created.code);
    expect(
      await updateProduct(
        adminA,
        created.productId,
        product("IP12", { name: "iPhone 12 64" }),
      ),
    ).toEqual({ ok: true, changed: true });
    const views = await getProductVariants(adminA, [
      { id: created.productId, modelId },
    ]);
    expect(
      views?.get(created.productId)?.attributes.map((a) => a.value),
    ).toEqual(["64 GB", "Negro"]);

    const retired = await newModel(adminA, "iPhone X");
    await setModelActive(adminA, retired, false);
    expect(
      await createProduct(adminA, {
        ...product("IPX"),
        variant: await variantOf(adminA, retired, "64 GB", "Negro"),
      }),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      variantFields: ["modelId"],
    });
  });

  it("nombres de modelo y de opción únicos sin distinguir mayúsculas", async () => {
    const { adminA } = await seed();
    await newModel(adminA, "iPhone 13");
    expect(
      await createModel(adminA, { name: "IPHONE 13", brand: null }),
    ).toEqual({
      ok: false,
      code: "CONFLICT",
      field: "name",
    });
    const ids = await attributeIds(adminA);
    expect(await addOption(adminA, ids.color.id, "azul")).toEqual({
      ok: false,
      code: "CONFLICT",
      field: "option",
    });
    expect(await addOption(adminA, ids.color.id, "Coral")).toMatchObject({
      ok: true,
    });
    const refreshed = await attributeIds(adminA);
    expect(
      await updateOption(adminA, refreshed.option(refreshed.color, "Coral"), {
        isActive: false,
      }),
    ).toMatchObject({ ok: true, changed: true });
    expect(
      await createAttribute(adminA, {
        name: "Color",
        type: "text",
        isRequired: false,
        isVariant: false,
        options: [],
      }),
    ).toEqual({ ok: false, code: "CONFLICT", field: "name" });
  });

  it("un viewer lee modelos y atributos, pero no los cambia", async () => {
    const { adminA, viewerA } = await seed();
    await newModel(adminA, "iPhone 13");
    const models = await listModels(viewerA);
    expect(models.ok && models.models.map((model) => model.name)).toEqual([
      "iPhone 13",
    ]);
    expect((await listAttributes(viewerA)).ok).toBe(true);
    expect(
      await createModel(viewerA, { name: "iPhone 14", brand: null }),
    ).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("un admin ordena modelos, atributos y opciones, auditado; el viewer y otra organización no", async () => {
    const { orgA, adminA, viewerA, adminB } = await seed();
    const m11 = await newModel(adminA, "iPhone 11");
    const m12 = await newModel(adminA, "iPhone 12");
    const m13 = await newModel(adminA, "iPhone 13");
    const names = async () => {
      const listed = await listModels(adminA);
      return listed.ok ? listed.models.map((model) => model.name) : [];
    };
    expect(await moveModel(adminA, m13, "up")).toEqual({
      ok: true,
      changed: true,
    });
    expect(await names()).toEqual(["iPhone 11", "iPhone 13", "iPhone 12"]);
    // En el primer lugar, subir no hace nada.
    expect(await moveModel(adminA, m11, "up")).toEqual({
      ok: true,
      changed: false,
    });
    expect(await moveModel(adminA, m12, "sideways")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await moveModel(viewerA, m12, "up")).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await moveModel(adminB, m12, "up")).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    const audit = await getDb().execute<{
      diff: { before: unknown; after: unknown };
    }>(
      sql`select diff from audit_logs where organization_id = ${orgA}
          and entity_type = 'product_model' and entity_id = ${m13} and action = 'update'`,
    );
    expect(audit.rows.map((row) => row.diff)).toEqual([
      { before: { position: 2 }, after: { position: 1 } },
    ]);

    // Atributos: Capacidad, Color, Trae caja; bajar Capacidad la pone segunda.
    const ids = await attributeIds(adminA);
    expect(await moveAttribute(adminA, ids.capacity.id, "down")).toMatchObject({
      ok: true,
      changed: true,
    });
    const attributes = await listAttributes(adminA);
    expect(
      attributes.ok &&
        attributes.definitions.map((definition) => definition.key),
    ).toEqual(["color", "capacidad", "trae_caja"]);

    // Opciones: subir «128 GB» la deja primera.
    const option128 = ids.option(ids.capacity, "128 GB");
    expect(await moveOption(adminA, option128, "up")).toEqual({
      ok: true,
      definitionId: ids.capacity.id,
      changed: true,
    });
    const after = await attributeIds(adminA);
    expect(after.capacity.options.map((option) => option.label)).toEqual([
      "128 GB",
      "64 GB",
      "256 GB",
      "512 GB",
      "1 TB",
    ]);
  });

  it("la lista agrupada sigue el orden de los modelos, con los que no tienen modelo al final", async () => {
    const { adminA, adminC } = await seed();
    const m13 = await newModel(adminA, "iPhone 13");
    const m15 = await newModel(adminA, "iPhone 15");
    for (const [sku, modelId, color] of [
      ["A-13-AZU", m13, "Azul"],
      ["B-15-NEG", m15, "Negro"],
      ["C-13-ROS", m13, "Rosa"],
    ] as const) {
      const created = await createProduct(adminA, {
        ...product(sku),
        variant: await variantOf(adminA, modelId, "128 GB", color),
      });
      if (!created.ok) throw new Error(created.code);
    }
    await createProduct(adminA, product("0-FUNDA"));
    const filters = {
      text: "",
      stockStatus: "all" as const,
      activity: "all" as const,
      page: 1,
    };
    const skus = async (context: AuthContext, groupByModel: boolean) => {
      const listed = await listProductStock(context, {
        ...filters,
        groupByModel,
      });
      return listed.ok ? listed.products.map((row) => row.sku) : [];
    };
    expect(await skus(adminA, false)).toEqual([
      "0-FUNDA",
      "A-13-AZU",
      "B-15-NEG",
      "C-13-ROS",
    ]);
    expect(await skus(adminA, true)).toEqual([
      "A-13-AZU",
      "C-13-ROS",
      "B-15-NEG",
      "0-FUNDA",
    ]);
    await moveModel(adminA, m15, "up");
    expect(await skus(adminA, true)).toEqual([
      "B-15-NEG",
      "A-13-AZU",
      "C-13-ROS",
      "0-FUNDA",
    ]);
    // Sin la capacidad, agrupar no hace nada.
    await createProduct(adminC, product("Z-1"));
    await createProduct(adminC, product("A-1"));
    expect(await skus(adminC, true)).toEqual(["A-1", "Z-1"]);
  });

  it("aislamiento: una organización no ve ni usa los modelos de otra", async () => {
    const { adminA, adminB } = await seed();
    const modelA = await newModel(adminA, "iPhone 13");
    const listed = await listModels(adminB);
    expect(listed.ok && listed.models).toEqual([]);
    const idsB = await attributeIds(adminB);
    expect(
      await createProduct(adminB, {
        ...product("B-1"),
        variant: {
          modelId: modelA,
          attributes: {
            [idsB.capacity.id]: idsB.option(idsB.capacity, "128 GB"),
            [idsB.color.id]: idsB.option(idsB.color, "Azul"),
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      variantFields: ["modelId"],
    });
    // La opción de A en un producto de B es inválida aunque su definición tenga el mismo nombre.
    const idsA = await attributeIds(adminA);
    expect(
      await createProduct(adminB, {
        ...product("B-2"),
        variant: {
          modelId: "",
          attributes: { [idsB.color.id]: idsA.option(idsA.color, "Azul") },
        },
      }),
    ).toMatchObject({
      ok: false,
      variantFields: [`atributo:${idsB.color.id}`],
    });
  });
});

describe("los scripts de operador (AC-4, AC-5)", () => {
  it("el catálogo de la demo no repite SKU", () => {
    const skus = DEMO_IPHONE_CATALOG.flatMap((model) =>
      model.variants.map((variant) => demoProduct(model, variant).sku),
    );
    expect(new Set(skus).size).toBe(skus.length);
  });

  // Corren con tsx contra la misma base de prueba que este archivo.
  function run(script: string, args: string[]) {
    return execFileSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", script, ...args],
      { env: { ...process.env }, encoding: "utf8", stdio: "pipe" },
    );
  }

  it("org:capability activa y copia una vez; demo:catalog retoma una carga cortada y se niega con datos ajenos", async () => {
    const orgId = await createOrganization("iPhone Demo");
    await addUser(orgId, "demo@example.com", "admin");
    const activate = () =>
      run("scripts/activar-capacidad.ts", [
        "--organization",
        orgId,
        "--admin-email",
        "demo@example.com",
        "--profile",
        "iphone",
      ]);
    const activation = activate();
    expect(activation).toContain("Capacidad activada: variants.");
    expect(activation).toContain("capacidad, color, trae_caja");
    // H-9 de la revisión: con la capacidad ya activa, el perfil no se vuelve a copiar.
    const again = activate();
    expect(again).toContain("ya estaba activa");
    expect(again).toContain("no se copió");

    // H-4 de la revisión: una carga cortada después de crear un producto y antes de fijar su
    // precio. El script lo saltea, le fija el precio y completa el resto.
    const [first] = DEMO_IPHONE_CATALOG;
    const cut = demoProduct(first!, first!.variants[0]!);
    await getDb().execute(
      sql`insert into products (organization_id, sku, name) values (${orgId}, ${cut.sku}, ${cut.name})`,
    );
    const load = () =>
      run("scripts/cargar-catalogo-demo.ts", [
        "--organization",
        orgId,
        "--admin-email",
        "demo@example.com",
      ]);
    expect(load()).toContain(
      "Carga anterior retomada: 34 productos nuevos y 1 precios",
    );
    const counts = await getDb().execute<{
      products: number;
      prices: number;
      values: number;
    }>(
      sql`select (select count(*)::int from products where organization_id = ${orgId}) as products,
                 (select count(*)::int from product_prices where organization_id = ${orgId} and currency = 'USD') as prices,
                 (select count(*)::int from attribute_values where organization_id = ${orgId}) as values`,
    );
    const row = counts.rows[0]!;
    expect(row.products).toBe(35);
    expect(row.prices).toBe(35);
    // El producto insertado a mano por este test no tiene atributos.
    expect(row.values).toBe(34 * 2);

    // Completo, otra corrida no carga nada.
    expect(load()).toContain("0 productos nuevos y 0 precios");

    // Un producto que no es del catálogo de ejemplo: se niega sin cargar nada.
    await getDb().execute(
      sql`insert into products (organization_id, sku, name) values (${orgId}, 'FUNDA-1', 'Funda')`,
    );
    expect(load).toThrow(/no son del catálogo de ejemplo/);
  }, 120_000);
});
