import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import {
  SEED_IPHONE_ORGANIZATION_ID,
  SEED_IPHONE_USERS,
  seedIphone,
} from "../../seeds/demo-iphone";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// La capacidad variants de punta a punta (brief-29.2, D-11): Chromium, next start, Server Actions,
// catalog, organizations y PostgreSQL real. La tienda de ejemplo con la capacidad la siembra esta
// spec y la borra al terminar: las demás borran toda organización que no sea la del seed básico, y
// sus claves foráneas lo impedirían.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const ADMIN_BASIC = SEED_USERS[0].email;
const NOT_FOUND_TITLE = "No encontramos esta página";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

// Vacía los productos y todo lo de la tienda de ejemplo; con keep, vuelve a sembrarla.
async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, inventories, product_images, product_costs, product_prices, attribute_values, stock_units, products`,
  );
  const iphone = SEED_IPHONE_ORGANIZATION_ID;
  await db.execute(
    sql`delete from attribute_options where organization_id = ${iphone}`,
  );
  await db.execute(
    sql`delete from attribute_definitions where organization_id = ${iphone}`,
  );
  await db.execute(
    sql`delete from product_models where organization_id = ${iphone}`,
  );
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${iphone}`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  const keepIds = sql.join(
    (keep ? SEEDED_USER_IDS : SEED_USERS.map((user) => user.id)).map(
      (id) => sql`${id}`,
    ),
    sql`, `,
  );
  await db.execute(
    sql`delete from organization_members where user_id not in (${keepIds})`,
  );
  await db.execute(sql`delete from users where id not in (${keepIds})`);
  await db.execute(
    keep
      ? sql`delete from organizations where id not in (${SEED_ORGANIZATION_ID}, ${iphone})`
      : sql`delete from organizations where id <> ${SEED_ORGANIZATION_ID}`,
  );
  await seedBasic(db, E2E_PASSWORD);
  if (keep) await seedIphone(db, E2E_PASSWORD);
}

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.beforeEach(async () => {
  await reset(true);
});

test.afterAll(async () => {
  await reset(false);
  await db.$client.end();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

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

test("un admin crea un modelo y una variante desde su ficha", async ({
  page,
}) => {
  // Un saldo para una de las dos variantes del iPhone 13: la tienda de ejemplo no trae
  // existencias, y sin esto «Disponibles» sería cero en todas las filas y la prueba no podría
  // distinguir el número real de un respaldo roto.
  await db.execute(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        select organization_id, id, '7.000' from products
        where organization_id = ${SEED_IPHONE_ORGANIZATION_ID}
          and sku = 'IP13-128-AZU-R'`,
  );
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/modelos");
  await expect(page.getByRole("heading", { name: "Modelos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "iPhone 13" })).toBeVisible();
  await expectAccessible(page, "lista de modelos");

  // La fila de la lámina 03: modelo, marca, variantes, disponibles y estado con ícono y texto
  // (brief-24.5.3, AC-1). Los dos números se afirman **exactos**: con «contiene disponibles»
  // alcanzaba una fila en cero, que es justo el modo de fallo del respaldo de la pantalla
  // (revisión independiente, F-4). El saldo lo siembra el test, porque la tienda de ejemplo no
  // trae existencias.
  const row = page
    .getByRole("table", { name: "Modelos de la organización" })
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: "iPhone 13" }) });
  await expect(row).toContainText("Apple");
  await expect(row).toContainText("2 variantes");
  await expect(row).toContainText("7 disponibles");
  await expect(row.getByText("Activo", { exact: true })).toBeVisible();

  // Y la ficha dice el mismo número que el listado: es lo que la lectura acotada por modelo tiene
  // que garantizar, y lo único que lo prueba es leerlo en las dos pantallas.
  await page.getByRole("link", { name: "iPhone 13" }).first().click();
  const resumen = page.getByRole("main");
  await expect(resumen).toContainText("variantes registradas");
  await expect(resumen).toContainText("disponibles");
  await expect(resumen.getByText("2", { exact: true }).first()).toBeVisible();
  await expect(resumen.getByText("7", { exact: true }).first()).toBeVisible();
  await page.goto("/modelos");

  // El alta vive en el panel lateral, que abre y cierra la URL (lámina 03).
  await page.getByRole("link", { name: "+ Nuevo modelo" }).click();
  await expect(page).toHaveURL(/nuevo=1/);
  const panel = page.getByRole("dialog", { name: "Nuevo modelo" });
  await expect(panel).toBeVisible();
  await expectAccessible(page, "panel de alta de modelo");
  await page.getByLabel("Nombre *").fill("iPhone 16");
  await page.getByLabel("Marca").fill("Apple");
  await page.getByRole("button", { name: "Crear modelo" }).click();
  await expect(page.getByText("Modelo creado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "iPhone 16", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Este modelo todavía no tiene productos."),
  ).toBeVisible();

  await page.getByRole("link", { name: "+ Nueva variante" }).click();
  await expect(page.getByLabel("Modelo", { exact: true })).toHaveValue(/.+/);
  await expectAccessible(page, "alta con modelo");
  await page.getByLabel("SKU *").fill("IP16-128-ULT-N");
  await page.getByLabel("Nombre *").fill("iPhone 16 128 GB Ultramarino");
  await page.getByLabel("Capacidad *").selectOption({ label: "128 GB" });
  await page.getByLabel("Color *").selectOption({ label: "Ultramarino" });
  await page.getByLabel("Trae caja").selectOption({ label: "Sí" });
  await page.getByRole("button", { name: "Crear producto" }).click();

  await expect(page.getByText("Producto creado.")).toBeVisible();
  await expect(page.getByRole("link", { name: "iPhone 16" })).toBeVisible();
  await expect(page.getByText("Ultramarino", { exact: true })).toBeVisible();

  await page.goto("/modelos");
  await page.getByRole("link", { name: "iPhone 16" }).click();
  await expect(
    page.getByRole("link", { name: "iPhone 16 128 GB Ultramarino" }),
  ).toBeVisible();
});

test("la misma variante activa se rechaza con el nombre del producto que choca", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/productos/nuevo");
  await page.getByLabel("SKU *").fill("OTRO-13");
  await page.getByLabel("Nombre *").fill("Otro iPhone 13");
  await page
    .getByLabel("Condición *")
    .selectOption({ label: "Reacondicionado" });
  await page
    .getByLabel("Modelo", { exact: true })
    .selectOption({ label: "iPhone 13" });
  await page.getByLabel("Capacidad *").selectOption({ label: "128 GB" });
  await page.getByLabel("Color *").selectOption({ label: "Medianoche" });
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(
    page.getByText(
      "Ya hay un producto activo de este modelo con la misma condición y la misma variante: «iPhone 13 128 GB Medianoche reacondicionado».",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Modelo", { exact: true })).toBeFocused();
  await expect(page.getByLabel("SKU *")).toHaveValue("OTRO-13");
});

test("la lista muestra la variante debajo del nombre y filtra por modelo", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/productos");
  await expect(
    page.getByText("iPhone 13 · 128 GB · Medianoche").first(),
  ).toBeVisible();
  await page
    .getByLabel("Modelo", { exact: true })
    .selectOption({ label: "iPhone 15" });
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/modelo=/);
  const table = page.getByRole("table", {
    name: "Productos de la organización",
  });
  await expect(table.getByText("iPhone 15 · 128 GB · Negro")).toBeVisible();
  await expect(table.getByText(/iPhone 13 ·/)).toHaveCount(0);
  await expectAccessible(page, "lista filtrada por modelo");
});

test("la lista se agrupa por modelo, en el orden que el admin les da", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  // Bajar «iPhone 13» deja primero a «iPhone 15» (revisión independiente, H-2).
  await page.goto("/modelos");
  const table = page.getByRole("table", { name: "Modelos de la organización" });
  await expect(table.getByRole("link").first()).toHaveText("iPhone 13");
  await expect(
    table.getByRole("button", { name: "Subir iPhone 13" }),
  ).toBeDisabled();
  await table.getByRole("button", { name: "Bajar iPhone 13" }).click();
  await expect(table.getByRole("link").first()).toHaveText("iPhone 15");

  // Agrupada (D-4): el nombre del modelo encabeza sus productos. Desde la 24.5.1 se elige con el
  // enlace «Por modelo», no con una casilla, y el encabezado lleva además sus sumas y «Ver modelo»
  // (brief-24.5.1, D-4 y AC-4).
  await page.goto("/productos");
  await page.getByRole("link", { name: "Por modelo" }).click();
  await expect(page).toHaveURL(/agrupar=modelo/);
  const products = page.getByRole("table", {
    name: "Productos de la organización",
  });
  const groups = products.locator("th[scope=colgroup]");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText("iPhone 15");
  await expect(groups.nth(1)).toContainText("iPhone 13");
  await expect(
    groups.nth(0).getByRole("link", { name: "Ver modelo" }),
  ).toBeVisible();
  await expectAccessible(page, "lista agrupada por modelo");

  // El catálogo agrupado a 320 px, con los grupos abiertos (brief-24.5.1, AC-12).
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  // A 320 px la tabla se reemplaza por las tarjetas, que son las que hay que medir.
  await expect(
    page.getByRole("list", { name: "Productos de la organización" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "desbordamiento horizontal del catálogo agrupado").toBe(0);
  await expectAccessible(page, "lista agrupada por modelo a 320 px");
});

test("los grupos del catálogo se cierran y se abren por enlace, y «Volver a productos» recupera el recorrido", async ({
  browser,
  page,
}) => {
  // AC-2, AC-4 y AC-10 del brief-24.5.1. El estado de los grupos y el recorrido de vuelta viven
  // los dos en la URL, así que lo que se prueba acá es que son enlaces de verdad; el último bloque
  // repite el cierre con JavaScript apagado.
  const model13 = "5eed0000-0000-4000-8210-000000000001";
  const model15 = "5eed0000-0000-4000-8210-000000000002";
  await login(page, ADMIN_IPHONE.email);

  const products = page.getByRole("table", {
    name: "Productos de la organización",
  });
  const groups = products.locator("th[scope=colgroup]");
  const row = (name: string) =>
    products.getByRole("row").filter({ hasText: name });
  const MEDIANOCHE = "iPhone 13 128 GB Medianoche reacondicionado";
  const NEGRO = "iPhone 15 128 GB Negro";

  await page.goto("/productos?agrupar=modelo");
  // Los grupos arrancan abiertos: sin `cerrado` en la URL, el chevron ofrece cerrar.
  await expect(groups.nth(0)).toContainText("iPhone 13");
  await expect(groups.nth(0)).toContainText("2 presentaciones");
  await expect(row(MEDIANOCHE)).toBeVisible();
  const close13 = page.getByRole("link", { name: "Cerrar el grupo iPhone 13" });
  await expect(close13).toHaveAttribute("aria-expanded", "true");

  await close13.click();
  await expect(page).toHaveURL(new RegExp(`cerrado=${model13}`));
  await expect(row(MEDIANOCHE)).toBeHidden();
  // Cerrar oculta filas, no información: el encabezado sigue diciendo cuánto hay en el grupo.
  await expect(groups.nth(0)).toContainText("2 presentaciones");
  await expect(row(NEGRO)).toBeVisible();

  const open13 = page.getByRole("link", { name: "Abrir el grupo iPhone 13" });
  await expect(open13).toHaveAttribute("aria-expanded", "false");
  await open13.click();
  await expect(page).not.toHaveURL(/cerrado=/);
  await expect(row(MEDIANOCHE)).toBeVisible();

  // AC-4: el chevron y «Ver modelo» son dos destinos distintos en el mismo encabezado.
  await groups.nth(0).getByRole("link", { name: "Ver modelo" }).click();
  await expect(page).toHaveURL(`/modelos/${model13}`);

  // AC-10: con un filtro puesto y un grupo cerrado, entrar a un producto y volver recupera las dos
  // cosas. El enlace del producto lleva el recorrido en `desde`.
  await page.goto(`/productos?agrupar=modelo&q=128+GB&cerrado=${model15}`);
  await expect(row(NEGRO)).toBeHidden();
  await row(MEDIANOCHE).getByRole("link", { name: MEDIANOCHE }).click();
  await expect(page).toHaveURL(/\?desde=/);
  await page.getByRole("link", { name: "Volver a productos" }).click();
  await expect(page).toHaveURL(/agrupar=modelo/);
  await expect(page).toHaveURL(new RegExp(`cerrado=${model15}`));
  await expect(page.getByLabel("Buscar", { exact: true })).toHaveValue(
    "128 GB",
  );
  await expect(row(NEGRO)).toBeHidden();

  // Sin `desde`, el mismo enlace vuelve al catálogo sin filtros.
  const direct = await db.execute<{ id: string }>(
    sql`select id from products where sku = 'IP13-128-MED-R'`,
  );
  await page.goto(`/productos/${direct.rows[0]!.id}`);
  await page.getByRole("link", { name: "Volver a productos" }).click();
  await expect(page).toHaveURL("/productos");

  // AC-12: en el teléfono, los dos destinos del encabezado se tocan con el dedo. A 375 px la tabla
  // se reemplaza por las tarjetas, así que hay que medir las de la lista y no las de la tabla, que
  // sigue en el árbol escondida.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/productos?agrupar=modelo");
  const cards = page.getByRole("list", {
    name: "Productos de la organización",
  });
  for (const [what, locator] of [
    [
      "el chevron del grupo",
      cards.getByRole("link", { name: /grupo iPhone 13/ }),
    ],
    ["«Ver modelo»", cards.getByRole("link", { name: "Ver modelo" }).first()],
  ] as const) {
    const box = await locator.boundingBox();
    expect(box, `caja de ${what}`).not.toBeNull();
    expect(box!.height, `alto de ${what}`).toBeGreaterThanOrEqual(44);
  }
  // El chevron es además cuadrado: un ícono solo necesita ancho propio, no el de su fila.
  const chevron = await cards
    .getByRole("link", { name: /grupo iPhone 13/ })
    .boundingBox();
  expect(chevron!.width, "ancho del chevron del grupo").toBeGreaterThanOrEqual(
    44,
  );
  await page.setViewportSize({ width: 1280, height: 800 });

  // Sin JavaScript: el chevron es un enlace, no un botón que esconda filas en el cliente.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  const noScript = await context.newPage();
  await noScript.goto("/productos?agrupar=modelo");
  const hidden = noScript
    .getByRole("table", { name: "Productos de la organización" })
    .getByRole("row")
    .filter({ hasText: MEDIANOCHE });
  await expect(hidden).toBeVisible();
  await noScript
    .getByRole("link", { name: "Cerrar el grupo iPhone 13" })
    .click();
  await expect(noScript).toHaveURL(new RegExp(`cerrado=${model13}`));
  await expect(hidden).toBeHidden();
  await context.close();
});

test("un admin agrega una opción a un atributo", async ({ page }) => {
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/modelos/atributos");
  await expectAccessible(page, "atributos");

  // El recuento de uso por valor (brief-24.5.3, D-6 y AC-5), con el caso 0 incluido: «Ultramarino»
  // no lo usa ninguna variante de la semilla y «Medianoche» sí.
  const colores = page.getByRole("list", { name: "Valores de Color" });
  await expect(
    colores.getByRole("listitem").filter({ hasText: "Ultramarino" }),
  ).toContainText("Ninguna variante lo usa");
  await expect(
    colores.getByRole("listitem").filter({ hasText: "Medianoche" }),
  ).toContainText("lo usa");
  // Y el aviso de los valores en uso (AC-6), que la pantalla dice antes de intentar nada.
  await expect(page.getByText("Los valores en uso no se quitan")).toBeVisible();

  // El alta en línea de la lámina 05: sin entrar en modo edición, y dentro de la tarjeta de Color,
  // porque cada atributo tiene la suya.
  const tarjeta = page.getByRole("region", { name: "Color" });
  await tarjeta.getByLabel("Nueva opción de Color").fill("Coral");
  await tarjeta.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Opción agregada.")).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Valores de Color" })
      .getByText("Coral", { exact: true }),
  ).toBeVisible();
});

test("un viewer ve modelos y atributos sin formularios", async ({ page }) => {
  await login(page, VIEWER_IPHONE.email);
  await page.goto("/modelos");
  await expect(page.getByRole("link", { name: "iPhone 13" })).toBeVisible();
  // Lo que hay que mirar es el **disparador** del panel, no el botón de adentro: con el rediseño
  // «Crear modelo» vive en el panel y el panel solo existe con ?nuevo=1, así que buscarlo acá era
  // cierto para cualquier rol (revisión independiente, F-3). Y se pide el panel a mano, que es lo
  // que haría alguien que escribe la URL.
  await expect(page.getByRole("link", { name: "+ Nuevo modelo" })).toHaveCount(
    0,
  );
  await page.goto("/modelos?nuevo=1");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crear modelo" })).toHaveCount(
    0,
  );
  await page.goto("/modelos");
  await page.getByRole("link", { name: "iPhone 13" }).click();
  await expect(
    page.getByRole("link", { name: "+ Nueva variante" }),
  ).toHaveCount(0);
  await page.goto("/modelos/atributos");
  await expect(
    page.getByRole("button", { name: "Crear atributo" }),
  ).toHaveCount(0);
});

test("sin la capacidad no hay «Modelos», la sección da 404 y el formulario no cambia", async ({
  page,
}) => {
  await login(page, ADMIN_BASIC);
  await expect(
    page.getByRole("link", { name: "Productos" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Modelos" })).toHaveCount(0);
  for (const path of ["/modelos", "/modelos/atributos"]) {
    await page.goto(path);
    await expect(page.getByText(NOT_FOUND_TITLE)).toBeVisible();
    // La 404 del marco: con el menú (D-3).
    await expect(
      page.getByRole("link", { name: "Productos" }).first(),
    ).toBeVisible();
  }
  // La mitad negativa de AC-1 (brief-24.5.1): sin la capacidad, el catálogo no ofrece la
  // alternativa y la lista queda como antes. Sin esto, quitar la condición del conmutador no
  // rompía ninguna prueba (N-6 de la revisión independiente del 2026-10-31).
  // La organización del seed básico no tiene productos, y un catálogo vacío no probaría nada: le
  // ponemos dos para que la lista exista y la ausencia del conmutador signifique algo.
  await db.execute(
    sql`insert into products (organization_id, sku, name, unit, reorder_point)
        values (${SEED_ORGANIZATION_ID}, 'SIN-CAP-1', 'Teclado', 'unidad', 1),
               (${SEED_ORGANIZATION_ID}, 'SIN-CAP-2', 'Mouse', 'unidad', 1)`,
  );
  await page.goto("/productos");
  const sinCapacidad = page.getByRole("table", {
    name: "Productos de la organización",
  });
  await expect(sinCapacidad.getByRole("row")).toHaveCount(1 + 2);
  await expect(
    page.getByRole("navigation", { name: "Vista del catálogo" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Por modelo" })).toHaveCount(0);
  // Y pedir el agrupado por la URL tampoco lo activa: la lista sale sin encabezados de grupo.
  await page.goto("/productos?agrupar=modelo");
  await expect(sinCapacidad.getByRole("row")).toHaveCount(1 + 2);
  await expect(sinCapacidad.locator("th[scope=colgroup]")).toHaveCount(0);

  await page.goto("/productos/nuevo");
  await expect(
    page.getByRole("heading", { name: "Nuevo producto" }),
  ).toBeVisible();
  await expect(page.getByText("Modelo y variante")).toHaveCount(0);
  await expect(page.getByLabel("Modelo", { exact: true })).toHaveCount(0);
});

test("la ficha del modelo en el teléfono", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN_IPHONE.email);
  await page.goto("/modelos");
  await page.getByRole("link", { name: "iPhone 15" }).first().click();
  await expect(
    page.getByRole("list", { name: "Variantes de iPhone 15" }),
  ).toBeVisible();
  await expectAccessible(page, "ficha del modelo a 375 px");
});

// Desbordamiento cero a 320 px en las pantallas que rediseñó la 24.5.3 (brief-24.5.3, AC-12). La
// medida sale del documento, no de la vista: `scrollWidth` mayor que `clientWidth` es exactamente
// la barra horizontal que no tiene que aparecer. Se mide también con el panel abierto, que es
// donde un ancho fijo se nota primero.
const anchoDesbordado = (page: Page) =>
  page.evaluate(() => {
    const raiz = document.documentElement;
    return raiz.scrollWidth - raiz.clientWidth;
  });

test("sin desbordamiento horizontal en modelos, su ficha y atributos, de 320 a 1440 px", async ({
  page,
}) => {
  await login(page, ADMIN_IPHONE.email);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/modelos");
  const ficha = await page
    .getByRole("link", { name: "iPhone 15" })
    .first()
    .getAttribute("href");
  const rutas = [
    "/modelos",
    "/modelos?nuevo=1",
    ficha!,
    `${ficha}?editar=1`,
    "/modelos/atributos",
  ];
  // 320 px es el piso del criterio; los otros cuatro son los anchos que pide §Mediciones del
  // brief (revisión independiente, F-8).
  for (const ancho of [320, 390, 640, 1082, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    for (const ruta of rutas) {
      await page.goto(ruta);
      await expect(page.getByRole("main")).toBeVisible();
      expect(
        await anchoDesbordado(page),
        `desbordamiento en ${ruta} a ${ancho} px`,
      ).toBe(0);
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/modelos/atributos");
  await expectAccessible(page, "atributos a 320 px");
  await page.goto("/modelos");
  await expectAccessible(page, "modelos a 320 px");
});
