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
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, cash_movements,
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
  await page.getByRole("link", { name: "Anular recibo" }).click();
  await expect(page).toHaveURL(new RegExp(`/cobros/${late}/anular$`));
  // AC-4: la forma de la tarjeta «¿Anular R-000183?» de la lámina 09 (D-4): la pregunta corta, los
  // tres datos, el motivo de su lista cerrada y los dos botones.
  await expect(
    page.getByText("¿Anular R-000002?", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/que sigue abierta/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Conservar recibo" }),
  ).toBeVisible();
  await expectAccessible(page, "anulación de un cobro");
  const reason = page.getByLabel("Motivo *");
  await reason.focus();
  await reason.selectOption({ label: "Otro monto" });
  await page.getByRole("button", { name: "Anular recibo" }).click();
  await expect(page).toHaveURL(new RegExp(`/cobros/${late}\\?anulado=1`));
  await expect(page.getByText("Cobro anulado.")).toBeVisible();
  await expect(page.locator("[data-comprobante]")).toContainText(
    "Anulado por AR-000001",
  );
  await expect(page.getByRole("link", { name: "Anular recibo" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "recibo anulado");

  await page.goto("/caja");
  const totals = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000002",
  });
  // Inicial 2.000 + cobros 500 − anulados 500: lo esperado vuelve a 2.000, y los cobros netos, a 0.
  //
  // **Anclado al concepto y no a «alguna celda en cero».** Con la tabla transpuesta de la 24.7.1
  // hay varias celdas en cero en cualquier sesión —Aportes, Retiros, Devoluciones—, así que
  // buscar «0,00» suelto pasaba aunque la anulación no hubiera restado nada. Lo encontró la
  // revisión independiente de la 24.7.1.
  const fila = (concepto: string) =>
    totals.getByRole("row").filter({ hasText: concepto });
  await expect(fila("Cobros en efectivo")).toContainText(/\$\s0,00/);
  await expect(fila("Esperado")).toContainText(/\$\s2\.000,00/);
  // Desde la 24.7.1 el cobro anulado se lee en la lista unificada de la caja, con su marca
  // (brief-24.7.1, D-1); su tarjeta propia quedó en la pantalla 26.
  await expect(
    page.getByRole("region", {
      name: "Movimientos de la sesión C-000002",
    }),
  ).toContainText("Anulado");

  // El cobro de la sesión cerrada: su arqueo no cambia y la muestra como posterior.
  await page.goto(`/cobros/${early}/anular`);
  await expect(page.getByText(/que ya se cerró/)).toBeVisible();
  await page
    .getByLabel("Motivo *")
    .selectOption({ label: "La plata no entró" });
  await page.getByRole("button", { name: "Anular recibo" }).click();
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

  // El dinero de la ficha vive en la pestaña «Cobros» desde la 24.6.2-b (D-4).
  await page.goto(`/ventas/${counter}?pestana=cobros`);
  await expect(page.getByText(/A devolver: \$\s2\.000,00/)).toBeVisible();
  await page.getByRole("link", { name: "Devolver", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/ventas/${counter}/devolver$`));
  const amount = page.getByLabel(/Importe en/);
  await expect(amount).toHaveValue("2000.00");
  // AC-6, la forma de la lámina 07 desde la entrada de la venta: el aviso de previsión, las dos
  // tarjetas de contexto —con el motivo de la anulación, que es lo único que H-5 tuvo que agregar
  // al `select`— y la revisión de importes.
  await expect(
    page.getByText("La devolución aún no se registró."),
  ).toBeVisible();
  const contexto = page.getByRole("region", {
    name: "La venta y su anulación",
  });
  await expect(contexto).toContainText("V-000001");
  await expect(contexto).toContainText("Anulada");
  await expect(contexto).toContainText("A-000001");
  await expect(contexto).toContainText("Error de carga");
  await expect(contexto).toContainText("Importe cobrado:");
  const revision = page.getByRole("complementary", {
    name: "Revisión de importes",
  });
  await expect(revision).toContainText("A devolver actual");
  await expect(revision).toContainText("Quedará por devolver");
  await expect(
    page.getByText("Confirmá que el dinero fue entregado."),
  ).toBeVisible();
  await expectAccessible(page, "formulario de la devolución");

  // AC-7: la revisión sigue lo que se escribe, y un importe de más **lo rechaza el servidor**.
  await page
    .getByLabel("Medio de pago *")
    .selectOption({ label: "Efectivo (sale de la caja)" });
  await amount.fill("2500");
  await expect(revision).toContainText("el registro lo rechaza");
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(
    page.getByText(/La devolución supera lo disponible: \$\s2\.000,00/),
  ).toBeFocused();
  await expect(amount).toHaveValue("2500");
  await expectAccessible(page, "devolución rechazada");

  // En efectivo, con el teclado.
  const cash = page.getByLabel("Medio de pago *");
  await cash.focus();
  await cash.selectOption({ label: "Efectivo (sale de la caja)" });
  await amount.fill("500");
  await expect(revision).toContainText("$ 1.500,00");
  await amount.press("Enter");
  await expect(page).toHaveURL(/\/devoluciones\/[^/]+\?registrada=1$/);
  await expect(page.getByText("Devolución registrada.")).toBeVisible();
  const comprobante = page.locator("[data-comprobante]");
  await expect(comprobante).toContainText("Devolución D-000001");
  await expect(comprobante).toContainText("Consumidor final");
  await expect(comprobante).toContainText("V-000001");
  await expectAccessible(page, "comprobante de la devolución");

  // La anulación de la devolución, y otra vez a devolver.
  // AC-4: la misma tarjeta, en la anulación de la devolución. `Screens.md` §36 dice que usa «la
  // confirmación de la pantalla 32»: son la misma pantalla con otro sustantivo.
  await page.getByRole("link", { name: "Anular devolución" }).click();
  await expect(
    page.getByText("¿Anular D-000001?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Conservar devolución" }),
  ).toBeVisible();
  await expectAccessible(page, "anulación de una devolución");
  await page
    .getByLabel("Motivo *")
    .selectOption({ label: "La plata no salió" });
  await page.getByRole("button", { name: "Anular devolución" }).click();
  await expect(page.getByText("Devolución anulada.")).toBeVisible();
  await expect(comprobante).toContainText("Anulada por AD-000001");
  // El dinero de la ficha vive en la pestaña «Cobros» desde la 24.6.2-b (D-4).
  await page.goto(`/ventas/${counter}?pestana=cobros`);
  await expect(page.getByText(/A devolver: \$\s2\.000,00/)).toBeVisible();
  await page.getByRole("link", { name: "Devolver", exact: true }).click();
  await page
    .getByLabel("Medio de pago *")
    .selectOption({ label: "Transferencia" });
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(page.getByText("Devolución registrada.")).toBeVisible();
  // El dinero de la ficha vive en la pestaña «Cobros» desde la 24.6.2-b (D-4).
  await page.goto(`/ventas/${counter}?pestana=cobros`);
  await expect(
    page.getByText(/Devuelto: \$\s2\.000,00\. A devolver: \$\s0,00\./),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Devolver", exact: true }),
  ).toHaveCount(0);

  // El saldo a favor de un cliente: lo cobrado de su venta anulada pasó a su cuenta.
  // El dinero de la ficha vive en la pestaña «Cobros» desde la 24.6.2-b (D-4).
  await page.goto(`/ventas/${withClient}?pestana=cobros`);
  await page.getByRole("link", { name: "Devolver saldo a favor" }).click();
  await expect(page).toHaveURL(new RegExp(`/clientes/${clientId}/devolver$`));
  await expect(
    page.getByText(/Lucía Gómez tiene a favor \$\s1\.500,00/),
  ).toBeVisible();
  // **AC-6: la otra entrada del mismo formulario tiene la misma forma.** Es lo que la 24.7.2 no
  // hizo con su lámina 02, y le costó su hallazgo bloqueante B-1.
  await expect(
    page.getByText("La devolución aún no se registró."),
  ).toBeVisible();
  const revisionCuenta = page.getByRole("complementary", {
    name: "Revisión de importes",
  });
  await expect(revisionCuenta).toContainText("A favor actual");
  await expect(revisionCuenta).toContainText("Quedará a favor");
  await expect(page.getByLabel(/Importe en/)).toBeVisible();
  await expect(
    page.getByText("Confirmá que el dinero fue entregado."),
  ).toBeVisible();
  await expectAccessible(page, "devolución desde la cuenta");
  await page
    .getByLabel("Medio de pago *")
    .selectOption({ label: "Transferencia" });
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(page.getByText("Devolución registrada.")).toBeVisible();
  await expect(page.locator("[data-comprobante]")).toContainText(
    "El saldo a favor de su cuenta",
  );

  await page.goto("/caja/devoluciones");
  const list = page.getByRole("region", { name: "Devoluciones" });
  await expect(list).toContainText("D-000003");
  await expect(list).toContainText("Anulada");
  await expect(list).toContainText("Vigente");
  for (const header of [
    "Número D",
    "Cliente",
    "Desde",
    "Medio",
    "Importe",
    "Estado",
  ]) {
    await expect(
      list.getByRole("columnheader", { name: header, exact: true }),
    ).toBeVisible();
  }
  await expectAccessible(page, "lista de devoluciones");
  // AC-2: el filtro por cliente deja **solo** las devoluciones de ese cliente. El `<select>` trae
  // los que tienen devoluciones, no todos los de la organización.
  const cliente = page.getByLabel("Cliente");
  await expect(cliente.locator("option")).toHaveCount(2);
  await cliente.selectOption({ label: "Lucía Gómez" });
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(list).toContainText("D-000003");
  await expect(list).not.toContainText("D-000002");
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

  // El dinero de la ficha vive en la pestaña «Cobros» desde la 24.6.2-b (D-4).
  await page.goto(`/ventas/${saleId}?pestana=cobros`);
  await expect(
    page.getByRole("region", { name: "Devoluciones de la venta V-000001" }),
  ).toContainText("D-000001");
  await expect(
    page.getByRole("link", { name: "Devolver", exact: true }),
  ).toHaveCount(0);

  await page.goto(`/cobros/${receiptId}`);
  await expect(page.getByRole("link", { name: "Anular recibo" })).toHaveCount(
    0,
  );
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

    // AC-9: el filtro y el panel **también andan sin JavaScript**, porque son un formulario GET
    // y un parámetro de la URL. El panel de la lámina no es un diálogo que abre un script.
    await page.goto("/caja/cobros");
    await page.getByRole("link", { name: "R-000001" }).click();
    await expect(
      page.getByRole("complementary", { name: "Recibo R-000001" }),
    ).toBeVisible();
    await page
      .getByRole("complementary", { name: "Recibo R-000001" })
      .getByRole("link", { name: "Cerrar el recibo" })
      .click();
    await expect(
      page.getByRole("complementary", { name: /^Recibo/ }),
    ).toHaveCount(0);
    await page.getByLabel("Número R").fill("2");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/numero=2/);
    await expect(
      page.getByRole("region", { name: "Cobros" }),
    ).not.toContainText("R-000001");

    await page.goto(`/cobros/${receiptId}/anular`);
    await page
      .getByLabel("Motivo *")
      .selectOption({ label: "Otro medio de pago" });
    await page.getByRole("button", { name: "Anular recibo" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/cobros/${receiptId}\\?anulado=1`),
    );
    await expect(page.getByText("Cobro anulado.")).toBeVisible();

    await page.goto(`/ventas/${counter}/devolver`);
    // Sin JavaScript la revisión **no sigue lo que se escribe**, y muestra lo propuesto: es
    // inherente al no-JavaScript y está declarado (H-4), no es un defecto que apareció al final.
    await expect(
      page.getByRole("complementary", { name: "Revisión de importes" }),
    ).toContainText("A devolver actual");
    await page
      .getByLabel("Medio de pago *")
      .selectOption({ label: "Transferencia" });
    await page.getByRole("button", { name: "Registrar devolución" }).click();
    await expect(page).toHaveURL(/\/devoluciones\/[^/]+\?registrada=1$/);
    await expect(page.getByText("Devolución registrada.")).toBeVisible();
    expect(await counts()).toEqual({ voids: 1, refunds: 1, refund_voids: 0 });
  });
});

// AC-10, la otra mitad: el barrido de anchos de las pantallas de devolución. Va acá y no en
// `receipts.spec.ts` porque este archivo ya sabe dejar una venta anulada con algo a devolver y un
// cliente con saldo a favor, que es lo que hace falta para que las pantallas **tengan datos**. Un
// `<select>` vacío no mide nada, y una pantalla bloqueada tampoco dibuja el formulario.
const anchoDesbordado = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth - document.body.clientWidth,
  );

test("sin desbordamiento horizontal de 320 a 1440 px en las devoluciones y en «Registrar devolución»", async ({
  page,
}) => {
  test.slow();
  const methods = await insertMethods();
  // Una venta sin cliente anulada y cobrada: deja algo a devolver sobre la venta.
  const counter = await insertSale(1, "2000.00");
  await insertReceipt({
    number: 1,
    saleId: counter,
    methodId: methods.transfer,
    sessionId: null,
    amount: "2000.00",
  });
  await voidSale(1, counter);
  // Un cliente con una venta anulada cobrada: deja saldo a favor en su cuenta, con un nombre largo
  // para que el `<select>` del filtro se mida con su peor opción.
  const clientId = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID},
                'María Fernanda Etcheverría Villanueva de la Torre',
                '+5491155550009')
        returning id`,
  );
  const largo = clientId.rows[0]!.id;
  const withClient = await insertSale(2, "1500.00", largo);
  await insertReceipt({
    number: 2,
    saleId: withClient,
    methodId: methods.transfer,
    sessionId: null,
    amount: "1500.00",
  });
  await voidSale(2, withClient);
  // Y una devolución ya registrada, para que el listado tenga filas, su filtro tenga opciones y
  // exista una anulación que dibujar.
  const refund = await db.execute<{ id: string }>(
    sql`insert into refunds (organization_id, number, target, client_id, payment_method_id,
                             currency, amount, created_by)
        values (${SEED_ORGANIZATION_ID}, 1, 'account', ${largo}, ${methods.transfer}, 'ARS',
                '500.00', ${ADMIN_SEED.id})
        returning id`,
  );
  const refundId = refund.rows[0]!.id;
  await login(page, ADMIN);

  for (const width of [320, 390, 640, 1082, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const ruta of [
      "/caja/devoluciones",
      `/devoluciones/${refundId}/anular`,
      `/ventas/${counter}/devolver`,
      `/clientes/${largo}/devolver`,
    ]) {
      await page.goto(ruta);
      expect(
        await anchoDesbordado(page),
        `${ruta} desborda a ${width} px`,
      ).toBeLessThanOrEqual(0);
    }
  }

  // Y el `<select>` del filtro de Devoluciones, poblado, entra a 320 px: es la misma medición que
  // M-2 hace en Cobros, sobre el otro listado.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/caja/devoluciones");
  const ancho = await page
    .getByLabel("Cliente")
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(
    ancho,
    "el select de clientes de Devoluciones no entra a 320 px",
  ).toBeLessThanOrEqual(320);
});
