import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createProduct,
  deactivateProduct,
  listProductAudit,
  updateProduct,
  type ProductInput,
} from "@/modules/catalog";
import { adjustStock } from "@/modules/inventory";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Historial de auditoría del producto contra PostgreSQL real (FR-AUD-02, brief-4.4, D-1):
// ediciones (entity_type product) y ajustes de stock (inventory, con el id del producto) en una
// sola lista paginada, solo para admin. catalog autoriza y compone el autor; audit solo consulta.

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
  name: string,
  role: "admin" | "viewer",
  mustChangePassword = false,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${name}, ${mustChangePassword}) returning id`,
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
  await addUser(orgA, "admin-a@example.com", "Ana Pérez", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera Lectora", "viewer");
  await addUser(orgA, "pendiente-a@example.com", "Pedro", "admin", true);
  await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  return {
    orgA,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    pendingA: await contextFor("pendiente-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

// Los campos de la 17.2 vacíos: el producto de antes de la subfase.
const NO_OPERATION_VALUES = {
  barcode: null,
  weightKg: null,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  location: null,
  shelf: null,
};

const coffee: ProductInput = {
  sku: "CAF-250",
  name: "Café molido 250 g",
  description: "Tostado medio",
  unit: "unidad",
  reorderPoint: "5",
  brand: null,
  category: null,
  condition: "new",
  ...NO_OPERATION_VALUES,
};

async function create(context: AuthContext, input: ProductInput = coffee) {
  const result = await createProduct(context, input);
  if (!result.ok) throw new Error(`alta rechazada: ${result.code}`);
  return result.productId;
}

async function audit(context: AuthContext, productId: string, page = 1) {
  const result = await listProductAudit(context, productId, page);
  if (!result.ok) throw new Error(`historial rechazado: ${result.code}`);
  return result;
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("listProductAudit: contenido y orden", () => {
  it("reúne el alta, la edición, la desactivación y el ajuste de stock, del más reciente al más antiguo", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    await updateProduct(s.adminA, productId, { ...coffee, reorderPoint: "10" });
    await adjustStock(s.adminA, productId, {
      type: "adjustment_positive",
      quantity: "4",
      expectedQuantityOnHand: "0",
      reason: "Conteo",
    });
    await deactivateProduct(s.adminA, productId);

    const result = await audit(s.adminA, productId);
    expect(result).toMatchObject({ total: 4, page: 1, pageCount: 1 });
    expect(
      result.entries.map((entry) => [entry.entityType, entry.action]),
    ).toEqual([
      ["product", "deactivate"],
      ["inventory", "stock_adjustment"],
      ["product", "update"],
      ["product", "create"],
    ]);
    expect(
      result.entries.every((entry) => entry.createdAt instanceof Date),
    ).toBe(true);
    expect(
      new Set(
        result.entries.map((entry) =>
          entry.actor.kind === "user" ? entry.actor.name : "",
        ),
      ),
    ).toEqual(new Set(["Ana Pérez"]));
    expect(result.entries[1]!.diff).toEqual({
      before: { quantityOnHand: "0.000" },
      after: { quantityOnHand: "4.000" },
    });
    expect(result.entries[2]!.diff).toEqual({
      before: { reorderPoint: "5.000" },
      after: { reorderPoint: "10.000" },
    });
  });

  it("no mezcla la auditoría de otro producto ni la de otra entidad", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    const other = await create(s.adminA, { ...coffee, sku: "YER-500" });
    await updateProduct(s.adminA, other, {
      ...coffee,
      sku: "YER-500",
      name: "Yerba",
    });

    const result = await audit(s.adminA, productId);
    expect(result.total).toBe(1);
    expect(result.entries[0]!.action).toBe("create");
  });

  it("muestra el nombre del autor aunque el usuario esté desactivado", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    await getDb().execute(
      sql`update users set is_active = false where id = ${s.adminA.userId}`,
    );
    const result = await audit(s.adminA, productId);
    expect(result.entries[0]!.actor).toEqual({
      kind: "user",
      id: s.adminA.userId,
      name: "Ana Pérez",
    });
  });
});

describe("listProductAudit: paginación", () => {
  it("pagina de a 25 y lleva una página fuera de rango a un extremo", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    // 25 ajustes más el alta: 26 registros, dos páginas.
    for (let i = 0; i < 25; i++) {
      const result = await adjustStock(s.adminA, productId, {
        type: "adjustment_positive",
        quantity: "1",
        expectedQuantityOnHand: String(i),
        reason: "Conteo",
      });
      if (!result.ok) throw new Error(`ajuste rechazado: ${result.code}`);
    }

    const first = await audit(s.adminA, productId);
    expect(first).toMatchObject({ total: 26, page: 1, pageCount: 2 });
    expect(first.entries).toHaveLength(25);
    expect(
      first.entries.every((entry) => entry.entityType === "inventory"),
    ).toBe(true);

    const second = await audit(s.adminA, productId, 2);
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]!.action).toBe("create");
    expect(await audit(s.adminA, productId, 99)).toEqual(second);
    expect(await audit(s.adminA, productId, 0)).toEqual(first);
    expect(await audit(s.adminA, productId, Number.NaN)).toEqual(first);
  });
});

describe("listProductAudit: autorización y aislamiento", () => {
  it("viewer y contraseña pendiente reciben FORBIDDEN", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    for (const context of [s.viewerA, s.pendingA]) {
      expect(await listProductAudit(context, productId, 1)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
  });

  it("otra organización o un producto inexistente dan NOT_FOUND, y un id inválido VALIDATION_ERROR sin fields", async () => {
    const s = await seed();
    const productId = await create(s.adminA);
    expect(await listProductAudit(s.adminB, productId, 1)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await listProductAudit(s.adminA, randomUUID(), 1)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await listProductAudit(s.adminA, "no-es-un-id", 1)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });
});
