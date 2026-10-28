import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Response } from "@playwright/test";
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

// La búsqueda global de punta a punta (brief-23.3, AC-1 a AC-7): Chromium, next start, la Server
// Action, las lecturas de crm, orders, catalog, sales y purchasing, y PostgreSQL real, sin mocks.
// Un admin encuentra los seis tipos con el teclado y llega a cada ficha; Enter abre /buscar; sin
// JavaScript el formulario funciona; un viewer no recibe el teléfono de un cliente ni ve compras ni
// proveedores; a 375 px se busca desde la lupa; axe sin violaciones.
//
// Desde la 24.2 (brief-24.2), la búsqueda vive en un diálogo: se abre con el botón de la barra, la
// lupa o Ctrl/Cmd+K, el foco queda adentro y vuelve al cerrar, y suma las reparaciones y los turnos de
// los clientes encontrados, en la tienda de ejemplo con repairs y appointments.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const PHONE = "+5491177778899";
// El número guardado, entero o sin los últimos 4 dígitos. La búsqueda se escribe con separadores,
// que la página devuelve en el campo: eso es lo que se tipeó, no una fuga (como clients.spec.ts).
const HIDDEN_FRAGMENTS = ["5491177778899", "549117777"];
const TYPED_PHONE = "+54 9 11 7777-8899";
const SUPPLIER = "Distribuidora Norte";
const CUIT = "30712345674";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

// Los demás specs borran organizaciones: no pueden quedar filas que lo impidan.
test.afterAll(async () => {
  await truncate();
  await db.$client.end();
});

// Las tablas de solo inserción y los contadores se vacían con TRUNCATE, la vía documentada (ADR 0013).
async function truncate() {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids,
          goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers,
          document_counters, audit_logs, refund_voids, refunds, receipt_voids, receipts,
          sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, conversation_notes, messages,
          conversations, client_tag_assignments, clients, inventory_movements, inventories,
          product_images, product_costs, product_prices, attribute_values, stock_units, products`,
  );
}

let ids: {
  client: string;
  order: string;
  product: string;
  sale: string;
  purchaseOrder: string;
  supplier: string;
};

test.beforeEach(async () => {
  await truncate();
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  await seedBasic(db, E2E_PASSWORD);
  ids = await insertFixtures();
});

async function insertFixtures() {
  const one = async (query: ReturnType<typeof sql>) =>
    (await db.execute<{ id: string }>(query)).rows[0]!.id;
  const client = await one(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, 'Ana Pérez', ${PHONE}) returning id`,
  );
  const product = await one(
    sql`insert into products (organization_id, sku, name)
        values (${SEED_ORGANIZATION_ID}, 'CAF-250', 'Café molido') returning id`,
  );
  // El pedido, la venta y la orden de compra llevan el mismo número, 123 (H-1b).
  const order = await one(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, 123, ${client}, 'ARS', '100.00', ${ADMIN_SEED.id})
        returning id`,
  );
  await db.execute(
    sql`insert into order_lines (organization_id, order_id, product_id, position, quantity,
                                 unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${order}, ${product}, 1, '1', '100.00', 'ARS', '100.00')`,
  );
  const sale = await one(
    sql`insert into sales (organization_id, number, order_id, client_id, currency, total,
                           created_by)
        values (${SEED_ORGANIZATION_ID}, 123, null, null, 'ARS', '100.00', ${ADMIN_SEED.id})
        returning id`,
  );
  await db.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${SEED_ORGANIZATION_ID}, ${sale}, ${product}, 1, '1', '100.00', 'ARS', '100.00')`,
  );
  await db.execute(
    sql`insert into sale_voids (organization_id, number, sale_id, currency, total, reason,
                                created_by)
        values (${SEED_ORGANIZATION_ID}, 7, ${sale}, 'ARS', '100.00', 'data_entry_error',
                ${ADMIN_SEED.id})`,
  );
  const supplier = await one(
    sql`insert into suppliers (organization_id, name, cuit)
        values (${SEED_ORGANIZATION_ID}, ${SUPPLIER}, ${CUIT}) returning id`,
  );
  const purchaseOrder = await one(
    sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                     created_by)
        values (${SEED_ORGANIZATION_ID}, 123, ${supplier}, 'ARS', '100.00', ${ADMIN_SEED.id})
        returning id`,
  );
  await db.execute(
    sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                          position, quantity, unit_cost, line_total)
        values (${SEED_ORGANIZATION_ID}, ${purchaseOrder}, ${product}, 1, 1, '100.00', '100.00')`,
  );
  return { client, order, product, sale, purchaseOrder, supplier };
}

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

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Buscar en el sistema" });

const searchField = (page: Page) =>
  dialog(page).getByRole("combobox", { name: "Buscar en el sistema" });

// El botón de la barra, desde 1024 px (brief-24.2, D-1).
const barTrigger = (page: Page) =>
  page.getByRole("button", { name: "Buscar en el sistema…" });

// Abre el diálogo con el botón de la barra, si no está abierto.
async function openSearch(page: Page) {
  if (await dialog(page).isVisible()) return;
  await barTrigger(page).click();
  await expect(searchField(page)).toBeFocused();
}

const suggestions = (page: Page) =>
  page.getByRole("listbox", { name: "Sugerencias" });

// Escribe en el campo de la barra, como una persona, y espera la lista.
async function type(page: Page, text: string) {
  await openSearch(page);
  const field = searchField(page);
  await field.fill("");
  await field.pressSequentially(text);
  await expect(suggestions(page)).toBeVisible();
}

// Baja con las flechas hasta la primera opción y la elige con Enter.
async function chooseFirst(page: Page) {
  await searchField(page).press("ArrowDown");
  await searchField(page).press("Enter");
}

test("brief-23.3: un admin encuentra los seis tipos con el teclado y llega a cada ficha", async ({
  page,
}) => {
  await login(page, ADMIN);

  // Un cliente por el comienzo del nombre.
  await type(page, "Ana");
  const clients = suggestions(page).getByRole("group", { name: "Clientes" });
  await expect(clients.getByRole("option")).toHaveText([/^Ana Pérez/]);
  await expect(
    clients.getByRole("option", { name: "Ana Pérez, cliente" }),
  ).toBeVisible();
  await chooseFirst(page);
  await expect(page).toHaveURL(`/clientes/${ids.client}`);

  // Un número sin prefijo es de tres tipos, cada uno en su grupo (H-1b).
  await type(page, "123");
  await expect(suggestions(page).getByRole("group")).toHaveText([
    /^Pedidos/,
    /^Ventas/,
    /^Compras/,
  ]);
  await expect(
    suggestions(page).getByRole("option", { name: /^P-000123, pedido/ }),
  ).toContainText("Ana Pérez · Pendiente");
  await expect(
    suggestions(page).getByRole("option", { name: /^V-000123, venta/ }),
  ).toContainText("Consumidor final · Anulada (A-000007)");
  await expect(
    suggestions(page).getByRole("option", {
      name: /^OC-000123, orden de compra/,
    }),
  ).toContainText(`${SUPPLIER} · Abierta`);

  // Con el prefijo, uno solo; y cada ficha.
  for (const [text, href] of [
    ["P-000123", `/pedidos/${ids.order}`],
    ["p123", `/pedidos/${ids.order}`],
    ["V-123", `/ventas/${ids.sale}`],
    ["A-000007", `/ventas/${ids.sale}`],
    ["OC-123", `/compras/ordenes/${ids.purchaseOrder}`],
    ["CAF-250", `/productos/${ids.product}`],
    ["norte", `/compras/proveedores/${ids.supplier}`],
    ["30-71234567-4", `/compras/proveedores/${ids.supplier}`],
  ] as const) {
    await type(page, text);
    await expect(suggestions(page).getByRole("option")).toHaveCount(1);
    await chooseFirst(page);
    await expect(page).toHaveURL(href);
  }
});

test("brief-23.3: Enter abre /buscar con los grupos, y «Ver todas» lleva a la lista con la búsqueda", async ({
  page,
}) => {
  await login(page, ADMIN);
  await type(page, "123");
  await searchField(page).press("Enter");
  await expect(page).toHaveURL("/buscar?q=123");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 2 })).toHaveText([
    "Pedidos",
    "Ventas",
    "Compras",
  ]);
  await expect(
    main.getByRole("region", { name: "Pedidos" }).getByRole("link", {
      name: "P-000123",
    }),
  ).toHaveAttribute("href", `/pedidos/${ids.order}`);
  await expectAccessible(page, "/buscar con resultados");

  await main.getByRole("link", { name: "Ver todas en Ventas" }).click();
  await expect(page).toHaveURL("/ventas?numero=123");
  await expect(
    page.getByRole("main").getByRole("link", { name: "V-000123" }).first(),
  ).toBeVisible();

  // Sin resultados: el vacío de la 23.2.
  await page.goto("/buscar?q=zzz");
  await expect(page.getByText("No encontramos nada para «zzz».")).toBeVisible();
  await expectAccessible(page, "/buscar sin resultados");
});

test("brief-23.3: la lista abierta no tiene violaciones de axe", async ({
  page,
}) => {
  await login(page, ADMIN);
  await type(page, "123");
  await searchField(page).press("ArrowDown");
  await expect(searchField(page)).toHaveAttribute(
    "aria-activedescendant",
    /.+/,
  );
  await expectAccessible(page, "la lista abierta con tres grupos");
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("brief-24.2 (AC-7): el botón de la barra lleva a /buscar, que tiene su formulario", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.getByRole("link", { name: "Buscar en el sistema…" }).click();
    await expect(page).toHaveURL("/buscar");
    const field = page.getByRole("main").getByRole("searchbox", {
      name: "Buscar en el sistema",
    });
    await field.fill("Ana");
    await field.press("Enter");
    await expect(page).toHaveURL("/buscar?q=Ana");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Ana Pérez" }),
    ).toHaveAttribute("href", `/clientes/${ids.client}`);
  });
});

test("brief-24.2 (AC-6): a 375 px, la lupa abre el diálogo a pantalla completa, y Enter lleva a /buscar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN);
  await expect(barTrigger(page)).toBeHidden();
  const lupa = page.getByRole("button", {
    name: "Buscar en el sistema",
    exact: true,
  });
  await lupa.click();
  await expect(searchField(page)).toBeFocused();
  const box = await dialog(page).boundingBox();
  expect(box!.x).toBe(0);
  expect(box!.width).toBe(375);
  expect(box!.height).toBe(800);
  await searchField(page).pressSequentially("123");
  await expect(suggestions(page)).toBeVisible();
  await expectAccessible(page, "diálogo a 375 px con resultados");
  await expect(
    dialog(page).evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).resolves.toBe(true);
  await searchField(page).press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(lupa).toBeFocused();

  // La página de resultados sigue siendo el respaldo, también en el teléfono.
  await page.goto("/buscar");
  const field = page.getByRole("main").getByRole("searchbox", {
    name: "Buscar en el sistema",
  });
  await expect(field).toBeFocused();
  await field.fill("123");
  await field.press("Enter");
  await expect(page).toHaveURL("/buscar?q=123");
  await expect(
    page.getByRole("main").getByRole("link", { name: "OC-000123" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectAccessible(page, "/buscar a 375 px");
});

// Todo lo que el servidor manda a quien busca: documentos, datos de RSC y las respuestas de la Server
// Action. `pages` se abre en /buscar y `typed` se escribe en el diálogo.
async function collectBodies(
  page: Page,
  email: string,
  pages: string[],
  typed: string[],
) {
  const bodies: string[] = [];
  let pending: Promise<void>[] = [];
  // Solo lo que trae resultados de la búsqueda: el documento de /buscar, con su RSC en línea, y las
  // respuestas POST de la Server Action. Los prefetch de los enlaces piden otras pantallas, que
  // cuidan sus propios specs, y uno cortado por la navegación siguiente deja su lectura colgada.
  const listener = (response: Response) => {
    if (!response.url().startsWith("http://localhost")) return;
    const request = response.request();
    if (request.resourceType() !== "document" && request.method() !== "POST")
      return;
    pending.push(
      response
        .text()
        .then((text) => void bodies.push(text))
        .catch(() => undefined),
    );
  };
  const drain = async () => {
    await page.waitForLoadState("networkidle");
    await Promise.all(pending);
    pending = [];
  };
  await login(page, email);
  page.on("response", listener);
  for (const text of pages) {
    const route = `/buscar?${new URLSearchParams({ q: text })}`;
    await page.goto(route);
    await drain();
    bodies.push(await page.content());
  }
  // Las sugerencias: se espera la respuesta de la Server Action, porque una búsqueda sin
  // resultados no abre la lista.
  for (const text of typed) {
    await openSearch(page);
    const answered = page.waitForResponse(
      (response) => response.request().method() === "POST",
    );
    await searchField(page).fill("");
    await searchField(page).pressSequentially(text);
    await answered;
    await drain();
  }
  page.off("response", listener);
  await page.context().clearCookies();
  return bodies.join("\n");
}

test("brief-23.3 (AC-4): un viewer no recibe el teléfono de un cliente ni ve compras ni proveedores", async ({
  page,
}) => {
  // Dos roles, ocho búsquedas cada uno: el triple del tiempo de un caso.
  test.slow();
  const collect = (email: string) =>
    collectBodies(
      page,
      email,
      [TYPED_PHONE, "123", "Norte", CUIT],
      ["123", "Norte", "30-71234567-4", "Ana"],
    );

  const viewer = await collect(VIEWER);
  for (const fragment of [...HIDDEN_FRAGMENTS, SUPPLIER, "OC-000123"]) {
    expect(viewer).not.toContain(fragment);
  }
  // Busca lo suyo: el cliente por el teléfono entero (H-7, riesgo aceptado), solo con su nombre, y
  // el pedido y la venta por número.
  expect(viewer).toContain("Ana Pérez");
  expect(viewer).toContain("P-000123");
  expect(viewer).toContain("V-000123");

  // Control: con admin, el mismo recorrido sí trae la compra y el proveedor; el test no pasa por
  // vacío. El teléfono tampoco llega a un admin desde la búsqueda: solo muestra nombres (D-3).
  const admin = await collect(ADMIN);
  expect(admin).toContain(SUPPLIER);
  expect(admin).toContain("OC-000123");
  for (const fragment of HIDDEN_FRAGMENTS) {
    expect(admin).not.toContain(fragment);
  }
});

test("brief-24.2 (AC-1 a AC-3): Ctrl+K abre el diálogo desde un campo, Tab no sale, y Esc o cerrar devuelven el foco", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/clientes");
  const listField = page.locator("#q");
  await listField.focus();
  await page.keyboard.press("Control+k");
  await expect(dialog(page)).toBeVisible();
  await expect(searchField(page)).toBeFocused();
  // El atajo no escribe nada en el campo de la página.
  await expect(listField).toHaveValue("");
  await expect(dialog(page)).toContainText(
    "Clientes, pedidos, productos, ventas, compras y proveedores",
  );

  // La cantidad se anuncia al terminar la búsqueda.
  await searchField(page).pressSequentially("123");
  await expect(suggestions(page).getByRole("option")).toHaveCount(3);
  await expect(dialog(page).getByText("3 resultados")).toBeVisible();

  // Tab y Mayús+Tab no salen del diálogo de búsqueda: el fondo es inerte.
  const insideDialog = () =>
    dialog(page).evaluate((element) =>
      element.contains(document.activeElement),
    );
  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await insideDialog(), key).toBe(true);
  }

  // Esc cierra y el foco vuelve al campo desde donde se abrió.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(listField).toBeFocused();

  // Con el botón de la barra y el de cerrar: el foco vuelve al botón.
  await barTrigger(page).click();
  await expect(searchField(page)).toBeFocused();
  await dialog(page)
    .getByRole("button", { name: "Cerrar la búsqueda" })
    .click();
  await expect(dialog(page)).toBeHidden();
  await expect(barTrigger(page)).toBeFocused();

  // Un teléfono entero no se busca en el diálogo: Enter abre la búsqueda completa (D-4).
  await openSearch(page);
  await searchField(page).pressSequentially(TYPED_PHONE);
  await expect(
    dialog(page).getByText(
      "Para buscar por teléfono, Enter abre la búsqueda completa.",
    ),
  ).toBeVisible();
  await searchField(page).press("Enter");
  await expect(page).toHaveURL(/\/buscar\?q=/);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Ana Pérez" }),
  ).toBeVisible();
});

test.describe("con reparaciones y turnos (brief-24.2, D-3)", () => {
  const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
  const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
  let iphone: { client: string; order: string; appointment: string };

  // Lo que la clienta y su orden guardan y la búsqueda no copia (AC-5): el teléfono, el email, lo
  // que reportó y los dos totales del presupuesto, con y sin coma decimal.
  const LUCIA_PHONE = "+5491166554433";
  const LUCIA_EMAIL = "lucia.gomez@ejemplo.com.ar";
  const HIDDEN_IPHONE = [
    "5491166554433",
    "549116655",
    LUCIA_EMAIL,
    "Pantalla con manchas",
    "987.65",
    "987,65",
    "432.10",
    "432,10",
  ];

  // La tienda de ejemplo con repairs y appointments, como la dejan org:capability y los specs de
  // reparaciones y turnos: una clienta con una orden de servicio presupuestada y un turno confirmado.
  test.beforeEach(async () => {
    await db.execute(
      sql`delete from appointment_reasons where organization_id = ${IPHONE}`,
    );
    await seedIphone(db, E2E_PASSWORD);
    for (const capability of ["repairs", "appointments"]) {
      await db.execute(
        sql`insert into organization_capabilities (organization_id, capability, activated_by)
            values (${IPHONE}, ${capability}, ${ADMIN_IPHONE.id}) on conflict do nothing`,
      );
    }
    const one = async (query: ReturnType<typeof sql>) =>
      (await db.execute<{ id: string }>(query)).rows[0]!.id;
    const client = await one(
      sql`insert into clients (organization_id, display_name, phone_e164, email)
          values (${IPHONE}, 'Lucía Gómez', ${LUCIA_PHONE}, ${LUCIA_EMAIL}) returning id`,
    );
    const model = await one(
      sql`select id from product_models where organization_id = ${IPHONE} and name = 'iPhone 13'`,
    );
    const technician = await one(
      sql`insert into suppliers (organization_id, name, is_technician)
          values (${IPHONE}, 'Técnico Uno', true) returning id`,
    );
    const order = await one(
      sql`insert into service_orders (organization_id, number, client_id, model_id, device_serial,
            reported_issue, created_by)
          values (${IPHONE}, 248, ${client}, ${model}, '356938035643809', 'Pantalla con manchas',
            ${ADMIN_IPHONE.id}) returning id`,
    );
    // Hasta presupuestada, por SQL, como en repairs.spec.ts.
    await db.execute(
      sql`update service_orders set status = 'sent', technician_id = ${technician},
            sent_at = now() where id = ${order}`,
    );
    await db.execute(
      sql`update service_orders set status = 'quoted', quoted_at = now(),
            customer_currency = 'USD', customer_total = 987.65, technician_currency = 'USD',
            technician_total = 432.10 where id = ${order}`,
    );
    const reason = await one(
      sql`insert into appointment_reasons (organization_id, name, position, is_example)
          values (${IPHONE}, 'Retirar un equipo', 0, true) returning id`,
    );
    const appointment = await one(
      sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
            created_by, confirmed_at)
          values (${IPHONE}, ${client}, ${reason}, date_trunc('hour', now()) + interval '2 days',
            date_trunc('hour', now()) + interval '2 days 30 minutes', 'confirmed',
            ${ADMIN_IPHONE.id}, now())
          returning id`,
    );
    iphone = { client, order, appointment };
  });

  // La tienda se borra entera, como en appointments.spec.ts: los demás specs no la esperan.
  test.afterAll(async () => {
    await truncate();
    await db.execute(sql`delete from sessions`);
    for (const table of [
      "appointment_reasons",
      "attribute_options",
      "attribute_definitions",
      "product_models",
      "organization_capabilities",
      "organization_members",
    ]) {
      await db.execute(
        sql`delete from ${sql.identifier(table)} where organization_id = ${IPHONE}`,
      );
    }
    const iphoneUsers = sql.join(
      SEED_IPHONE_USERS.map((user) => sql`${user.id}`),
      sql`, `,
    );
    await db.execute(sql`delete from users where id in (${iphoneUsers})`);
    await db.execute(sql`delete from organizations where id = ${IPHONE}`);
  });

  test("un admin encuentra por la clienta su reparación y su turno, y la orden por su número", async ({
    page,
  }) => {
    await login(page, ADMIN_IPHONE.email);
    await openSearch(page);
    await expect(dialog(page)).toContainText(
      "Clientes, reparaciones, turnos, pedidos, productos, equipos por IMEI, ventas, compras y proveedores",
    );
    await type(page, "Lucía");
    await expect(suggestions(page).getByRole("group")).toHaveText([
      /^Clientes/,
      /^Reparaciones/,
      /^Turnos/,
    ]);
    await expect(
      suggestions(page).getByRole("option", { name: /^OS-000248, reparación/ }),
    ).toContainText("Lucía Gómez · iPhone 13");
    await expect(
      suggestions(page)
        .getByRole("group", { name: "Turnos" })
        .getByRole("option"),
    ).toContainText("Lucía Gómez · Retirar un equipo · Confirmado");
    await expect(dialog(page).getByText("3 resultados")).toBeVisible();
    await expectAccessible(page, "diálogo con reparaciones y turnos");

    // El tercero es el turno: flechas y Enter abren su ficha.
    for (let step = 0; step < 3; step++) {
      await searchField(page).press("ArrowDown");
    }
    await searchField(page).press("Enter");
    await expect(page).toHaveURL(`/turnos/${iphone.appointment}`);
    await expect(dialog(page)).toBeHidden();

    await type(page, "OS-000248");
    await expect(suggestions(page).getByRole("option")).toHaveCount(1);
    await chooseFirst(page);
    await expect(page).toHaveURL(`/reparaciones/${iphone.order}`);

    // /buscar muestra los mismos grupos.
    await page.goto(`/buscar?${new URLSearchParams({ q: "Lucía" })}`);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 2 }),
    ).toHaveText(["Clientes", "Reparaciones", "Turnos"]);
  });

  test("un viewer también los ve, y no recibe el teléfono, el email ni los totales (AC-4 de la 23.3)", async ({
    page,
  }) => {
    test.slow();
    await login(page, VIEWER_IPHONE.email);
    await type(page, "Lucía");
    await expect(suggestions(page).getByRole("group")).toHaveText([
      /^Clientes/,
      /^Reparaciones/,
      /^Turnos/,
    ]);
    await expect(dialog(page)).not.toContainText("compras");
    await page.context().clearCookies();

    // Lo que recibe el navegador del viewer, también por el teléfono entero en /buscar (H-7 de la
    // 23.3, riesgo aceptado: encuentra a la clienta, no ve su número).
    const viewer = await collectBodies(
      page,
      VIEWER_IPHONE.email,
      ["Lucía", "+54 9 11 6655-4433", "OS-000248"],
      ["Lucía", "Gómez", "OS-000248"],
    );
    for (const fragment of HIDDEN_IPHONE) {
      expect(viewer).not.toContain(fragment);
    }
    // Control: el recorrido sí trajo la orden, el turno y la clienta.
    expect(viewer).toContain("OS-000248");
    expect(viewer).toContain("Retirar un equipo");
    expect(viewer).toContain("Lucía Gómez");
  });

  test("sin repairs ni appointments, los mismos datos no aparecen: ni en el diálogo ni en /buscar (AC-4)", async ({
    page,
  }) => {
    await db.execute(
      sql`delete from organization_capabilities
          where organization_id = ${IPHONE} and capability in ('repairs', 'appointments')`,
    );
    await login(page, ADMIN_IPHONE.email);
    await openSearch(page);
    await expect(dialog(page)).not.toContainText("reparaciones");
    await expect(dialog(page)).not.toContainText("turnos");
    await type(page, "Lucía");
    await expect(suggestions(page).getByRole("group")).toHaveText([
      /^Clientes/,
    ]);
    await expect(dialog(page).getByText("1 resultado")).toBeVisible();

    await searchField(page).fill("");
    await searchField(page).pressSequentially("OS-000248");
    await expect(dialog(page).getByText("Sin resultados")).toBeVisible();

    await page.goto(`/buscar?${new URLSearchParams({ q: "Lucía" })}`);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 2 }),
    ).toHaveText(["Clientes"]);
  });

  test.describe("sin JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("a 375 px, la lupa lleva a /buscar, que muestra las reparaciones y los turnos (AC-7)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await login(page, ADMIN_IPHONE.email);
      await page
        .getByRole("link", { name: "Buscar en el sistema", exact: true })
        .click();
      await expect(page).toHaveURL("/buscar");
      const field = page.getByRole("main").getByRole("searchbox", {
        name: "Buscar en el sistema",
      });
      await field.fill("Lucía");
      await field.press("Enter");
      await expect(
        page.getByRole("main").getByRole("heading", { level: 2 }),
      ).toHaveText(["Clientes", "Reparaciones", "Turnos"]);
      await expect(
        page.getByRole("main").getByRole("link", { name: /^OS-000248/ }),
      ).toHaveAttribute("href", `/reparaciones/${iphone.order}`);
    });
  });
});
