import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

// inventory_movements y audit_logs son de solo inserción: TRUNCATE es la vía documentada
// para vaciarlas (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, inventory_movements, inventories, products`,
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
  { balance, isActive = true }: { balance?: string; isActive?: boolean } = {},
) {
  const result = await db.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit, reorder_point, is_active)
        values (${SEED_ORGANIZATION_ID}, ${sku}, ${name}, 'unidad', 5, ${isActive})
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
  await expectAccessible(page, "detalle recién creado");

  const stored = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from products where sku = 'CAF-250'`,
  );
  expect(stored.rows[0]!.count).toBe(1);
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
  await expect(pagination.getByText("Página 1 de 2")).toBeVisible();
  await expect(productsTable(page).getByRole("row")).toHaveCount(1 + 25);
  await pagination.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL("/productos?pagina=2");
  await expect(productsTable(page).getByRole("row")).toHaveCount(1 + 2);
  await page.reload();
  await expect(pagination.getByText("Página 2 de 2")).toBeVisible();

  await page.goto("/productos");
  await page.getByLabel("Buscar").fill("Producto 001");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  // Un formulario GET envía todos sus campos, también los que están en su valor por defecto.
  await expect(page).toHaveURL(
    "/productos?q=Producto+001&estado=todos&actividad=activos",
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
  await page.keyboard.press("Tab");
  await page.keyboard.type("Producto de teclado");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Sin descripción");
  await page.keyboard.press("Tab");
  await page.keyboard.type("unidad");
  await page.keyboard.press("Tab");
  await page.keyboard.type("3");
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
