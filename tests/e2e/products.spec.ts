import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 3, 4 y 5 de punta a punta: Chromium, next start, Server Actions, catalog, inventory,
// audit y PostgreSQL real, sin mocks (brief-4.4). Los productos los crea cada caso (D-5).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const ADMIN_NAME = ADMIN_SEED.name;
const TIMEZONE = "America/Argentina/Buenos_Aires";
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";
const NOT_FOUND = "Este producto no existe.";

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

test.afterAll(async () => {
  await db.$client.end();
});

// inventory_movements, product_prices y audit_logs son de solo inserción: TRUNCATE es la vía
// documentada para vaciarlas (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, inventory_movements, inventories, product_images, product_prices, products`,
  );
  await db.execute(sql`delete from login_attempts`);
  await db.execute(sql`delete from sessions`);
  const seedIds = sql.join(
    SEED_USERS.map((user) => sql`${user.id}`),
    sql`, `,
  );
  await db.execute(sql`delete from users where id not in (${seedIds})`);
  await db.execute(
    sql`delete from organizations where id <> ${SEED_ORGANIZATION_ID}`,
  );
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
    // Una navegación en el cliente puede dejar el <title> vacío un instante (brief-6.4, D-6).
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

async function insertProduct(
  sku: string,
  name: string,
  {
    balance,
    isActive = true,
    brand = null,
    category = null,
  }: {
    balance?: string;
    isActive?: boolean;
    brand?: string | null;
    category?: string | null;
  } = {},
) {
  const result = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit, reorder_point, is_active, brand, category)
        values (${SEED_ORGANIZATION_ID}, ${sku}, ${name}, 'unidad', 5, ${isActive}, ${brand}, ${category})
        returning id`,
  );
  const productId = result.rows[0]!.id;
  if (balance !== undefined) {
    await db.execute(
      sql`insert into inventories (organization_id, product_id, quantity_on_hand)
          values (${SEED_ORGANIZATION_ID}, ${productId}, ${balance})`,
    );
  }
  return productId;
}

async function movements(productId: string) {
  const result = await db.execute<{
    type: string;
    quantity: string;
    balance_after: string;
    reason: string;
  }>(
    sql`select type, quantity, balance_after, reason from inventory_movements
        where product_id = ${productId} order by created_at`,
  );
  return result.rows;
}

async function balanceOf(productId: string) {
  const result = await db.execute<{ quantity_on_hand: string }>(
    sql`select quantity_on_hand from inventories where product_id = ${productId}`,
  );
  return result.rows[0]?.quantity_on_hand;
}

const productsTable = (page: Page) =>
  page.getByRole("table", { name: "Productos de la organización" });

test("caso 1: un admin llega desde la navegación, ve el vacío y crea el primer producto", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Productos" })
    .click();
  await expect(page).toHaveURL("/productos");
  await expect(page.getByText("Todavía no hay productos.")).toBeVisible();
  await expectAccessible(page, "lista vacía");

  await page.getByRole("link", { name: "Crear el primero" }).click();
  await expect(page).toHaveURL("/productos/nuevo");
  await page.getByLabel("SKU").fill("CAF-250");
  await page.getByLabel("Nombre").fill("Café molido 250 g");
  // FR-PROD-10 (brief-11.1): marca, categoría y condición.
  await page.getByLabel("Marca").fill("Cafetal");
  await page.getByLabel("Categoría").fill("Almacén");
  await page.getByLabel("Condición").selectOption("refurbished");
  await page.getByLabel("Descripción").fill("Tostado medio");
  await page.getByLabel("Unidad").fill("unidad");
  await page.getByLabel("Punto de reposición").fill("10");
  await expectAccessible(page, "alta");
  await page.getByRole("button", { name: "Crear producto" }).click();

  await expect(page).toHaveURL(/\/productos\/[0-9a-f-]{36}\?aviso=creado$/);
  await expect(page.getByText("Producto creado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Café molido 250 g" }),
  ).toBeVisible();
  await expect(page.getByText("Sin stock")).toBeVisible();
  await expect(page.getByText("Sin movimientos todavía.")).toBeVisible();
  await expect(page.getByText(`Fechas en ${TIMEZONE}.`)).toBeVisible();
  const datos = page.getByRole("region", { name: "Información básica" });
  await expect(datos).toContainText("Cafetal");
  await expect(datos).toContainText("Almacén");
  await expect(datos).toContainText("Reacondicionado");
  await expectAccessible(page, "detalle recién creado");

  const stored = await db.execute<{
    brand: string;
    category: string;
    condition: string;
  }>(
    sql`select brand, category, condition from products where sku = 'CAF-250'`,
  );
  expect(stored.rows).toEqual([
    { brand: "Cafetal", category: "Almacén", condition: "refurbished" },
  ]);
});

test("caso 2: un SKU repetido muestra el mensaje en el campo y no crea nada", async ({
  page,
}) => {
  await insertProduct("CAF-250", "Café molido 250 g");
  await login(page, ADMIN);
  await page.goto("/productos/nuevo");
  await page.getByLabel("SKU").fill("caf-250");
  await page.getByLabel("Nombre").fill("Otro café");
  await page.getByLabel("Unidad").fill("unidad");
  await page.getByLabel("Punto de reposición").fill("1");
  await page.getByRole("button", { name: "Crear producto" }).click();

  const sku = page.getByLabel("SKU");
  await expect(sku).toHaveAccessibleDescription(
    /Ya existe un producto con ese SKU\./,
  );
  await expect(sku).toHaveAttribute("aria-invalid", "true");
  await expect(sku).toBeFocused();
  await expect(page.getByLabel("Nombre")).toHaveValue("Otro café");
  await expectAccessible(page, "alta con SKU repetido");

  const stored = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from products`,
  );
  expect(stored.rows[0]!.count).toBe(1);
});

test("caso 3: editar deja el cambio en la auditoría del producto", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "6",
  });
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}`);
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(`/productos/${productId}?editar=1`);
  await expectAccessible(page, "edición");

  await page.getByLabel("Punto de reposición").fill("10");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Producto actualizado.")).toBeVisible();

  const audit = page.getByRole("table", { name: /Auditoría de/ });
  await expect(audit).toContainText("Edición");
  await expect(audit).toContainText("Punto de reposición: 5 → 10");
  await expect(audit).toContainText(ADMIN_NAME);
  await expect(page.getByText("Bajo stock")).toBeVisible();
});

test("caso 4: desactivar pide confirmación, quita el ajuste y se puede reactivar", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "6",
  });
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}`);
  await page.getByRole("link", { name: "Desactivar" }).click();
  await expect(
    page.getByText('¿Desactivar "Café molido 250 g"?'),
  ).toBeFocused();
  await expectAccessible(page, "confirmación de desactivar");
  await page.getByRole("button", { name: "Sí, desactivar" }).click();

  await expect(page.getByText("Producto desactivado.")).toBeVisible();
  await expect(page.getByText("Inactivo")).toBeVisible();

  await page.goto(`/productos/${productId}/movimientos`);
  await expect(
    page.getByText("Este producto está desactivado y no admite ajustes."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar ajuste" }),
  ).toBeHidden();

  await page.goto(`/productos/${productId}`);
  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Producto reactivado.")).toBeVisible();
  await expect(page.getByText("Activo", { exact: true })).toBeVisible();
});

test("caso 5: un ajuste positivo se registra, aparece en el historial y en el detalle", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "6",
  });
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}/movimientos`);
  await expect(
    page.getByText("Este producto no tiene movimientos."),
  ).toBeVisible();
  await expectAccessible(page, "historial vacío");

  await page.getByLabel("Cantidad *").fill("4");
  await expect(
    page.getByText("Saldo resultante: 6 + 4 = 10 unidad"),
  ).toBeVisible();
  await page.getByLabel("Motivo *").fill("Recepción");
  await page.getByRole("button", { name: "Confirmar ajuste" }).click();

  await expect(page).toHaveURL(
    `/productos/${productId}/movimientos?aviso=ajustado`,
  );
  await expect(page.getByText("Ajuste registrado.")).toBeVisible();
  const table = page.getByRole("table", { name: /Movimientos de/ });
  await expect(table).toContainText("Ajuste positivo");
  await expect(table).toContainText("Recepción");
  await expect(table).toContainText(ADMIN_NAME);
  await expect(
    page.getByText("Inventario · Stock actual: 10 unidad"),
  ).toBeVisible();
  await expectAccessible(page, "historial con un movimiento");

  expect(await movements(productId)).toEqual([
    {
      type: "adjustment_positive",
      quantity: "4.000",
      balance_after: "10.000",
      reason: "Recepción",
    },
  ]);
  expect(await balanceOf(productId)).toBe("10.000");

  await page.goto(`/productos/${productId}`);
  await expect(page.getByText("+4 · Recepción")).toBeVisible();
});

test("caso 6: el formulario no deja confirmar un ajuste que dejaría el stock negativo", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "6",
  });
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}/movimientos`);
  await page.getByRole("radio", { name: "Negativo (−)" }).check();
  await page.getByLabel("Cantidad *").fill("9");
  await page.getByLabel("Motivo *").fill("Rotura");

  await expect(
    page.getByText("Saldo resultante: 6 − 9 = −3 unidad ✕ No permitido"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar ajuste" }),
  ).toBeDisabled();
  await expectAccessible(page, "ajuste que dejaría negativo");

  expect(await movements(productId)).toEqual([]);
  expect(await balanceOf(productId)).toBe("6.000");
});

test("caso 7: si el stock cambió mientras se completaba, el ajuste pide confirmar de nuevo", async ({
  page,
  browser,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "6",
  });
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}/movimientos`);
  await page.getByLabel("Cantidad *").fill("4");
  await page.getByLabel("Motivo *").fill("Recepción");

  // Otra sesión ajusta el mismo producto antes de confirmar.
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await login(otherPage, ADMIN);
    await otherPage.goto(`/productos/${productId}/movimientos`);
    await otherPage.getByRole("radio", { name: "Negativo (−)" }).check();
    await otherPage.getByLabel("Cantidad *").fill("2");
    await otherPage.getByLabel("Motivo *").fill("Rotura");
    await otherPage.getByRole("button", { name: "Confirmar ajuste" }).click();
    await expect(otherPage.getByText("Ajuste registrado.")).toBeVisible();
  } finally {
    await other.close();
  }

  await page.getByRole("button", { name: "Confirmar ajuste" }).click();
  await expect(
    page.getByText(/El stock cambió mientras registrabas el ajuste\./),
  ).toBeFocused();
  await expect(page.getByText(/Saldo actualizado: 4\./)).toBeVisible();
  // La pantalla se actualiza con el saldo real y el motivo escrito no se pierde.
  await expect(
    page.getByText("Inventario · Stock actual: 4 unidad"),
  ).toBeVisible();
  await expect(page.getByLabel("Motivo *")).toHaveValue("Recepción");
  await expectAccessible(page, "ajuste con cambio concurrente");
  expect(await movements(productId)).toHaveLength(1);

  // Con el saldo ya actualizado en el formulario, confirmar de nuevo funciona.
  await page.getByRole("button", { name: "Confirmar ajuste" }).click();
  await expect(page.getByText("Ajuste registrado.")).toBeVisible();
  expect(await balanceOf(productId)).toBe("8.000");
  expect(await movements(productId)).toHaveLength(2);
});

test("caso 8: filtros y página de la lista viven en la URL", async ({
  page,
}) => {
  await db.execute(
    sql`insert into products (organization_id, sku, name, unit, reorder_point, is_active)
        select ${SEED_ORGANIZATION_ID}, 'SKU-' || lpad(i::text, 3, '0'),
               'Producto ' || lpad(i::text, 3, '0'), 'unidad', 5, i % 10 <> 0
        from generate_series(1, 30) as i`,
  );
  await login(page, ADMIN);
  await page.goto("/productos");

  const pagination = page.getByRole("navigation", { name: "Paginación" });
  await expect(
    pagination.getByText("Mostrando 1 a 25 de 27 productos"),
  ).toBeVisible();
  await expect(productsTable(page).getByRole("row")).toHaveCount(1 + 25);
  await pagination.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL("/productos?pagina=2");
  await expect(productsTable(page).getByRole("row")).toHaveCount(1 + 2);
  await page.reload();
  await expect(
    pagination.getByText("Mostrando 26 a 27 de 27 productos"),
  ).toBeVisible();

  await page.goto("/productos");
  await page.getByLabel("Buscar").fill("Producto 001");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  // Un formulario GET envía todos sus campos, también los que están en su valor por defecto.
  await expect(page).toHaveURL(
    "/productos?q=Producto+001&estado=todos&actividad=activos&categoria=&marca=&orden=nombre",
  );
  await expect(productsTable(page).getByRole("row")).toHaveCount(1 + 1);

  await page.goto("/productos?q=inexistente");
  await expect(
    page.getByText("Ningún producto coincide con estos filtros."),
  ).toBeVisible();
  await expectAccessible(page, "lista sin resultados");
  await page.getByRole("link", { name: "Limpiar filtros" }).last().click();
  await expect(page).toHaveURL("/productos");

  await page.goto("/productos?actividad=inactivos");
  await expect(productsTable(page).getByRole("row")).toHaveCount(1 + 3);
});

test("caso 9: los filtros del historial viven en la URL y distinguen sin resultados de sin movimientos", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "0",
  });
  await db.execute(
    sql`insert into inventory_movements
          (organization_id, product_id, type, quantity, balance_after, reason, created_by, created_at)
        values (${SEED_ORGANIZATION_ID}, ${productId}, 'adjustment_positive', 10, 10,
                'Conteo inicial', ${ADMIN_SEED.id}, now() - interval '200 days')`,
  );
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}/movimientos`);
  await expect(
    page.getByRole("table", { name: /Movimientos de/ }),
  ).toBeVisible();

  await page.getByLabel("Período").selectOption("30d");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(
    `/productos/${productId}/movimientos?tipo=todos&periodo=30d`,
  );
  await expect(
    page.getByText("Ningún movimiento coincide con estos filtros."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Limpiar filtros" }).last().click();
  await expect(page).toHaveURL(`/productos/${productId}/movimientos`);
  await page.getByLabel("Tipo").selectOption("negativo");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(
    `/productos/${productId}/movimientos?tipo=negativo&periodo=todo`,
  );
  await expect(
    page.getByText("Ningún movimiento coincide con estos filtros."),
  ).toBeVisible();
});

test("caso 10: un viewer consulta pero no recibe formularios ni auditoría", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "6",
  });
  await login(page, VIEWER);
  await page.goto("/productos");
  await expect(
    page.getByRole("link", { name: "+ Nuevo producto" }),
  ).toBeHidden();

  await page.goto(`/productos/${productId}`);
  await expect(page.getByRole("link", { name: "Editar" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Desactivar" })).toBeHidden();
  await expect(page.getByRole("table", { name: /Auditoría de/ })).toBeHidden();
  expect(await page.content()).not.toContain("Historial de auditoría");
  await expectAccessible(page, "detalle como viewer");

  await page.goto(`/productos/${productId}/movimientos`);
  await expect(
    page.getByRole("button", { name: "Confirmar ajuste" }),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Historial de movimientos" }),
  ).toBeVisible();

  await page.goto("/productos/nuevo");
  await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
  await expect(page.getByLabel("SKU")).toBeHidden();

  // Forzar la edición por la URL tampoco entrega el formulario.
  await page.goto(`/productos/${productId}?editar=1`);
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toBeHidden();
});

test("caso 11: un producto de otra organización o un id inválido no existen", async ({
  page,
}) => {
  const other = await db.execute<{ id: string }>(
    sql`insert into organizations (name) values ('Otra organización') returning id`,
  );
  const foreign = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit, reorder_point)
        values (${other.rows[0]!.id}, 'AJE-001', 'Producto ajeno', 'unidad', 1)
        returning id`,
  );

  await login(page, ADMIN);
  for (const id of [foreign.rows[0]!.id, "no-es-un-uuid"]) {
    await page.goto(`/productos/${id}`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    expect(await page.content()).not.toContain("Producto ajeno");
    await page.goto(`/productos/${id}/movimientos`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
  }
  await expectAccessible(page, "producto inexistente");

  // La organización del seed no tiene productos propios, y "todos" es un filtro activo:
  // la lista responde "sin resultados", nunca con el producto de la otra organización.
  await page.goto("/productos?actividad=todos");
  await expect(
    page.getByText("Ningún producto coincide con estos filtros."),
  ).toBeVisible();
  expect(await page.content()).not.toContain("Producto ajeno");
});

test("caso 12: el alta se completa solo con teclado", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/productos/nuevo");

  const sku = page.getByLabel("SKU");
  for (let i = 0; i < 12; i++) {
    if (await sku.evaluate((element) => element === document.activeElement)) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(sku).toBeFocused();
  await page.keyboard.type("TEC-001");
  // Desde la 17.2, el código de barras va debajo del SKU (brief-17.2, D-11).
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Código de barras")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.type("Producto de teclado");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Marca")).toBeFocused();
  await page.keyboard.type("Teclados SA");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Categoría")).toBeFocused();
  await page.keyboard.type("Periféricos");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Condición")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.type("Sin descripción");
  await page.keyboard.press("Tab");
  await page.keyboard.type("unidad");
  await page.keyboard.press("Tab");
  await page.keyboard.type("3");
  // Desde la 17.2, las tarjetas «Logística» y «Ubicación», en el orden visual (D-11).
  // «Ubicación» también nombra su tarjeta: se busca el campo por su rol.
  for (const field of [
    page.getByLabel("Peso (kg)"),
    page.getByLabel("Largo (cm)"),
    page.getByLabel("Ancho (cm)"),
    page.getByLabel("Alto (cm)"),
    page.getByRole("combobox", { name: "Ubicación" }),
    page.getByLabel("Estante"),
  ]) {
    await page.keyboard.press("Tab");
    await expect(field).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Crear producto" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Producto creado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Producto de teclado" }),
  ).toBeVisible();
});

test("caso 13: en móvil la lista y el historial se ven como tarjetas", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "6",
  });
  await db.execute(
    sql`insert into inventory_movements
          (organization_id, product_id, type, quantity, balance_after, reason, created_by)
        values (${SEED_ORGANIZATION_ID}, ${productId}, 'adjustment_negative', 4, 6,
                'Rotura', ${ADMIN_SEED.id})`,
  );
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, ADMIN);

  await page.goto("/productos");
  const cards = page.getByRole("list", {
    name: "Productos de la organización",
  });
  await expect(cards.getByRole("listitem")).toHaveCount(1);
  await expect(productsTable(page)).toBeHidden();
  await expectAccessible(page, "lista en móvil");

  await page.goto(`/productos/${productId}/movimientos`);
  const movementCards = page.getByRole("list", { name: /Movimientos de/ });
  await expect(movementCards.getByRole("listitem")).toHaveCount(1);
  await expect(movementCards).toContainText("Rotura");
  await expectAccessible(page, "historial en móvil");
});

// FR-PROD-10 y FR-PROD-11 (brief-11.1, AC-5): la búsqueda por palabras encuentra por marca y por
// categoría, un viewer ve los campos nuevos sin poder editarlos, y "bajo stock" usa el token de
// advertencia (O-17) sin violaciones de axe en claro ni en oscuro.
test("caso 14: FR-PROD-11 busca por marca y categoría; FR-PROD-10 un viewer ve los campos", async ({
  page,
}) => {
  const coffee = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "3",
    brand: "Nescafé",
    category: "Bebidas",
  });
  await insertProduct("YER-500", "Yerba 500 g", {
    balance: "40",
    brand: "Playadito",
    category: "Almacén",
  });
  await insertProduct("AZU-1K", "Azúcar 1 kg", {
    balance: "40",
    category: "Almacén",
  });

  await login(page, VIEWER);
  await page.goto("/productos");
  const table = productsTable(page);
  await expect(table).toContainText("Nescafé");
  await expect(table).toContainText("Bebidas");
  // "Bajo stock" con el token de advertencia, y la lista sin violaciones (O-17).
  await expect(table.getByText("Bajo stock")).toBeVisible();
  await expectAccessible(page, "lista con bajo stock");

  // Por marca, sin acentos y por prefijo.
  await page.getByLabel("Buscar").fill("nesca");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(table.getByRole("row")).toHaveCount(1 + 1);
  await expect(table).toContainText("Café molido 250 g");

  // Por categoría, sin acentos: los dos de almacén.
  await page.goto("/productos?q=almacen");
  await expect(table.getByRole("row")).toHaveCount(1 + 2);

  // Palabras de campos distintos, todas a la vez.
  await page.goto("/productos?q=almacen+playa");
  await expect(table.getByRole("row")).toHaveCount(1 + 1);
  await expect(table).toContainText("Yerba 500 g");

  // El viewer ve marca, categoría y condición en el detalle, sin formulario.
  await page.goto(`/productos/${coffee}`);
  const datos = page.getByRole("region", { name: "Información básica" });
  await expect(datos).toContainText("Nescafé");
  await expect(datos).toContainText("Bebidas");
  await expect(datos).toContainText("Nuevo");
  await expect(page.getByLabel("Marca")).toBeHidden();
  await expectAccessible(page, "detalle con marca y categoría");
});

async function prices(productId: string) {
  const result = await db.execute<{ amount: string; currency: string }>(
    sql`select amount, currency from product_prices
        where product_id = ${productId} order by created_at, id`,
  );
  return result.rows;
}

// FR-PROD-12 y D-6 (brief-11.1, AC-11): el admin fija un precio desde la pantalla nueva. «300.000»
// en pesos chilenos se rechaza con su mensaje; el monto formateado se muestra antes de confirmar,
// y el precio aparece en el historial, en el detalle, en la lista y en la auditoría.
test("caso 15: FR-PROD-12 el admin fija precios; «300.000» en CLP se rechaza", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g", {
    balance: "20",
  });
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}`);
  const datos = page.getByRole("region", { name: "Precio" });
  await expect(datos).toContainText("Sin precio");
  await datos
    .getByRole("link", { name: "Ver historial y fijar precio" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/productos/${productId}/precios$`));
  await expect(
    page.getByText("Este producto todavía no tiene precio."),
  ).toBeVisible();
  await expectAccessible(page, "precios sin precio");

  await page.getByLabel("Moneda *").selectOption("CLP");
  await page.getByLabel("Monto *").fill("300.000");
  await page.getByRole("button", { name: "Confirmar precio" }).click();
  await expect(page.getByLabel("Monto *")).toBeFocused();
  await expect(
    page.getByText(/escribí el monto sin puntos ni comas/),
  ).toBeVisible();
  await expectAccessible(page, "precio rechazado");
  expect(await prices(productId)).toEqual([]);

  // Antes de confirmar, el monto se muestra en su moneda.
  await page.getByLabel("Monto *").fill("300000");
  await expect(page.getByText("Precio nuevo: CLP 300.000")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar precio" }).click();
  await expect(page.getByText("Precio fijado.")).toBeVisible();
  await expect(
    page.getByText("Precios · Precio vigente: CLP 300.000"),
  ).toBeVisible();
  expect(await prices(productId)).toEqual([
    { amount: "300000.00", currency: "CLP" },
  ]);

  // Un precio nuevo en otra moneda: el anterior queda en el historial.
  await page.getByLabel("Moneda *").selectOption("USD");
  await page.getByLabel("Monto *").fill("1.234,5");
  await expect(page.getByText("Precio nuevo: US$ 1.234,50")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar precio" }).click();
  await expect(
    page.getByText("Precios · Precio vigente: US$ 1.234,50"),
  ).toBeVisible();
  const history = page.getByRole("table", {
    name: "Historial de precios de Café molido 250 g",
  });
  await expect(history.getByRole("row")).toHaveCount(1 + 2);
  await expect(history.getByRole("row").nth(1)).toContainText("vigente");
  await expect(history).toContainText("CLP 300.000");
  await expect(history).toContainText(ADMIN_NAME);
  await expectAccessible(page, "precios con historial");

  await page.goto("/productos");
  await expect(productsTable(page)).toContainText("US$ 1.234,50");
  await page.goto(`/productos/${productId}`);
  await expect(datos).toContainText("US$ 1.234,50");
  const audit = page.getByRole("region", { name: "Historial de auditoría" });
  await expect(audit).toContainText("Precio: CLP 300.000 → US$ 1.234,50");
  await expect(audit).toContainText("Precio: sin precio → CLP 300.000");
});

// D-7: si otro admin fijó un precio mientras se completaba el formulario, el servidor responde
// CONFLICT, la pantalla muestra el vigente nuevo y confirmar otra vez lo reemplaza. Un rechazo de
// validación en el medio no hace olvidar qué precio vio (revisión independiente de la 11.1, M-1),
// y después de fijarlo se puede fijar otro sin un CONFLICT falso ni el mensaje anterior (M-4).
test("caso 16: FR-PROD-12 si el precio cambió mientras se completaba, pide confirmar de nuevo", async ({
  page,
  browser,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g");
  await login(page, ADMIN);
  await page.goto(`/productos/${productId}/precios`);
  await page.getByLabel("Moneda *").selectOption("ARS");
  // Ambiguo en una moneda con decimales: cinco mil, o cinco. Se rechaza.
  await page.getByLabel("Monto *").fill("5.000");

  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await login(otherPage, ADMIN);
    await otherPage.goto(`/productos/${productId}/precios`);
    await otherPage.getByLabel("Moneda *").selectOption("ARS");
    await otherPage.getByLabel("Monto *").fill("4500");
    await otherPage.getByRole("button", { name: "Confirmar precio" }).click();
    await expect(otherPage.getByText("Precio fijado.")).toBeVisible();
  } finally {
    await other.close();
  }

  await page.getByRole("button", { name: "Confirmar precio" }).click();
  await expect(page.getByLabel("Monto *")).toBeFocused();
  await expect(page.getByText(/más decimales de los que usa/)).toBeVisible();
  expect(await prices(productId)).toHaveLength(1);

  // Corregido el monto, el precio que vio sigue siendo el de antes: CONFLICT, no una escritura
  // encima del de la otra sesión.
  await page.getByLabel("Monto *").fill("5000");
  await page.getByRole("button", { name: "Confirmar precio" }).click();
  await expect(
    page.getByText(/El precio cambió mientras fijabas uno nuevo\./),
  ).toBeFocused();
  await expect(
    // Intl separa el símbolo con U+00A0, y una regex no normaliza los espacios.
    page.getByText(/Precio vigente: \$\s4\.500,00\. Revisá/),
  ).toBeVisible();
  await expect(page.getByLabel("Monto *")).toHaveValue("5000");
  // El reinicio del formulario tras la acción no vacía la moneda: con el select vacío, el
  // navegador bloqueaba el envío siguiente sin avisar (defecto encontrado en esta etapa).
  await expect(page.getByLabel("Moneda *")).toHaveValue("ARS");
  await expectAccessible(page, "precio con cambio concurrente");
  expect(await prices(productId)).toHaveLength(1);

  await page.getByRole("button", { name: "Confirmar precio" }).click();
  await expect(page.getByText("Precio fijado.")).toBeVisible();
  expect(await prices(productId)).toEqual([
    { amount: "4500.00", currency: "ARS" },
    { amount: "5000.00", currency: "ARS" },
  ]);

  // Otro precio sobre el recién fijado, desde la misma URL: sin CONFLICT falso ni mensaje viejo.
  await expect(page.getByText(/El precio cambió/)).toBeHidden();
  await page.getByLabel("Monto *").fill("5100");
  await page.getByRole("button", { name: "Confirmar precio" }).click();
  await expect(
    page.getByText(/^Precios · Precio vigente: \$\s5\.100,00$/),
  ).toBeVisible();
  await expect(page.getByText(/El precio cambió/)).toBeHidden();
  expect(await prices(productId)).toHaveLength(3);

  // El mismo precio otra vez: se avisa y no se escribe (D-7).
  await page.getByLabel("Monto *").fill("5100");
  await page.getByRole("button", { name: "Confirmar precio" }).click();
  await expect(
    page.getByText(
      "Ese ya es el precio vigente: no se registró ningún cambio.",
    ),
  ).toBeVisible();
  expect(await prices(productId)).toHaveLength(3);
});

// FR-PROD-12 y FR-PROD-13: un viewer ve el precio y el historial, sin formulario; ninguna pantalla
// ofrece editar ni borrar un precio.
test("caso 17: FR-PROD-13 un viewer ve precios e historial sin formulario", async ({
  page,
}) => {
  const productId = await insertProduct("CAF-250", "Café molido 250 g");
  await insertProduct("YER-500", "Yerba 500 g");
  const admin = await db.execute<{ id: string }>(
    sql`select id from users where email = ${ADMIN}`,
  );
  await db.execute(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${SEED_ORGANIZATION_ID}, ${productId}, 1500, 'ARS', ${admin.rows[0]!.id})`,
  );

  await login(page, VIEWER);
  await page.goto("/productos");
  const table = productsTable(page);
  await expect(table.getByRole("row", { name: /Café molido/ })).toContainText(
    "$ 1.500,00",
  );
  await expect(table.getByRole("row", { name: /Yerba/ })).toContainText(
    "Sin precio",
  );
  await expectAccessible(page, "lista con precios");

  await page.goto(`/productos/${productId}`);
  await page.getByRole("link", { name: "Ver historial de precios" }).click();
  await expect(
    page.getByText("Precios · Precio vigente: $ 1.500,00"),
  ).toBeVisible();
  await expect(
    page.getByRole("table", {
      name: "Historial de precios de Café molido 250 g",
    }),
  ).toContainText("$ 1.500,00");
  await expect(page.getByLabel("Monto *")).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Editar|Borrar|Eliminar/ }),
  ).toHaveCount(0);
  await expectAccessible(page, "precios para viewer");
});

test("caso 18: brief-15.2 ordena, elige las filas por página y los conserva al paginar", async ({
  page,
}) => {
  // P01 a P12: el stock crece con el número y el precio también; «Sin precio» no tiene.
  for (let i = 1; i <= 12; i++) {
    const n = String(i).padStart(2, "0");
    const productId = await insertProduct(`SKU-${n}`, `P${n}`, {
      balance: String(i),
    });
    await db.execute(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${SEED_ORGANIZATION_ID}, ${productId}, ${i * 100}, 'ARS', ${ADMIN_SEED.id})`,
    );
  }
  await insertProduct("SKU-00", "Sin precio", { balance: "50" });
  await login(page, ADMIN);
  await page.goto("/productos");

  const rows = productsTable(page).getByRole("row");
  const firstName = () => rows.nth(1).getByRole("cell").nth(1);
  await expect(firstName()).toHaveText("P01");

  await page.getByLabel("Ordenar por").selectOption("precio-mayor");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/[?&]orden=precio-mayor$/);
  await expect(page.getByLabel("Ordenar por")).toHaveValue("precio-mayor");
  await expect(firstName()).toHaveText("P12");
  // Sin precio, al final también en este sentido.
  await expect(rows.last().getByRole("cell").nth(1)).toHaveText("Sin precio");

  const sizes = page.getByRole("group", { name: "Filas por página" });
  await expect(
    sizes.getByText("25 filas por página", { exact: false }),
  ).toBeVisible();
  await sizes.getByRole("link", { name: "10 filas por página" }).click();
  await expect(page).toHaveURL("/productos?orden=precio-mayor&filas=10");
  await expect(rows).toHaveCount(1 + 10);
  const pagination = page.getByRole("navigation", { name: "Paginación" });
  await expect(
    pagination.getByText("Mostrando 1 a 10 de 13 productos"),
  ).toBeVisible();
  await pagination.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL(/[?&]orden=precio-mayor&filas=10&pagina=2$/);
  await expect(rows).toHaveCount(1 + 3);
  await expect(firstName()).toHaveText("P02");
  await expectAccessible(page, "lista ordenada por precio, 10 filas");

  // Filtrar conserva las filas por página y vuelve a la página 1.
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/[?&]filas=10$/);
  await expect(rows).toHaveCount(1 + 10);

  await page.goto("/productos?orden=stock-mayor&filas=50");
  await expect(firstName()).toHaveText("Sin precio");
  await expect(rows).toHaveCount(1 + 13);

  // AC-3: los demás órdenes del selector, por sus dos primeras filas.
  const firstTwo = async (orden: string, names: [string, string]) => {
    await page.goto(`/productos?orden=${orden}`);
    await expect(page.getByLabel("Ordenar por")).toHaveValue(orden);
    await expect(firstName()).toHaveText(names[0]);
    await expect(rows.nth(2).getByRole("cell").nth(1)).toHaveText(names[1]);
  };
  await firstTwo("nombre-za", ["Sin precio", "P12"]);
  await firstTwo("sku", ["Sin precio", "P01"]);
  await firstTwo("stock-menor", ["P01", "P02"]);
  await firstTwo("precio-menor", ["P01", "P02"]);
  await expect(rows.last().getByRole("cell").nth(1)).toHaveText("Sin precio");

  await page.goto("/productos?orden=inventado&filas=7");
  await expect(firstName()).toHaveText("P01");
  await expect(page.getByLabel("Ordenar por")).toHaveValue("nombre");
});

test("caso 19: brief-15.2 filtra por categoría y por marca, y los conserva al ordenar y paginar", async ({
  page,
}) => {
  await insertProduct("NOT-1", "Atlas", {
    brand: "Arkon",
    category: "Notebooks",
  });
  await insertProduct("NOT-2", "Zenda", {
    brand: "Veltra",
    category: "Notebooks",
  });
  await insertProduct("CEL-1", "Nova", {
    brand: "Arkon",
    category: "Celulares",
  });
  await insertProduct("SIN-1", "Sin datos");
  await login(page, ADMIN);
  await page.goto("/productos");

  const category = page.getByLabel("Categoría");
  const brand = page.getByLabel("Marca");
  await expect(category).toHaveValue("");
  await expect(category.getByRole("option")).toHaveText([
    "Todas",
    "Celulares",
    "Notebooks",
  ]);
  await expect(brand.getByRole("option")).toHaveText([
    "Todas",
    "Arkon",
    "Veltra",
  ]);

  const rows = productsTable(page).getByRole("row");
  const shownNames = () => rows.locator("td:nth-child(2)").allTextContents();

  await category.selectOption("Notebooks");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/[?&]categoria=Notebooks&marca=&orden=nombre$/);
  await expect(rows).toHaveCount(1 + 2);
  expect(await shownNames()).toEqual(["Atlas", "Zenda"]);
  await expect(
    page.getByRole("link", { name: "Limpiar filtros" }),
  ).toBeVisible();

  await brand.selectOption("Arkon");
  await page.getByLabel("Ordenar por").selectOption("nombre-za");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(rows).toHaveCount(1 + 1);
  expect(await shownNames()).toEqual(["Atlas"]);
  await expect(category).toHaveValue("Notebooks");
  await expect(brand).toHaveValue("Arkon");

  // Los enlaces de filas por página conservan los dos filtros.
  await page
    .getByRole("group", { name: "Filas por página" })
    .getByRole("link", { name: "10 filas por página" })
    .click();
  await expect(page).toHaveURL(
    "/productos?categoria=Notebooks&marca=Arkon&orden=nombre-za&filas=10",
  );
  await expect(rows).toHaveCount(1 + 1);

  // Solo marca, desde la URL.
  await page.goto("/productos?marca=Arkon");
  expect(await shownNames()).toEqual(["Atlas", "Nova"]);
  await expectAccessible(page, "lista filtrada por marca");

  // Un valor que no está en la lista se muestra elegido y no encuentra nada, sin error.
  await page.goto("/productos?categoria=Inexistente");
  await expect(category).toHaveValue("Inexistente");
  await expect(
    page.getByText("Ningún producto coincide con estos filtros."),
  ).toBeVisible();
});

test("caso 20: brief-15.2 las sugerencias de marca y categoría son propias y se usan con teclado y con el mouse", async ({
  page,
}) => {
  await insertProduct("NOT-1", "Atlas", {
    brand: "Arkon",
    category: "Notebooks",
  });
  await insertProduct("CEL-1", "Nova", {
    brand: "Brisa",
    category: "Celulares",
  });
  await insertProduct("ALM-1", "Yerba", { category: "Almacén" });
  await login(page, ADMIN);
  await page.goto("/productos/nuevo");

  const category = page.getByRole("combobox", { name: "Categoría" });
  const list = page.getByRole("listbox", { name: "Sugerencias" });
  await expect(category).toHaveAttribute("aria-expanded", "false");
  await expect(list).toBeHidden();

  // Escribir filtra sin tildes ni mayúsculas.
  await category.fill("ALMACEN");
  await expect(category).toHaveAttribute("aria-expanded", "true");
  await expect(list.getByRole("option")).toHaveText(["Almacén"]);
  await expectAccessible(page, "alta con la lista de sugerencias abierta");

  // Flechas y Enter: el foco queda en el campo y Enter elige sin enviar el formulario.
  await category.fill("");
  await category.press("Escape");
  await expect(list).toBeHidden();
  // La flecha abre la lista sin marcar ninguna opción; las siguientes se mueven.
  await category.press("ArrowDown");
  await expect(category).not.toHaveAttribute("aria-activedescendant", /.+/);
  await expect(list.getByRole("option")).toHaveText([
    "Almacén",
    "Celulares",
    "Notebooks",
  ]);
  await category.press("ArrowDown");
  await category.press("ArrowDown");
  const active = list.getByRole("option", { name: "Celulares" });
  await expect(active).toHaveAttribute("aria-selected", "true");
  await expect(category).toHaveAttribute(
    "aria-activedescendant",
    (await active.getAttribute("id"))!,
  );
  await category.press("Enter");
  await expect(category).toHaveValue("Celulares");
  await expect(category).toBeFocused();
  await expect(list).toBeHidden();
  await expect(page).toHaveURL("/productos/nuevo");

  // Escape cierra sin cambiar el texto.
  await category.press("ArrowDown");
  await expect(list).toBeVisible();
  await category.press("Escape");
  await expect(list).toBeHidden();
  await expect(category).toHaveValue("Celulares");

  // Con el mouse, en Marca.
  const brand = page.getByRole("combobox", { name: "Marca" });
  await brand.fill("bri");
  await list.getByRole("option", { name: "Brisa" }).click();
  await expect(brand).toHaveValue("Brisa");
  await expect(brand).toBeFocused();
  await expect(list).toBeHidden();

  // Un valor que no está en la lista se acepta igual: es texto libre.
  await page.getByLabel("SKU").fill("TAB-1");
  await page.getByLabel("Nombre").fill("Tableta");
  await category.fill("Tablets");
  await page.getByLabel("Unidad").fill("unidad");
  await page.getByLabel("Punto de reposición").fill("1");
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(page).toHaveURL(/\/productos\/[0-9a-f-]{36}\?aviso=creado$/);
  const datos = page.getByRole("region", { name: "Información básica" });
  await expect(datos).toContainText("Brisa");
  await expect(datos).toContainText("Tablets");
});

test("caso 21: brief-15.2 sin JavaScript, marca y categoría son campos de texto que se envían igual", async ({
  browser,
  page,
}) => {
  await login(page, ADMIN);
  const context = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  const noScript = await context.newPage();
  await noScript.goto("/productos/nuevo");
  await expect(
    noScript.getByRole("listbox", { name: "Sugerencias" }),
  ).toBeHidden();
  await noScript.getByLabel("SKU").fill("SJS-1");
  await noScript.getByLabel("Nombre").fill("Sin script");
  await noScript.getByLabel("Marca").fill("Arkon");
  await noScript.getByLabel("Categoría").fill("Notebooks");
  await noScript.getByLabel("Unidad").fill("unidad");
  await noScript.getByLabel("Punto de reposición").fill("1");
  await noScript.getByRole("button", { name: "Crear producto" }).click();
  await expect(noScript).toHaveURL(/\/productos\/[0-9a-f-]{36}\?aviso=creado$/);
  const stored = await db.execute<{ brand: string; category: string }>(
    sql`select brand, category from products where sku = 'SJS-1'`,
  );
  expect(stored.rows).toEqual([{ brand: "Arkon", category: "Notebooks" }]);
  await context.close();
});

test("caso 22: brief-15.2 el buscador sugiere productos con la regla de la búsqueda y elegir abre el producto", async ({
  page,
  playwright,
}) => {
  const atlasId = await insertProduct("NOT-ATL", "Atlas Pro", {
    brand: "Arkon",
    category: "Notebooks",
  });
  await insertProduct("NOT-ZEN", "Zenda 13", { brand: "Arkon" });
  await insertProduct("NOT-OLD", "Atlas viejo", { isActive: false });
  await login(page, VIEWER);
  await page.goto("/productos");

  let captured: Request | undefined;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      captured ??= request;
    }
  });

  const search = page.getByRole("combobox", { name: "Buscar" });
  const list = page.getByRole("listbox", { name: "Sugerencias" });

  // Por palabra de la marca: los dos activos, con su SKU; el inactivo, no.
  await search.fill("arkon");
  await expect(list.getByRole("option")).toHaveCount(2);
  await expect(list).toContainText("NOT-ATL");
  await expect(list).not.toContainText("Atlas viejo");
  await expectAccessible(page, "buscador con sugerencias abiertas");

  // SKU exacto.
  await search.fill("NOT-ZEN");
  await expect(list.getByRole("option")).toHaveText(["Zenda 13 NOT-ZEN"]);

  // Enter sin elegir busca como siempre.
  await search.press("Escape");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/productos\?q=NOT-ZEN&/);
  await expect(productsTable(page).getByRole("row")).toHaveCount(1 + 1);

  // Con el mouse, elegir abre el detalle.
  await page.goto("/productos");
  await search.fill("atlas");
  await list.getByRole("option", { name: /Atlas Pro/ }).click();
  await expect(page).toHaveURL(`/productos/${atlasId}`);

  // AC-6: la misma acción, sin la cookie de sesión, no devuelve sugerencias.
  expect(captured, "no se capturó la acción de sugerencias").toBeTruthy();
  const anonymous = await playwright.request.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const response = await anonymous.post(captured!.url(), {
    headers: captured!.headers(),
    data: captured!.postData() ?? "",
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(await response.text()).not.toContain("Atlas Pro");
  expect(
    response.headers()["x-action-redirect"] ?? response.headers()["location"],
  ).toMatch(/\/login/);
  await anonymous.dispose();
});

test("caso 23: brief-15.2 una lista nueva de sugerencias reinicia la opción marcada y Enter busca", async ({
  page,
}) => {
  await insertProduct("NOT-ATL", "Atlas Pro", { brand: "Arkon" });
  await insertProduct("NOT-BRI", "Brisa 14", { brand: "Arkon" });
  await insertProduct("NOT-ZEN", "Zenda 13", { brand: "Arkon" });
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await login(page, VIEWER);
  await page.goto("/productos");

  // La respuesta a «NOT-ZEN» llega tarde: mientras tanto se marca la tercera opción de la lista vieja.
  await page.route("**/productos", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.headers()["next-action"] &&
      (request.postData() ?? "").includes("NOT-ZEN")
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await route.continue();
  });

  const search = page.getByRole("combobox", { name: "Buscar" });
  const list = page.getByRole("listbox", { name: "Sugerencias" });
  await search.fill("arkon");
  await expect(list.getByRole("option")).toHaveCount(3);
  await search.fill("NOT-ZEN");
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", /-2$/);

  // Llega la lista de una opción: ninguna queda marcada, y Enter busca en lugar de fallar.
  await expect(list.getByRole("option")).toHaveText(["Zenda 13 NOT-ZEN"]);
  await expect(search).not.toHaveAttribute("aria-activedescendant", /.*/);
  await search.press("Enter");
  await expect(page).toHaveURL(/\/productos\?q=NOT-ZEN&/);
  expect(errors).toEqual([]);
});
