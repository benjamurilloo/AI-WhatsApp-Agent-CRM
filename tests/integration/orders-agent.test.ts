import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  recordIngestionEvent,
  recordIngestionEventV2,
  type IngestionContext,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El pedido pendiente que deja el agente, contra PostgreSQL real (brief-19.4): order.placed por el
// contrato v2, su proyección en orders (AC-3), sus reglas con su precedencia (AC-4), la
// concurrencia (AC-5) y el aislamiento (AC-6). Los eventos se arman acá, con forma asumida.

const RECEIVED_AT = new Date("2026-10-11T15:00:00.000Z");
const PHONE = "+5491155550001";
let eventCounter = 0;

async function organizationWithCredential(name: string, source: string) {
  const organization = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  const organizationId = organization.rows[0]!.id;
  const credential = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${organizationId}, ${source}, 'ingest', ${randomUUID()}) returning id`,
  );
  // Un usuario solo para firmar los precios, que exigen su autor.
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${`${source}-${randomUUID()}@example.com`}, 'x', 'Admin') returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, 'admin')`,
  );
  return {
    context: {
      organizationId,
      source,
      credentialId: credential.rows[0]!.id,
    } satisfies IngestionContext,
    userId: user.rows[0]!.id,
  };
}

async function insertClient(
  organizationId: string,
  phone: string,
  isActive = true,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, is_active)
        values (${organizationId}, 'Ana', ${phone}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertProduct(
  organizationId: string,
  sku: string,
  options: {
    isActive?: boolean;
    price?: [string, string] | null;
    userId: string;
  },
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, is_active)
        values (${organizationId}, ${sku}, ${`Producto ${sku}`}, ${options.isActive ?? true})
        returning id`,
  );
  const productId = result.rows[0]!.id;
  const price =
    options.price === undefined ? ["1500.00", "ARS"] : options.price;
  if (price) {
    await getDb().execute(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${organizationId}, ${productId}, ${price[0]}, ${price[1]}, ${options.userId})`,
    );
  }
  return productId;
}

function orderEvent(
  lines: { product_id: string; quantity: string }[],
  options: { phone?: string; eventId?: string; version?: "1" | "2" } = {},
) {
  return {
    contract_version: options.version ?? "2",
    event_type: "order.placed",
    event_id: options.eventId ?? `evt-pedido-${++eventCounter}`,
    occurred_at: "2026-10-11T14:59:58.000Z",
    client: { phone: options.phone ?? PHONE },
    lines,
  };
}

function send(context: IngestionContext, payload: unknown) {
  return recordIngestionEventV2(context, JSON.stringify(payload), RECEIVED_AT);
}

async function ordersOf(organizationId: string) {
  const result = await getDb().execute<{
    id: string;
    number: string;
    client_id: string;
    status: string;
    currency: string;
    total: string;
    created_by: string | null;
    created_by_credential_id: string | null;
    ingestion_event_id: string | null;
  }>(
    sql`select id, number::text, client_id, status, currency, total::text, created_by,
               created_by_credential_id, ingestion_event_id
        from orders where organization_id = ${organizationId} order by number`,
  );
  return result.rows;
}

async function linesOf(orderId: string) {
  const result = await getDb().execute<{
    product_id: string;
    position: number;
    quantity: string;
    unit_price: string;
    line_total: string;
  }>(
    sql`select product_id, position, quantity::text, unit_price::text, line_total::text
        from order_lines where order_id = ${orderId} order by position`,
  );
  return result.rows;
}

async function eventsOf(organizationId: string) {
  const result = await getDb().execute<{
    id: string;
    external_ref: string;
    status: string;
    error_code: string | null;
  }>(
    sql`select id, external_ref, status, error_code from ingestion_events
        where organization_id = ${organizationId} order by received_at, external_ref`,
  );
  return result.rows;
}

async function orderAuditOf(organizationId: string) {
  const result = await getDb().execute<{
    entity_id: string;
    action: string;
    actor_user_id: string | null;
    actor_credential_id: string | null;
  }>(
    sql`select entity_id, action, actor_user_id, actor_credential_id from audit_logs
        where organization_id = ${organizationId} and entity_type = 'order'
        order by created_at, id`,
  );
  return result.rows;
}

async function counterOf(organizationId: string) {
  const result = await getDb().execute<{ last_number: string }>(
    sql`select last_number::text from document_counters
        where organization_id = ${organizationId} and kind = 'order'`,
  );
  return result.rows[0]?.last_number ?? null;
}

// Una tercera conexión que retiene una transacción hasta que se la suelta (brief-12.2, D-8).
let releaseHeld: (() => Promise<void>) | null = null;

async function hold(statements: ReturnType<typeof sql>[]) {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    for (const statement of statements) await tx.execute(statement);
    taken();
    await released;
  });
  await lockTaken;
  releaseHeld = async () => {
    release();
    await holder;
    releaseHeld = null;
  };
  return releaseHeld;
}

async function waitForLockWaiters(count: number) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const waiting = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from pg_stat_activity
           where datname = current_database() and wait_event_type = ${"Lock"}`,
    );
    if (waiting.rows[0]!.count === count) return;
    if (Date.now() > deadline) {
      throw new Error(`se esperaban ${count} conexiones en un bloqueo`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterEach(async () => {
  if (releaseHeld) await releaseHeld();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("brief-19.4: el pedido del agente por el contrato v2 (AC-3)", () => {
  it("crea un pendiente con su número, los precios copiados, la credencial como actor y el vínculo al evento", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    const clientId = await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
      price: ["1500.00", "ARS"],
    });
    const tea = await insertProduct(context.organizationId, "TE", {
      userId,
      price: ["800.50", "ARS"],
    });

    const placed = await send(
      context,
      orderEvent([
        { product_id: coffee.toUpperCase(), quantity: "2" },
        { product_id: tea, quantity: "1.5" },
      ]),
    );
    expect(placed).toEqual({
      ok: true,
      result: "accepted",
      eventId: `evt-pedido-${eventCounter}`,
      order: { number: 1, displayNumber: "P-000001" },
    });

    const [event] = await eventsOf(context.organizationId);
    expect(event).toMatchObject({ status: "processed", error_code: null });
    const [order] = await ordersOf(context.organizationId);
    expect(order).toMatchObject({
      number: "1",
      client_id: clientId,
      status: "pending",
      currency: "ARS",
      total: "4200.75",
      created_by: null,
      created_by_credential_id: context.credentialId,
      ingestion_event_id: event!.id,
    });
    expect(await linesOf(order!.id)).toEqual([
      {
        product_id: coffee,
        position: 1,
        quantity: "2.000",
        unit_price: "1500.00",
        line_total: "3000.00",
      },
      {
        product_id: tea,
        position: 2,
        quantity: "1.500",
        unit_price: "800.50",
        line_total: "1200.75",
      },
    ]);
    expect(await orderAuditOf(context.organizationId)).toEqual([
      {
        entity_id: order!.id,
        action: "create",
        actor_user_id: null,
        actor_credential_id: context.credentialId,
      },
    ]);
  });

  it("D-8: no mira el stock ni lo toca: un producto sin saldo se pide igual", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
    });

    expect(
      await send(context, orderEvent([{ product_id: coffee, quantity: "50" }])),
    ).toMatchObject({ ok: true, result: "accepted" });
    const inventories = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from inventories
          where organization_id = ${context.organizationId}`,
    );
    expect(inventories.rows[0]!.count).toBe(0);
  });

  it("D-6: el reenvío idéntico responde el mismo número sin escribir; otro contenido, 409", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
    });
    const event = orderEvent([{ product_id: coffee, quantity: "1" }]);

    expect(await send(context, event)).toMatchObject({
      result: "accepted",
      order: { displayNumber: "P-000001" },
    });
    expect(await send(context, event)).toEqual({
      ok: true,
      result: "duplicate",
      eventId: event.event_id,
      order: { number: 1, displayNumber: "P-000001" },
    });
    expect(
      await send(context, {
        ...event,
        lines: [{ product_id: coffee, quantity: "2" }],
      }),
    ).toEqual({
      ok: false,
      code: "CONFLICT",
      recorded: false,
      reason: "event_payload_mismatch",
    });
    expect(await ordersOf(context.organizationId)).toHaveLength(1);
    expect(await orderAuditOf(context.organizationId)).toHaveLength(1);
    expect(await counterOf(context.organizationId)).toBe("1");
  });

  it("D-9: dos pendientes iguales del mismo cliente se aceptan, con números distintos", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
    });
    const lines = [{ product_id: coffee, quantity: "1" }];

    await send(context, orderEvent(lines));
    await send(context, orderEvent(lines));
    expect(
      (await ordersOf(context.organizationId)).map((order) => order.number),
    ).toEqual(["1", "2"]);
  });

  it("v1 no conoce order.placed y no escribe nada", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
    });

    const result = await recordIngestionEvent(
      context,
      JSON.stringify(
        orderEvent([{ product_id: coffee, quantity: "1" }], { version: "1" }),
      ),
      RECEIVED_AT,
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      result.ok === false && "fields" in result && result.fields,
    ).toContain("event_type");
    expect(await ordersOf(context.organizationId)).toEqual([]);
    expect(await eventsOf(context.organizationId)).toEqual([]);
  });
});

describe("brief-19.4: las reglas de order.placed (AC-4)", () => {
  async function scenario() {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    const other = await organizationWithCredential("Otro", "agente-otro");
    await insertClient(context.organizationId, PHONE);
    return {
      context,
      ars: await insertProduct(context.organizationId, "ARS", { userId }),
      usd: await insertProduct(context.organizationId, "USD", {
        userId,
        price: ["10.00", "USD"],
      }),
      cent: await insertProduct(context.organizationId, "CENT", {
        userId,
        price: ["0.01", "ARS"],
      }),
      expensive: await insertProduct(context.organizationId, "CARO", {
        userId,
        price: ["999999999999.99", "ARS"],
      }),
      half: await insertProduct(context.organizationId, "MEDIO", {
        userId,
        price: ["600000000000.00", "ARS"],
      }),
      unpriced: await insertProduct(context.organizationId, "SINPRECIO", {
        userId,
        price: null,
      }),
      inactive: await insertProduct(context.organizationId, "INACTIVO", {
        userId,
        isActive: false,
      }),
      foreign: await insertProduct(other.context.organizationId, "AJENO", {
        userId: other.userId,
      }),
    };
  }

  async function rejected(
    context: IngestionContext,
    lines: { product_id: string; quantity: string }[],
    options: { phone?: string } = {},
  ) {
    const result = await send(context, orderEvent(lines, options));
    if (result.ok || result.code !== "BUSINESS_RULE_VIOLATION") {
      throw new Error(`se esperaba un 422: ${JSON.stringify(result)}`);
    }
    return result.rule;
  }

  it("cada regla, sin pedido, sin número y con el evento failed", async () => {
    const s = await scenario();
    const { context } = s;
    const one = (product_id: string, quantity = "1") => [
      { product_id, quantity },
    ];

    expect(
      await rejected(context, one(s.ars), { phone: "+5491100000000" }),
    ).toBe("client_not_found");
    expect(await rejected(context, one(randomUUID()))).toBe(
      "product_not_found",
    );
    expect(await rejected(context, one(s.inactive))).toBe("product_not_found");
    expect(await rejected(context, one(s.foreign))).toBe("product_not_found");
    expect(await rejected(context, one(s.unpriced))).toBe(
      "product_without_price",
    );
    expect(
      await rejected(context, [
        { product_id: s.ars, quantity: "1" },
        { product_id: s.usd, quantity: "1" },
      ]),
    ).toBe("currency_mismatch");
    // 0,01 por 0,001 redondea a cero.
    expect(await rejected(context, one(s.cent, "0.001"))).toBe(
      "amount_out_of_range",
    );
    // Una línea que no cabe en numeric(14, 2).
    expect(await rejected(context, one(s.expensive, "2"))).toBe(
      "amount_out_of_range",
    );
    // Dos líneas que caben (599 999 999 999,99 y 600 000 000 000) y un total que no (revisión
    // independiente, R-1: la versión anterior usaba una segunda línea que ya no cabía sola).
    expect(
      await rejected(context, [
        { product_id: s.expensive, quantity: "0.6" },
        { product_id: s.half, quantity: "1" },
      ]),
    ).toBe("amount_out_of_range");

    expect(await ordersOf(context.organizationId)).toEqual([]);
    expect(await counterOf(context.organizationId)).toBeNull();
    expect(
      (await eventsOf(context.organizationId)).map((row) => [
        row.status,
        row.error_code,
      ]),
    ).toEqual(
      [
        "client_not_found",
        "product_not_found",
        "product_not_found",
        "product_not_found",
        "product_without_price",
        "currency_mismatch",
        "amount_out_of_range",
        "amount_out_of_range",
        "amount_out_of_range",
      ].map((rule) => ["failed", rule]),
    );

    // El siguiente aceptado es el primero: ningún rechazo consumió un número.
    expect(await send(context, orderEvent(one(s.ars)))).toMatchObject({
      order: { displayNumber: "P-000001" },
    });
  });

  it("un cliente desactivado no recibe pedidos", async () => {
    const s = await scenario();
    await getDb().execute(
      sql`update clients set is_active = false
          where organization_id = ${s.context.organizationId}`,
    );
    expect(
      await rejected(s.context, [{ product_id: s.ars, quantity: "1" }]),
    ).toBe("client_inactive");
    // Revisión independiente, R-6: el cliente desactivado antes que un producto inexistente.
    expect(
      await rejected(s.context, [{ product_id: randomUUID(), quantity: "1" }]),
    ).toBe("client_inactive");
  });

  it("la precedencia: el cliente primero, después las líneas en su orden", async () => {
    const s = await scenario();
    const { context } = s;

    // El cliente gana sobre un producto inexistente.
    expect(
      await rejected(context, [{ product_id: randomUUID(), quantity: "1" }], {
        phone: "+5491100000000",
      }),
    ).toBe("client_not_found");
    // La primera línea gana: sin precio antes que un producto inexistente en la segunda.
    expect(
      await rejected(context, [
        { product_id: s.unpriced, quantity: "1" },
        { product_id: randomUUID(), quantity: "1" },
      ]),
    ).toBe("product_without_price");
    // La moneda de la segunda antes que el producto inexistente de la tercera.
    expect(
      await rejected(context, [
        { product_id: s.ars, quantity: "1" },
        { product_id: s.usd, quantity: "1" },
        { product_id: randomUUID(), quantity: "1" },
      ]),
    ).toBe("currency_mismatch");
    // Revisión independiente, R-6: dentro de una línea, la moneda antes que el monto (USD por una
    // cantidad que tampoco cabría).
    expect(
      await rejected(context, [
        { product_id: s.ars, quantity: "1" },
        { product_id: s.usd, quantity: "99999999999" },
      ]),
    ).toBe("currency_mismatch");
    // Dentro de una línea, inexistente antes que sin precio: un inactivo sin precio es inexistente.
    await getDb().execute(
      sql`update products set is_active = false where id = ${s.unpriced}`,
    );
    expect(
      await rejected(context, [{ product_id: s.unpriced, quantity: "1" }]),
    ).toBe("product_not_found");
  });

  it("un reenvío responde la misma regla, aunque ya se cumpla", async () => {
    const s = await scenario();
    const event = orderEvent([{ product_id: s.unpriced, quantity: "1" }]);
    expect(await send(s.context, event)).toMatchObject({
      rule: "product_without_price",
    });
    await getDb().execute(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          select organization_id, ${s.unpriced}, 100, 'ARS', created_by from product_prices
          where product_id = ${s.ars}`,
    );
    expect(await send(s.context, event)).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "product_without_price",
      recorded: true,
    });
    expect(await ordersOf(s.context.organizationId)).toEqual([]);
  });
});

describe("brief-19.4: concurrencia (AC-5)", () => {
  it("espera a una desactivación del cliente en curso y la respeta", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    const clientId = await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
    });

    const release = await hold([
      sql`select id from clients where id = ${clientId} for update`,
      sql`update clients set is_active = false where id = ${clientId}`,
    ]);
    const pending = send(
      context,
      orderEvent([{ product_id: coffee, quantity: "1" }]),
    );
    await waitForLockWaiters(1);
    await release();
    expect(await pending).toMatchObject({ rule: "client_inactive" });
    expect(await ordersOf(context.organizationId)).toEqual([]);
  });

  it("espera a la desactivación de un producto en curso y la respeta", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
    });

    const release = await hold([
      sql`select id from products where id = ${coffee} for update`,
      sql`update products set is_active = false where id = ${coffee}`,
    ]);
    const pending = send(
      context,
      orderEvent([{ product_id: coffee, quantity: "1" }]),
    );
    await waitForLockWaiters(1);
    await release();
    expect(await pending).toMatchObject({ rule: "product_not_found" });
  });

  it("toma el precio que queda vigente después de un cambio en curso", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
    });

    const release = await hold([
      sql`select id from products where id = ${coffee} for update`,
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${context.organizationId}, ${coffee}, 2000, 'ARS', ${userId})`,
    ]);
    const pending = send(
      context,
      orderEvent([{ product_id: coffee, quantity: "1" }]),
    );
    await waitForLockWaiters(1);
    await release();
    expect(await pending).toMatchObject({ result: "accepted" });
    const [order] = await ordersOf(context.organizationId);
    expect(order!.total).toBe("2000.00");
  });

  it("dos eventos del mismo cliente en paralelo crean dos pedidos; el mismo evento, uno", async () => {
    const { context, userId } = await organizationWithCredential(
      "Negocio",
      "agente",
    );
    await insertClient(context.organizationId, PHONE);
    const coffee = await insertProduct(context.organizationId, "CAF", {
      userId,
    });
    const lines = [{ product_id: coffee, quantity: "1" }];

    await Promise.all([
      send(context, orderEvent(lines)),
      send(context, orderEvent(lines)),
    ]);
    expect(
      (await ordersOf(context.organizationId)).map((order) => order.number),
    ).toEqual(["1", "2"]);

    const same = orderEvent(lines);
    const results = await Promise.all([
      send(context, same),
      send(context, same),
    ]);
    expect(
      results.map((result) => (result.ok ? result.result : result.code)).sort(),
    ).toEqual(["accepted", "duplicate"]);
    expect(
      results.map((result) => result.ok && "order" in result && result.order),
    ).toEqual([
      { number: 3, displayNumber: "P-000003" },
      { number: 3, displayNumber: "P-000003" },
    ]);
    expect(await ordersOf(context.organizationId)).toHaveLength(3);
  });
});

describe("brief-19.4: aislamiento entre organizaciones (AC-6)", () => {
  it("la credencial de una organización no usa clientes ni productos de otra", async () => {
    const a = await organizationWithCredential("Negocio A", "agente-a");
    const b = await organizationWithCredential("Negocio B", "agente-b");
    await insertClient(a.context.organizationId, PHONE);
    const productA = await insertProduct(a.context.organizationId, "CAF", {
      userId: a.userId,
    });

    // El teléfono es de un cliente de A: para B no existe.
    expect(
      await send(
        b.context,
        orderEvent([{ product_id: productA, quantity: "1" }]),
      ),
    ).toMatchObject({ rule: "client_not_found" });
    // Con un cliente propio, el producto de A tampoco existe para B.
    await insertClient(b.context.organizationId, PHONE);
    expect(
      await send(
        b.context,
        orderEvent([{ product_id: productA, quantity: "1" }]),
      ),
    ).toMatchObject({ rule: "product_not_found" });
    expect(await ordersOf(a.context.organizationId)).toEqual([]);
    expect(await ordersOf(b.context.organizationId)).toEqual([]);
  });
});
