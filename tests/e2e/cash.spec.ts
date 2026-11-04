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
    sql`truncate table trade_in_payment_voids, trade_in_payments, supplier_payment_voids, supplier_payments, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts, cash_session_closings,
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

  // La lista inicial, desde su subpantalla. **Desde la 24.7.1 vive en el menú «Más»** de la barra
  // de secciones (brief-24.7.1, D-3): se configura una vez, no es el trabajo del día. El menú es un
  // `<details>`, así que abre sin JavaScript.
  const barra = page.getByRole("navigation", { name: "Secciones de la caja" });
  // **El `<summary>` se busca por elemento, no por rol.** No es un botón en el árbol de
  // accesibilidad: «Más acciones» de las fichas sí lo es porque `MoreActions` dibuja un `<button>`
  // real cuando hay JavaScript, y el `<details>` es solo su reemplazo sin él. Acá el `<details>` es
  // la pieza, y ni él ni su resumen toman nombre accesible de rol alguno.
  const abrirMas = barra.locator("summary");
  const mas = barra.locator("details");
  await expect(
    barra.getByRole("link", { name: "Medios de pago" }),
  ).toBeHidden();
  await abrirMas.click();
  await mas.getByRole("link", { name: "Medios de pago" }).click();
  // **El menú no esconde la sección activa**: parado acá, «Medios de pago» subió a la barra, y como
  // esta organización no tiene moneda principal —sin ella no hay sección de cotización— el menú se
  // queda **sin nada que mostrar y no se dibuja**. Nunca hay que abrir un desplegable para saber
  // dónde estás, y un desplegable vacío no existe.
  await expect(
    barra.getByRole("link", { name: "Medios de pago" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(mas).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "C-000001" })).toBeVisible();
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

  // Desde la 24.7.1 se entra por un solo «Registrar movimiento» y el tipo se elige adentro
  // (brief-24.7.1, D-2). El aporte es el que se propone.
  await page.getByRole("link", { name: "Registrar movimiento" }).click();
  await expect(page.getByLabel("Moneda *")).toHaveValue("ARS");
  await page.getByLabel("Importe *").fill("500");
  await page
    .getByLabel("Motivo *")
    .selectOption({ label: "Cambio para la caja" });
  // **La revisión de la lámina 03**: sigue lo que se escribe, y es aritmética sobre lo esperado
  // que la sesión ya trae. 10.000 + 500.
  const revision = page.getByRole("region", {
    name: "Revisión del movimiento",
  });
  await expect(revision).toContainText(/Esperado después \(ARS\)/);
  await expect(revision).toContainText(/10\.500,00/);
  await expectAccessible(page, "aporte");
  await page.getByRole("button", { name: "Registrar aporte" }).click();
  await expect(page.getByText("Aporte registrado.")).toBeVisible();

  // Un retiro mayor que lo esperado se rechaza y conserva lo escrito. La revisión lo **anticipa**:
  // dice el rechazo en vez de dibujar un esperado negativo.
  await page.getByRole("link", { name: "Registrar movimiento" }).click();
  await page.getByRole("link", { name: "Retiro", exact: true }).click();
  await page.getByLabel("Importe *").fill("20000");
  await expect(revision).toContainText(/El retiro supera lo esperado en ARS/);
  await page
    .getByLabel("Motivo *")
    .selectOption({ label: "Depósito en el banco" });
  await page.getByRole("button", { name: "Registrar retiro" }).click();
  await expect(
    page.getByText(/No alcanza: lo esperado en ARS es/),
  ).toBeFocused();
  await expect(page.getByLabel("Importe *")).toHaveValue("20000");
  await expect(page.getByText(/Se lee: \$\s20\.000,00/)).toBeVisible();
  await expectAccessible(page, "retiro rechazado");
  await page.getByLabel("Importe *").fill("3000");
  await page
    .getByLabel("Motivo *")
    .selectOption({ label: "Depósito en el banco" });
  await page.getByRole("button", { name: "Registrar retiro" }).click();
  await expect(page.getByText("Retiro registrado.")).toBeVisible();

  const totals = page.getByRole("region", {
    name: "Totales por moneda de la sesión C-000001",
  });
  // 10.000 + 500 − 3.000.
  await expect(totals).toContainText("7.500,00");
  // Desde la 24.7.1 es **una sola lista** con todo lo que movió efectivo, no cinco tarjetas.
  const movements = page.getByRole("region", {
    name: "Movimientos de la sesión C-000001",
  });
  await expect(movements).toContainText("Aporte · Cambio para la caja");
  await expect(movements).toContainText("Retiro · Depósito en el banco");
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
  await page.getByRole("link", { name: "Preparar cierre" }).click();
  await expect(page.getByLabel("Moneda 1")).toHaveValue("ARS");
  await expect(page.getByText(/Esperado: .*7\.500,00/)).toBeVisible();
  // Desde la 24.7.1 los dos pasos se nombran (lámina 04).
  await expect(page.getByText("Paso 1 de 2: Conteo")).toBeVisible();
  await page.getByLabel("Contado 1").fill("7400");
  await page.getByRole("button", { name: "Revisar el cierre" }).click();
  await expect(
    page.getByText("¿Cerrar la sesión C-000001 con este arqueo?"),
  ).toBeFocused();
  await expect(page.getByText("Paso 2 de 2: Revisión")).toBeVisible();
  await expect(page.getByText(/Faltante de .*100,00/)).toBeVisible();
  // **Lo que hay que leer antes de confirmar**, a la derecha: lo contado de cada moneda y las tres
  // advertencias de la lámina, que son reglas que ya rigen dichas antes y no después.
  await expect(page.getByText("ARS contados")).toBeVisible();
  await expect(
    page.getByText(/la diferencia no se compensa entre monedas/),
  ).toBeVisible();
  for (const aviso of [
    /no se edita ni se reabre/,
    /El faltante no genera un retiro automático/,
    /hay que revisar otra vez/,
  ]) {
    await expect(page.getByText(aviso)).toBeVisible();
  }
  await expectAccessible(page, "confirmación del cierre");
  await page.getByRole("button", { name: "Cerrar caja" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/caja\/sesiones\/[0-9a-f-]+\?aviso=cerrada$/);

  // El arqueo, que es el comprobante imprimible de la sesión cerrada.
  const arqueo = page.locator("[data-comprobante]");
  await expect(arqueo).toContainText("Arqueo de caja C-000001");
  await expect(arqueo).toContainText("7.400,00");
  await expect(arqueo).toContainText(/Faltante de .*100,00/);
  // **Una sesión cerrada dice siempre que su arqueo es una foto** (lámina 05), no solo cuando ya
  // hubo una anulación posterior: sirve antes de que aparezca la primera.
  await expect(arqueo).toContainText("Valores guardados al cierre.");
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

  // **La sesión siguiente arranca vacía** (brief-24.7.1, D-6). Hasta esa subfase el campo venía
  // prellenado con lo contado al cerrar, y un campo prellenado con el conteo de ayer invita a
  // confirmar sin contar. El dato sigue a la vista, y «Usar estos valores» lo carga: es un enlace,
  // así que anda sin JavaScript.
  await page.goto("/caja/abrir");
  await expect(page.getByLabel("Moneda 1")).toHaveValue("ARS");
  await expect(page.getByLabel("Efectivo inicial 1")).toHaveValue("");
  await expect(
    page.getByText("Al cerrar la última sesión se contó"),
  ).toBeVisible();
  await expect(page.getByText(/7\.400,00/)).toBeVisible();
  await page.getByRole("link", { name: "Usar estos valores" }).click();
  await expect(page.getByLabel("Efectivo inicial 1")).toHaveValue("7400.00");
  await page.goto("/caja/sesiones");
  await expect(
    page.getByRole("heading", { name: "Sesiones de caja" }),
  ).toBeVisible();
  const sesiones = page.getByRole("region", { name: "Sesiones de caja" });
  await expect(sesiones).toContainText(/ARS.*Faltante de/);
  // Desde la 24.7.1 el estado es una insignia con nombre e ícono, no la palabra escondida en la
  // columna del cierre; y la columna «Diferencia» se queda, aunque la lámina la lleve a su panel.
  await expect(sesiones).toContainText("Cerrada");
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
  await expect(page.getByRole("heading", { name: "C-000001" })).toBeVisible();
  await expect(page.getByText("2.500,00").first()).toBeVisible();
  for (const name of ["Registrar movimiento", "Preparar cierre"]) {
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  }
  // **El aviso de D-1 se dibuja por el dato, no por el rol.** Esta sesión no tuvo ningún pago a
  // proveedor ni de usado, así que no hay nada oculto y la línea **no va**: afirmarla acá le diría
  // a un `viewer` que se le esconden movimientos que no existen. El estado en que sí corresponde
  // —un `viewer` con un pago a proveedor en la sesión— lo prueba `supplier-payments.spec.ts`.
  // La primera versión la dibujaba siempre; lo encontró la revisión independiente.
  await expect(
    page.getByText(/su detalle es solo para un administrador/),
  ).toHaveCount(0);
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

test("con cuarenta movimientos la tarjeta corta en diez y «Ver todos» los trae a todos", async ({
  page,
}) => {
  // **M-2, la parte que se puede medir desde afuera.** El brief pedía un fixture de al menos
  // cuarenta movimientos para que un `N+1` se notara. Con Next en otro proceso no se pueden contar
  // sentencias, así que lo que este caso demuestra es lo observable: que el corte de la tarjeta no
  // depende del volumen y que «Ver todos» los trae completos. Que no haya `N+1` está verificado por
  // camino de código —`unifiedMovements` no tiene un `await` adentro y los nombres salen de una
  // sola llamada—, y así está declarado en el §Cierre.
  const sessionId = await insertOpenSession();
  const filas = Array.from(
    { length: 40 },
    (_, i) =>
      sql`(${SEED_ORGANIZATION_ID}, ${sessionId}, 'contribution', 'ARS', ${`${i + 1}.00`},
         'other', ${ADMIN_SEED.id})`,
  );
  await db.execute(
    sql`insert into cash_movements (organization_id, session_id, kind, currency, amount, reason,
                                    created_by)
        values ${sql.join(filas, sql`, `)}`,
  );
  await login(page, ADMIN);
  await page.goto("/caja");
  const movimientos = page.getByRole("region", {
    name: "Movimientos de la sesión C-000001",
  });
  // Diez filas de datos más la de encabezados.
  await expect(movimientos.getByRole("row")).toHaveCount(11);
  await page.getByRole("link", { name: "Ver todos" }).click();
  // Los cuarenta nuevos más los dos del fixture.
  await expect(movimientos.getByRole("row")).toHaveCount(43);
  await expect(page.getByRole("link", { name: "Ver todos" })).toHaveCount(0);
  await expectAccessible(page, "caja con cuarenta movimientos");
});

const anchoDesbordado = (page: Page) =>
  page.evaluate(() => {
    const raiz = document.documentElement;
    return raiz.scrollWidth - raiz.clientWidth;
  });

test("brief-24.7.1: sin desbordamiento de 320 a 1440 px, y las dos vistas de la lámina 08", async ({
  page,
}) => {
  // AC-8. **Las seis pantallas** de la caja que la subfase tocó, en los cinco anchos del criterio.
  // **La tabla por moneda es la que más riesgo tenía**: hasta la 24.7.1 eran nueve columnas con
  // desplazamiento horizontal, y transponerla es justamente lo que la saca del borde.
  //
  // **La apertura se barre con la caja cerrada**, antes de abrirla: con una sesión abierta esa
  // pantalla dibuja un aviso y no el formulario, que es lo que hay que medir. La primera versión
  // la dejó afuera por eso y no lo dijo; lo encontró la revisión independiente.
  await login(page, ADMIN);
  for (const ancho of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto("/caja/abrir");
    expect(
      await anchoDesbordado(page),
      `la apertura a ${ancho} px`,
    ).toBeLessThanOrEqual(0);
  }
  const sessionId = await insertOpenSession();
  for (const ancho of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    for (const [ruta, nombre] of [
      ["/caja", "la caja"],
      ["/caja/movimiento", "el movimiento"],
      ["/caja/cerrar", "el cierre"],
      ["/caja/sesiones", "las sesiones"],
      [`/caja/sesiones/${sessionId}`, "el arqueo"],
    ] as const) {
      await page.goto(ruta);
      expect(
        await anchoDesbordado(page),
        `${nombre} a ${ancho} px`,
      ).toBeLessThanOrEqual(0);
    }
  }

  // **Las dos vistas son enlaces y la barra solo existe en pantalla chica** (D-4). En grande se ven
  // las dos cosas, así que elegir entre ellas no tendría sentido.
  const vistas = page.getByRole("navigation", { name: "Vistas de la caja" });
  const movimientos = page.getByRole("region", {
    name: "Movimientos de la sesión C-000001",
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/caja");
  await expect(vistas).toBeVisible();
  await expect(movimientos).toBeHidden();
  await page.getByRole("link", { name: "Movimientos" }).click();
  await expect(page).toHaveURL(/\/caja\?vista=movimientos$/);
  await expect(movimientos).toBeVisible();
  await expectAccessible(page, "caja en pantalla chica");
  // **«Ver todos» no puede esconder la lista que expande.** Sin llevar la vista, en un teléfono
  // parado en «Movimientos» caía en «Resumen», que oculta la tarjeta: la única acción de la
  // tarjeta quedaba inoperable justo en la pantalla chica que D-4 vino a resolver. Ningún caso la
  // ejercía; lo encontró la revisión independiente.
  await page.getByRole("link", { name: "Ver todos" }).click();
  await expect(page).toHaveURL(/vista=movimientos&movimientos=todos$/);
  await expect(movimientos).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver todos" })).toHaveCount(0);
  // Y volver al resumen conserva que estabas viendo todos.
  await page.getByRole("link", { name: "Resumen" }).click();
  await expect(page).toHaveURL(/\/caja\?movimientos=todos$/);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/caja");
  await expect(vistas).toBeHidden();
  await expect(movimientos).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "C-000001" })).toBeVisible();

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
    await page.getByRole("button", { name: "Cerrar caja" }).click();
    await expect(page).toHaveURL(
      /\/caja\/sesiones\/[0-9a-f-]+\?aviso=cerrada$/,
    );
    await expect(page.locator("[data-comprobante]")).toContainText(
      "Arqueo de caja C-000001",
    );
  });

  // **Las tres piezas que la 24.7.1 agregó** (AC-7). Ninguna es estado de cliente: el menú es un
  // `<details>`, las vistas y el tipo de movimiento son enlaces, y la decisión la toma el servidor.
  test("el menú de la barra, las vistas y el tipo de movimiento andan sin JavaScript", async ({
    page,
  }) => {
    await insertOpenSession();
    await login(page, ADMIN);

    // El menú «Más» abre sin JavaScript porque es un elemento del navegador, no un desplegable
    // dibujado a mano.
    await page.goto("/caja");
    const barra = page.getByRole("navigation", {
      name: "Secciones de la caja",
    });
    await expect(
      barra.getByRole("link", { name: "Medios de pago" }),
    ).toBeHidden();
    await barra.locator("summary").click();
    await expect(
      barra.getByRole("link", { name: "Medios de pago" }),
    ).toBeVisible();

    // Las dos vistas de la lámina 08.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/caja?vista=movimientos");
    await expect(
      page.getByRole("region", { name: "Movimientos de la sesión C-000001" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    // El tipo del movimiento: dos enlaces, y cada uno trae su propia lista de motivos, que es por
    // lo que no puede ser un conmutador de cliente.
    await page.goto("/caja/movimiento");
    await page.getByRole("link", { name: "Retiro", exact: true }).click();
    await expect(page).toHaveURL(/\/caja\/movimiento\?tipo=retiro$/);
    await page.getByLabel("Importe *").fill("100");
    await page
      .getByLabel("Motivo *")
      .selectOption({ label: "Depósito en el banco" });
    await page.getByRole("button", { name: "Registrar retiro" }).click();
    await expect(page.getByText("Retiro registrado.")).toBeVisible();
  });
});
