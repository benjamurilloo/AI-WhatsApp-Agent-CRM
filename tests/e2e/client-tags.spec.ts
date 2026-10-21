import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Etiquetas de clientes de punta a punta: Chromium, next start, Server Actions, crm, audit y
// PostgreSQL real, sin mocks (brief-16.1, AC-10 y AC-11). Las pantallas 6, 7 y 13, con axe en
// claro y en oscuro, el teclado y el móvil a 375 px. Las etiquetas y los clientes los crea cada
// caso (D-13).

const AGENT_SOURCE = "agente-e2e-etiquetas";
const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

// Los demás specs borran organizaciones y vacían clients: no pueden quedar etiquetas ni
// asignaciones que lo impidan.
test.afterAll(async () => {
  await db.execute(
    sql`truncate table trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, client_tag_assignments, client_tags, conversation_notes, messages, conversations, clients`,
  );
  await db.execute(
    sql`delete from ingestion_credentials where source = ${AGENT_SOURCE}`,
  );
  await db.$client.end();
});

// audit_logs es de solo inserción: TRUNCATE es la vía documentada para vaciarla (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, client_tag_assignments, client_tags, conversation_notes, messages, conversations, clients`,
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

// Cada estado se analiza en claro y en oscuro (brief-4.0, D-6). AC-11: los seis colores de
// etiqueta pasan el contraste en los dos temas.
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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function insertClient(name: string, phone: string | null = null) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${phone}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertTag(name: string, color = "gray", isActive = true) {
  const result = await db.execute<{ id: string }>(
    sql`insert into client_tags (organization_id, name, color, is_active)
        values (${SEED_ORGANIZATION_ID}, ${name}, ${color}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

async function assign(clientId: string, tagId: string) {
  await db.execute(
    sql`insert into client_tag_assignments (organization_id, client_id, tag_id)
        values (${SEED_ORGANIZATION_ID}, ${clientId}, ${tagId})`,
  );
}

async function assignedNames(clientId: string) {
  const result = await db.execute<{ name: string }>(
    sql`select t.name from client_tag_assignments a
        join client_tags t on t.id = a.tag_id
        where a.client_id = ${clientId} order by t.name`,
  );
  return result.rows.map((row) => row.name);
}

const status = (page: Page) => page.getByRole("status");

test("1. FR-CLI-08: un admin crea las sugeridas, agrega, edita, desactiva y reactiva (pantalla 13)", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Etiquetas" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Etiquetas de clientes" }),
  ).toBeVisible();
  await expectAccessible(page, "catálogo vacío");

  await page.getByRole("button", { name: "Crear las sugeridas" }).click();
  await expect(status(page)).toHaveText("Etiquetas sugeridas creadas.");
  const table = page.getByRole("table", { name: "Etiquetas de clientes" });
  for (const name of [
    "Interesado",
    "No interesado",
    "Quiere señar",
    "Reclamo",
  ]) {
    await expect(table).toContainText(name);
  }
  await expect(
    page.getByRole("button", { name: "Crear las sugeridas" }),
  ).toHaveCount(0);

  // Alta con color, y el nombre repetido sin distinguir mayúsculas da error en el campo.
  const form = page.getByRole("region", { name: "Nueva etiqueta" });
  await form.getByLabel("Nombre").fill("Mayorista");
  await form.getByRole("radio", { name: "Violeta" }).check();
  await form.getByRole("button", { name: "Crear etiqueta" }).click();
  await expect(status(page)).toHaveText("Etiqueta creada.");
  await expect(table).toContainText("Mayorista");

  await page
    .getByRole("region", { name: "Nueva etiqueta" })
    .getByLabel("Nombre")
    .fill("MAYORISTA");
  await page
    .getByRole("region", { name: "Nueva etiqueta" })
    .getByRole("button", { name: "Crear etiqueta" })
    .click();
  await expect(
    page.getByText("Ya existe una etiqueta con ese nombre"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Nueva etiqueta" }).getByLabel("Nombre"),
  ).toBeFocused();
  await expectAccessible(page, "catálogo con error de nombre");

  // Edición desde la fila.
  await table.getByRole("link", { name: "Editar Reclamo" }).click();
  const edit = page.getByRole("region", { name: "Editar «Reclamo»" });
  await edit.getByLabel("Nombre").fill("Queja");
  await edit.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(status(page)).toHaveText("Etiqueta actualizada.");
  await expect(table).toContainText("Queja");

  // Desactivar con confirmación y reactivar.
  await table.getByRole("link", { name: "Desactivar Queja" }).click();
  await expect(
    page.getByText('¿Desactivar la etiqueta "Queja"?'),
  ).toBeFocused();
  await expectAccessible(page, "confirmación de desactivar");
  await page.getByRole("button", { name: "Sí, desactivar" }).click();
  await expect(status(page)).toContainText("Etiqueta desactivada.");
  await table.getByRole("button", { name: "Reactivar Queja" }).click();
  await expect(status(page)).toHaveText("Etiqueta reactivada.");
});

test("2. FR-CLI-09: un admin agrega y quita etiquetas en la ficha, con teclado y auditoría (pantalla 7)", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Etiqueta");
  await insertTag("Reclamo", "red");
  await insertTag("Interesado", "blue");
  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}`);

  const card = page.getByRole("region", { name: "Etiquetas" });
  await expect(
    card.getByText("Este cliente no tiene etiquetas."),
  ).toBeVisible();
  await card.getByLabel("Agregar etiqueta").selectOption({ label: "Reclamo" });
  await card.getByRole("button", { name: "Agregar" }).click();
  await expect(status(page)).toHaveText("Etiqueta agregada.");
  await expect(
    page.getByRole("region", { name: "Etiquetas" }).getByRole("list", {
      name: "Etiquetas del cliente",
    }),
  ).toContainText("Reclamo");
  expect(await assignedNames(clientId)).toEqual(["Reclamo"]);
  // El selector ya no ofrece la que tiene.
  await expect(
    page
      .getByRole("region", { name: "Etiquetas" })
      .getByLabel("Agregar etiqueta")
      .locator("option", { hasText: "Reclamo" }),
  ).toHaveCount(0);
  await expectAccessible(page, "ficha con una etiqueta");

  // La auditoría del cliente lo cuenta con el nombre.
  await expect(page.getByText("Etiqueta agregada: Reclamo")).toBeVisible();

  // Quitar con el teclado: el botón tiene nombre propio.
  const remove = page.getByRole("button", { name: "Quitar Reclamo" });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Etiqueta quitada.");
  expect(await assignedNames(clientId)).toEqual([]);
  await expect(page.getByText("Etiqueta quitada: Reclamo")).toBeVisible();
});

test("3. FR-CLI-10: la lista muestra las etiquetas y filtra por una, también en móvil (pantalla 6)", async ({
  page,
}) => {
  const ana = await insertClient("Ana Filtro");
  const beto = await insertClient("Beto Filtro");
  const reclamo = await insertTag("Reclamo", "red");
  const interesado = await insertTag("Interesado", "green");
  await assign(ana, reclamo);
  await assign(ana, interesado);
  await assign(beto, interesado);
  // Cuatro en un cliente: la fila muestra tres y «+1».
  const carla = await insertClient("Carla Muchas");
  for (const [name, color] of [
    ["Uno", "amber"],
    ["Dos", "violet"],
    ["Tres", "blue"],
    ["Cuatro", "gray"],
  ] as const) {
    await assign(carla, await insertTag(name, color));
  }
  await login(page, ADMIN);
  await page.goto("/clientes");

  const table = page.getByRole("table", {
    name: "Clientes de la organización",
  });
  const anaRow = table.getByRole("row", { name: /Ana Filtro/ });
  await expect(anaRow).toContainText("Reclamo");
  await expect(anaRow).toContainText("Interesado");
  await expect(table.getByRole("row", { name: /Carla Muchas/ })).toContainText(
    "+1",
  );
  await expectAccessible(page, "lista con etiquetas y «+1»");

  await page.getByLabel("Etiqueta").selectOption({ label: "Reclamo" });
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(new RegExp(`etiqueta=${reclamo}`));
  await expect(table.getByRole("link", { name: "Ana Filtro" })).toBeVisible();
  await expect(table.getByRole("link", { name: "Beto Filtro" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Limpiar filtros" }).first(),
  ).toBeVisible();

  // Una etiqueta ajena o inexistente en la URL se ignora.
  await page.goto("/clientes?etiqueta=00000000-0000-4000-8000-000000000000");
  await expect(table.getByRole("link", { name: "Beto Filtro" })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/clientes?etiqueta=${interesado}`);
  const cards = page.getByRole("list", { name: "Clientes de la organización" });
  await expect(cards.getByRole("link", { name: "Ana Filtro" })).toBeVisible();
  await expect(cards.getByRole("link", { name: "Beto Filtro" })).toBeVisible();
  await expect(cards).toContainText("Interesado");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "lista filtrada en móvil");

  await page.goto("/clientes/etiquetas");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "catálogo en móvil");
});

test("4. D-8: una etiqueta inactiva queda en el cliente, marcada, y no se ofrece ni filtra", async ({
  page,
}) => {
  const clientId = await insertClient("Dora Inactiva");
  const vieja = await insertTag("Vieja", "amber", false);
  await insertTag("Nueva", "green");
  await assign(clientId, vieja);
  await login(page, ADMIN);

  await page.goto(`/clientes/${clientId}`);
  const card = page.getByRole("region", { name: "Etiquetas" });
  await expect(card).toContainText("Vieja");
  await expect(card).toContainText("(inactiva)");
  await expect(
    card.getByLabel("Agregar etiqueta").locator("option", { hasText: "Vieja" }),
  ).toHaveCount(0);
  await expectAccessible(page, "ficha con una etiqueta inactiva");

  await page.goto("/clientes");
  await expect(
    page.getByLabel("Etiqueta").locator("option", { hasText: "Vieja" }),
  ).toHaveCount(0);
});

test("5. D-5: un viewer ve las etiquetas sin ningún control de escritura", async ({
  page,
}) => {
  const clientId = await insertClient("Eva Lectora", "+5491166660000");
  const tagId = await insertTag("Reclamo", "red");
  await assign(clientId, tagId);
  await login(page, VIEWER);

  await page.goto(`/clientes/${clientId}`);
  const card = page.getByRole("region", { name: "Etiquetas" });
  await expect(card).toContainText("Reclamo");
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByLabel("Agregar etiqueta")).toHaveCount(0);
  await expectAccessible(page, "ficha del viewer");

  await page.goto("/clientes/etiquetas");
  await expect(
    page.getByRole("table", { name: "Etiquetas de clientes" }),
  ).toContainText("Reclamo");
  await expect(
    page.getByRole("region", { name: "Nueva etiqueta" }),
  ).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Editar/ })).toHaveCount(0);
  await expectAccessible(page, "catálogo del viewer");

  // El filtro también es para el viewer, con el teléfono enmascarado (invariante 5).
  await page.goto(`/clientes?etiqueta=${tagId}`);
  await expect(
    page.getByRole("link", { name: "Eva Lectora" }).first(),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("5491166660000");
});

// Pasa el foco con Tab hasta `target`, como lo haría una persona con el teclado.
async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>) {
  for (let i = 0; i < 40; i++) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab no llegó al elemento");
}

// Revisión independiente de la 16.1.1, hallazgo 1: AC-10 pide el teclado y los 375 px en las
// tres pantallas, también en la ficha.
test("6. AC-10: alta, asignación y filtro solo con teclado, y la ficha a 375 px", async ({
  page,
}) => {
  const clientId = await insertClient("Gabi Teclado");
  await insertClient("Hugo Sin Etiqueta");
  await login(page, ADMIN);

  // Pantalla 13: nombre, color con las flechas y Enter en el botón.
  await page.goto("/clientes/etiquetas");
  const form = page.getByRole("region", { name: "Nueva etiqueta" });
  await tabTo(page, form.getByLabel("Nombre"));
  await page.keyboard.type("Reclamo");
  await tabTo(page, form.getByRole("radio", { name: "Gris" }));
  await page.keyboard.press("ArrowRight");
  await expect(form.getByRole("radio", { name: "Violeta" })).toBeChecked();
  await tabTo(page, form.getByRole("button", { name: "Crear etiqueta" }));
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Etiqueta creada.");

  // Pantalla 7: elegir con la búsqueda por letra del selector y agregar con Enter.
  await page.goto(`/clientes/${clientId}`);
  const card = page.getByRole("region", { name: "Etiquetas" });
  await tabTo(page, card.getByLabel("Agregar etiqueta"));
  await page.keyboard.type("R");
  await expect(card.getByLabel("Agregar etiqueta")).toHaveValue(/.+/);
  await tabTo(page, card.getByRole("button", { name: "Agregar" }));
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Etiqueta agregada.");
  expect(await assignedNames(clientId)).toEqual(["Reclamo"]);

  // Pantalla 6: el filtro.
  await page.goto("/clientes");
  await tabTo(page, page.getByLabel("Etiqueta"));
  await page.keyboard.type("R");
  await tabTo(page, page.getByRole("button", { name: "Buscar" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/etiqueta=/);
  const table = page.getByRole("table", {
    name: "Clientes de la organización",
  });
  await expect(table.getByRole("link", { name: "Gabi Teclado" })).toBeVisible();
  await expect(
    table.getByRole("link", { name: "Hugo Sin Etiqueta" }),
  ).toHaveCount(0);

  // La ficha con la tarjeta de etiquetas, a 375 px.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/clientes/${clientId}`);
  await expect(
    page.getByRole("region", { name: "Etiquetas" }).getByRole("list", {
      name: "Etiquetas del cliente",
    }),
  ).toContainText("Reclamo");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "ficha con etiquetas en móvil");
});

// brief-16.2, AC-4: una etiqueta puesta por el agente se ve en la ficha como cualquier otra, y el
// historial nombra a la credencial. La escritura por el contrato v2 está probada en integración
// (client-tags-ingestion.test.ts); acá se arma por SQL, como en clients.spec.ts.
test("7. FR-CLI-11: la etiqueta que puso el agente se ve en la ficha, con el servicio como autor", async ({
  page,
}) => {
  const clientId = await insertClient("Hilda Agente");
  const tagId = await insertTag("Interesado", "blue");
  await assign(clientId, tagId);
  const credential = await db.execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${SEED_ORGANIZATION_ID}, ${AGENT_SOURCE}, 'ingest', ${`hash-${clientId}`})
        returning id`,
  );
  await db.execute(
    sql`insert into audit_logs
          (organization_id, actor_credential_id, entity_type, entity_id, action, diff)
        values (${SEED_ORGANIZATION_ID}, ${credential.rows[0]!.id}, 'client', ${clientId},
          'tag_change', ${JSON.stringify({ before: { tag: null }, after: { tag: "Interesado" } })}::jsonb)`,
  );

  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}`);
  await expect(page.getByRole("region", { name: "Etiquetas" })).toContainText(
    "Interesado",
  );
  const audit = page.getByRole("table", { name: /Auditoría de/ });
  await expect(audit).toContainText(`Servicio · ${AGENT_SOURCE}`);
  await expect(audit).toContainText("Etiqueta agregada: Interesado");
  await expectAccessible(page, "ficha con una etiqueta del agente");
});
