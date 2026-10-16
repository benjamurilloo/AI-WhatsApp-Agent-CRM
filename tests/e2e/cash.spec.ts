import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Las pantallas de la caja y de los medios de pago de punta a punta (brief-21.2, AC-7): Chromium,
// next start, Server Actions, cash, numbering, audit y PostgreSQL real, sin mocks. Un admin crea la
// lista inicial, abre la caja, registra un aporte y un retiro, ve el rechazo de un retiro mayor que
// lo esperado, cierra con una diferencia e imprime el arqueo. Un viewer ve sin acciones.

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

// Las tablas de la caja y la auditoría son de solo inserción, y los medios de pago y el contador
// no se borran: TRUNCATE es la vía documentada para vaciarlas (ADR 0013). El contador se vacía para
// que cada caso empiece en C-000001.
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table supplier_payment_voids, supplier_payments, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts, cash_session_closings,
          cash_session_opening_amounts, cash_sessions, payment_methods, document_counters,
          audit_logs`,
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

test("un admin crea la lista inicial de medios de pago, abre la caja con el teclado y registra un aporte y un retiro", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/caja");
  await expect(page.getByText("La caja está cerrada.")).toBeVisible();
  await expectAccessible(page, "caja cerrada");

  // La lista inicial, desde su subpantalla.
  await page.getByRole("link", { name: "Medios de pago" }).click();
  await page.getByRole("button", { name: "Crear la lista inicial" }).click();
  await expect(page.getByText("Lista inicial creada.")).toBeVisible();
  const methods = page.getByRole("region", { name: "Medios de pago" });
  for (const name of [
    "Efectivo",
    "Transferencia",
    "Tarjeta de débito",
    "Tarjeta de crédito",
  ]) {
    await expect(methods).toContainText(name);
  }
  await expect(methods).not.toContainText("Mercado Pago");
  await expectAccessible(page, "medios de pago");

  // La apertura, con el teclado.
  await page.goto("/caja");
  await page.getByRole("link", { name: "Abrir caja" }).click();
  await page.getByLabel("Moneda 1").selectOption("ARS");
  await page.getByLabel("Efectivo inicial 1").fill("10000");
  // El monto se lee con los separadores de miles (recorrido de la 21.2).
  await expect(page.getByText(/Se lee: \$\s10\.000,00/)).toBeVisible();
  await expectAccessible(page, "apertura");
  await page.getByLabel("Efectivo inicial 1").press("Enter");
  await expect(page).toHaveURL(/\/caja\?aviso=abierta$/);
  await expect(page.getByText("Caja abierta.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Caja abierta · C-000001" }),
  ).toBeVisible();
});

// La sesión abierta con su inicial, por SQL: el caso de arriba la abre en la pantalla. Partido en
// dos en la 21.3, cuando el caso entero llegó a 25 s y una vez pasó el límite de 30 s por caso
// (lección de la 20.4).
async function insertSessionWithInitial() {
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${ADMIN_SEED.id}) returning id`,
  );
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${SEED_ORGANIZATION_ID}, ${session.rows[0]!.id}, 'ARS', '10000.00')`,
  );
}

test("un admin registra un aporte y un retiro con el teclado, y ve el rechazo de un retiro mayor que lo esperado", async ({
  page,
}) => {
  await insertSessionWithInitial();
  await login(page, ADMIN);
  await page.goto("/caja");

  // Un aporte: la moneda se propone porque la sesión tiene una sola.
  await page.getByRole("link", { name: "Registrar aporte" }).click();
  await expect(page.getByLabel("Moneda *")).toHaveValue("ARS");
  await page.getByLabel("Monto *").fill("500");
  await page.getByLabel("Cambio para la caja").check();
  await expectAccessible(page, "aporte");
  await page.getByRole("button", { name: "Registrar aporte" }).click();
  await expect(page.getByText("Aporte registrado.")).toBeVisible();

  // Un retiro mayor que lo esperado se rechaza y conserva lo escrito.
  await page.getByRole("link", { name: "Registrar retiro" }).click();
  await page.getByLabel("Monto *").fill("20000");
  await page.getByLabel("Depósito en el banco").check();
  await page.getByRole("button", { name: "Registrar retiro" }).click();
  await expect(
    page.getByText(/No alcanza: lo esperado en ARS es/),
  ).toBeFocused();
  await expect(page.getByLabel("Monto *")).toHaveValue("20000");
  await expect(page.getByText(/Se lee: \$\s20\.000,00/)).toBeVisible();
  await expectAccessible(page, "retiro rechazado");
  await page.getByLabel("Monto *").fill("3000");
  await page.getByLabel("Depósito en el banco").check();
  await page.getByRole("button", { name: "Registrar retiro" }).click();
  await expect(page.getByText("Retiro registrado.")).toBeVisible();

  const totals = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000001",
  });
  // 10.000 + 500 − 3.000.
  await expect(totals).toContainText("7.500,00");
  const movements = page.getByRole("region", {
    name: "Movimientos de la sesión C-000001",
  });
  await expect(movements).toContainText("Cambio para la caja");
  await expect(movements).toContainText("Depósito en el banco");
  await expectAccessible(page, "caja abierta");
});

// La sesión abierta, su inicial y sus movimientos, por SQL: el caso de arriba ya los hace en la
// pantalla. Separado para que ninguno de los dos se acerque al límite de 30 s por caso (lección de
// la 20.4). El cierre, su confirmación y el arqueo, no: se hacen en la pantalla.
async function insertOpenSession() {
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${ADMIN_SEED.id}) returning id`,
  );
  const sessionId = session.rows[0]!.id;
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${SEED_ORGANIZATION_ID}, ${sessionId}, 'ARS', '10000.00')`,
  );
  await db.execute(
    sql`insert into cash_movements (organization_id, session_id, kind, currency, amount, reason,
                                    created_by)
        values (${SEED_ORGANIZATION_ID}, ${sessionId}, 'contribution', 'ARS', '500.00',
                'change_fund', ${ADMIN_SEED.id}),
               (${SEED_ORGANIZATION_ID}, ${sessionId}, 'withdrawal', 'ARS', '3000.00',
                'bank_deposit', ${ADMIN_SEED.id})`,
  );
  return sessionId;
}

test("un admin cierra la caja con una diferencia, confirma con el teclado e imprime el arqueo", async ({
  page,
}) => {
  await insertOpenSession();
  await login(page, ADMIN);
  await page.goto("/caja");

  // El cierre, en dos pasos: lo contado y la diferencia antes de confirmar.
  await page.getByRole("link", { name: "Cerrar caja" }).click();
  await expect(page.getByLabel("Moneda 1")).toHaveValue("ARS");
  await expect(page.getByText(/Esperado: .*7\.500,00/)).toBeVisible();
  await page.getByLabel("Contado 1").fill("7400");
  await page.getByRole("button", { name: "Revisar el cierre" }).click();
  await expect(
    page.getByText("¿Cerrar la sesión C-000001 con este arqueo?"),
  ).toBeFocused();
  await expect(page.getByText(/Faltante de .*100,00/)).toBeVisible();
  await expectAccessible(page, "confirmación del cierre");
  await page.getByRole("button", { name: "Sí, cerrar la caja" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/caja\/sesiones\/[0-9a-f-]+\?aviso=cerrada$/);

  // El arqueo, que es el comprobante imprimible de la sesión cerrada.
  const arqueo = page.locator("[data-comprobante]");
  await expect(arqueo).toContainText("Arqueo de caja C-000001");
  await expect(arqueo).toContainText("7.400,00");
  await expect(arqueo).toContainText(/Faltante de .*100,00/);
  await expect(arqueo).toContainText(LEGEND);
  await expect(
    page.getByRole("table", { name: "Historia de la sesión C-000001" }),
  ).toContainText("Cierre");
  await expectAccessible(page, "arqueo");
  await page.emulateMedia({ media: "print" });
  await expect(arqueo).toBeVisible();
  for (const hidden of [
    page.getByRole("navigation", { name: "Principal" }),
    page.getByRole("button", { name: "Imprimir o guardar PDF" }),
    page.getByRole("table", { name: "Historia de la sesión C-000001" }),
  ]) {
    await expect(hidden).toBeHidden();
  }
  await page.emulateMedia({ media: null });

  // La sesión siguiente propone lo contado.
  await page.goto("/caja/abrir");
  await expect(page.getByLabel("Moneda 1")).toHaveValue("ARS");
  await expect(page.getByLabel("Efectivo inicial 1")).toHaveValue("7400.00");
  await page.goto("/caja/sesiones");
  await expect(
    page.getByRole("region", { name: "Sesiones de caja" }),
  ).toContainText(/ARS.*Faltante de/);
  await expectAccessible(page, "sesiones");
});

test("un viewer ve la caja, las sesiones y los medios sin ninguna acción", async ({
  page,
}) => {
  // Una sesión abierta y un medio, por SQL: el viewer solo mira.
  const session = await db.execute<{ id: string }>(
    sql`insert into cash_sessions (organization_id, number, opened_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${ADMIN_SEED.id}) returning id`,
  );
  await db.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${SEED_ORGANIZATION_ID}, ${session.rows[0]!.id}, 'ARS', '2500.00')`,
  );
  await db.execute(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Efectivo', true)`,
  );

  await login(page, VIEWER);
  await page.goto("/caja");
  await expect(
    page.getByRole("heading", { name: "Caja abierta · C-000001" }),
  ).toBeVisible();
  await expect(page.getByText("2.500,00").first()).toBeVisible();
  for (const name of ["Registrar aporte", "Registrar retiro", "Cerrar caja"]) {
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  }
  await expectAccessible(page, "caja del viewer");

  await page.goto("/caja/medios-de-pago");
  await expect(
    page.getByRole("region", { name: "Medios de pago" }),
  ).toContainText("Efectivo");
  await expect(
    page.getByRole("button", { name: "Crear medio de pago" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Desactivar/ })).toHaveCount(0);

  await page.goto("/caja/abrir");
  await expect(
    page.getByText("Solo un administrador puede operar la caja."),
  ).toBeVisible();
  await page.goto("/caja/cerrar");
  await expect(
    page.getByText("Solo un administrador puede operar la caja."),
  ).toBeVisible();
});

// Sin JavaScript (brief-21.2, AC-7; revisión independiente, R-3): la apertura y el cierre en dos
// pasos son formularios comunes, y el servidor devuelve cada paso.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin abre la caja y la cierra en dos pasos", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/caja/abrir");
    await page.getByLabel("Moneda 1").selectOption("ARS");
    await page.getByLabel("Efectivo inicial 1").fill("0");
    await page.getByRole("button", { name: "Abrir caja" }).click();
    await expect(page).toHaveURL(/\/caja\?aviso=abierta$/);
    await expect(
      page.getByRole("heading", { name: "Caja abierta · C-000001" }),
    ).toBeVisible();

    await page.goto("/caja/cerrar");
    await page.getByLabel("Contado 1").fill("5");
    await page.getByRole("button", { name: "Revisar el cierre" }).click();
    await expect(
      page.getByText("¿Cerrar la sesión C-000001 con este arqueo?"),
    ).toBeVisible();
    await expect(page.getByText(/Sobrante de .*5,00/)).toBeVisible();
    // Corregir vuelve a lo contado, con lo escrito.
    await page.getByRole("button", { name: "Corregir lo contado" }).click();
    await expect(page.getByLabel("Contado 1")).toHaveValue("5");
    await page.getByLabel("Contado 1").fill("0");
    await page.getByRole("button", { name: "Revisar el cierre" }).click();
    await expect(page.getByText("Sin diferencia")).toBeVisible();
    await page.getByRole("button", { name: "Sí, cerrar la caja" }).click();
    await expect(page).toHaveURL(
      /\/caja\/sesiones\/[0-9a-f-]+\?aviso=cerrada$/,
    );
    await expect(page.locator("[data-comprobante]")).toContainText(
      "Arqueo de caja C-000001",
    );
  });
});
