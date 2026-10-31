import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as catalogRepository from "@/modules/catalog/repository";
import * as conversationsRepository from "@/modules/conversations/repository";
import * as crmRepository from "@/modules/crm/repository";
import * as ingestionRepository from "@/modules/ingestion/repository";
import * as unitRepository from "@/modules/inventory/unit-repository";
import {
  createSupplierPayment,
  getGoodsReceiptPayments,
  getSupplierPayment,
  listSupplierPayments,
  voidSupplierPayment,
} from "@/modules/cash";
import * as supplierPaymentRepository from "@/modules/cash/supplier-payment-repository";
import { getMemberSummaries, type AuthContext } from "@/modules/organizations";
import * as organizationsRepository from "@/modules/organizations/repository";
import {
  closePurchaseOrder,
  createGoodsReceipt,
  createPurchaseOrder,
  getGoodsReceipt,
  listGoodsReceipts,
  voidGoodsReceipt,
} from "@/modules/purchasing";
import * as goodsReceiptRepository from "@/modules/purchasing/goods-receipt-repository";
import * as purchaseOrderRepository from "@/modules/purchasing/purchase-order-repository";
import * as purchasingRepository from "@/modules/purchasing/repository";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Aislamiento por organización en el acceso a datos (9.0.1; H-7 y H-1 de la 8.4).
//
// Por qué estos tests llaman al repositorio y no a la interfaz pública: los siete casos de uso
// leen la fila filtrada por organización ANTES de escribir, así que por el servicio la operación
// devuelve NOT_FOUND y nunca llega a la escritura. Eso es justamente lo que hacía a H-7
// inalcanzable, y también lo que hace imposible probar el invariante del repositorio desde
// afuera. Para producir evidencia del filtro en el `where` hay que llamar al repositorio con una
// organización que no es la dueña de la fila. Es el único lugar del proyecto donde un test de
// integración importa un `repository` de un módulo, y es deliberado: la excepción está registrada
// en docs/architecture/RepositoryStructure.md §Frontera entre módulos.
//
// La 9.0.4 sumó `ingestion.finishEvent`, de la misma clase, con un motivo todavía más fuerte para
// no pasar por la interfaz pública: su id lo crea `reserveEvent` dentro de la transacción, así que
// desde afuera no hay forma de construir la llamada cruzada que este test necesita.
//
// Los datos se insertan por SQL: son fixtures sintéticos, declarados como tales (brief-6.4, D-5).

type Fixture = {
  orgA: string;
  orgB: string;
  productB: string;
  clientB: string;
  memberB: string;
  userB: string;
  conversationB: string;
  eventB: string;
};

let fixture: Fixture;

async function createOrganization(name: string): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function seed(): Promise<Fixture> {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");

  const product = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit)
        values (${orgB}, 'SKU-B', 'Producto de B', 'unidad') returning id`,
  );
  const client = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgB}, 'Cliente de B', '+5491100000001') returning id`,
  );
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values ('miembro-b@example.com', 'hash-irrelevante', 'Miembro de B') returning id`,
  );
  const member = await getDb().execute<{ id: string }>(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgB}, ${user.rows[0]!.id}, 'viewer') returning id`,
  );
  const conversation = await getDb().execute<{ id: string }>(
    sql`insert into conversations (organization_id, channel, external_ref, started_at, last_message_at)
        values (${orgB}, 'whatsapp', 'ext-b-1', '2026-09-01T12:00:00Z', '2026-09-01T12:00:00Z')
        returning id`,
  );

  // La fila de ingestion_events se inserta por SQL y no con `reserveEvent` (9.0.4, D-3): lo que
  // este test prueba es el `where` de la escritura, y montar el contexto de ingestión completo no
  // agregaría evidencia sobre eso.
  const event = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_events
          (organization_id, source, external_ref, event_type, payload_hash)
        values (${orgB}, 'fuente-b', 'evt-b-1', 'message.received', 'hash-irrelevante')
        returning id`,
  );

  return {
    orgA,
    orgB,
    eventB: event.rows[0]!.id,
    productB: product.rows[0]!.id,
    clientB: client.rows[0]!.id,
    memberB: member.rows[0]!.id,
    userB: user.rows[0]!.id,
    conversationB: conversation.rows[0]!.id,
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
  fixture = await seed();
});

afterAll(async () => {
  await getDb().$client.end();
});

// La transacción se deja CONFIRMAR. Es deliberado y es lo que hace que la aserción sobre el
// estado de la base signifique algo: si el filtro por organización no estuviera, la escritura
// no lanzaría, la transacción commitearía y la fila de la otra organización quedaría cambiada,
// que es exactamente el defecto. Con el filtro, la función lanza y la transacción revierte sola.
//
// Una versión anterior de este ayudante forzaba el rollback siempre. Así los `select` posteriores
// devolvían el valor original con y sin la corrección, y la única aserción que discriminaba era
// la del mensaje de error. Lo encontró la revisión independiente de la 9.0.1.
async function attempt(
  work: (tx: never) => Promise<unknown>,
): Promise<unknown> {
  try {
    await getDb().transaction(async (tx) => {
      await work(tx as never);
    });
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("las siete escrituras de H-7 no alcanzan a otra organización", () => {
  it("updateProductValues", async () => {
    const error = await attempt((tx) =>
      catalogRepository.updateProductValues(
        tx,
        fixture.orgA,
        fixture.productB,
        {
          name: "Renombrado por A",
        },
      ),
    );
    const after = await getDb().execute<{ name: string }>(
      sql`select name from products where id = ${fixture.productB}`,
    );
    expect(after.rows[0]!.name).toBe("Producto de B");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateProductActive", async () => {
    const error = await attempt((tx) =>
      catalogRepository.updateProductActive(
        tx,
        fixture.orgA,
        fixture.productB,
        false,
      ),
    );
    const after = await getDb().execute<{ is_active: boolean }>(
      sql`select is_active from products where id = ${fixture.productB}`,
    );
    expect(after.rows[0]!.is_active).toBe(true);
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateClientValues", async () => {
    const error = await attempt((tx) =>
      crmRepository.updateClientValues(tx, fixture.orgA, fixture.clientB, {
        displayName: "Renombrado por A",
      }),
    );
    const after = await getDb().execute<{ display_name: string }>(
      sql`select display_name from clients where id = ${fixture.clientB}`,
    );
    expect(after.rows[0]!.display_name).toBe("Cliente de B");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateClientActive", async () => {
    const error = await attempt((tx) =>
      crmRepository.updateClientActive(
        tx,
        fixture.orgA,
        fixture.clientB,
        false,
      ),
    );
    const after = await getDb().execute<{ is_active: boolean }>(
      sql`select is_active from clients where id = ${fixture.clientB}`,
    );
    expect(after.rows[0]!.is_active).toBe(true);
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateMemberRole", async () => {
    const error = await attempt((tx) =>
      organizationsRepository.updateMemberRole(
        tx,
        fixture.orgA,
        fixture.memberB,
        "admin",
      ),
    );
    const after = await getDb().execute<{ role: string }>(
      sql`select role from organization_members where id = ${fixture.memberB}`,
    );
    expect(after.rows[0]!.role).toBe("viewer");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateConversationStatus", async () => {
    const error = await attempt((tx) =>
      conversationsRepository.updateConversationStatus(
        tx,
        fixture.orgA,
        fixture.conversationB,
        "closed",
      ),
    );
    const after = await getDb().execute<{ status: string }>(
      sql`select status from conversations where id = ${fixture.conversationB}`,
    );
    expect(after.rows[0]!.status).toBe("open");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("widenConversationDates", async () => {
    const error = await attempt((tx) =>
      conversationsRepository.widenConversationDates(
        tx,
        fixture.orgA,
        fixture.conversationB,
        new Date("2020-01-01T00:00:00Z"),
      ),
    );
    const after = await getDb().execute<{ started_at: string }>(
      sql`select started_at from conversations where id = ${fixture.conversationB}`,
    );
    // Sin el filtro, least() habría movido started_at a 2020 y la transacción lo habría
    // confirmado, porque nada lanzaría.
    expect(after.rows[0]!.started_at).toContain("2026-09-01");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });
});

describe("la escritura de ingestion de la 9.0.4 no alcanza a otra organización", () => {
  it("finishEvent", async () => {
    const error = await attempt((tx) =>
      ingestionRepository.finishEvent(tx, fixture.orgA, fixture.eventB, {
        status: "failed",
        errorCode: "CONFLICT",
      }),
    );
    const after = await getDb().execute<{
      status: string;
      error_code: string | null;
      processed_at: string | null;
    }>(
      sql`select status, error_code, processed_at
          from ingestion_events where id = ${fixture.eventB}`,
    );
    // Sin el filtro, el evento de B quedaría en 'failed' con su error_code y su processed_at
    // escritos por A, y la transacción lo confirmaría porque nada lanzaría.
    expect(after.rows[0]!.status).toBe("received");
    expect(after.rows[0]!.error_code).toBeNull();
    expect(after.rows[0]!.processed_at).toBeNull();
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });
});

describe("la lectura de usuarios de H-1 no cruza organizaciones", () => {
  it("getMemberSummaries no devuelve un usuario de otra organización", async () => {
    const summaries = await getMemberSummaries(fixture.orgA, [fixture.userB]);
    expect(summaries).toEqual([]);
  });

  it("getMemberSummaries sí devuelve al usuario de su propia organización", async () => {
    const summaries = await getMemberSummaries(fixture.orgB, [fixture.userB]);
    expect(summaries.map((user) => user.id)).toEqual([fixture.userB]);
  });
});

// Las escrituras por id del proveedor (brief-22.2, D-6 y AC-6), con el mismo ayudante: el
// servicio lee la fila filtrada por organización antes de escribir, así que el filtro del `where`
// solo se prueba llamando al repositorio con una organización que no es la dueña.
describe("las escrituras del proveedor no alcanzan a otra organización", () => {
  async function supplierOfB(): Promise<string> {
    const result = await getDb().execute<{ id: string }>(
      sql`insert into suppliers (organization_id, name)
          values (${fixture.orgB}, 'Proveedor de B') returning id`,
    );
    return result.rows[0]!.id;
  }

  async function supplierRow(id: string) {
    const result = await getDb().execute<{ name: string; is_active: boolean }>(
      sql`select name, is_active from suppliers where id = ${id}`,
    );
    return result.rows[0]!;
  }

  it("updateSupplierValues", async () => {
    const supplierB = await supplierOfB();
    const error = await attempt((tx) =>
      purchasingRepository.updateSupplierValues(tx, fixture.orgA, supplierB, {
        name: "Renombrado por A",
      }),
    );
    expect((await supplierRow(supplierB)).name).toBe("Proveedor de B");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateSupplierActive", async () => {
    const supplierB = await supplierOfB();
    const error = await attempt((tx) =>
      purchasingRepository.updateSupplierActive(
        tx,
        fixture.orgA,
        supplierB,
        false,
      ),
    );
    expect((await supplierRow(supplierB)).is_active).toBe(true);
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  // AC-6 pide también la lista (revisión independiente, R-8).
  it("la lista no ve los proveedores de otra organización", async () => {
    await supplierOfB();
    const search = { kind: "name", text: "proveedor" } as const;
    expect(
      await purchasingRepository.countSuppliers(fixture.orgA, "all", search),
    ).toBe(0);
    expect(
      await purchasingRepository.findSuppliers(
        fixture.orgA,
        "all",
        { kind: "none" },
        25,
        0,
      ),
    ).toEqual([]);
    expect(
      await purchasingRepository.countSuppliers(fixture.orgB, "all", search),
    ).toBe(1);
  });

  it("findSupplier no ve el proveedor de otra organización", async () => {
    const supplierB = await supplierOfB();
    expect(
      await purchasingRepository.findSupplier(fixture.orgA, supplierB),
    ).toBeUndefined();
    expect(
      await purchasingRepository.findSupplier(fixture.orgB, supplierB),
    ).toMatchObject({ name: "Proveedor de B" });
  });
});

// La orden de compra (brief-22.3, D-7 y AC-6), con el mismo ayudante. La cancelación, el detalle y
// la lista se prueban en el repositorio con una organización que no es la dueña; el alta con un
// proveedor o un producto de otra organización, por el servicio, con un contexto de admin de A
// armado a mano: el servicio solo mira la organización, el usuario y el rol.
describe("la orden de compra no alcanza a otra organización", () => {
  async function orderOfB(): Promise<{ orderId: string; supplierId: string }> {
    const supplier = await getDb().execute<{ id: string }>(
      sql`insert into suppliers (organization_id, name)
          values (${fixture.orgB}, 'Proveedor de B') returning id`,
    );
    const supplierId = supplier.rows[0]!.id;
    const order = await getDb().execute<{ id: string }>(
      sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                       created_by)
          values (${fixture.orgB}, 1, ${supplierId}, 'ARS', 100, ${fixture.userB})
          returning id`,
    );
    const orderId = order.rows[0]!.id;
    await getDb().execute(
      sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                            position, quantity, unit_cost, line_total)
          values (${fixture.orgB}, ${orderId}, ${fixture.productB}, 1, 1, 100, 100)`,
    );
    return { orderId, supplierId };
  }

  async function adminOfA(): Promise<AuthContext> {
    const user = await getDb().execute<{ id: string }>(
      sql`insert into users (email, password_hash, name)
          values ('admin-a@example.com', 'hash-irrelevante', 'Admin de A') returning id`,
    );
    await getDb().execute(
      sql`insert into organization_members (organization_id, user_id, role)
          values (${fixture.orgA}, ${user.rows[0]!.id}, 'admin')`,
    );
    return {
      userId: user.rows[0]!.id,
      organizationId: fixture.orgA,
      role: "admin",
      mustChangePassword: false,
      sessionExpiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  it("cancelPurchaseOrderRow", async () => {
    const { orderId } = await orderOfB();
    const error = await attempt((tx) =>
      purchaseOrderRepository.cancelPurchaseOrderRow(tx, fixture.orgA, orderId),
    );
    const after = await getDb().execute<{ status: string }>(
      sql`select status from purchase_orders where id = ${orderId}`,
    );
    expect(after.rows[0]!.status).toBe("open");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("findPurchaseOrder y findPurchaseOrderLines no ven la orden de otra organización", async () => {
    const { orderId } = await orderOfB();
    expect(
      await purchaseOrderRepository.findPurchaseOrder(fixture.orgA, orderId),
    ).toBeUndefined();
    expect(
      await purchaseOrderRepository.findPurchaseOrderLines(
        fixture.orgA,
        orderId,
      ),
    ).toEqual([]);
    expect(
      await purchaseOrderRepository.findPurchaseOrder(fixture.orgB, orderId),
    ).toMatchObject({ id: orderId, status: "open" });
  });

  it("la lista no ve las órdenes de otra organización, ni filtrando por su proveedor", async () => {
    const { supplierId } = await orderOfB();
    for (const query of [
      { status: null, supplierId: null, number: null },
      { status: null, supplierId, number: null },
      { status: null, supplierId: null, number: 1 },
    ]) {
      const ofA = { organizationId: fixture.orgA, ...query };
      expect(await purchaseOrderRepository.countPurchaseOrders(ofA)).toBe(0);
      expect(
        await purchaseOrderRepository.findPurchaseOrders(ofA, 25, 0),
      ).toEqual([]);
    }
    expect(
      await purchaseOrderRepository.countPurchaseOrders({
        organizationId: fixture.orgB,
        status: null,
        supplierId: null,
        number: null,
      }),
    ).toBe(1);
  });

  it("el alta con un proveedor o un producto de otra organización responde NOT_FOUND", async () => {
    const { supplierId } = await orderOfB();
    const admin = await adminOfA();
    const supplierA = await getDb().execute<{ id: string }>(
      sql`insert into suppliers (organization_id, name)
          values (${fixture.orgA}, 'Proveedor de A') returning id`,
    );
    const line = { productId: fixture.productB, quantity: "1", unitCost: "1" };
    expect(
      await createPurchaseOrder(admin, {
        supplierId,
        currency: "ARS",
        lines: [line],
      }),
    ).toEqual({ ok: false, code: "NOT_FOUND", target: "supplier" });
    expect(
      await createPurchaseOrder(admin, {
        supplierId: supplierA.rows[0]!.id,
        currency: "ARS",
        lines: [line],
      }),
    ).toEqual({
      ok: false,
      code: "NOT_FOUND",
      target: "products",
      lines: [{ position: 1, productId: fixture.productB }],
    });
    const orders = await getDb().execute<{ total: number }>(
      sql`select count(*)::int as total from purchase_orders
          where organization_id = ${fixture.orgA}`,
    );
    expect(orders.rows[0]!.total).toBe(0);
  });
});

// La recepción (brief-22.4, D-8 y AC-7), con los mismos ayudantes. Las lecturas por id y la lista
// se prueban en el repositorio y en el servicio con una organización que no es la dueña; el alta,
// el cierre a mano y el detalle, por el servicio con un admin de A.
describe("la recepción no alcanza a otra organización", () => {
  async function receiptOfB() {
    const supplier = await getDb().execute<{ id: string }>(
      sql`insert into suppliers (organization_id, name)
          values (${fixture.orgB}, 'Proveedor de B') returning id`,
    );
    const supplierId = supplier.rows[0]!.id;
    const order = await getDb().execute<{ id: string }>(
      sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                       created_by)
          values (${fixture.orgB}, 1, ${supplierId}, 'ARS', 100, ${fixture.userB})
          returning id`,
    );
    const orderId = order.rows[0]!.id;
    const orderLine = await getDb().execute<{ id: string }>(
      sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                            position, quantity, unit_cost, line_total)
          values (${fixture.orgB}, ${orderId}, ${fixture.productB}, 1, 2, 100, 200)
          returning id`,
    );
    const receipt = await getDb().execute<{ id: string }>(
      sql`insert into goods_receipts (organization_id, number, supplier_id, purchase_order_id,
                                      currency, total, created_by)
          values (${fixture.orgB}, 1, ${supplierId}, ${orderId}, 'ARS', 100, ${fixture.userB})
          returning id`,
    );
    const receiptId = receipt.rows[0]!.id;
    await getDb().execute(
      sql`insert into goods_receipt_lines (organization_id, goods_receipt_id,
                                           purchase_order_line_id, product_id, position,
                                           quantity, unit_cost, line_total)
          values (${fixture.orgB}, ${receiptId}, ${orderLine.rows[0]!.id}, ${fixture.productB},
                  1, 1, 100, 100)`,
    );
    return {
      supplierId,
      orderId,
      orderLineId: orderLine.rows[0]!.id,
      receiptId,
    };
  }

  async function adminOfA(): Promise<AuthContext> {
    const user = await getDb().execute<{ id: string }>(
      sql`insert into users (email, password_hash, name)
          values ('admin-a@example.com', 'hash-irrelevante', 'Admin de A') returning id`,
    );
    await getDb().execute(
      sql`insert into organization_members (organization_id, user_id, role)
          values (${fixture.orgA}, ${user.rows[0]!.id}, 'admin')`,
    );
    return {
      userId: user.rows[0]!.id,
      organizationId: fixture.orgA,
      role: "admin",
      mustChangePassword: false,
      sessionExpiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  it("las lecturas por id y lo recibido no ven la recepción de otra organización", async () => {
    const { orderId, receiptId } = await receiptOfB();
    expect(
      await goodsReceiptRepository.findGoodsReceipt(fixture.orgA, receiptId),
    ).toBeUndefined();
    expect(
      await goodsReceiptRepository.findGoodsReceiptLines(
        fixture.orgA,
        receiptId,
      ),
    ).toEqual([]);
    expect(
      await goodsReceiptRepository.sumReceivedByOrderLine(
        fixture.orgA,
        orderId,
      ),
    ).toEqual(new Map());
    expect(
      await goodsReceiptRepository.countOrderGoodsReceipts(
        fixture.orgA,
        orderId,
      ),
    ).toBe(0);
    expect(
      await goodsReceiptRepository.findGoodsReceipt(fixture.orgB, receiptId),
    ).toMatchObject({ id: receiptId });
    expect(await getGoodsReceipt(await adminOfA(), receiptId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("la lista no ve las recepciones de otra organización, ni filtrando por su proveedor o su orden", async () => {
    const { supplierId, orderId } = await receiptOfB();
    for (const query of [
      { supplierId: null, purchaseOrderId: null, number: null },
      { supplierId, purchaseOrderId: null, number: null },
      { supplierId: null, purchaseOrderId: orderId, number: null },
      { supplierId: null, purchaseOrderId: null, number: 1 },
    ]) {
      const ofA = { organizationId: fixture.orgA, ...query };
      expect(await goodsReceiptRepository.countGoodsReceipts(ofA)).toBe(0);
      expect(
        await goodsReceiptRepository.findGoodsReceipts(ofA, 25, 0),
      ).toEqual([]);
    }
  });

  it("el alta con un proveedor, una orden, una línea o un producto de otra organización responde NOT_FOUND, y el cierre a mano también", async () => {
    const { supplierId, orderId, orderLineId } = await receiptOfB();
    const admin = await adminOfA();
    const supplierA = await getDb().execute<{ id: string }>(
      sql`insert into suppliers (organization_id, name)
          values (${fixture.orgA}, 'Proveedor de A') returning id`,
    );
    const free = (supplier: string) => ({
      purchaseOrderId: null,
      supplierId: supplier,
      currency: "ARS",
      supplierReference: "",
      lines: [{ productId: fixture.productB, quantity: "1", unitCost: "1" }],
    });
    expect(await createGoodsReceipt(admin, free(supplierId))).toEqual({
      ok: false,
      code: "NOT_FOUND",
      target: "supplier",
    });
    expect(
      await createGoodsReceipt(admin, free(supplierA.rows[0]!.id)),
    ).toEqual({
      ok: false,
      code: "NOT_FOUND",
      target: "products",
      lines: [{ position: 1, productId: fixture.productB }],
    });
    expect(
      await createGoodsReceipt(admin, {
        purchaseOrderId: orderId,
        supplierId: "",
        currency: "",
        supplierReference: "",
        lines: [
          {
            purchaseOrderLineId: orderLineId,
            productId: "",
            quantity: "1",
            unitCost: "1",
          },
        ],
      }),
    ).toEqual({ ok: false, code: "NOT_FOUND", target: "purchase_order" });
    expect(await closePurchaseOrder(admin, orderId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    const written = await getDb().execute<{ total: number }>(
      sql`select count(*)::int as total from goods_receipts
          where organization_id = ${fixture.orgA}`,
    );
    expect(written.rows[0]!.total).toBe(0);
    const order = await getDb().execute<{ status: string }>(
      sql`select status from purchase_orders where id = ${orderId}`,
    );
    expect(order.rows[0]!.status).toBe("open");
  });

  // La anulación (brief-22.5, AC-6): su lectura por recepción, la operación y la lista, con una
  // organización que no es la dueña.
  it("la anulación, su lectura y la lista no alcanzan la recepción de otra organización", async () => {
    const { orderId, receiptId } = await receiptOfB();
    await getDb().execute(
      sql`insert into goods_receipt_voids (organization_id, number, goods_receipt_id, currency,
                                           total, reason, created_by)
          values (${fixture.orgB}, 1, ${receiptId}, 'ARS', 100, 'other', ${fixture.userB})`,
    );
    expect(
      await goodsReceiptRepository.findVoidByGoodsReceipt(
        fixture.orgA,
        receiptId,
      ),
    ).toBeUndefined();
    expect(
      await goodsReceiptRepository.findVoidByGoodsReceipt(
        fixture.orgB,
        receiptId,
      ),
    ).toMatchObject({ number: 1 });
    for (const query of [
      { voidNumber: 1, status: "all" as const },
      { voidNumber: null, status: "voided" as const },
      { voidNumber: null, status: "current" as const },
    ]) {
      const ofA = {
        organizationId: fixture.orgA,
        supplierId: null,
        purchaseOrderId: null,
        number: null,
        ...query,
      };
      expect(await goodsReceiptRepository.countGoodsReceipts(ofA)).toBe(0);
      expect(
        await goodsReceiptRepository.findGoodsReceipts(ofA, 25, 0),
      ).toEqual([]);
    }
    expect(
      await goodsReceiptRepository.countOrderGoodsReceipts(
        fixture.orgB,
        orderId,
      ),
    ).toBe(0);

    const admin = await adminOfA();
    expect(await voidGoodsReceipt(admin, receiptId, "other")).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    const list = await listGoodsReceipts(admin, {
      supplierId: null,
      number: "ARC-000001",
      page: 1,
    });
    expect(list.ok && list.total).toBe(0);
    const written = await getDb().execute<{ total: number }>(
      sql`select count(*)::int as total from goods_receipt_voids`,
    );
    expect(written.rows[0]!.total).toBe(1);
  });
});

// Los pagos a proveedores (brief-22.6, AC-7): las lecturas por id y por proveedor, la lista y la
// anulación, con una organización que no es la dueña; y las lecturas de purchasing que cash usa.
describe("los pagos a proveedores no alcanzan a otra organización", () => {
  async function paymentOfB() {
    const supplier = await getDb().execute<{ id: string }>(
      sql`insert into suppliers (organization_id, name)
          values (${fixture.orgB}, 'Proveedor de B') returning id`,
    );
    const supplierId = supplier.rows[0]!.id;
    const receipt = await getDb().execute<{ id: string }>(
      sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                      created_by)
          values (${fixture.orgB}, 1, ${supplierId}, 'ARS', 100, ${fixture.userB})
          returning id`,
    );
    const receiptId = receipt.rows[0]!.id;
    const method = await getDb().execute<{ id: string }>(
      sql`insert into payment_methods (organization_id, name, is_cash)
          values (${fixture.orgB}, 'Efectivo', true) returning id`,
    );
    const session = await getDb().execute<{ id: string }>(
      sql`insert into cash_sessions (organization_id, number, opened_by)
          values (${fixture.orgB}, 1, ${fixture.userB}) returning id`,
    );
    const sessionId = session.rows[0]!.id;
    const payment = await getDb().execute<{ id: string }>(
      sql`insert into supplier_payments (organization_id, number, target, goods_receipt_id,
                                         supplier_id, payment_method_id, session_id, currency,
                                         amount, created_by)
          values (${fixture.orgB}, 1, 'goods_receipt', ${receiptId}, ${supplierId},
                  ${method.rows[0]!.id}, ${sessionId}, 'ARS', 40, ${fixture.userB})
          returning id`,
    );
    const paymentId = payment.rows[0]!.id;
    await getDb().execute(
      sql`insert into supplier_payment_voids (organization_id, number, supplier_payment_id,
                                              currency, amount, reason, session_id, created_by)
          values (${fixture.orgB}, 1, ${paymentId}, 'ARS', 40, 'other', ${sessionId},
                  ${fixture.userB})`,
    );
    return { supplierId, receiptId, sessionId, paymentId };
  }

  async function adminOfA(): Promise<AuthContext> {
    const user = await getDb().execute<{ id: string }>(
      sql`insert into users (email, password_hash, name)
          values ('admin-a@example.com', 'hash-irrelevante', 'Admin de A') returning id`,
    );
    await getDb().execute(
      sql`insert into organization_members (organization_id, user_id, role)
          values (${fixture.orgA}, ${user.rows[0]!.id}, 'admin')`,
    );
    return {
      userId: user.rows[0]!.id,
      organizationId: fixture.orgA,
      role: "admin",
      mustChangePassword: false,
      sessionExpiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  it("las lecturas de cash por id, por proveedor, por recepción y por sesión", async () => {
    const { supplierId, receiptId, sessionId, paymentId } = await paymentOfB();
    const a = fixture.orgA;
    expect(
      await supplierPaymentRepository.findSupplierPayment(a, paymentId),
    ).toBeUndefined();
    expect(
      await supplierPaymentRepository.findSupplierPayments(a, supplierId),
    ).toEqual([]);
    expect(
      await supplierPaymentRepository.findGoodsReceiptPayments(a, receiptId),
    ).toEqual([]);
    expect(
      await supplierPaymentRepository.findSessionSupplierPayments(a, sessionId),
    ).toEqual([]);
    expect(
      await supplierPaymentRepository.findSessionSupplierPaymentVoids(
        a,
        sessionId,
      ),
    ).toEqual([]);
    expect(
      await supplierPaymentRepository.findLateSupplierPaymentVoids(
        a,
        sessionId,
      ),
    ).toEqual([]);
    for (const query of [
      { status: "all" as const, supplierId: null, number: null },
      { status: "voided" as const, supplierId, number: null },
      {
        status: "all" as const,
        supplierId: null,
        number: { kind: "void" as const, value: 1 },
      },
    ]) {
      const ofA = { organizationId: a, ...query };
      expect(await supplierPaymentRepository.countSupplierPayments(ofA)).toBe(
        0,
      );
      expect(
        await supplierPaymentRepository.findSupplierPaymentsPage(ofA, 25, 0),
      ).toEqual([]);
    }
    // La organización dueña sí los ve: el filtro es el que los esconde.
    expect(
      await supplierPaymentRepository.findSupplierPayment(
        fixture.orgB,
        paymentId,
      ),
    ).toMatchObject({ number: 1 });
  });

  it("las lecturas de purchasing que cash usa", async () => {
    const { supplierId, receiptId } = await paymentOfB();
    const a = fixture.orgA;
    await getDb().transaction(async (tx) => {
      expect(
        await goodsReceiptRepository.findGoodsReceiptForAccount(
          tx,
          a,
          receiptId,
        ),
      ).toBeUndefined();
      expect(
        await goodsReceiptRepository.findSupplierGoodsReceiptsForAccount(
          tx,
          a,
          supplierId,
        ),
      ).toEqual([]);
      expect(
        await purchasingRepository.findSupplier(a, supplierId, tx, {
          forShare: true,
        }),
      ).toBeUndefined();
    });
    expect(
      await purchasingRepository.findSupplierNames(a, [supplierId]),
    ).toEqual([]);
  });

  it("el pago, la anulación y las lecturas del servicio responden NOT_FOUND o vacío", async () => {
    const { supplierId, receiptId, paymentId } = await paymentOfB();
    const admin = await adminOfA();
    expect(
      await createSupplierPayment(admin, {
        target: "goods_receipt",
        goodsReceiptId: receiptId,
        paymentMethodId: crypto.randomUUID(),
        amount: "1",
      }),
    ).toEqual({ ok: false, code: "NOT_FOUND", entity: "goods_receipt" });
    expect(
      await createSupplierPayment(admin, {
        target: "account",
        supplierId,
        currency: "ARS",
        paymentMethodId: crypto.randomUUID(),
        amount: "1",
      }),
    ).toEqual({ ok: false, code: "NOT_FOUND", entity: "supplier" });
    expect(
      await voidSupplierPayment(admin, { paymentId, reason: "other" }),
    ).toEqual({ ok: false, code: "NOT_FOUND", entity: "supplier_payment" });
    expect(await getSupplierPayment(admin, paymentId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await getGoodsReceiptPayments(admin, receiptId)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    const list = await listSupplierPayments(admin, {
      status: "all",
      supplierId,
      search: "PP-000001",
      page: 1,
    });
    expect(list.ok && list.payments.total).toBe(0);
    const written = await getDb().execute<{ payments: number; voids: number }>(
      sql`select (select count(*)::int from supplier_payments) as payments,
                 (select count(*)::int from supplier_payment_voids) as voids`,
    );
    expect(written.rows[0]).toEqual({ payments: 1, voids: 1 });
  });
});

// La lectura agrupada de la 24.5.1 (brief-24.5.1, D-6, AC-7 e I-5). Va acá y no en
// tests/integration/units.test.ts por el mismo motivo que explica la cabecera de este archivo: por
// el servicio, `countUnitsByStatus` llama primero a `getProduct`, que filtra por organización y
// devuelve NOT_FOUND, así que la consulta agrupada nunca llega a correr con una organización
// ajena. Visto desde afuera, el `where` del repositorio es inobservable: la prueba de units.test.ts
// pasaría igual si se borrara.
//
// Lo encontró la revisión independiente del 2026-10-31 (hallazgo N-7): «la aserción pasaría con
// `eq(stockUnits.organizationId, …)` borrado».
describe("el recuento de unidades por estado no alcanza a otra organización", () => {
  it("cuenta las unidades de su dueña y ninguna de la organización ajena", async () => {
    await getDb().execute(
      sql`update products set tracking = 'unit' where id = ${fixture.productB}`,
    );
    await getDb().execute(
      sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
            origin_type, created_by)
          values (${fixture.orgB}, ${fixture.productB}, 'SERIE-B-1', 100, 'USD',
                  'manual', ${fixture.userB}),
                 (${fixture.orgB}, ${fixture.productB}, 'SERIE-B-2', 100, 'USD',
                  'manual', ${fixture.userB})`,
    );

    // El control, que es lo que le da sentido al caso de abajo: con su dueña, la consulta sí
    // devuelve filas. Sin esta aserción, un mapa vacío podría significar que el fixture no insertó
    // nada y la prueba pasaría por el motivo equivocado.
    const propias = await unitRepository.countUnitsByStatus(
      fixture.orgB,
      fixture.productB,
    );
    expect(propias.get("available")).toBe(2);

    // La organización ajena no ve ninguna, aunque pida el mismo producto por su id: el filtro vive
    // en el `where` de la consulta, no solo en la comprobación del servicio.
    const ajenas = await unitRepository.countUnitsByStatus(
      fixture.orgA,
      fixture.productB,
    );
    expect([...ajenas.entries()]).toEqual([]);
  });
});
