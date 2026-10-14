import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// El cobro de una venta de punta a punta (brief-21.3, AC-7): Chromium, next start, Server Actions,
// cash, sales, numbering, audit y PostgreSQL real, sin mocks. Un admin cobra una venta en dos partes
// y en dos medios hasta «Cobrada», ve el rechazo de un cobro de más, imprime el recibo, lo busca en
// «Cobros» y cierra la caja con el cobro en lo esperado. Un viewer ve sin acciones. Las ventas, los
// medios y la sesión se cargan por SQL: sus pantallas ya tienen sus propios casos.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const LEGEND = "Documento no válido como factura";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Los cobros, las ventas, la caja y la auditoría son de solo inserción, y los medios, los pedidos y
// el contador no se borran: TRUNCATE es la vía documentada para vaciarlas (ADR 0013). El contador
// se vacía para que cada caso empiece en V-000001, C-000001 y R-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table receipts, cash_movements, cash_session_closing_amounts,
          cash_session_closings, cash_session_opening_amounts, cash_sessions, payment_methods,
          sale_voids, sale_lines, sales, order_lines, orders, document_counters, audit_logs,
          inventory_movements, inventories, product_images, product_costs, product_prices,
          products, conversation_notes, messages, conversations, client_tag_assignments, clients`,
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

// La lista inicial de medios, como la crea su botón.
async function insertMethods() {
  const result = await db.execute<{ id: string; name: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Efectivo', true),
               (${SEED_ORGANIZATION_ID}, 'Transferencia', false),
               (${SEED_ORGANIZATION_ID}, 'Tarjeta de débito', false),
               (${SEED_ORGANIZATION_ID}, 'Tarjeta de crédito', false)
        returning id, name`,
  );
  return new Map(result.rows.map((row) => [row.name, row.id]));
}

// Una venta sin pedido de una línea, por SQL. Ninguna pantalla de estos casos emite una venta, así
// que el contador no hace falta.
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

async function insertOpenSession() {
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${ADMIN_SEED.id}) returning id`,
  );
  const sessionId = session.rows[0]!.id;
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${SEED_ORGANIZATION_ID}, ${sessionId}, 'ARS', '1000.00')`,
  );
  return sessionId;
}

// Un cobro por SQL: el primer caso ya los hace en la pantalla, y los casos que los cargan así no
// registran otro, así que el contador no hace falta.
async function insertReceipt(values: {
  number: number;
  saleId: string;
  methodId: string;
  sessionId: string | null;
  amount: string;
}) {
  await db.execute(
    sql`insert into receipts (organization_id, number, target, sale_id, client_id,
                              payment_method_id, session_id, currency, amount, created_by)
        select organization_id, ${values.number}, 'sale', id, client_id, ${values.methodId},
               ${values.sessionId}, currency, ${values.amount}, ${ADMIN_SEED.id}
        from sales where id = ${values.saleId}`,
  );
}

async function receiptCount() {
  const result = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from receipts`,
  );
  return result.rows[0]!.total;
}

test("un admin cobra una venta en dos partes y en dos medios con el teclado, ve el rechazo de un cobro de más e imprime el recibo", async ({
  page,
}) => {
  await insertMethods();
  await insertOpenSession();
  const saleId = await insertSale(1, "15000.00");
  await login(page, ADMIN);
  await page.goto(`/ventas/${saleId}`);
  await expect(page.getByText("Sin cobros.")).toBeVisible();
  await expectAccessible(page, "venta sin cobros");

  // El primer cobro, en efectivo, por una parte. El monto se propone en lo que falta.
  await page.getByRole("link", { name: "Registrar cobro" }).click();
  await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}/cobrar$`));
  const amount = page.getByLabel(/Monto en/);
  await expect(amount).toHaveValue("15000.00");
  const cash = page.getByRole("radio", { name: /Efectivo/ });
  await cash.focus();
  await cash.press("Space");
  await expect(cash).toBeChecked();
  await amount.fill("10000");
  await expect(page.getByText(/Se lee: \$\s10\.000,00/)).toBeVisible();
  await expectAccessible(page, "formulario del cobro");
  await amount.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
  await expect(page.getByText("Se registró el cobro")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "R-000001" }).first(),
  ).toBeVisible();

  // Un cobro de más se rechaza con lo que falta, y conserva lo escrito.
  await page.getByRole("link", { name: "Registrar cobro" }).click();
  await page.getByRole("radio", { name: "Transferencia" }).check();
  await amount.fill("6000");
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(
    page.getByText(/El cobro supera lo que falta: \$\s5\.000,00/),
  ).toBeFocused();
  await expect(amount).toHaveValue("6000");
  await expect(
    page.getByRole("radio", { name: "Transferencia" }),
  ).toBeChecked();
  await expectAccessible(page, "cobro rechazado");
  await amount.fill("5000");
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page.getByText("Se registró el cobro")).toBeVisible();

  // Cobrada: no ofrece otro cobro.
  await expect(page.getByText("Cobrada")).toBeVisible();
  await expect(page.getByRole("link", { name: "Registrar cobro" })).toHaveCount(
    0,
  );
  const receipts = page.getByRole("region", {
    name: "Cobros de la venta V-000001",
  });
  await expect(receipts).toContainText("Efectivo");
  await expect(receipts).toContainText("Transferencia");
  await expectAccessible(page, "venta cobrada");

  // El recibo imprimible.
  await receipts.getByRole("link", { name: "R-000001" }).click();
  const receipt = page.locator("[data-comprobante]");
  await expect(receipt).toContainText("Recibo R-000001");
  await expect(receipt).toContainText("Consumidor final");
  await expect(receipt).toContainText("V-000001");
  await expect(receipt).toContainText("Efectivo");
  await expect(receipt).toContainText("10.000,00");
  await expect(receipt).toContainText(LEGEND);
  await expect(
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
  ).toBeVisible();
  await expectAccessible(page, "recibo");
  expect(await receiptCount()).toBe(2);
});

test("un admin busca un recibo en «Cobros» y cierra la caja con el cobro en efectivo en lo esperado", async ({
  page,
}) => {
  const methods = await insertMethods();
  const sessionId = await insertOpenSession();
  const first = await insertSale(1, "3000.00");
  const second = await insertSale(2, "2000.00");
  await insertReceipt({
    number: 1,
    saleId: first,
    methodId: methods.get("Efectivo")!,
    sessionId,
    amount: "2500.00",
  });
  await insertReceipt({
    number: 2,
    saleId: second,
    methodId: methods.get("Transferencia")!,
    sessionId: null,
    amount: "2000.00",
  });
  await login(page, ADMIN);

  // La lista, con la búsqueda por número.
  await page.goto("/caja");
  await page.getByRole("link", { name: "Cobros", exact: true }).click();
  await expect(page).toHaveURL(/\/caja\/cobros$/);
  const list = page.getByRole("region", { name: "Cobros" });
  await expect(list).toContainText("R-000002");
  await expect(list).toContainText("R-000001");
  await expectAccessible(page, "lista de cobros");
  await page.getByLabel("Número").fill("2");
  await page.getByLabel("Número").press("Enter");
  await expect(page).toHaveURL(/\/caja\/cobros\?numero=2$/);
  await expect(list).toContainText("R-000002");
  await expect(list).not.toContainText("R-000001");
  await page.getByLabel("Número").fill("R-000099");
  await page.getByLabel("Número").press("Enter");
  await expect(
    page.getByText("Ningún cobro coincide con ese número."),
  ).toBeVisible();

  // La caja suma solo el cobro en efectivo: 1.000 + 2.500.
  await page.goto("/caja");
  const totals = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000001",
  });
  await expect(totals).toContainText("2.500,00");
  await expect(totals).toContainText("3.500,00");
  const sessionReceipts = page.getByRole("region", {
    name: "Cobros en efectivo de la sesión C-000001",
  });
  await expect(sessionReceipts).toContainText("R-000001");
  await expect(sessionReceipts).not.toContainText("R-000002");
  await expectAccessible(page, "caja con cobros");

  // El cierre, con lo esperado que incluye el cobro.
  await page.goto("/caja/cerrar");
  await page.getByLabel("Contado 1").fill("3500");
  await page.getByRole("button", { name: "Revisar el cierre" }).click();
  await expect(page.getByText("Sin diferencia")).toBeVisible();
  await page.getByRole("button", { name: "Sí, cerrar la caja" }).click();
  await expect(page).toHaveURL(/\/caja\/sesiones\/[0-9a-f-]+\?aviso=cerrada$/);
  const arqueo = page.locator("[data-comprobante]");
  await expect(arqueo).toContainText("Arqueo de caja C-000001");
  await expect(arqueo).toContainText("R-000001");
  await expectAccessible(page, "arqueo con cobros");
});

test("un viewer ve los cobros de una venta, el recibo y la lista sin ninguna acción", async ({
  page,
}) => {
  const methods = await insertMethods();
  const saleId = await insertSale(1, "3000.00");
  await insertReceipt({
    number: 1,
    saleId,
    methodId: methods.get("Transferencia")!,
    sessionId: null,
    amount: "1000.00",
  });
  await login(page, VIEWER);
  await page.goto(`/ventas/${saleId}`);
  await expect(
    page.getByRole("region", { name: "Cobros de la venta V-000001" }),
  ).toContainText("R-000001");
  await expect(page.getByRole("link", { name: "Registrar cobro" })).toHaveCount(
    0,
  );
  await expectAccessible(page, "venta para un viewer");

  await page.goto(`/ventas/${saleId}/cobrar`);
  await expect(
    page.getByText("Solo un administrador puede registrar cobros."),
  ).toBeVisible();

  await page.goto("/caja/cobros");
  await page.getByRole("link", { name: "R-000001" }).click();
  await expect(page.locator("[data-comprobante]")).toContainText(
    "Recibo R-000001",
  );
  await expectAccessible(page, "recibo para un viewer");
});

// Sin JavaScript (brief-21.3, AC-7): el cobro es un formulario común, y el servidor vuelve al detalle
// de la venta con el aviso.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin registra un cobro", async ({ page }) => {
    await insertMethods();
    const saleId = await insertSale(1, "3000.00");
    await login(page, ADMIN);
    await page.goto(`/ventas/${saleId}/cobrar`);
    await page.getByRole("radio", { name: "Transferencia" }).check();
    await page.getByLabel(/Monto en/).fill("1000");
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(page).toHaveURL(new RegExp(`/ventas/${saleId}\\?cobro=`));
    await expect(page.getByText("Se registró el cobro")).toBeVisible();
    expect(await receiptCount()).toBe(1);
  });
});
