import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// La anulación de un cobro, la devolución y su anulación de punta a punta (brief-21.5, AC-9):
// Chromium, next start, Server Actions, cash, sales, crm, numbering, audit y PostgreSQL real, sin
// mocks. Un admin anula un cobro en efectivo con la sesión abierta y otro de una sesión cerrada, que
// la muestra como posterior; devuelve en efectivo lo cobrado de una venta sin cliente anulada, anula
// esa devolución y vuelve a devolver, y devuelve el saldo a favor de un cliente. Un viewer ve sin
// acciones. Las ventas, sus anulaciones, los cobros, los medios y las sesiones se cargan por SQL: sus
// pantallas ya tienen sus propios casos.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Como en receipts.spec.ts: TRUNCATE es la vía documentada para vaciar lo que es de solo inserción
// (ADR 0013), y el contador se vacía para que cada caso empiece en AR-000001 y D-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, cash_movements,
          cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts,
          cash_sessions, payment_methods, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders,
          document_counters, audit_logs, inventory_movements, inventories, product_images,
          product_costs, product_prices, attribute_values, stock_units, products, conversation_notes, messages, conversations,
          client_tag_assignments, clients`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  await seedBasic(db, E2E_PASSWORD);
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

// Cada estado se analiza en claro y en oscuro (brief-4.0, D-6).
async function expectAccessible(page: Page, state: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page).toHaveTitle(/.+/);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const violations = results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    );
    expect(
      violations,
      `violaciones de axe en "${state}" (${colorScheme})`,
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null });
}

async function insertMethods(): Promise<{ cash: string; transfer: string }> {
  const result = await db.execute<{ id: string; name: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Efectivo', true),
               (${SEED_ORGANIZATION_ID}, 'Transferencia', false)
        returning id, name`,
  );
  const idOf = (name: string) =>
    result.rows.find((row) => row.name === name)!.id;
  return { cash: idOf("Efectivo"), transfer: idOf("Transferencia") };
}

async function insertClient() {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, 'Lucía Gómez', '+5491155550000')
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertSale(number: number, total: string, clientId?: string) {
  const product = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, ${`SKU-${number}`}, 'Yerba') returning id`,
  );
  const sale = await db.execute<{ id: string }>(
    sql`insert into sales (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId ?? null}, 'ARS', ${total},
                ${ADMIN_SEED.id})
        returning id`,
  );
  const saleId = sale.rows[0]!.id;
  await db.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${saleId}, ${product.rows[0]!.id}, 1, '1', ${total},
                'ARS', ${total})`,
  );
  return saleId;
}

// La anulación de una venta por SQL: copia su moneda y su total, como exige el trigger.
async function voidSale(number: number, saleId: string) {
  await db.execute(
    sql`insert into sale_voids (organization_id, number, sale_id, currency, total, reason,
                                created_by)
        select organization_id, ${number}, id, currency, total, 'data_entry_error',
               ${ADMIN_SEED.id}
        from sales where id = ${saleId}`,
  );
}

async function insertSession(
  number: number,
  initial: string,
  previousId: string | null = null,
) {
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, previous_session_id, opened_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${previousId}, ${ADMIN_SEED.id})
        returning id`,
  );
  const sessionId = session.rows[0]!.id;
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${SEED_ORGANIZATION_ID}, ${sessionId}, 'ARS', ${initial})`,
  );
  return sessionId;
}

// El cierre por SQL: sus filas por moneda antes que la cabecera, como el servicio.
async function closeSession(sessionId: string, amount: string) {
  await db.execute(
    sql`insert into cash_session_closing_amounts (organization_id, session_id, currency,
                                                  counted, expected)
        values (${SEED_ORGANIZATION_ID}, ${sessionId}, 'ARS', ${amount}, ${amount})`,
  );
  await db.execute(
    sql`insert into cash_session_closings (organization_id, session_id, closed_by)
        values (${SEED_ORGANIZATION_ID}, ${sessionId}, ${ADMIN_SEED.id})`,
  );
}

async function insertReceipt(values: {
  number: number;
  saleId: string;
  methodId: string;
  sessionId: string | null;
  amount: string;
}) {
  const result = await db.execute<{ id: string }>(
    sql`insert into receipts (organization_id, number, target, sale_id, client_id,
                              payment_method_id, session_id, currency, amount, created_by)
        select organization_id, ${values.number}, 'sale', id, client_id, ${values.methodId},
               ${values.sessionId}, currency, ${values.amount}, ${ADMIN_SEED.id}
        from sales where id = ${values.saleId}
        returning id`,
  );
  return result.rows[0]!.id;
}

async function counts() {
  const result = await db.execute<{
    voids: number;
    refunds: number;
    refund_voids: number;
  }>(
    sql`select (select count(*)::int from receipt_voids) as voids,
               (select count(*)::int from refunds) as refunds,
               (select count(*)::int from refund_voids) as refund_voids`,
  );
  return result.rows[0]!;
}

test("un admin anula con el teclado un cobro en efectivo de la sesión abierta y otro de una sesión cerrada, que lo muestra como posterior", async ({
  page,
}) => {
  test.slow();
  const methods = await insertMethods();
  const saleId = await insertSale(1, "3000.00");
  const closed = await insertSession(1, "1000.00");
  const early = await insertReceipt({
    number: 1,
    saleId,
    methodId: methods.cash,
    sessionId: closed,
    amount: "1000.00",
  });
  await closeSession(closed, "2000.00");
  const open = await insertSession(2, "2000.00", closed);
  const late = await insertReceipt({
    number: 2,
    saleId,
    methodId: methods.cash,
    sessionId: open,
    amount: "500.00",
  });
  await login(page, ADMIN);

  // El cobro de la sesión abierta: sale de lo esperado.
  await page.goto(`/cobros/${late}`);
  await page.getByRole("link", { name: "Anular cobro" }).click();
  await expect(page).toHaveURL(new RegExp(`/cobros/${late}/anular$`));
  await expect(
    page.getByText(/que sigue abierta: sale de lo esperado/),
  ).toBeVisible();
  await expectAccessible(page, "anulación de un cobro");
  const reason = page.getByRole("radio", { name: "Otro monto" });
  await reason.focus();
  await reason.press("Space");
  await expect(reason).toBeChecked();
  await page.getByRole("button", { name: "Sí, anular el cobro" }).click();
  await expect(page).toHaveURL(new RegExp(`/cobros/${late}\\?anulado=1`));
  await expect(page.getByText("Cobro anulado.")).toBeVisible();
  await expect(page.locator("[data-comprobante]")).toContainText(
    "Anulado por AR-000001",
  );
  await expect(page.getByRole("link", { name: "Anular cobro" })).toHaveCount(0);
  await expectAccessible(page, "recibo anulado");

  await page.goto("/caja");
  const totals = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000002",
  });
  // Inicial 2.000 + cobros 500 − anulados 500: lo esperado vuelve a 2.000, y los cobros netos, a 0.
  await expect(totals).toContainText(/\$\s0,00/);
  await expect(
    page.getByRole("region", {
      name: "Cobros en efectivo de la sesión C-000002",
    }),
  ).toContainText("Anulado");

  // El cobro de la sesión cerrada: su arqueo no cambia y la muestra como posterior.
  await page.goto(`/cobros/${early}/anular`);
  await expect(
    page.getByText(/que ya se cerró: su arqueo no cambia/),
  ).toBeVisible();
  await page.getByRole("radio", { name: "La plata no entró" }).check();
  await page.getByRole("button", { name: "Sí, anular el cobro" }).click();
  await expect(page.getByText("Cobro anulado.")).toBeVisible();
  await page.goto(`/caja/sesiones/${closed}`);
  await expect(
    page.getByRole("region", {
      name: "Anulaciones posteriores al cierre de la sesión C-000001",
    }),
  ).toContainText("AR-000002");
  await expect(
    page.getByRole("region", {
      name: "Totales por moneda de la sesión C-000001",
    }),
  ).toContainText("Sin diferencia");
  await expectAccessible(page, "arqueo con una anulación posterior");
  expect((await counts()).voids).toBe(2);
});

test("un admin devuelve en efectivo lo cobrado de una venta sin cliente anulada, ve el rechazo de una de más, la anula, vuelve a devolver y devuelve el saldo a favor de un cliente", async ({
  page,
}) => {
  test.slow();
  const methods = await insertMethods();
  await insertSession(1, "1000.00");
  const counter = await insertSale(1, "2000.00");
  await insertReceipt({
    number: 1,
    saleId: counter,
    methodId: methods.transfer,
    sessionId: null,
    amount: "2000.00",
  });
  await voidSale(1, counter);
  const clientId = await insertClient();
  const withClient = await insertSale(2, "1500.00", clientId);
  await insertReceipt({
    number: 2,
    saleId: withClient,
    methodId: methods.transfer,
    sessionId: null,
    amount: "1500.00",
  });
  await voidSale(2, withClient);
  await login(page, ADMIN);

  await page.goto(`/ventas/${counter}`);
  await expect(page.getByText(/A devolver: \$\s2\.000,00/)).toBeVisible();
  await page.getByRole("link", { name: "Devolver", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/ventas/${counter}/devolver$`));
  const amount = page.getByLabel(/Monto en/);
  await expect(amount).toHaveValue("2000.00");
  await expectAccessible(page, "formulario de la devolución");

  // Una devolución de más se rechaza con lo disponible, y conserva lo escrito.
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await amount.fill("2500");
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(
    page.getByText(/La devolución supera lo disponible: \$\s2\.000,00/),
  ).toBeFocused();
  await expect(amount).toHaveValue("2500");
  await expectAccessible(page, "devolución rechazada");

  // En efectivo, con el teclado.
  const cash = page.getByRole("radio", { name: /Efectivo/ });
  await cash.focus();
  await cash.press("Space");
  await amount.fill("500");
  await amount.press("Enter");
  await expect(page).toHaveURL(/\/devoluciones\/[^/]+\?registrada=1$/);
  await expect(page.getByText("Devolución registrada.")).toBeVisible();
  const comprobante = page.locator("[data-comprobante]");
  await expect(comprobante).toContainText("Devolución D-000001");
  await expect(comprobante).toContainText("Consumidor final");
  await expect(comprobante).toContainText("V-000001");
  await expectAccessible(page, "comprobante de la devolución");

  // La anulación de la devolución, y otra vez a devolver.
  await page.getByRole("link", { name: "Anular devolución" }).click();
  await page.getByRole("radio", { name: "La plata no salió" }).check();
  await page.getByRole("button", { name: "Sí, anular la devolución" }).click();
  await expect(page.getByText("Devolución anulada.")).toBeVisible();
  await expect(comprobante).toContainText("Anulada por AD-000001");
  await page.goto(`/ventas/${counter}`);
  await expect(page.getByText(/A devolver: \$\s2\.000,00/)).toBeVisible();
  await page.getByRole("link", { name: "Devolver", exact: true }).click();
  await page.getByRole("radio", { name: "Transferencia" }).check();
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(page.getByText("Devolución registrada.")).toBeVisible();
  await page.goto(`/ventas/${counter}`);
  await expect(
    page.getByText(/Devuelto: \$\s2\.000,00\. A devolver: \$\s0,00\./),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Devolver", exact: true }),
  ).toHaveCount(0);

  // El saldo a favor de un cliente: lo cobrado de su venta anulada pasó a su cuenta.
  await page.goto(`/ventas/${withClient}`);
  await page.getByRole("link", { name: "Devolver saldo a favor" }).click();
  await expect(page).toHaveURL(new RegExp(`/clientes/${clientId}/devolver$`));
  await expect(page.getByText(/A favor: \$\s1\.500,00/)).toBeVisible();
  await expectAccessible(page, "devolución desde la cuenta");
  await page.getByRole("radio", { name: "Transferencia" }).check();
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(page.getByText("Devolución registrada.")).toBeVisible();
  await expect(page.locator("[data-comprobante]")).toContainText(
    "El saldo a favor de su cuenta",
  );

  await page.goto("/caja/devoluciones");
  const list = page.getByRole("region", { name: "Devoluciones" });
  await expect(list).toContainText("D-000003");
  await expect(list).toContainText("Anulada");
  await expectAccessible(page, "lista de devoluciones");
  expect(await counts()).toEqual({ voids: 0, refunds: 3, refund_voids: 1 });
});

test("un viewer ve el cobro anulado, la devolución y la lista sin ninguna acción", async ({
  page,
}) => {
  const methods = await insertMethods();
  const saleId = await insertSale(1, "2000.00");
  const receiptId = await insertReceipt({
    number: 1,
    saleId,
    methodId: methods.transfer,
    sessionId: null,
    amount: "2000.00",
  });
  await voidSale(1, saleId);
  const refund = await db.execute<{ id: string }>(
    sql`insert into refunds (organization_id, number, target, sale_id, payment_method_id,
                             currency, amount, created_by)
        values (${SEED_ORGANIZATION_ID}, 1, 'sale', ${saleId}, ${methods.transfer}, 'ARS',
                '500.00', ${ADMIN_SEED.id})
        returning id`,
  );
  const refundId = refund.rows[0]!.id;
  await login(page, VIEWER);

  await page.goto(`/ventas/${saleId}`);
  await expect(
    page.getByRole("region", { name: "Devoluciones de la venta V-000001" }),
  ).toContainText("D-000001");
  await expect(
    page.getByRole("link", { name: "Devolver", exact: true }),
  ).toHaveCount(0);

  await page.goto(`/cobros/${receiptId}`);
  await expect(page.getByRole("link", { name: "Anular cobro" })).toHaveCount(0);
  await page.goto(`/devoluciones/${refundId}`);
  await expect(page.locator("[data-comprobante]")).toContainText(
    "Devolución D-000001",
  );
  await expect(
    page.getByRole("link", { name: "Anular devolución" }),
  ).toHaveCount(0);
  await expectAccessible(page, "devolución para un viewer");

  await page.goto(`/cobros/${receiptId}/anular`);
  await expect(
    page.getByText("Solo un administrador puede anular cobros."),
  ).toBeVisible();
  await page.goto(`/ventas/${saleId}/devolver`);
  await expect(
    page.getByText(
      "Solo un administrador puede registrar o anular devoluciones.",
    ),
  ).toBeVisible();
  await page.goto("/caja/devoluciones");
  await expect(
    page.getByRole("region", { name: "Devoluciones" }),
  ).toContainText("D-000001");
  expect(await counts()).toEqual({ voids: 0, refunds: 1, refund_voids: 0 });
});

// Sin JavaScript (brief-21.5, AC-9): la anulación y la devolución son formularios comunes, y el
// servidor vuelve al comprobante con el aviso.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin anula un cobro y registra una devolución", async ({
    page,
  }) => {
    const methods = await insertMethods();
    const saleId = await insertSale(1, "2000.00");
    const receiptId = await insertReceipt({
      number: 1,
      saleId,
      methodId: methods.transfer,
      sessionId: null,
      amount: "500.00",
    });
    const counter = await insertSale(2, "1000.00");
    await insertReceipt({
      number: 2,
      saleId: counter,
      methodId: methods.transfer,
      sessionId: null,
      amount: "1000.00",
    });
    await voidSale(1, counter);
    await login(page, ADMIN);

    await page.goto(`/cobros/${receiptId}/anular`);
    await page.getByRole("radio", { name: "Otro medio de pago" }).check();
    await page.getByRole("button", { name: "Sí, anular el cobro" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/cobros/${receiptId}\\?anulado=1`),
    );
    await expect(page.getByText("Cobro anulado.")).toBeVisible();

    await page.goto(`/ventas/${counter}/devolver`);
    await page.getByRole("radio", { name: "Transferencia" }).check();
    await page.getByRole("button", { name: "Registrar devolución" }).click();
    await expect(page).toHaveURL(/\/devoluciones\/[^/]+\?registrada=1$/);
    await expect(page.getByText("Devolución registrada.")).toBeVisible();
    expect(await counts()).toEqual({ voids: 1, refunds: 1, refund_voids: 0 });
  });
});
