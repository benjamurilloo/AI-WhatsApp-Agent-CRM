import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
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
    sql`truncate table supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, audit_logs`,
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
  await expect(nav.getByRole("link", { name: "Compras" })).toHaveAttribute(
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
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/compras\/proveedores\?q=&estado=inactivos$/);
  await expect(table).toContainText("Distribuidora Norte SRL");
  await expectAccessible(page, "lista de inactivos");

  // La búsqueda por parte del nombre y por CUIT.
  await page.goto("/compras/proveedores?estado=todos");
  await page.getByLabel("Buscar").fill("norte srl");
  await page.getByLabel("Buscar").press("Enter");
  await expect(table).toContainText("Distribuidora Norte SRL");
  await expect(table).not.toContainText("Bodega del Sur");
  await page.getByLabel("Buscar").fill("20 12345678 6");
  await page.getByLabel("Buscar").press("Enter");
  await expect(table).toContainText("Distribuidora Norte SRL");
  await page.getByLabel("Buscar").fill("Ferretería");
  await page.getByLabel("Buscar").press("Enter");
  await expect(
    page.getByText("Ningún proveedor coincide con esta búsqueda."),
  ).toBeVisible();

  // La reactivación y la historia.
  await page.goto(`/compras/proveedores/${id}`);
  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Proveedor reactivado.")).toBeVisible();
  const history = page.getByRole("region", {
    name: "Auditoría de Distribuidora Norte SRL",
  });
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
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
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
