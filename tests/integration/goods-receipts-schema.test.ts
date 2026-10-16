import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El esquema de la recepción contra PostgreSQL real (brief-22.4, AC-1): los privilegios, los CHECK,
// los únicos, las claves compuestas de D-1 y los triggers de goods_receipts y goods_receipt_lines,
// probados con SQL directo y con el rol dueño, que es el que no frenan los privilegios.

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertRow(query: SQL) {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

type Executor = { execute: (query: SQL) => Promise<unknown> };

type ReceiptValues = {
  organizationId: string;
  supplierId: string;
  createdBy: string;
  purchaseOrderId?: string | null;
  number?: number;
  total?: string;
  currency?: string;
  supplierReference?: string | null;
};

function insertReceiptRow(executor: Executor, values: ReceiptValues) {
  return executor.execute(
    sql`insert into goods_receipts (organization_id, number, supplier_id, purchase_order_id,
                                    currency, total, supplier_reference, created_by)
        values (${values.organizationId}, ${values.number ?? 1}, ${values.supplierId},
                ${values.purchaseOrderId ?? null}, ${values.currency ?? "ARS"},
                ${values.total ?? "100"}, ${values.supplierReference ?? null},
                ${values.createdBy})`,
  );
}

type LineValues = {
  organizationId: string;
  receiptId: string;
  productId: string;
  purchaseOrderLineId?: string | null;
  position?: number;
  quantity?: string;
  unitCost?: string;
  lineTotal?: string;
};

function insertLineRow(executor: Executor, values: LineValues) {
  return executor.execute(
    sql`insert into goods_receipt_lines (organization_id, goods_receipt_id, purchase_order_line_id,
                                         product_id, position, quantity, unit_cost, line_total)
        values (${values.organizationId}, ${values.receiptId},
                ${values.purchaseOrderLineId ?? null}, ${values.productId},
                ${values.position ?? 1}, ${values.quantity ?? "1"}, ${values.unitCost ?? "100"},
                ${values.lineTotal ?? "100"})`,
  );
}

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; constraint: string | undefined; message: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: { code?: string; constraint?: string; message?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      constraint: e.cause?.constraint ?? e.constraint,
      message: e.cause?.message ?? e.message ?? "",
    };
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

async function privileges(table: string) {
  const result = await getDb().execute<{ privilege: string }>(
    sql`select privilege_type as privilege from information_schema.role_table_grants
        where grantee = 'crm_app' and table_name = ${table}
        order by privilege_type`,
  );
  return result.rows.map((row) => row.privilege);
}

// Una organización con dos proveedores, dos productos, una orden en ARS del primero con una línea de
// CAF-1, y una recepción de esa orden con su línea; y otra organización con lo suyo.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const userId = await insertRow(
    sql`insert into users (email, password_hash, name)
        values ('ana@example.com', 'hash', 'Ana') returning id`,
  );
  const supplier = (organizationId: string, name: string) =>
    insertRow(
      sql`insert into suppliers (organization_id, name)
          values (${organizationId}, ${name}) returning id`,
    );
  const product = (organizationId: string, sku: string) =>
    insertRow(
      sql`insert into products (organization_id, sku, name)
          values (${organizationId}, ${sku}, 'Café') returning id`,
    );
  const supplierA = await supplier(orgA, "Norte");
  const supplierA2 = await supplier(orgA, "Sur");
  const supplierB = await supplier(orgB, "Norte");
  const productA = await product(orgA, "CAF-1");
  const productA2 = await product(orgA, "CAF-2");
  const productB = await product(orgB, "CAF-1");
  const orderA = await insertRow(
    sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                     created_by)
        values (${orgA}, 1, ${supplierA}, 'ARS', 100, ${userId}) returning id`,
  );
  const orderLineA = await insertRow(
    sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                          position, quantity, unit_cost, line_total)
        values (${orgA}, ${orderA}, ${productA}, 1, 10, 10, 100) returning id`,
  );
  await insertReceiptRow(getDb(), {
    organizationId: orgA,
    supplierId: supplierA,
    purchaseOrderId: orderA,
    createdBy: userId,
  });
  const receipt = await getDb().execute<{ id: string }>(
    sql`select id from goods_receipts where organization_id = ${orgA} and number = 1`,
  );
  const receiptA = receipt.rows[0]!.id;
  await insertLineRow(getDb(), {
    organizationId: orgA,
    receiptId: receiptA,
    productId: productA,
    purchaseOrderLineId: orderLineA,
  });
  return {
    orgA,
    orgB,
    userId,
    supplierA,
    supplierA2,
    supplierB,
    productA,
    productA2,
    productB,
    orderA,
    orderLineA,
    receiptA,
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los privilegios (AC-1; D-2)", () => {
  it("goods_receipts y goods_receipt_lines: SELECT e INSERT", async () => {
    expect(await privileges("goods_receipts")).toEqual(["INSERT", "SELECT"]);
    expect(await privileges("goods_receipt_lines")).toEqual([
      "INSERT",
      "SELECT",
    ]);
  });

  it("crm_app no actualiza ni borra ninguna de las dos: 42501", async () => {
    const s = await seed();
    for (const statement of [
      sql`update goods_receipts set total = 2 where id = ${s.receiptA}`,
      sql`delete from goods_receipts where id = ${s.receiptA}`,
      sql`update goods_receipt_lines set quantity = 2 where goods_receipt_id = ${s.receiptA}`,
      sql`delete from goods_receipt_lines where goods_receipt_id = ${s.receiptA}`,
    ]) {
      expect(
        (await pgError(asAppRole((tx) => tx.execute(statement)))).code,
      ).toBe("42501");
    }
  });

  it("goods_receipt es un valor de document_kind, de audit_entity_type y de inventory_movement_type", async () => {
    const result = await getDb().execute<{
      kind: boolean;
      entity: boolean;
      movement: boolean;
    }>(
      sql`select 'goods_receipt' = any(enum_range(null::document_kind)::text[]) as kind,
                 'goods_receipt' = any(enum_range(null::audit_entity_type)::text[]) as entity,
                 'goods_receipt' = any(enum_range(null::inventory_movement_type)::text[]) as movement`,
    );
    expect(result.rows[0]).toEqual({
      kind: true,
      entity: true,
      movement: true,
    });
  });
});

describe("los CHECK (AC-1; D-1 y D-13)", () => {
  it.each([
    ["el número en cero", { number: 0 }, "goods_receipts_number_positive"],
    ["el total en cero", { total: "0" }, "goods_receipts_total_positive"],
    [
      "la moneda en minúsculas",
      { currency: "ars" },
      "goods_receipts_currency_format",
    ],
    [
      "la referencia vacía",
      { supplierReference: "" },
      "goods_receipts_supplier_reference_format",
    ],
    [
      "la referencia con un carácter fuera del patrón",
      { supplierReference: "R#1" },
      "goods_receipts_supplier_reference_format",
    ],
    [
      "la referencia con espacios al borde",
      { supplierReference: " R1" },
      "goods_receipts_supplier_reference_format",
    ],
    [
      "la referencia de 41 caracteres",
      { supplierReference: "A".repeat(41) },
      "goods_receipts_supplier_reference_format",
    ],
  ])("la cabecera rechaza %s: 23514", async (_name, values, constraint) => {
    const s = await seed();
    expect(
      await pgError(
        insertReceiptRow(getDb(), {
          organizationId: s.orgA,
          supplierId: s.supplierA2,
          createdBy: s.userId,
          number: 2,
          ...values,
        }),
      ),
    ).toMatchObject({ code: "23514", constraint });
  });

  it("la cabecera acepta la referencia de 40 caracteres y la nula", async () => {
    const s = await seed();
    await insertReceiptRow(getDb(), {
      organizationId: s.orgA,
      supplierId: s.supplierA2,
      createdBy: s.userId,
      number: 2,
      supplierReference: "0001-00012345 / R-".padEnd(40, "9"),
    });
    await insertReceiptRow(getDb(), {
      organizationId: s.orgA,
      supplierId: s.supplierA2,
      createdBy: s.userId,
      number: 3,
    });
  });

  it.each([
    ["la posición 0", { position: 0 }, "goods_receipt_lines_position_range"],
    ["la posición 51", { position: 51 }, "goods_receipt_lines_position_range"],
    [
      "la cantidad en cero",
      { quantity: "0" },
      "goods_receipt_lines_quantity_positive",
    ],
    [
      "el costo en cero",
      { unitCost: "0" },
      "goods_receipt_lines_unit_cost_positive",
    ],
    [
      "el total en cero",
      { lineTotal: "0" },
      "goods_receipt_lines_line_total_positive",
    ],
  ])("la línea rechaza %s: 23514", async (_name, values, constraint) => {
    const s = await seed();
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          receiptId: s.receiptA,
          productId: s.productA2,
          position: 2,
          ...values,
        }),
      ),
    ).toMatchObject({ code: "23514", constraint });
  });
});

describe("las claves (AC-1; D-1)", () => {
  it("el número es único por organización, y otra organización lo repite", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertReceiptRow(getDb(), {
          organizationId: s.orgA,
          supplierId: s.supplierA2,
          createdBy: s.userId,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "goods_receipts_organization_number_unique",
    });
    await insertReceiptRow(getDb(), {
      organizationId: s.orgB,
      supplierId: s.supplierB,
      createdBy: s.userId,
    });
  });

  it("un producto y una posición por recepción", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          receiptId: s.receiptA,
          productId: s.productA,
          position: 2,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "goods_receipt_lines_receipt_product_unique",
    });
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          receiptId: s.receiptA,
          productId: s.productA2,
          position: 1,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "goods_receipt_lines_receipt_position_unique",
    });
  });

  it("con orden, la recepción es del proveedor y de la moneda de su orden: 23503", async () => {
    const s = await seed();
    for (const values of [
      { supplierId: s.supplierA2 },
      { supplierId: s.supplierA, currency: "USD" },
    ]) {
      expect(
        await pgError(
          insertReceiptRow(getDb(), {
            organizationId: s.orgA,
            purchaseOrderId: s.orderA,
            createdBy: s.userId,
            number: 2,
            ...values,
          }),
        ),
      ).toMatchObject({
        code: "23503",
        constraint: "goods_receipts_order_fk",
      });
    }
    // Sin orden, la clave no se mira: otro proveedor y otra moneda pasan.
    await insertReceiptRow(getDb(), {
      organizationId: s.orgA,
      supplierId: s.supplierA2,
      currency: "USD",
      createdBy: s.userId,
      number: 2,
    });
  });

  it("la línea recibida es del producto de su línea de la orden: 23503", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          receiptId: s.receiptA,
          productId: s.productA2,
          purchaseOrderLineId: s.orderLineA,
          position: 2,
        }),
      ),
    ).toMatchObject({
      code: "23503",
      constraint: "goods_receipt_lines_order_line_fk",
    });
  });

  it("ni el proveedor, ni la orden, ni la recepción, ni el producto, ni la línea de otra organización: 23503", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertReceiptRow(getDb(), {
          organizationId: s.orgB,
          supplierId: s.supplierA,
          createdBy: s.userId,
          number: 2,
        }),
      ),
    ).toMatchObject({
      code: "23503",
      constraint: "goods_receipts_supplier_fk",
    });
    expect(
      await pgError(
        insertReceiptRow(getDb(), {
          organizationId: s.orgB,
          supplierId: s.supplierB,
          purchaseOrderId: s.orderA,
          createdBy: s.userId,
          number: 2,
        }),
      ),
    ).toMatchObject({ code: "23503", constraint: "goods_receipts_order_fk" });
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgB,
          receiptId: s.receiptA,
          productId: s.productB,
          position: 2,
        }),
      ),
    ).toMatchObject({
      code: "23503",
      constraint: "goods_receipt_lines_receipt_fk",
    });
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          receiptId: s.receiptA,
          productId: s.productB,
          position: 2,
        }),
      ),
    ).toMatchObject({
      code: "23503",
      constraint: "goods_receipt_lines_product_fk",
    });
  });

  it("un proveedor, una orden, una línea de la orden o un producto con recepciones no se borran", async () => {
    const s = await seed();
    // Una recepción sin orden de Sur, con CAF-2: ni el proveedor ni el producto tienen otra cosa que
    // los frene.
    await insertReceiptRow(getDb(), {
      organizationId: s.orgA,
      supplierId: s.supplierA2,
      createdBy: s.userId,
      number: 2,
    });
    const receipt = await getDb().execute<{ id: string }>(
      sql`select id from goods_receipts where organization_id = ${s.orgA} and number = 2`,
    );
    await insertLineRow(getDb(), {
      organizationId: s.orgA,
      receiptId: receipt.rows[0]!.id,
      productId: s.productA2,
    });
    // ON DELETE RESTRICT responde restrict_violation, 23001.
    expect(
      await pgError(
        getDb().execute(sql`delete from suppliers where id = ${s.supplierA2}`),
      ),
    ).toMatchObject({
      code: "23001",
      constraint: "goods_receipts_supplier_fk",
    });
    expect(
      await pgError(
        getDb().execute(sql`delete from products where id = ${s.productA2}`),
      ),
    ).toMatchObject({
      code: "23001",
      constraint: "goods_receipt_lines_product_fk",
    });
    // La orden y sus líneas ya las frenan sus triggers; la clave es la otra defensa.
    for (const statement of [
      sql`delete from purchase_orders where id = ${s.orderA}`,
      sql`delete from purchase_order_lines where id = ${s.orderLineA}`,
    ]) {
      expect((await pgError(getDb().execute(statement))).code).toBe("P0001");
    }
  });
});

describe("los triggers (AC-1; D-2)", () => {
  it("rechazan UPDATE y DELETE para cualquier rol: P0001", async () => {
    const s = await seed();
    for (const [statement, table] of [
      [
        sql`update goods_receipts set total = 2 where id = ${s.receiptA}`,
        "goods_receipts",
      ],
      [
        sql`delete from goods_receipts where id = ${s.receiptA}`,
        "goods_receipts",
      ],
      [
        sql`update goods_receipt_lines set quantity = 2 where goods_receipt_id = ${s.receiptA}`,
        "goods_receipt_lines",
      ],
      [
        sql`delete from goods_receipt_lines where goods_receipt_id = ${s.receiptA}`,
        "goods_receipt_lines",
      ],
    ] as const) {
      const error = await pgError(getDb().execute(statement));
      expect(error.code).toBe("P0001");
      expect(error.message).toMatch(
        new RegExp(`${table} es de solo inserción`),
      );
    }
  });
});
