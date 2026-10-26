import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Response } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// La búsqueda global de punta a punta (brief-23.3, AC-1 a AC-7): Chromium, next start, la Server
// Action, las lecturas de crm, orders, catalog, sales y purchasing, y PostgreSQL real, sin mocks.
// Un admin encuentra los seis tipos con el teclado y llega a cada ficha; Enter abre /buscar; sin
// JavaScript el formulario funciona; un viewer no recibe el teléfono de un cliente ni ve compras ni
// proveedores; a 375 px se busca desde la lupa; axe sin violaciones.

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

const searchField = (page: Page) =>
  page
    .getByRole("search", { name: "Búsqueda global" })
    .getByRole("combobox", { name: "Buscar en el sistema" });

const suggestions = (page: Page) =>
  page.getByRole("listbox", { name: "Sugerencias" });

// Escribe en el campo de la barra, como una persona, y espera la lista.
async function type(page: Page, text: string) {
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

  test("brief-23.3: el campo de la barra es un formulario que lleva a /buscar", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await searchField(page).fill("Ana");
    await searchField(page).press("Enter");
    await expect(page).toHaveURL("/buscar?q=Ana");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Ana Pérez" }),
    ).toHaveAttribute("href", `/clientes/${ids.client}`);
  });
});

test("brief-23.3: a 375 px, la lupa lleva a /buscar sin desplazamiento horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN);
  await expect(searchField(page)).toBeHidden();
  await page.getByRole("link", { name: "Buscar en el sistema" }).click();
  await expect(page).toHaveURL("/buscar");
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

test("brief-23.3 (AC-4): un viewer no recibe el teléfono de un cliente ni ve compras ni proveedores", async ({
  page,
}) => {
  // Dos roles, ocho búsquedas cada uno: el triple del tiempo de un caso.
  test.slow();
  // Todo lo que el servidor manda: documentos, datos de RSC y las respuestas de la Server Action.
  async function collectBodies(email: string) {
    const bodies: string[] = [];
    let pending: Promise<void>[] = [];
    // Solo lo que trae resultados de la búsqueda: el documento de /buscar, con su RSC en línea, y
    // las respuestas POST de la Server Action. Los prefetch de los enlaces piden otras pantallas, que
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
    for (const text of [TYPED_PHONE, "123", "Norte", CUIT]) {
      const route = `/buscar?${new URLSearchParams({ q: text })}`;
      await page.goto(route);
      await drain();
      bodies.push(await page.content());
    }
    // Las sugerencias: se espera la respuesta de la Server Action, porque para un viewer «Norte»
    // no trae nada y la lista no se abre.
    for (const text of ["123", "Norte", "30-71234567-4", "Ana"]) {
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

  const viewer = await collectBodies(VIEWER);
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
  const admin = await collectBodies(ADMIN);
  expect(admin).toContain(SUPPLIER);
  expect(admin).toContain("OC-000123");
  for (const fragment of HIDDEN_FRAGMENTS) {
    expect(admin).not.toContain(fragment);
  }
});
