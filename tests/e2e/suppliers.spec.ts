import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql, type SQL } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Las pantallas de proveedores de punta a punta (brief-22.2, AC-8): Chromium, next start, Server
// Actions, purchasing, audit y PostgreSQL real, sin mocks. Un admin da de alta un proveedor y ve
// los rechazos de un CUIT inválido y de un nombre repetido; lo edita, lo desactiva, lo reactiva, lo
// busca y ve su historia. Un viewer no ve «Compras» y recibe el aviso de página prohibida.

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// Los proveedores no se borran desde la aplicación (crm_app no tiene DELETE), y la auditoría es de
// solo inserción: TRUNCATE es la vía documentada para vaciarlas (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table service_order_lines, service_orders, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, audit_logs`,
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

async function insertSupplier(values: {
  name: string;
  cuit?: string;
  email?: string;
}): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name, cuit, email)
        values (${SEED_ORGANIZATION_ID}, ${values.name}, ${values.cuit ?? null},
                ${values.email ?? null})
        returning id`,
  );
  return result.rows[0]!.id;
}

// La capacidad `repairs` (ADR 0024) no está en el seed: cada caso que la necesita la enciende, y
// se apaga **después**, no antes, porque entre archivos de la misma base se filtra (24.6.1-b).
async function enableRepairs() {
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${SEED_ORGANIZATION_ID}, 'repairs', ${ADMIN_SEED.id})`,
  );
}

test.afterEach(async () => {
  await db.execute(
    sql`delete from organization_capabilities
        where organization_id = ${SEED_ORGANIZATION_ID}
          and capability in ('repairs', 'variants')`,
  );
});

async function enableVariants() {
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${SEED_ORGANIZATION_ID}, 'variants', ${ADMIN_SEED.id})`,
  );
}

async function insertTechnician(name: string): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name, is_technician)
        values (${SEED_ORGANIZATION_ID}, ${name}, true)
        returning id`,
  );
  return result.rows[0]!.id;
}

test("un admin llega a Compras, da de alta un proveedor con el teclado y ve los rechazos", async ({
  page,
}) => {
  await login(page, ADMIN);
  const nav = page.getByRole("navigation", { name: "Principal" });
  // Desde la 22.3, «Compras» lleva a las órdenes, y los proveedores son la otra pestaña
  // (brief-22.3, D-10).
  await nav.getByRole("link", { name: "Compras" }).click();
  await expect(page).toHaveURL("/compras/ordenes");
  await page
    .getByRole("navigation", { name: "Secciones de compras" })
    .getByRole("link", { name: "Proveedores" })
    .click();
  await expect(page).toHaveURL("/compras/proveedores");
  // Desde la 24.1, Proveedores es un destino propio del grupo Abastecimiento (brief-24.1, D-1).
  await expect(nav.getByRole("link", { name: "Proveedores" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("Todavía no hay proveedores.")).toBeVisible();
  await expectAccessible(page, "lista vacía");

  await page.getByRole("link", { name: "+ Nuevo proveedor" }).click();
  await expect(page).toHaveURL("/compras/proveedores/nuevo");
  await page.getByLabel("Nombre *").fill("Distribuidora Norte");
  await page.getByLabel("Teléfono").fill("+54 9 11 5555-1234");
  await page.getByLabel("Email").fill("Ventas@Norte.com");
  // El dígito verificador no cierra: el servidor lo rechaza con su mensaje propio (brief-22.3, D-12)
  // y conserva lo escrito.
  await page.getByLabel("CUIT").fill("20-12345678-0");
  await expectAccessible(page, "alta");
  await page.getByLabel("CUIT").press("Enter");
  await expect(
    page.getByText(/El dígito verificador no corresponde a este CUIT/),
  ).toBeVisible();
  await expect(page.getByLabel("CUIT")).toBeFocused();
  await expect(page.getByLabel("Nombre *")).toHaveValue("Distribuidora Norte");
  await expectAccessible(page, "alta con el CUIT rechazado");

  await page.getByLabel("CUIT").fill("20-12345678-6");
  await page.getByLabel("CUIT").press("Enter");
  await expect(page).toHaveURL(
    /\/compras\/proveedores\/[0-9a-f-]+\?aviso=creado$/,
  );
  await expect(page.getByText("Proveedor creado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Distribuidora Norte" }),
  ).toBeVisible();
  await expect(page.getByText("+5491155551234", { exact: true })).toBeVisible();
  await expect(page.getByText("ventas@norte.com").first()).toBeVisible();
  await expect(page.getByText("20-12345678-6").first()).toBeVisible();
  await expectAccessible(page, "ficha");

  // El mismo nombre con otras mayúsculas.
  await page.goto("/compras/proveedores/nuevo");
  await page.getByLabel("Nombre *").fill("DISTRIBUIDORA NORTE");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(
    page.getByText(/Ya existe un proveedor con ese nombre/),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre *")).toBeFocused();
});

test("un admin edita, desactiva, busca, reactiva y ve la historia", async ({
  page,
}) => {
  const id = await insertSupplier({
    name: "Distribuidora Norte",
    cuit: "20123456786",
    email: "ventas@norte.com",
  });
  await insertSupplier({ name: "Bodega del Sur" });
  await login(page, ADMIN);

  // La edición: vaciar el email lo lleva a «Sin email».
  await page.goto(`/compras/proveedores/${id}`);
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(`/compras/proveedores/${id}/editar`);
  await expect(page.getByLabel("CUIT")).toHaveValue("20-12345678-6");
  await page.getByLabel("Nombre *").fill("Distribuidora Norte SRL");
  await page.getByLabel("Email").fill("");
  await expectAccessible(page, "edición");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Proveedor actualizado.")).toBeVisible();
  await expect(page.getByText("Sin email")).toBeVisible();

  // La desactivación, con su confirmación.
  await page
    .getByRole("button", { name: "Más acciones del proveedor" })
    .click();
  await page.getByRole("link", { name: "Desactivar" }).click();
  await expect(
    page.getByText('¿Desactivar "Distribuidora Norte SRL"?'),
  ).toBeFocused();
  await expectAccessible(page, "confirmar desactivación");
  await page.getByRole("button", { name: "Sí, desactivar" }).click();
  await expect(page.getByText("Proveedor desactivado.")).toBeVisible();
  await expect(page.getByText("Inactivo", { exact: true })).toBeVisible();

  // La lista oculta al inactivo por defecto; el filtro lo muestra.
  await page.goto("/compras/proveedores");
  const table = page.getByRole("table", {
    name: "Proveedores de la organización",
  });
  await expect(table).toContainText("Bodega del Sur");
  await expect(table).not.toContainText("Distribuidora Norte SRL");
  await page.getByLabel("Estado").selectOption("inactivos");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/\/compras\/proveedores\?q=&estado=inactivos$/);
  await expect(table).toContainText("Distribuidora Norte SRL");
  await expectAccessible(page, "lista de inactivos");

  // La búsqueda por parte del nombre y por CUIT.
  await page.goto("/compras/proveedores?estado=todos");
  await page.getByLabel("Buscar", { exact: true }).fill("norte srl");
  await page.getByLabel("Buscar", { exact: true }).press("Enter");
  await expect(table).toContainText("Distribuidora Norte SRL");
  await expect(table).not.toContainText("Bodega del Sur");
  await page.getByLabel("Buscar", { exact: true }).fill("20 12345678 6");
  await page.getByLabel("Buscar", { exact: true }).press("Enter");
  await expect(table).toContainText("Distribuidora Norte SRL");
  await page.getByLabel("Buscar", { exact: true }).fill("Ferretería");
  await page.getByLabel("Buscar", { exact: true }).press("Enter");
  await expect(
    page.getByText("Ningún proveedor coincide con esta búsqueda."),
  ).toBeVisible();

  // La reactivación y la historia.
  await page.goto(`/compras/proveedores/${id}`);
  await page.getByRole("button", { name: "Reactivar proveedor" }).click();
  await expect(page.getByText("Proveedor reactivado.")).toBeVisible();
  // La auditoría se dibuja como la línea de tiempo «Actividad» de la lámina 14 (V-24), sobre los
  // mismos eventos de siempre.
  const history = page.getByRole("region", { name: "Actividad" });
  await expect(
    history.getByRole("list", { name: "Actividad de Distribuidora Norte SRL" }),
  ).toBeVisible();
  await expect(history).toContainText("Edición");
  await expect(history).toContainText(
    "Nombre: Distribuidora Norte → Distribuidora Norte SRL",
  );
  await expect(history).toContainText("Desactivación");
  await expect(history).toContainText("Reactivación");
  await expectAccessible(page, "ficha con historia");
});

test("un viewer no ve Compras y las páginas de proveedores muestran el permiso sin datos", async ({
  page,
}) => {
  const id = await insertSupplier({
    name: "Distribuidora Norte",
    cuit: "20123456786",
  });
  await login(page, VIEWER);
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Inicio" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Compras" })).toHaveCount(0);

  for (const path of [
    "/compras",
    "/compras/proveedores",
    "/compras/proveedores/nuevo",
    `/compras/proveedores/${id}`,
    `/compras/proveedores/${id}/editar`,
  ]) {
    await page.goto(path);
    await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
    await expect(page.getByText("Distribuidora Norte")).toHaveCount(0);
    await expect(page.getByText("20-12345678-6")).toHaveCount(0);
  }
  await expectAccessible(page, "permiso de viewer");
});

// Sin JavaScript (AC-8): el alta y la edición son formularios comunes, y el servidor devuelve el
// rechazo con lo escrito.
test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("un admin da de alta un proveedor y ve el rechazo de un teléfono inválido", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/compras/proveedores/nuevo");
    await page.getByLabel("Nombre *").fill("Bodega del Sur");
    await page.getByLabel("Teléfono").fill("011 5555-1234");
    await page.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(
      page.getByText(/Ingresá el teléfono en formato internacional/),
    ).toBeVisible();
    await expect(page.getByLabel("Nombre *")).toHaveValue("Bodega del Sur");

    await page.getByLabel("Teléfono").fill("+54 11 5555-1234");
    await page.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(page).toHaveURL(
      /\/compras\/proveedores\/[0-9a-f-]+\?aviso=creado$/,
    );
    await expect(
      page.getByText("+541155551234", { exact: true }),
    ).toBeVisible();
  });
});

// Las dos pantallas de la 24.8.2-b (láminas 13 y 15 del lote 28): la forma del listado, la columna
// y el filtro «Tipo» que solo existen con `repairs` (AC-1 y AC-2), la casilla «Es técnico» del alta
// (AC-3) y el reflujo dentro de las tarjetas (AC-13).

const SUPPLIERS_TABLE = "Proveedores de la organización";

test("el listado tiene la forma de la lámina 13, y sin repairs no nombra a los técnicos", async ({
  page,
}) => {
  await insertSupplier({ name: "Distribuidora Norte", cuit: "20123456786" });
  await insertSupplier({ name: "Bodega del Sur", email: "hola@sur.com" });
  await login(page, ADMIN);
  await page.goto("/compras/proveedores");

  // Las dos acciones de la lámina, juntas y arriba de los filtros (V-1 y V-2).
  await expect(
    page.getByRole("link", { name: "Ver cuentas a pagar" }),
  ).toHaveAttribute("href", "/compras/a-pagar");
  await expect(
    page.getByRole("link", { name: "+ Nuevo proveedor" }),
  ).toBeVisible();

  const table = page.getByRole("table", { name: SUPPLIERS_TABLE });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Nombre",
    "Estado",
    "Teléfono",
    "Email",
    "CUIT",
    "Acciones",
  ]);
  // Sin la capacidad no hay columna ni filtro de tipo (AC-2, ADR 0024 punto 10).
  await expect(page.getByRole("group", { name: "Tipo" })).toHaveCount(0);

  const sur = table.getByRole("row").filter({ hasText: "Bodega del Sur" });
  // «Sin datos» y no un guion, que no se lee en voz alta (V-7).
  await expect(sur.getByRole("cell").nth(2)).toHaveText("Sin datos");
  await expect(table.getByText("—")).toHaveCount(0);
  await expect(sur.getByRole("cell").nth(1)).toHaveText("Activo");

  // El pie: el aviso de los inactivos y el total (V-9). Sin paginación con dos filas.
  await expect(
    page.getByText(
      "Los proveedores inactivos conservan su historial y pueden recibir pagos.",
    ),
  ).toBeVisible();
  await expect(page.getByText("2 proveedores")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Paginación" }),
  ).toHaveCount(0);
  await expectAccessible(page, "listado con proveedores");

  // «Ver» en lugar del lápiz (V-8), y lleva a la ficha.
  await sur.getByRole("link", { name: "Ver" }).click();
  await expect(page).toHaveURL(/\/compras\/proveedores\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "Bodega del Sur" }),
  ).toBeVisible();
});

test("con repairs, el listado trae la columna «Tipo» y el filtro separa a los técnicos", async ({
  page,
}) => {
  await insertSupplier({ name: "Distribuidora Norte" });
  await insertTechnician("Laboratorio Prisma");
  await enableRepairs();
  await login(page, ADMIN);
  await page.goto("/compras/proveedores");

  const table = page.getByRole("table", { name: SUPPLIERS_TABLE });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Nombre",
    "Estado",
    "Tipo",
    "Teléfono",
    "Email",
    "CUIT",
    "Acciones",
  ]);
  await expect(
    table.getByRole("row").filter({ hasText: "Laboratorio Prisma" }),
  ).toContainText("Técnico");
  await expect(
    table.getByRole("row").filter({ hasText: "Distribuidora Norte" }),
  ).toContainText("Proveedor");

  const tipo = page.getByRole("group", { name: "Tipo" });
  await expect(tipo.getByRole("radio", { name: "Todos" })).toBeChecked();
  await tipo.getByText("Técnicos", { exact: true }).click();
  await expect(tipo.getByRole("radio", { name: "Técnicos" })).toBeChecked();
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(
    /\/compras\/proveedores\?q=&estado=activos&tipo=tecnicos$/,
  );
  await expect(table).toContainText("Laboratorio Prisma");
  await expect(table).not.toContainText("Distribuidora Norte");
  await expect(page.getByText("1 proveedor", { exact: true })).toBeVisible();
  await expectAccessible(page, "listado filtrado por técnicos");

  await page.getByRole("link", { name: "Limpiar filtros" }).click();
  await expect(page).toHaveURL("/compras/proveedores");
  await expect(table.getByRole("row")).toHaveCount(3);
});

test("el alta marca al técnico, la edición lo desmarca, y la historia lo cuenta", async ({
  page,
}) => {
  await enableRepairs();
  await login(page, ADMIN);
  await page.goto("/compras/proveedores/nuevo");

  // Los tres bloques de la lámina 15 (V-12) y el aviso de unicidad al pie (V-14).
  for (const title of [
    "Datos del proveedor",
    "Identificación",
    "Servicio técnico",
  ]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(
    page.getByText(
      "El nombre y el CUIT no pueden repetirse, incluso con proveedores inactivos.",
    ),
  ).toBeVisible();

  const tecnico = page.getByRole("checkbox", { name: "Es técnico" });
  await expect(tecnico).not.toBeChecked();
  await page.getByLabel("Nombre *").fill("Laboratorio Prisma");
  await tecnico.check();
  await expectAccessible(page, "alta con la casilla de técnico");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page).toHaveURL(
    /\/compras\/proveedores\/[0-9a-f-]+\?aviso=creado$/,
  );
  const path = new URL(page.url()).pathname;

  // La marca viajó en el alta: la lista ya lo muestra como técnico.
  await page.goto("/compras/proveedores");
  await expect(
    page
      .getByRole("table", { name: SUPPLIERS_TABLE })
      .getByRole("row")
      .filter({ hasText: "Laboratorio Prisma" }),
  ).toContainText("Técnico");

  // La edición lo desmarca, y la historia lo dice con todas las letras.
  await page.goto(`${path}/editar`);
  await expect(
    page.getByRole("checkbox", { name: "Es técnico" }),
  ).toBeChecked();
  await page.getByRole("checkbox", { name: "Es técnico" }).uncheck();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Proveedor actualizado.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Actividad" })).toContainText(
    "Técnico: sí → no",
  );
  await page.goto("/compras/proveedores");
  await expect(
    page
      .getByRole("table", { name: SUPPLIERS_TABLE })
      .getByRole("row")
      .filter({ hasText: "Laboratorio Prisma" }),
  ).toContainText("Proveedor");
});

test("sin repairs, el alta no ofrece la casilla y un enlace con tipo no rompe el listado", async ({
  page,
}) => {
  await insertSupplier({ name: "Distribuidora Norte" });
  await insertTechnician("Laboratorio Prisma");
  await login(page, ADMIN);

  await page.goto("/compras/proveedores/nuevo");
  await expect(
    page.getByRole("heading", { name: "Servicio técnico" }),
  ).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Es técnico" })).toHaveCount(
    0,
  );

  // Un enlace viejo con `tipo` sigue filtrando aunque el control no se dibuje, y «Buscar» no lo
  // pierde: viaja en un campo oculto.
  await page.goto("/compras/proveedores?tipo=tecnicos");
  const table = page.getByRole("table", { name: SUPPLIERS_TABLE });
  await expect(table).toContainText("Laboratorio Prisma");
  await expect(table).not.toContainText("Distribuidora Norte");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/tipo=tecnicos$/);
  await expect(table).not.toContainText("Distribuidora Norte");
});

// Las tablas que no se vacían entre pruebas y son únicas por nombre: se reusa la fila que ya está.
async function existingOrNew(select: SQL, insert: SQL): Promise<string> {
  const found = await db.execute<{ id: string }>(select);
  if (found.rows[0]) return found.rows[0].id;
  const created = await db.execute<{ id: string }>(insert);
  return created.rows[0]!.id;
}

// Una orden de servicio reparada por este técnico, por los mismos pasos que exigen los CHECK y el
// guardián de transiciones: es el camino que ya usa sales.spec.ts para llegar a una entregada.
async function insertRepairedOrder(
  technicianId: string,
  number: number,
): Promise<string> {
  const modelId = await existingOrNew(
    sql`select id from product_models
        where organization_id = ${SEED_ORGANIZATION_ID} and lower(name) = 'iphone 13'`,
    sql`insert into product_models (organization_id, name)
        values (${SEED_ORGANIZATION_ID}, 'iPhone 13') returning id`,
  );
  const repairTypeId = await existingOrNew(
    sql`select id from repair_types
        where organization_id = ${SEED_ORGANIZATION_ID} and lower(name) = 'cambio de batería'`,
    sql`insert into repair_types (organization_id, name, position)
        values (${SEED_ORGANIZATION_ID}, 'Cambio de batería', 1) returning id`,
  );
  const clientId = await existingOrNew(
    sql`select id from clients
        where organization_id = ${SEED_ORGANIZATION_ID} and display_name = 'Ana Cliente'`,
    sql`insert into clients (organization_id, display_name)
        values (${SEED_ORGANIZATION_ID}, 'Ana Cliente') returning id`,
  );
  const order = await db.execute<{ id: string }>(
    sql`insert into service_orders (organization_id, number, client_id, model_id, device_serial,
                                    reported_issue, created_by)
        values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId},
                ${modelId}, '356938035643809', 'No carga', ${ADMIN_SEED.id})
        returning id`,
  );
  const id = order.rows[0]!.id;
  await db.execute(
    sql`update service_orders set status = 'sent', sent_at = now(),
          technician_id = ${technicianId} where id = ${id}`,
  );
  await db.execute(
    sql`update service_orders set status = 'quoted', quoted_at = now(),
          customer_currency = 'ARS', customer_total = 80000,
          technician_currency = 'ARS', technician_total = 30000 where id = ${id}`,
  );
  // Las líneas se insertan con el presupuesto, que es lo que exige su guardián.
  await db.execute(
    sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id,
                                        position, price, cost)
        values (${SEED_ORGANIZATION_ID}, ${id}, ${repairTypeId}, 1, 80000, 30000)`,
  );
  await db.execute(
    sql`update service_orders set status = 'approved', approved_at = now() where id = ${id}`,
  );
  await db.execute(
    sql`update service_orders set status = 'repaired', repaired_at = now() where id = ${id}`,
  );
  return id;
}

test("el alta rechaza el CUIT mal formado y el repetido, y conserva la casilla «Es técnico»", async ({
  page,
}) => {
  // Los rechazos del formulario viven en el servidor, pero tres no son alcanzables desde el
  // navegador: «Nombre» es `required` con `maxLength={120}` y «Email» es `type="email"`, así que la
  // validación nativa los ataja antes de enviar. Están cubiertos en el servicio
  // (tests/integration/suppliers.test.ts). Acá quedan los dos que faltaban: la forma del CUIT y el
  // CUIT repetido (hallazgo B-2 de la revisión de esta subfase).
  await insertSupplier({ name: "Distribuidora Norte", cuit: "20123456786" });
  await enableRepairs();
  await login(page, ADMIN);
  await page.goto("/compras/proveedores/nuevo");

  await page.getByLabel("Nombre *").fill("Laboratorio Prisma");
  await page.getByLabel("Es técnico").check();
  await page.getByLabel("CUIT").fill("20-123456");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByText(/Ingresá un CUIT de 11 dígitos/)).toBeVisible();
  await expect(page.getByLabel("CUIT")).toBeFocused();
  await expect(page.getByLabel("Nombre *")).toHaveValue("Laboratorio Prisma");
  // La casilla se conserva: la pantalla no puede olvidar lo que se marcó ni decir que se guardó.
  await expect(page.getByLabel("Es técnico")).toBeChecked();

  await page.getByLabel("CUIT").fill("20-12345678-6");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(
    page.getByText(/Ya existe un proveedor con ese CUIT/),
  ).toBeVisible();
  await expect(page.getByLabel("CUIT")).toBeFocused();
  await expect(page.getByLabel("Es técnico")).toBeChecked();
  await expectAccessible(page, "alta con el CUIT repetido");
});

test("la ficha del técnico tiene la forma de la lámina 14 y muestra su trabajo reparado", async ({
  page,
}) => {
  const technicianId = await insertTechnician("Laboratorio Prisma");
  await enableRepairs();
  await enableVariants();
  await insertRepairedOrder(technicianId, 123);
  await login(page, ADMIN);
  await page.goto(`/compras/proveedores/${technicianId}`);

  // El título, el subtítulo y las tres acciones del encabezado (V-17, V-20, V-21).
  await expect(
    page.getByRole("heading", { name: "Laboratorio Prisma", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Proveedor de insumos y servicio técnico."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Registrar pago a cuenta" }),
  ).toHaveAttribute("href", `/compras/proveedores/${technicianId}/pagar`);
  await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();

  // La marca ya no se edita desde la ficha: viaja en el alta y en la edición (D-2).
  await expect(
    page.getByRole("button", { name: "Marcarlo como técnico" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Dejar de marcarlo como técnico" }),
  ).toHaveCount(0);

  // La tira de contacto nombra los vacíos (V-18).
  const datos = page.getByRole("region", { name: "Datos de contacto" });
  await expect(datos).toContainText("Sin teléfono");
  await expect(datos).toContainText("Sin email");
  await expect(datos).toContainText("Sin CUIT");

  // «Trabajo reparado», con modelo y tipo de reparación (AC-5, V-23, D-4).
  const trabajo = page.getByRole("region", { name: "Trabajo reparado" });
  await expect(trabajo).toContainText("OS-000123");
  await expect(trabajo).toContainText("iPhone 13 · Cambio de batería");
  await expect(trabajo).toContainText("$ 30.000,00");
  await expect(trabajo).toContainText(
    "Lo que se le debe por estas reparaciones está en su cuenta, junto con sus pagos.",
  );
  // La tarjeta no dibuja ningún «Pendiente»: la deuda es de la cuenta (H-5).
  await expect(trabajo).not.toContainText("Pendiente");
  // El enlace no promete un número y pide «Todas»: la tarjeta cuenta las reparadas, entregadas
  // incluidas, y «En curso» no las muestra (hallazgo B-1 de la revisión de esta subfase).
  await expect(
    trabajo.getByRole("link", { name: "Ver las órdenes de este técnico" }),
  ).toHaveAttribute(
    "href",
    `/reparaciones?tecnico=${technicianId}&estado=todas`,
  );

  // La cuenta, con su estado de cuenta como acción de la tarjeta.
  await expect(
    page
      .getByRole("region", { name: "Cuenta" })
      .getByRole("link", { name: "Ver estado de cuenta" }),
  ).toHaveAttribute("href", `/compras/proveedores/${technicianId}/cuenta`);

  // El menú «Más», abierto, con axe (AC-17).
  await page
    .getByRole("button", { name: "Más acciones del proveedor" })
    .click();
  await expect(
    page.getByRole("link", { name: "Ver los pagos de este proveedor" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Desactivar" })).toBeVisible();
  await expectAccessible(page, "ficha del técnico con el menú abierto");

  // El menú se cierra antes de seguir: abierto, tapa las acciones de la tarjeta.
  await page
    .getByRole("button", { name: "Más acciones del proveedor" })
    .click();

  // «Ver reparaciones» lleva a la lista filtrada por él, con el filtro puesto (V-22, D-5).
  await page.getByRole("link", { name: "Ver reparaciones" }).click();
  await expect(page).toHaveURL(
    `/reparaciones?tecnico=${technicianId}&estado=todas`,
  );
  await expect(page.getByLabel("Técnico")).toHaveValue(technicianId);
  await expect(page.getByLabel("Estado")).toHaveValue("todas");
  await expect(
    page.getByRole("table", { name: "Órdenes de servicio de la organización" }),
  ).toContainText("OS-000123");
});

test("la ficha de un proveedor inactivo muestra la tarjeta 5, y la de uno común no habla de técnicos", async ({
  page,
}) => {
  const id = await insertSupplier({ name: "Distribuidora Norte" });
  await enableRepairs();
  await login(page, ADMIN);
  await page.goto(`/compras/proveedores/${id}`);

  // Un proveedor que no es técnico: ni subtítulo de servicio, ni trabajo, ni «Ver reparaciones».
  await expect(page.getByText("Proveedor de insumos.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Trabajo reparado" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Ver reparaciones" }),
  ).toHaveCount(0);

  // Inactivo: la tarjeta 5 con sus tres frases y «Reactivar proveedor» (AC-6, V-35).
  await db.execute(
    sql`update suppliers set is_active = false where id = ${id}`,
  );
  await page.reload();
  const estado = page.getByRole("region", { name: "Estado" });
  await expect(estado).toContainText("Este proveedor está inactivo.");
  await expect(estado).toContainText(
    "No se pueden generar nuevas órdenes de compra ni recibir mercadería.",
  );
  await expect(estado).toContainText("Puede recibir pagos.");
  await expect(
    estado.getByRole("button", { name: "Reactivar proveedor" }),
  ).toBeVisible();
  // La lámina 17 no dibuja «Los datos anteriores se conservan» acá, y la ficha tampoco (H-9).
  await expect(page.getByText("Los datos anteriores se conservan")).toHaveCount(
    0,
  );
  // Con el proveedor inactivo, «Desactivar» ya no está en el menú.
  await page
    .getByRole("button", { name: "Más acciones del proveedor" })
    .click();
  await expect(page.getByRole("link", { name: "Desactivar" })).toHaveCount(0);
  await expectAccessible(page, "ficha de un proveedor inactivo");
});

test("con la cuenta ilegible, la ficha muestra la tarjeta 6 y ningún cero", async ({
  page,
}) => {
  const id = await insertSupplier({ name: "Distribuidora Norte" });
  await login(page, ADMIN);

  // La lectura forzada a fallar (AC-7): la tabla de los pagos deja de existir mientras se pide la
  // ficha. Es el único modo de alcanzar la tarjeta 6, y se deshace enseguida. El runner corre con
  // `workers: 1`, así que ninguna otra prueba lee la base mientras tanto.
  await db.execute(
    sql`alter table supplier_payments rename to supplier_payments_ausente`,
  );
  try {
    await page.goto(`/compras/proveedores/${id}`);
    const cuenta = page.getByRole("region", { name: "Cuenta" });
    await expect(cuenta).toContainText("No pudimos leer la cuenta.");
    await expect(cuenta).toContainText("Reintentá la consulta.");
    // Ni un cero ni «No se le debe nada»: sería una afirmación de dinero falsa.
    await expect(cuenta).not.toContainText("No se le debe nada");
    await expect(cuenta).not.toContainText("0,00");
    // Tampoco la frase de la lámina que esta ficha no adopta (H-9).
    await expect(cuenta).not.toContainText("Los datos anteriores se conservan");
    // El resto de la ficha sigue en pie.
    await expect(
      page.getByRole("heading", { name: "Distribuidora Norte", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Datos de contacto" }),
    ).toBeVisible();
    await expectAccessible(page, "ficha con la cuenta ilegible");
    // «Reintentar» es volver a pedir la misma página: anda sin JavaScript.
    await expect(
      cuenta.getByRole("link", { name: "Reintentar" }),
    ).toHaveAttribute("href", `/compras/proveedores/${id}`);
  } finally {
    await db.execute(
      sql`alter table supplier_payments_ausente rename to supplier_payments`,
    );
  }
});

// El reflujo **dentro de las tarjetas** (AC-13 y medición 3 del brief-24.8.2-b). El barrido del
// documento no alcanza: en la 24.8.1-b la CI estaba verde y el recorrido encontró cuatro
// desbordamientos adentro de una tarjeta, a anchos de escritorio. Se replica el caso de
// supplier-payments.spec.ts, con la capacidad encendida, que es el peor caso de columnas.
const REFLOW_WIDTHS = [320, 375, 1280, 1440, 1536, 1680] as const;

async function overflowProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.querySelector("main") ?? document.body;
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      problems.push(
        `el documento pide ${document.documentElement.scrollWidth} px en ${window.innerWidth}`,
      );
    }
    const scrolls = (el: Element) => {
      const style = getComputedStyle(el);
      return style.overflowX === "auto" || style.overflowX === "scroll";
    };
    const cards = [...root.querySelectorAll(".rounded-xl")].filter(
      (card) => !scrolls(card) && getComputedStyle(card).position === "static",
    );
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (box.width === 0) continue;
      for (const el of card.querySelectorAll(
        "input, select, button, a, dd, dt, td, th, h1, h2, h3, p, li",
      )) {
        let node = el.parentElement;
        let skip = false;
        while (node && node !== card) {
          if (scrolls(node)) skip = true;
          node = node.parentElement;
        }
        const style = getComputedStyle(el);
        if (
          skip ||
          style.position === "absolute" ||
          style.position === "fixed"
        ) {
          continue;
        }
        const inner = el.getBoundingClientRect();
        if (inner.width === 0) continue;
        if (inner.right > box.right + 1 || inner.left < box.left - 1) {
          const name = (el.textContent ?? el.tagName).trim().slice(0, 28);
          problems.push(`«${name}» se sale de su tarjeta`);
        }
      }
    }
    return [...new Set(problems)];
  });
}

test("el listado y el formulario entran en su tarjeta a los seis anchos", async ({
  page,
}) => {
  // El nombre más largo que admite el alta, para que la fila y el control sean el peor caso.
  const longName = "Importaciones y Distribuciones del Litoral Argentino S.A.";
  const id = await insertSupplier({
    name: longName,
    cuit: "20123456786",
    email: "comprobantes.electronicos@importacionesdellitoral.com.ar",
  });
  const technicianId = await insertTechnician(
    "Laboratorio Prisma de Reparaciones del Sur",
  );
  await insertRepairedOrder(technicianId, 123);
  await enableRepairs();
  await enableVariants();
  await login(page, ADMIN);

  const screens: [string, string][] = [
    ["el listado", "/compras/proveedores"],
    ["el listado filtrado por técnicos", "/compras/proveedores?tipo=tecnicos"],
    ["el listado sin resultados", "/compras/proveedores?q=ferreteria"],
    ["el alta", "/compras/proveedores/nuevo"],
    ["la edición", `/compras/proveedores/${id}/editar`],
    ["la ficha", `/compras/proveedores/${id}`],
    ["la ficha del técnico", `/compras/proveedores/${technicianId}`],
    // El estado de cuenta, sin movimientos: su versión con dos monedas, pagos e imputación se
    // barre en supplier-accounts.spec.ts, donde está el fixture que la llena.
    [
      "el estado de cuenta sin movimientos",
      `/compras/proveedores/${id}/cuenta`,
    ],
  ];
  for (const width of REFLOW_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, href] of screens) {
      await page.goto(href);
      expect(await overflowProblems(page), `${name} a ${width} px`).toEqual([]);
    }
  }
});

// Sin JavaScript, la casilla y el filtro son controles comunes de un formulario (AC-10).
test.describe("sin JavaScript, lo nuevo de la 24.8.2-b", () => {
  test.use({ javaScriptEnabled: false });

  test("la casilla «Es técnico» y el filtro «Tipo» funcionan igual", async ({
    page,
  }) => {
    await insertSupplier({ name: "Distribuidora Norte" });
    await enableRepairs();
    await login(page, ADMIN);

    await page.goto("/compras/proveedores/nuevo");
    await page.getByLabel("Nombre *").fill("Laboratorio Prisma");
    await page.getByRole("checkbox", { name: "Es técnico" }).check();
    await page.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(page).toHaveURL(
      /\/compras\/proveedores\/[0-9a-f-]+\?aviso=creado$/,
    );

    await page.goto("/compras/proveedores");
    const tipo = page.getByRole("group", { name: "Tipo" });
    await tipo.getByText("Técnicos", { exact: true }).click();
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/tipo=tecnicos$/);
    const table = page.getByRole("table", { name: SUPPLIERS_TABLE });
    await expect(table).toContainText("Laboratorio Prisma");
    await expect(table).not.toContainText("Distribuidora Norte");
  });

  test("el menú «Más» de la ficha queda a la vista y desactiva", async ({
    page,
  }) => {
    const id = await insertSupplier({ name: "Distribuidora Norte" });
    await login(page, ADMIN);
    await page.goto(`/compras/proveedores/${id}`);

    // Sin hidratar, `MoreActions` deja la lista abierta: sus acciones se alcanzan igual.
    const desactivar = page.getByRole("link", { name: "Desactivar" });
    await expect(desactivar).toBeVisible();
    await desactivar.click();
    await page.getByRole("button", { name: "Sí, desactivar" }).click();
    await expect(page.getByText("Proveedor desactivado.")).toBeVisible();

    // Y la tarjeta 5 reactiva sin JavaScript.
    await expect(page.getByRole("region", { name: "Estado" })).toContainText(
      "Este proveedor está inactivo.",
    );
    await page.getByRole("button", { name: "Reactivar proveedor" }).click();
    await expect(page.getByText("Proveedor reactivado.")).toBeVisible();
  });
});
