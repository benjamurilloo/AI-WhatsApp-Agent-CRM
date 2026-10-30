import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Pantallas 6 y 7 de punta a punta: Chromium, next start, Server Actions, crm, audit y PostgreSQL
// real, sin mocks (brief-5.3). Los clientes los crea cada caso (brief-4.4, D-5).

const [ADMIN_SEED, VIEWER_SEED] = SEED_USERS;
const ADMIN = ADMIN_SEED.email;
const VIEWER = VIEWER_SEED.email;
const ADMIN_NAME = ADMIN_SEED.name;
const TIMEZONE = "America/Argentina/Buenos_Aires";
const FORBIDDEN_PAGE = "No tenés permiso para ver esta página.";
const NOT_FOUND = "Este cliente no existe.";
// Distinto del ejemplo de la ayuda del formulario, que viaja en el JS del navegador.
const PHONE = "+5491166667788";
// El número guardado, entero o sin los últimos 4 dígitos (H-5). La búsqueda del viewer se escribe
// con separadores, que la página le devuelve en el campo: eso es lo que él tipeó, no una fuga.
const HIDDEN_FRAGMENTS = ["5491166667788", "549116666"];

let db: Db;

test.beforeAll(() => {
  db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL ?? ""));
});

// Los demás specs borran organizaciones: no pueden quedar clientes que lo impidan.
// TRUNCATE de clients exige vaciar en la misma sentencia las tablas que la referencian (brief-6.1).
test.afterAll(async () => {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, conversation_notes, messages, conversations, client_tag_assignments, clients`,
  );
  // La credencial del caso 16 queda referenciada por su fila de auditoría (RESTRICT, brief-12.1).
  await db.execute(
    sql`truncate table service_order_lines, service_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs`,
  );
  await db.execute(
    sql`delete from ingestion_credentials where source = ${SERVICE_SOURCE}`,
  );
  await db.$client.end();
});

// audit_logs y messages son de solo inserción: TRUNCATE es la vía documentada para vaciarlas (ADR 0013).
test.beforeEach(async () => {
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, conversation_notes, messages, conversations, client_tag_assignments, clients`,
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

async function insertClient(
  displayName: string,
  {
    phone = null,
    notes = null,
    isActive = true,
    organizationId = SEED_ORGANIZATION_ID,
  }: {
    phone?: string | null;
    notes?: string | null;
    isActive?: boolean;
    organizationId?: string;
  } = {},
) {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, notes, is_active)
        values (${organizationId}, ${displayName}, ${phone}, ${notes}, ${isActive})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function clientCount() {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from clients`,
  );
  return result.rows[0]!.count;
}

const clientsTable = (page: Page) =>
  page.getByRole("table", { name: "Clientes de la organización" });

// Las pestañas de la ficha (brief-24.4.1, D-1): enlaces con aria-current.
const clientTab = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: /^Secciones de / })
    .getByRole("link", { name, exact: true });

// Emisor sintético del caso 16 (brief-12.1, D-4): no coincide con ningún nombre real.
const SERVICE_SOURCE = "emisor-e2e";

test("caso 1: un admin llega desde la navegación, ve el vacío y crea el primer cliente", async ({
  page,
}) => {
  await login(page, ADMIN);
  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("link", { name: "Clientes", exact: true }).click();
  await expect(page).toHaveURL("/clientes");
  await expect(
    nav.getByRole("link", { name: "Clientes", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Todavía no hay clientes.")).toBeVisible();
  await expectAccessible(page, "lista vacía");

  // El vacío lleva «Nuevo cliente», como el encabezado (brief-24.4.2, panel 04 de 08).
  await page
    .getByRole("main")
    .getByRole("link", { name: "Nuevo cliente" })
    .last()
    .click();
  await expect(page).toHaveURL("/clientes/nuevo");
  await page.getByLabel("Nombre completo *").fill("Ana Pérez");
  await page.getByLabel("Teléfono WhatsApp").fill("+54 9 11 6666-7788");
  await expect(
    page.getByLabel("Observaciones internas"),
  ).toHaveAccessibleDescription(
    "Esta información es visible para el equipo. No registres datos sensibles innecesarios.",
  );
  await page
    .getByLabel("Observaciones internas")
    .fill("Prefiere retirar por la tarde.");
  await expectAccessible(page, "alta");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}\?aviso=creado$/);
  await expect(page.getByText("Cliente creado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Clientes", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(clientTab(page, "Resumen")).toHaveAttribute(
    "aria-current",
    "page",
  );
  const data = page.getByRole("region", { name: "Datos de contacto" });
  await expect(data).toContainText(PHONE);
  await expect(data).toContainText("Prefiere retirar por la tarde.");
  await expect(
    page.getByRole("region", { name: "Última interacción" }),
  ).toContainText("Sin interacciones");
  // Sin conversaciones, «Abrir conversación» no aparece (brief-24.4.1, AC-2).
  await expect(
    page.getByRole("link", { name: "Abrir conversación" }),
  ).toBeHidden();
  await expectAccessible(page, "detalle recién creado");

  // La auditoría, en la pestaña Actividad (brief-24.4.1, D-6).
  await clientTab(page, "Actividad").click();
  await expect(clientTab(page, "Actividad")).toHaveAttribute(
    "aria-current",
    "page",
  );
  const audit = page.getByRole("table", { name: "Auditoría de Ana Pérez" });
  await expect(audit).toContainText("Alta");
  await expect(audit).toContainText(
    `Nombre: Ana Pérez · Teléfono: ${PHONE} · Notas cargadas`,
  );
  await expect(audit).not.toContainText("Prefiere retirar");
  await expect(audit).toContainText(ADMIN_NAME);
  await expect(page.getByText(`Fechas en ${TIMEZONE}.`).first()).toBeVisible();
  await expectAccessible(page, "actividad recién creado");

  await page.getByRole("link", { name: "Volver a clientes" }).click();
  await expect(clientsTable(page)).toContainText("Ana Pérez");
  await expect(clientsTable(page)).toContainText(PHONE);
  await expect(clientsTable(page)).toContainText("Última interacción");
  await expect(clientsTable(page)).toContainText("Sin interacciones");
  await expectAccessible(page, "lista con un cliente");
});

test("caso 2: la validación marca el campo, conserva lo escrito y no crea nada", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");
  await page.getByLabel("Nombre completo *").fill("   ");
  await page.getByLabel("Teléfono WhatsApp").fill("011 5555-1234");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  const name = page.getByLabel("Nombre completo *");
  await expect(name).toHaveAccessibleDescription(
    "Ingresá un nombre de hasta 200 caracteres.",
  );
  // Desde la 24.4.2, el foco va al resumen de errores, que lleva al campo (brief-24.1, D-8).
  const summary = page.getByRole("group", {
    name: "Revisá 1 campo para guardar",
  });
  await expect(summary).toBeFocused();
  await summary
    .getByRole("link", { name: "Ingresá un nombre de hasta 200 caracteres." })
    .click();
  await expect(name).toBeFocused();

  await name.fill("Bruno Díaz");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  const phone = page.getByLabel("Teléfono WhatsApp");
  await expect(phone).toHaveAccessibleDescription(/con \+ y código de país/);
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(summary).toBeFocused();
  await expect(phone).toHaveValue("011 5555-1234");
  await expect(page.getByLabel("Nombre completo *")).toHaveValue("Bruno Díaz");
  await expectAccessible(page, "alta con teléfono inválido");

  await phone.fill("+5491155559999");
  await page.getByLabel("Observaciones internas").fill("n".repeat(1001));
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(
    page.getByLabel("Observaciones internas"),
  ).toHaveAccessibleDescription(/no pueden superar los 1000 caracteres/);
  expect(await clientCount()).toBe(0);
});

test("caso 3: el teléfono de un cliente desactivado muestra el aviso de duplicado y se encuentra con Todos", async ({
  page,
}) => {
  await insertClient("Ana Pérez", { phone: PHONE, isActive: false });
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");
  await page.getByLabel("Nombre completo *").fill("Otra Ana");
  await page.getByLabel("Teléfono WhatsApp").fill("+54 (9) 11 6666.7788");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  // El aviso de 08 (brief-24.4.2, D-8): el otro cliente, inactivo, con su ficha. El foco va al aviso.
  const notice = page.getByRole("group", {
    name: "Este teléfono ya está registrado",
  });
  await expect(notice).toBeFocused();
  await expect(notice).toContainText("Ana Pérez");
  await expect(notice).toContainText(PHONE);
  await expect(notice).toContainText("Inactivo");
  await expect(
    notice.getByRole("link", { name: "Ver ficha existente" }),
  ).toHaveAttribute("href", /^\/clientes\/[0-9a-f-]{36}$/);
  const phone = page.getByLabel("Teléfono WhatsApp");
  await expect(phone).toHaveAccessibleDescription(
    /Ya existe un cliente con ese teléfono\. Si está desactivado/,
  );
  await expect(page.getByLabel("Nombre completo *")).toHaveValue("Otra Ana");
  await expect(phone).toHaveValue("+54 (9) 11 6666.7788");
  await expectAccessible(page, "alta con teléfono duplicado");
  await notice.getByRole("link", { name: "Volver al formulario" }).click();
  await expect(phone).toBeFocused();
  expect(await clientCount()).toBe(1);

  await page.goto("/clientes");
  await page.getByLabel("Buscar", { exact: true }).fill("+54 9 11 6666-7788");
  // La actividad está en «Más filtros» (D-6).
  await page.getByText("Más filtros").click();
  await page.getByLabel("Actividad").selectOption("todos");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(
    "/clientes?q=%2B54+9+11+6666-7788&interaccion=&actividad=todos&orden=interaccion",
  );
  await expect(clientsTable(page)).toContainText("Ana Pérez");
  await expect(clientsTable(page)).toContainText("Inactivo");
});

test("caso 4: busca por nombre y por teléfono, filtra y pagina desde la URL", async ({
  page,
}) => {
  await insertClient("Ana Pérez", { phone: PHONE });
  await insertClient("Bruno Díaz", { phone: "+5491155559999" });
  await insertClient("Carla Inactiva", { isActive: false });
  await login(page, ADMIN);

  await page.goto("/clientes");
  await expect(clientsTable(page).getByRole("row")).toHaveCount(3);
  await expect(clientsTable(page)).not.toContainText("Carla");

  await page.getByLabel("Buscar", { exact: true }).fill("ana");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(
    "/clientes?q=ana&interaccion=&actividad=activos&orden=interaccion",
  );
  await expect(clientsTable(page).getByRole("row")).toHaveCount(2);
  await expect(clientsTable(page)).toContainText("Ana Pérez");

  await page.goto("/clientes?q=%2B54%209%2011%205555-9999");
  await expect(clientsTable(page)).toContainText("Bruno Díaz");
  await expect(clientsTable(page)).not.toContainText("Ana Pérez");

  await page.goto("/clientes?q=5555");
  await expect(
    page.getByText("Ningún cliente coincide con esta búsqueda."),
  ).toBeVisible();
  await expectAccessible(page, "sin resultados");
  await page.getByRole("link", { name: "Limpiar filtros" }).last().click();
  await expect(page).toHaveURL("/clientes");

  await page.goto("/clientes?actividad=inactivos");
  await expect(clientsTable(page)).toContainText("Carla Inactiva");
  await expect(clientsTable(page).getByRole("row")).toHaveCount(2);

  for (let i = 0; i < 26; i++) {
    await insertClient(`Zeta ${String(i).padStart(2, "0")}`);
  }
  await page.goto("/clientes");
  await expect(page.getByText("Mostrando 1 a 25 de 28 clientes")).toBeVisible();
  await page.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL("/clientes?pagina=2");
  await expect(clientsTable(page).getByRole("row")).toHaveCount(4);
  await expect(clientsTable(page)).toContainText("Zeta 25");
});

test("caso 5: editar deja el cambio resumido en la auditoría", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", {
    phone: PHONE,
    notes: "Nota vieja confidencial",
  });
  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}`);
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(`/clientes/${clientId}?editar=1`);
  await expect(page.getByLabel("Teléfono WhatsApp")).toHaveValue(PHONE);
  await expectAccessible(page, "edición");

  await page.getByLabel("Teléfono WhatsApp").fill("");
  await page.getByLabel("Observaciones internas").fill("Nota nueva");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cliente actualizado.")).toBeVisible();

  const data = page.getByRole("region", { name: "Datos de contacto" });
  await expect(data).toContainText("Sin teléfono");
  await expect(data).toContainText("Nota nueva");
  await clientTab(page, "Actividad").click();
  const audit = page.getByRole("table", { name: /Auditoría de/ });
  await expect(audit).toContainText("Edición");
  await expect(audit).toContainText(
    `Teléfono: ${PHONE} → vacío · Notas actualizadas`,
  );
  await expect(audit).not.toContainText("confidencial");
  await expectAccessible(page, "detalle editado");
});

test("caso 6: editar con el teléfono de otro cliente muestra el aviso en el campo", async ({
  page,
}) => {
  await insertClient("Ana Pérez", { phone: PHONE });
  const brunoId = await insertClient("Bruno Díaz", {
    phone: "+5491155559999",
  });
  await login(page, ADMIN);
  await page.goto(`/clientes/${brunoId}?editar=1`);
  await page.getByLabel("Teléfono WhatsApp").fill(PHONE);
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(
    page.getByRole("group", { name: "Este teléfono ya está registrado" }),
  ).toContainText("Ana Pérez");
  const phone = page.getByLabel("Teléfono WhatsApp");
  await expect(phone).toHaveAccessibleDescription(
    /Ya existe un cliente con ese teléfono/,
  );
  await expect(phone).toHaveValue(PHONE);
  const stored = await db.execute<{ phone_e164: string }>(
    sql`select phone_e164 from clients where id = ${brunoId}`,
  );
  expect(stored.rows[0]!.phone_e164).toBe("+5491155559999");
});

test("caso 7: desactivar pide confirmación y se puede reactivar", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", { phone: PHONE });
  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}`);
  // Desactivar está en «Más acciones del cliente» (brief-24.4.1, D-2).
  await page.getByRole("button", { name: "Más acciones del cliente" }).click();
  await page.getByRole("link", { name: "Desactivar" }).click();
  await expect(page.getByText('¿Desactivar "Ana Pérez"?')).toBeFocused();
  await expectAccessible(page, "confirmación de desactivar");
  await page.getByRole("button", { name: "Sí, desactivar" }).click();

  await expect(page.getByText("Cliente desactivado.")).toBeVisible();
  await expect(page.getByText("Inactivo", { exact: true })).toBeVisible();
  await expectAccessible(page, "cliente inactivo");

  await page.goto("/clientes");
  await expect(page.getByText("Ana Pérez")).toBeHidden();

  await page.goto(`/clientes/${clientId}`);
  // Reactivar también está en «Más acciones del cliente» (D-2).
  await page.getByRole("button", { name: "Más acciones del cliente" }).click();
  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Cliente reactivado.")).toBeVisible();
  // Activo ya no lleva insignia: solo «Inactivo» se marca (brief-24.4.1, D-2).
  await expect(page.getByText("Inactivo", { exact: true })).toBeHidden();
  await clientTab(page, "Actividad").click();
  const audit = page.getByRole("table", { name: /Auditoría de/ });
  await expect(audit).toContainText("Desactivación");
  await expect(audit).toContainText("Reactivación");
});

test("caso 8: un viewer ve el teléfono enmascarado y no recibe formularios ni auditoría", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", {
    phone: PHONE,
    notes: "Prefiere la tarde.",
  });
  await insertClient("Número corto", { phone: "+1234" });
  await login(page, VIEWER);
  await page.goto("/clientes");
  await expect(page.getByRole("link", { name: "Nuevo cliente" })).toBeHidden();
  const table = clientsTable(page);
  await expect(table).toContainText("•••• 7788");
  await expect(
    table.getByText("Teléfono enmascarado, termina en 7788"),
  ).toBeAttached();
  await expect(
    table.getByText("Teléfono enmascarado", { exact: true }),
  ).toBeAttached();
  await expectAccessible(page, "lista como viewer");

  await page.goto(`/clientes/${clientId}`);
  const data = page.getByRole("region", { name: "Datos de contacto" });
  await expect(data).toContainText("•••• 7788");
  await expect(data).toContainText("Prefiere la tarde.");
  await expect(data.getByRole("button", { name: /^Copiar/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Editar" })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Más acciones del cliente" }),
  ).toBeHidden();
  await expect(page.getByRole("link", { name: "Desactivar" })).toBeHidden();
  await expectAccessible(page, "detalle como viewer");
  await clientTab(page, "Actividad").click();
  await expect(clientTab(page, "Actividad")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("table", { name: /Auditoría de/ })).toBeHidden();
  expect(await page.content()).not.toContain("Historial de auditoría");

  await page.goto("/clientes/nuevo");
  await expect(page.getByText(FORBIDDEN_PAGE)).toBeVisible();
  await expect(page.getByLabel("Nombre completo *")).toBeHidden();

  // Forzar la edición por la URL tampoco entrega el formulario.
  await page.goto(`/clientes/${clientId}?editar=1`);
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toBeHidden();
  await expect(page.getByLabel("Teléfono WhatsApp")).toBeHidden();
});

test("caso 9 (H-5): nada de lo que recibe el navegador de un viewer contiene el número", async ({
  page,
}) => {
  // Dos sesiones, cuatro rutas y sus cuerpos crudos: desde la 29.7 la ficha consulta la capacidad
  // trade_ins y el caso quedó al borde de los 30 s (brief-29.7, desviación 7).
  test.slow();
  const clientId = await insertClient("Ana Pérez", { phone: PHONE });
  const routes = [
    "/clientes",
    "/clientes?q=%2B54%209%2011%206666-7788",
    `/clientes/${clientId}`,
    `/clientes/${clientId}?editar=1`,
  ];

  // Todo lo que el servidor manda durante la navegación: documentos y datos de RSC.
  async function collectBodies(email: string) {
    const bodies: string[] = [];
    let pending: Promise<void>[] = [];
    const listener = (response: import("@playwright/test").Response) => {
      if (!response.url().startsWith("http://localhost")) return;
      pending.push(
        response
          .text()
          .then((text) => void bodies.push(text))
          .catch(() => undefined),
      );
    };
    // Cada cuerpo se lee antes de la navegación siguiente: una respuesta que la navegación corta
    // (un prefetch o una sección en streaming) deja su lectura sin resolver.
    const drain = async () => {
      await page.waitForLoadState("networkidle");
      await Promise.all(pending);
      pending = [];
    };
    await login(page, email);
    page.on("response", listener);
    for (const route of routes) {
      await page.goto(route);
      await drain();
      bodies.push(await page.content());
      const raw = await page.request.get(route);
      bodies.push(await raw.text());
    }
    // Navegación del lado del cliente: la lista pide el detalle como datos de RSC.
    await page.goto("/clientes");
    await drain();
    await page
      .getByRole("table", { name: "Clientes de la organización" })
      .getByRole("link", { name: "Ana Pérez" })
      .click();
    await expect(page).toHaveURL(`/clientes/${clientId}`);
    await expect(
      page.getByRole("heading", { name: "Ana Pérez" }),
    ).toBeVisible();
    await drain();
    page.off("response", listener);
    await page.context().clearCookies();
    return bodies;
  }

  const viewerBodies = await collectBodies(VIEWER);
  expect(viewerBodies.length).toBeGreaterThan(8);
  for (const body of viewerBodies) {
    for (const fragment of HIDDEN_FRAGMENTS) {
      expect(body).not.toContain(fragment);
    }
  }
  expect(viewerBodies.join("\n")).toContain("•••• 7788");

  // Control: con admin el mismo recorrido sí contiene el número; el test no pasa por vacío.
  const adminBodies = await collectBodies(ADMIN);
  expect(adminBodies.join("\n")).toContain(PHONE);
});

test("caso 10: un cliente de otra organización o un id inválido no existen", async ({
  page,
}) => {
  const other = await db.execute<{ id: string }>(
    sql`insert into organizations (name) values ('Otra organización') returning id`,
  );
  const foreignId = await insertClient("Cliente ajeno", {
    phone: PHONE,
    organizationId: other.rows[0]!.id,
  });

  await login(page, ADMIN);
  for (const id of [foreignId, "no-es-un-uuid"]) {
    await page.goto(`/clientes/${id}`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    expect(await page.content()).not.toContain("Cliente ajeno");
  }
  await expectAccessible(page, "cliente inexistente");

  await page.goto("/clientes?q=%2B5491166667788&actividad=todos");
  await expect(
    page.getByText("Ningún cliente coincide con esta búsqueda."),
  ).toBeVisible();
  expect(await page.content()).not.toContain("Cliente ajeno");
});

test("caso 11: el alta se completa solo con teclado", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/clientes/nuevo");

  // brief-23.1 el marco suma una parada: la sección de las migas, que acá es un enlace. Desde la
  // brief-24.1 suma los botones de los grupos del menú y sus destinos nuevos.
  const name = page.getByLabel("Nombre completo *");
  for (let i = 0; i < 40; i++) {
    if (await name.evaluate((element) => element === document.activeElement)) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(name).toBeFocused();
  await page.keyboard.type("Cliente de teclado");
  await page.keyboard.press("Tab");
  await page.keyboard.type("+5491155557777");
  // Desde la 24.4.2, el orden de 02 (brief-24.4.2, D-7): el correo, el desplegable plegado de
  // identificación y domicilio, la organización interna con las observaciones al final, el enlace
  // de «Antes de guardar» y la barra de guardado.
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Correo electrónico")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByText("Agregar documento y dirección (opcional)"),
  ).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  await expect(page.getByLabel("Segmento")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Observaciones internas")).toBeFocused();
  await page.keyboard.type("Sin datos sensibles");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Buscar en la lista" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Crear cliente" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Cliente creado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cliente de teclado" }),
  ).toBeVisible();
});

test("caso 12: en móvil la lista se ve como tarjetas", async ({ page }) => {
  await insertClient("Ana Pérez", { phone: PHONE });
  await insertClient("Lucía Fernández");
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, VIEWER);

  await page.goto("/clientes");
  const cards = page.getByRole("list", { name: "Clientes de la organización" });
  await expect(cards.getByRole("listitem")).toHaveCount(2);
  await expect(cards).toContainText("•••• 7788");
  await expect(cards).toContainText("Sin teléfono");
  await expect(clientsTable(page)).toBeHidden();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
  await expectAccessible(page, "lista en móvil");
});

// Conversación mínima para la última interacción (brief-6.4, D-5): fixture sintético por SQL.
async function insertConversation(
  clientId: string,
  status: "open" | "pending" | "closed",
  sentAt: Date,
) {
  const result = await db.execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, status, started_at, last_message_at)
        values (${SEED_ORGANIZATION_ID}, ${clientId}, 'whatsapp', ${status},
          ${sentAt.toISOString()}, ${sentAt.toISOString()})
        returning id`,
  );
  const conversationId = result.rows[0]!.id;
  await db.execute(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
        values (${SEED_ORGANIZATION_ID}, ${conversationId}, 'inbound', ${sentAt.toISOString()}, 'hola')`,
  );
  return conversationId;
}

test("caso 13: la lista se ordena por última interacción y la muestra en la zona de la organización", async ({
  page,
}) => {
  const ana = await insertClient("Ana Pérez");
  await insertClient("Bruno Díaz");
  const zoe = await insertClient("Zoe Luna");
  await insertConversation(ana, "closed", new Date("2026-09-01T12:00:00Z"));
  // 02:30 UTC del 11 es todavía el 10 en Buenos Aires.
  await insertConversation(zoe, "open", new Date("2026-09-11T02:30:00Z"));

  await login(page, VIEWER);
  await page.goto("/clientes");
  const rows = clientsTable(page).getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText("Zoe Luna");
  await expect(rows.nth(1)).toContainText("10/09 23:30");
  await expect(rows.nth(2)).toContainText("Ana Pérez");
  await expect(rows.nth(2)).toContainText("01/09 09:00");
  await expect(rows.nth(3)).toContainText("Bruno Díaz");
  await expect(rows.nth(3)).toContainText("Sin interacciones");
  await expect(
    page.getByText(`Ordenados por última interacción · Fechas en ${TIMEZONE}.`),
  ).toBeVisible();
  await expectAccessible(page, "lista con última interacción");
});

test("caso 14: el detalle muestra la última interacción y las conversaciones del cliente", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez", { phone: PHONE });
  const base = new Date("2026-09-01T12:00:00Z").getTime();
  for (let index = 0; index < 26; index += 1) {
    await insertConversation(
      clientId,
      index === 25 ? "closed" : "open",
      new Date(base + index * 60 * 60 * 1000),
    );
  }

  await login(page, VIEWER);
  await page.goto(`/clientes/${clientId}`);
  // En el Resumen, la fecha y el canal, sin el texto del mensaje (brief-24.4.1, H-1).
  await expect(
    page.getByRole("region", { name: "Última interacción" }),
  ).toContainText("WhatsApp · 02/09 10:00");
  // «Abrir conversación» lleva a la más reciente, también para un viewer (D-2).
  const latest = await db.execute<{ id: string }>(
    sql`select id from conversations where client_id = ${clientId}
        order by last_message_at desc limit 1`,
  );
  await expect(
    page.getByRole("link", { name: "Abrir conversación" }),
  ).toHaveAttribute("href", `/conversaciones/${latest.rows[0]!.id}`);

  await clientTab(page, "Actividad").click();
  await expect(page).toHaveURL(`/clientes/${clientId}?pestana=actividad`);
  const section = page.getByRole("region", { name: "Conversaciones" });
  const table = section.getByRole("table", {
    name: "Conversaciones de Ana Pérez",
  });
  await expect(table.getByRole("row")).toHaveCount(1 + 25);
  await expect(table.getByRole("row").nth(1)).toContainText("Cerrada");
  await expect(
    section.getByText("Mostrando 1 a 25 de 26 conversaciones"),
  ).toBeVisible();
  await expectAccessible(page, "detalle con conversaciones");

  await section.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL(
    `/clientes/${clientId}?pestana=actividad&pagina_conv=2`,
  );
  await expect(table.getByRole("row")).toHaveCount(1 + 1);

  await section.getByLabel("Estado").selectOption("cerrada");
  await section.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(
    `/clientes/${clientId}?pestana=actividad&estado_conv=cerrada`,
  );
  await expect(table.getByRole("row")).toHaveCount(1 + 1);
  await section.getByLabel("Estado").selectOption("pendiente");
  await section.getByRole("button", { name: "Filtrar" }).click();
  await expect(
    section.getByText("Ninguna conversación con este estado."),
  ).toBeVisible();
  await expectAccessible(page, "conversaciones sin resultados");
  // La sección nueva no filtra el teléfono completo a un viewer (H-5).
  for (const fragment of HIDDEN_FRAGMENTS) {
    expect(await page.content()).not.toContain(fragment);
  }

  await section.getByRole("link", { name: "Limpiar filtro" }).first().click();
  await expect(page).toHaveURL(`/clientes/${clientId}?pestana=actividad`);
  await section.getByRole("link", { name: "Ver en Conversaciones" }).click();
  // Con todos los estados: la bandeja abre en Abiertas (brief-24.3, H-9).
  await expect(page).toHaveURL(
    `/conversaciones?estado=todos&cliente=${clientId}`,
  );
  await expect(page.getByText("Cliente: Ana Pérez")).toBeVisible();

  await page.goto(`/clientes/${clientId}?pestana=actividad`);
  await table.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/conversaciones\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
});

test("caso 15: un cliente sin conversaciones muestra el vacío", async ({
  page,
}) => {
  const clientId = await insertClient("Lucía Fernández");
  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}?pestana=actividad`);
  const section = page.getByRole("region", { name: "Conversaciones" });
  await expect(
    section.getByText("Sin conversaciones registradas."),
  ).toBeVisible();
  await expect(
    section.getByRole("link", { name: "Ver en Conversaciones" }),
  ).toBeHidden();
  await expectAccessible(page, "cliente sin conversaciones");
});

// La fila de servicio se inserta por SQL, como fixture sintético, para probar la pantalla sin
// depender de client.resolved (brief-12.1, D-4; brief-6.4, D-5).
test("caso 16 (FR-AUD-03): la auditoría muestra al servicio como autor, solo para admin", async ({
  page,
}) => {
  const clientId = await insertClient("Carla Ruiz");
  const credential = await db.execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${SEED_ORGANIZATION_ID}, ${SERVICE_SOURCE}, 'ingest', ${`hash-${clientId}`})
        returning id`,
  );
  await db.execute(
    sql`insert into audit_logs
          (organization_id, actor_credential_id, entity_type, entity_id, action, diff)
        values (${SEED_ORGANIZATION_ID}, ${credential.rows[0]!.id}, 'client', ${clientId},
          'create', ${JSON.stringify({ before: null, after: { displayName: "Carla Ruiz" } })}::jsonb)`,
  );

  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}?pestana=actividad`);
  const audit = page.getByRole("table", { name: /Auditoría de/ });
  await expect(audit).toContainText(`Servicio · ${SERVICE_SOURCE}`);
  await expect(audit).toContainText("Alta");
  await expectAccessible(page, "auditoría con autor de servicio");

  await page.context().clearCookies();
  await login(page, VIEWER);
  await page.goto(`/clientes/${clientId}?pestana=actividad`);
  await expect(page.getByRole("heading", { name: "Carla Ruiz" })).toBeVisible();
  expect(await page.content()).not.toContain(SERVICE_SOURCE);
});

test("caso 17: brief-15.2 ordena por nombre en los dos sentidos y elige las filas por página", async ({
  page,
}) => {
  for (let i = 1; i <= 11; i++) {
    await insertClient(`Cliente ${String(i).padStart(2, "0")}`);
  }
  const zoe = await insertClient("Zoe Luna");
  await insertConversation(zoe, "open", new Date("2026-09-10T12:00:00Z"));
  await login(page, ADMIN);
  await page.goto("/clientes");

  const rows = clientsTable(page).getByRole("row");
  const firstName = () => rows.nth(1).getByRole("cell").first();
  // Por defecto, por última interacción: Zoe es la única con una.
  await expect(firstName()).toContainText("Zoe Luna");

  await page.getByText("Más filtros").click();
  await page.getByLabel("Ordenar por").selectOption("nombre");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/[?&]orden=nombre$/);
  await expect(firstName()).toContainText("Cliente 01");
  await expect(
    page.getByText(/Ordenados por nombre \(A–Z\) · Fechas en/),
  ).toBeVisible();

  await page.goto("/clientes?orden=nombre-za");
  await expect(firstName()).toContainText("Zoe Luna");
  await expect(page.getByLabel("Ordenar por")).toHaveValue("nombre-za");

  const sizes = page.getByRole("group", { name: "Filas por página" });
  await sizes.getByRole("link", { name: "10 filas por página" }).click();
  await expect(page).toHaveURL("/clientes?orden=nombre-za&filas=10");
  await expect(rows).toHaveCount(1 + 10);
  const pagination = page.getByRole("navigation", { name: "Paginación" });
  await expect(
    pagination.getByText("Mostrando 1 a 10 de 12 clientes"),
  ).toBeVisible();
  await pagination.getByRole("link", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL("/clientes?orden=nombre-za&filas=10&pagina=2");
  await expect(rows).toHaveCount(1 + 2);
  await expect(firstName()).toContainText("Cliente 02");
  await expectAccessible(page, "lista por nombre inverso, 10 filas");

  // AC-3: 50 filas por página, desde la página 2, vuelve a la primera con el mismo orden.
  await sizes.getByRole("link", { name: "50 filas por página" }).click();
  await expect(page).toHaveURL("/clientes?orden=nombre-za&filas=50");
  await expect(
    sizes.getByText("50 filas por página", { exact: false }),
  ).toBeVisible();
  await expect(rows).toHaveCount(1 + 12);
  await expect(firstName()).toContainText("Zoe Luna");
});

test("caso 18: brief-15.2 el buscador sugiere nombres, nunca teléfonos, y elegir abre el cliente", async ({
  page,
  playwright,
}) => {
  const anaId = await insertClient("Ana Pérez", { phone: "+5491166667788" });
  await insertClient("Anabel Ruiz", { phone: "+5491166660000" });
  await insertClient("Ana inactiva", { isActive: false });
  await insertClient("Bruno");
  await login(page, VIEWER);
  await page.goto("/clientes");

  // Se captura cada respuesta de la acción: tampoco ahí puede viajar un teléfono.
  const actionBodies: string[] = [];
  let captured: Request | undefined;
  // El cuerpo se lee mientras la página sigue en pie; antes de navegar se deja de escuchar.
  const onResponse = async (response: Response) => {
    const request = response.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      captured ??= request;
      try {
        actionBodies.push(await response.text());
      } catch {
        // La página navegó antes de leerlo: esa respuesta ya no llega a nadie.
      }
    }
  };
  page.on("response", onResponse);

  const search = page.getByRole("combobox", { name: "Buscar", exact: true });
  const list = page.getByRole("listbox", { name: "Sugerencias" });

  // Un carácter no pide nada.
  await search.fill("a");
  await page.waitForTimeout(600);
  await expect(list).toBeHidden();
  expect(actionBodies).toEqual([]);

  await search.fill("ana");
  // Sin depender del orden: el collation de la base ignora los espacios al ordenar (brief-5.2).
  await expect(list.getByRole("option")).toHaveCount(2);
  expect((await list.getByRole("option").allTextContents()).sort()).toEqual([
    "Ana Pérez",
    "Anabel Ruiz",
  ]);
  await expect(list).not.toContainText("6666");
  await expectAccessible(page, "buscador con sugerencias abiertas");
  expect(actionBodies.join("")).not.toContain("6666");
  expect(actionBodies.join("")).not.toContain("+549");

  // Un texto que parece teléfono no pide sugerencias: esa búsqueda es exacta.
  const before = actionBodies.length;
  await search.fill("+54 9 11 6666");
  await page.waitForTimeout(600);
  await expect(list).toBeHidden();
  expect(actionBodies.length).toBe(before);

  page.off("response", onResponse);

  // Enter sin elegir busca como siempre.
  await search.fill("bru");
  await expect(list.getByRole("option")).toHaveText(["Bruno"]);
  await search.press("Escape");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/clientes\?q=bru&/);

  // Elegir una sugerencia abre el detalle.
  await page.goto("/clientes");
  await search.fill("ana p");
  await expect(list.getByRole("option")).toHaveText(["Ana Pérez"]);
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(`/clientes/${anaId}`);

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
  const body = await response.text();
  expect(body).not.toContain("Ana Pérez");
  expect(
    response.headers()["x-action-redirect"] ?? response.headers()["location"],
  ).toMatch(/\/login/);
  await anonymous.dispose();
});

test("brief-23.2: el vacío y la búsqueda sin resultados muestran su ícono, su texto y sus acciones según el rol", async ({
  page,
}) => {
  // Un viewer ve el vacío sin la acción de crear.
  await login(page, VIEWER);
  await page.goto("/clientes");
  await expect(page.getByText("Todavía no hay clientes.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo cliente" })).toHaveCount(
    0,
  );
  await page.context().clearCookies();

  await login(page, ADMIN);
  await page.goto("/clientes");
  await expect(page.getByText("Todavía no hay clientes.")).toBeVisible();
  await expect(
    page.getByText("Comenzá agregando tu primer cliente para verlo acá."),
  ).toBeVisible();
  // El del encabezado y el del vacío (brief-24.4.2, panel 04 de 08).
  const create = page
    .getByRole("main")
    .getByRole("link", { name: "Nuevo cliente" });
  await expect(create).toHaveCount(2);
  await expect(create.last()).toHaveAttribute("href", "/clientes/nuevo");
  await expectAccessible(page, "vacío");
  await page.setViewportSize({ width: 375, height: 800 });
  await expectAccessible(page, "vacío a 375 px");
  await page.setViewportSize({ width: 1280, height: 800 });

  await insertClient("Ana Pérez");
  await page.goto("/clientes?q=Zzz");
  await expect(
    page.getByText("Ningún cliente coincide con esta búsqueda."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Probá con otros términos o ajustá los filtros de búsqueda.",
    ),
  ).toBeVisible();
  // Solo el del encabezado.
  await expect(
    page.getByRole("main").getByRole("link", { name: "Nuevo cliente" }),
  ).toHaveCount(1);
  // El del formulario de búsqueda y el del vacío.
  const clear = page.getByRole("link", { name: "Limpiar filtros" });
  await expect(clear).toHaveCount(2);
  await expectAccessible(page, "sin resultados");
  await clear.last().click();
  await expect(page).toHaveURL("/clientes");
  await expect(clientsTable(page)).toContainText("Ana Pérez");
});

test("brief-23.2: la ficha pregunta antes de salir con cambios sin guardar, y el aviso al guardar lleva el tilde", async ({
  page,
}) => {
  const clientId = await insertClient("Ana Pérez");
  const edit = `/clientes/${clientId}?editar=1`;
  const nav = page.getByRole("navigation", { name: "Principal" });
  const form = page.locator('form[data-unsaved-changes="watching"]');
  const dialog = page.getByRole("dialog", {
    name: "Tenés cambios sin guardar",
  });
  const stay = dialog.getByRole("button", { name: "Seguir editando" });
  const leave = dialog.getByRole("button", { name: "Salir sin guardar" });
  await login(page, ADMIN);

  // Sin cambios, no pregunta.
  await page.goto(edit);
  await expect(form).toHaveCount(1);
  await nav.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL("/productos");

  // Con un cambio, pregunta con el diálogo del sistema. El foco empieza en «Seguir editando».
  await page.goto(edit);
  await expect(form).toHaveCount(1);
  await page.getByLabel("Observaciones internas").fill("Algo nuevo");
  await nav.getByRole("link", { name: "Productos" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Si salís ahora, se pierden.");
  await expect(stay).toBeFocused();
  await expectAccessible(page, "diálogo de cambios sin guardar");

  // Esc y «Seguir editando» dejan todo como estaba.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(edit);
  await nav.getByRole("link", { name: "Productos" }).click();
  await expect(dialog).toBeVisible();
  await stay.click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(edit);
  await expect(page.getByLabel("Observaciones internas")).toHaveValue(
    "Algo nuevo",
  );

  // «Salir sin guardar» sale, también desde el «Cancelar» del formulario.
  await page.getByRole("link", { name: "Cancelar" }).click();
  await expect(dialog).toBeVisible();
  await leave.click();
  await expect(page).toHaveURL(`/clientes/${clientId}`);

  // Después de guardar, no pregunta. El aviso lleva el tilde, dentro de su región de estado.
  await page.goto(edit);
  await expect(form).toHaveCount(1);
  await page.getByLabel("Observaciones internas").fill("Guardada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  const notice = page
    .getByRole("status")
    .filter({ hasText: "Cliente actualizado." });
  await expect(notice).toBeVisible();
  await expect(notice.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await nav.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL("/productos");

  // Cerrar la pestaña con un cambio pide confirmación del navegador: ese aviso no se puede reemplazar.
  await page.goto(edit);
  await expect(form).toHaveCount(1);
  await page.getByLabel("Observaciones internas").fill("Otra cosa");
  const beforeUnload = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const unload = await beforeUnload;
  expect(unload.type()).toBe("beforeunload");
  await unload.dismiss();
});

// La ficha en cuatro pestañas (brief-24.4.1). Un cliente con todos los datos de contacto: lo que un
// viewer no debe recibir tiene que existir para que la prueba diga algo (AC-6).
const CONTACT = {
  email: "ana.privada@example.com",
  address: "Pasaje Reservado 742",
  postal: "C1405XYZ",
};

async function insertFullClient() {
  const result = await db.execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, notes, email, address_line,
                             city, postal_code)
        values (${SEED_ORGANIZATION_ID}, 'Ana Pérez', ${PHONE}, 'Prefiere la tarde.',
                ${CONTACT.email}, ${CONTACT.address}, 'Rosario', ${CONTACT.postal})
        returning id`,
  );
  return result.rows[0]!.id;
}

// Cada pestaña y la región que la identifica.
const TABS = [
  { name: "Resumen", param: "", region: "Datos de contacto" },
  { name: "Operaciones", param: "?pestana=operaciones", region: "Pedidos" },
  {
    name: "Cuenta corriente",
    param: "?pestana=cuenta",
    region: "Cuenta corriente",
  },
  { name: "Actividad", param: "?pestana=actividad", region: "Conversaciones" },
] as const;

test("caso 19: brief-24.4.1 las cuatro pestañas se eligen por la URL, con aria-current, y un admin ve sus acciones (AC-1 a AC-5)", async ({
  page,
}) => {
  const clientId = await insertFullClient();
  await insertConversation(clientId, "open", new Date("2026-09-01T12:00:00Z"));
  await login(page, ADMIN);
  await page.goto(`/clientes/${clientId}`);
  await expect(page.getByText(/^Cliente desde \d+ \w+ \d{4}$/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir conversación" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();

  for (const tab of TABS) {
    await clientTab(page, tab.name).click();
    await expect(page).toHaveURL(`/clientes/${clientId}${tab.param}`);
    await expect(clientTab(page, tab.name)).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("region", { name: tab.region, exact: true }),
    ).toBeVisible();
    await expectAccessible(page, `pestaña ${tab.name}`);
  }

  // El Resumen: copiar para un admin y los indicadores, sin sumar monedas.
  await page.goto(`/clientes/${clientId}`);
  const contact = page.getByRole("region", { name: "Datos de contacto" });
  await expect(
    contact.getByRole("button", { name: "Copiar teléfono" }),
  ).toBeVisible();
  await expect(
    contact.getByRole("button", { name: "Copiar email" }),
  ).toBeVisible();
  await expect(page.getByText("Ventas registradas")).toBeVisible();
  await expect(page.getByText("Al día")).toBeVisible();
  await expect(page.getByRole("region", { name: "En curso" })).toContainText(
    "Nada en curso.",
  );

  // La cuenta: «Registrar cobro» lleva al cobro de hoy.
  await page.goto(`/clientes/${clientId}?pestana=cuenta`);
  const account = page.getByRole("region", {
    name: "Cuenta corriente",
    exact: true,
  });
  await expect(account).toContainText(
    "Este cliente no tiene ventas ni cobros.",
  );
  await expect(
    account.getByRole("link", { name: "Registrar cobro" }),
  ).toHaveAttribute("href", `/clientes/${clientId}/cobrar`);
  // Un valor desconocido vuelve a Resumen.
  await page.goto(`/clientes/${clientId}?pestana=otra`);
  await expect(clientTab(page, "Resumen")).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("caso 20: brief-24.4.1 un viewer ve las cuatro pestañas sin acciones y no recibe el teléfono, el email, la calle, el código postal ni la auditoría (AC-6)", async ({
  page,
}) => {
  const clientId = await insertFullClient();
  await login(page, VIEWER);
  for (const tab of TABS) {
    await page.goto(`/clientes/${clientId}${tab.param}`);
    await expect(
      page.getByRole("region", { name: tab.region, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Editar" })).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Más acciones del cliente" }),
    ).toBeHidden();
    await expect(
      page.getByRole("link", { name: "Registrar cobro" }),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: /^Copiar/ })).toHaveCount(0);
    // El único formulario de un viewer es el filtro GET de las conversaciones.
    await expect(page.locator("main form")).toHaveCount(
      tab.name === "Actividad" ? 1 : 0,
    );
    // Lo que llega al navegador y la respuesta cruda del servidor.
    const raw = await (
      await page.request.get(`/clientes/${clientId}${tab.param}`)
    ).text();
    for (const body of [await page.content(), raw]) {
      for (const fragment of [
        ...HIDDEN_FRAGMENTS,
        CONTACT.email,
        CONTACT.address,
        CONTACT.postal,
      ]) {
        expect(body, `${tab.name}: ${fragment}`).not.toContain(fragment);
      }
      // El título de la tarjeta sale aunque no haya filas: así no depende de que haya auditoría.
      expect(body).not.toContain("Historial de auditoría");
      expect(body).not.toContain("Auditoría de");
    }
  }
});

test.describe("brief-24.4.1 sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("caso 21: las pestañas son enlaces y cada una carga sola (AC-1)", async ({
    page,
  }) => {
    const clientId = await insertFullClient();
    const conversationId = await insertConversation(
      clientId,
      "open",
      new Date("2026-09-01T12:00:00Z"),
    );
    await login(page, ADMIN);
    await page.goto(`/clientes/${clientId}`);
    for (const tab of TABS) {
      await clientTab(page, tab.name).click();
      await expect(page).toHaveURL(`/clientes/${clientId}${tab.param}`);
      await expect(
        page.getByRole("region", { name: tab.region, exact: true }),
      ).toBeVisible();
      // Lo que llega dentro de un Suspense también está, sin el script que cambia el esqueleto.
      await expect(
        page.getByRole("link", { name: "Abrir conversación" }),
      ).toHaveAttribute("href", `/conversaciones/${conversationId}`);
    }
    await expect(
      page.getByRole("link", { name: /^Conversación del / }),
    ).toBeVisible();
    // Sin JavaScript, «Más acciones» queda a la vista con «Desactivar».
    await expect(page.getByRole("link", { name: "Desactivar" })).toBeVisible();
  });
});

test("caso 22: brief-24.4.1 la ficha en el teléfono, sin desplazamiento horizontal (AC-8)", async ({
  page,
}) => {
  const clientId = await insertFullClient();
  await insertConversation(clientId, "open", new Date("2026-09-01T12:00:00Z"));
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, ADMIN);
  for (const tab of TABS) {
    await page.goto(`/clientes/${clientId}${tab.param}`);
    await expect(
      page.getByRole("region", { name: tab.region, exact: true }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, tab.name).toBeLessThanOrEqual(0);
    await expectAccessible(page, `pestaña ${tab.name} a 375 px`);
  }
  // En el teléfono, «Más datos» abre el resto del contacto.
  await page.goto(`/clientes/${clientId}`);
  const contact = page.getByRole("region", { name: "Datos de contacto" });
  await contact.getByText("Más datos").click();
  await expect(contact.getByText("Rosario").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Editar cliente" }),
  ).toBeVisible();
  // La confirmación de desactivar, también a 375 px.
  await page.getByRole("button", { name: "Más acciones del cliente" }).click();
  await page.getByRole("link", { name: "Desactivar" }).click();
  await expect(page.getByText('¿Desactivar "Ana Pérez"?')).toBeFocused();
  await expectAccessible(page, "confirmación de desactivar a 375 px");
});

// La lista de la 24.4.2 (brief-24.4.2, AC-1 a AC-5 y AC-8): las vistas con su cantidad, el saldo por
// moneda sin sumar y «En curso». Ana debe en pesos y tiene a favor en dólares, con un pedido y una
// conversación abiertos; Bruno no tiene nada; Carla pagó todo. Los cobros y las ventas van por SQL,
// con un medio de pago propio que se borra al terminar.
async function insertListAccounts() {
  const ana = await insertClient("Ana Pérez", { phone: PHONE });
  const bruno = await insertClient("Bruno Díaz");
  const carla = await insertClient("Carla Paga");
  const method = await db.execute<{ id: string }>(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${SEED_ORGANIZATION_ID}, 'Lista e2e', false) returning id`,
  );
  const methodId = method.rows[0]!.id;
  const sale = async (number: number, clientId: string, total: string) =>
    (
      await db.execute<{ id: string }>(
        sql`insert into sales (organization_id, number, client_id, currency, total, created_by)
            values (${SEED_ORGANIZATION_ID}, ${number}, ${clientId}, 'ARS', ${total}, ${ADMIN_SEED.id})
            returning id`,
      )
    ).rows[0]!.id;
  await sale(1, ana, "150000.00");
  const paid = await sale(2, carla, "50000.00");
  await db.execute(
    sql`insert into receipts (organization_id, number, target, sale_id, client_id, payment_method_id,
          currency, amount, created_by)
        values (${SEED_ORGANIZATION_ID}, 1, 'sale', ${paid}, ${carla}, ${methodId}, 'ARS', '50000.00',
          ${ADMIN_SEED.id}),
          (${SEED_ORGANIZATION_ID}, 2, 'account', null, ${ana}, ${methodId}, 'USD', '100.00',
          ${ADMIN_SEED.id})`,
  );
  await db.execute(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${SEED_ORGANIZATION_ID}, 1, ${ana}, 'ARS', '1000.00', ${ADMIN_SEED.id})`,
  );
  await insertConversation(ana, "open", new Date("2026-09-01T12:00:00Z"));
  return { ana, bruno, carla };
}

async function deleteListMethod() {
  // receipts es de solo inserción (ADR 0013): se vacía con el TRUNCATE de beforeEach, que lleva las
  // tablas que la referencian, y recién entonces se puede borrar el medio.
  await db.execute(
    sql`truncate table appointments, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, service_order_lines, service_orders, refund_voids, refunds, receipt_voids, receipts, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders`,
  );
  await db.execute(
    sql`delete from payment_methods where organization_id = ${SEED_ORGANIZATION_ID} and name = 'Lista e2e'`,
  );
}

const views = (page: Page) =>
  page.getByRole("navigation", { name: "Vistas de clientes" });

const rowOf = (page: Page, name: string) =>
  clientsTable(page).getByRole("row").filter({ hasText: name });

test("caso 23 (brief-24.4.2): las vistas con su cantidad, el saldo por moneda y «En curso», para los dos roles", async ({
  page,
}) => {
  test.slow();
  await insertListAccounts();
  try {
    for (const email of [ADMIN, VIEWER]) {
      await login(page, email);
      await page.goto("/clientes");
      // Sin repairs, «Con reparaciones» no se ofrece (D-1).
      await expect(views(page).getByRole("link")).toHaveText([
        "Todos 3",
        "Con saldo 1",
      ]);
      await expect(
        views(page).getByRole("link", { name: "Todos 3" }),
      ).toHaveAttribute("aria-current", "page");

      // AC-2: una línea por moneda, sin sumar.
      const ana = rowOf(page, "Ana Pérez");
      await expect(ana).toContainText("$ 150.000,00");
      await expect(ana).toContainText("Pendiente");
      await expect(ana).toContainText("A favor US$ 100,00");
      // AC-3: lo abierto de cada módulo.
      await expect(ana).toContainText("1 pedido");
      await expect(ana).toContainText("1 conversación");
      const bruno = rowOf(page, "Bruno Díaz");
      await expect(bruno).toContainText("Sin operaciones abiertas");
      await expect(bruno).toContainText("Sin saldo pendiente");
      await expect(rowOf(page, "Carla Paga")).toContainText(
        "Sin saldo pendiente",
      );

      // La vista recorta la lista y conserva la cantidad de las demás (AC-1).
      await views(page).getByRole("link", { name: "Con saldo 1" }).click();
      await expect(page).toHaveURL("/clientes?vista=con-saldo");
      await expect(
        views(page).getByRole("link", { name: "Con saldo 1" }),
      ).toHaveAttribute("aria-current", "page");
      await expect(clientsTable(page).getByRole("row")).toHaveCount(2);
      await expect(clientsTable(page)).toContainText("Ana Pérez");
      // Combinable con la búsqueda: la vista viaja en el formulario.
      await page.getByLabel("Buscar", { exact: true }).fill("bruno");
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(page).toHaveURL(/vista=con-saldo/);
      await expect(views(page).getByRole("link")).toHaveText([
        "Todos 1",
        "Con saldo 0",
      ]);
      await expectAccessible(page, `vista con saldo como ${email}`);

      // El «⋮» de la fila (D-5): «Editar» solo para un admin.
      await page.goto("/clientes");
      await page
        .getByRole("button", { name: "Más acciones de Ana Pérez" })
        .first()
        .click();
      await expect(
        page.getByRole("link", { name: "Ver ficha" }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Editar", exact: true }),
      ).toHaveCount(email === ADMIN ? 1 : 0);
      await page.context().clearCookies();
    }

    // AC-8: lo que recibe un viewer no tiene el teléfono completo.
    await login(page, VIEWER);
    const response = await page.goto("/clientes");
    const html = (await response?.text()) ?? "";
    for (const fragment of HIDDEN_FRAGMENTS) {
      expect(html).not.toContain(fragment);
    }
    await expect(clientsTable(page)).toContainText("•••• 7788");

    // AC-11 en el teléfono: tarjetas sin desplazamiento horizontal.
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/clientes");
    const cards = page.getByRole("list", {
      name: "Clientes de la organización",
    });
    await expect(cards).toContainText("Saldo");
    await expect(cards).toContainText("Sin saldo pendiente");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expectAccessible(page, "lista a 375 px");
  } finally {
    await deleteListMethod();
  }
});

test("caso 24 (brief-24.4.2): el filtro por última interacción", async ({
  page,
}) => {
  const ana = await insertClient("Ana Reciente");
  await insertClient("Bruno Nunca");
  await insertConversation(ana, "closed", new Date(Date.now() - 2 * 86400000));
  await login(page, ADMIN);
  await page.goto("/clientes");
  await page.getByLabel("Última interacción").selectOption("7-dias");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/interaccion=7-dias/);
  await expect(clientsTable(page).getByRole("row")).toHaveCount(2);
  await expect(clientsTable(page)).toContainText("Ana Reciente");
  await page.goto("/clientes?interaccion=sin");
  await expect(clientsTable(page).getByRole("row")).toHaveCount(2);
  await expect(clientsTable(page)).toContainText("Bruno Nunca");
  // Una conversación cerrada no está «En curso».
  await page.goto("/clientes");
  await expect(rowOf(page, "Ana Reciente")).toContainText(
    "Sin operaciones abiertas",
  );
});

test.describe("brief-24.4.2 sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("caso 25: «Más filtros» se abre, filtra y queda abierto con un filtro aplicado (AC-5)", async ({
    page,
  }) => {
    await insertClient("Ana Activa");
    await insertClient("Carla Inactiva", { isActive: false });
    await login(page, ADMIN);
    await page.goto("/clientes");
    await expect(page.getByLabel("Actividad")).toBeHidden();
    await page.getByText("Más filtros").click();
    await page.getByLabel("Actividad").selectOption("inactivos");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/actividad=inactivos/);
    await expect(clientsTable(page)).toContainText("Carla Inactiva");
    await expect(page.getByLabel("Actividad")).toBeVisible();
  });

  test("caso 26: el aviso de duplicado llega como respuesta del envío (AC-7)", async ({
    page,
  }) => {
    await insertClient("Ana Pérez", { phone: PHONE });
    await login(page, ADMIN);
    await page.goto("/clientes/nuevo");
    await page.getByLabel("Nombre completo *").fill("Otra Ana");
    await page.getByLabel("Teléfono WhatsApp").fill(PHONE);
    await page.getByRole("button", { name: "Crear cliente" }).click();
    await expect(
      page.getByRole("group", { name: "Este teléfono ya está registrado" }),
    ).toContainText("Ana Pérez");
    await expect(page.getByLabel("Nombre completo *")).toHaveValue("Otra Ana");
    expect(await clientCount()).toBe(1);
  });
});

const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

test("caso 27 (brief-24.4.2): con repairs, la vista «Con reparaciones» y la reparación en «En curso»", async ({
  page,
}) => {
  const ana = await insertClient("Ana Reparación");
  await insertClient("Bruno Sin Orden");
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${SEED_ORGANIZATION_ID}, 'repairs', ${ADMIN_SEED.id})`,
  );
  try {
    await db.execute(
      sql`with m as (
            insert into product_models (organization_id, name)
            values (${SEED_ORGANIZATION_ID}, 'Modelo e2e 24.4.2') returning id
          )
          insert into service_orders (organization_id, number, client_id, model_id, device_serial,
                                      reported_issue, created_by)
          select ${SEED_ORGANIZATION_ID}, 1, ${ana}, m.id, '356938035643809', 'No carga',
            ${ADMIN_SEED.id} from m`,
    );
    await login(page, ADMIN);
    await page.goto("/clientes");
    await expect(views(page).getByRole("link")).toHaveText([
      "Todos 2",
      "Con saldo 0",
      "Con reparaciones 1",
    ]);
    await expect(rowOf(page, "Ana Reparación")).toContainText("1 reparación");
    await views(page).getByRole("link", { name: "Con reparaciones 1" }).click();
    await expect(page).toHaveURL("/clientes?vista=con-reparaciones");
    await expect(clientsTable(page).getByRole("row")).toHaveCount(2);
    await expect(clientsTable(page)).toContainText("Ana Reparación");

    // Una vista sin clientes no dice que no hay clientes (revisión de la 24.4.2, H-2).
    await views(page).getByRole("link", { name: "Con saldo 0" }).click();
    await expect(page.getByText("Ningún cliente en esta vista.")).toBeVisible();
    await expect(page.getByText("Todavía no hay clientes.")).toBeHidden();
    await expect(page.getByRole("link", { name: "Ver todos" })).toHaveAttribute(
      "href",
      "/clientes",
    );
    await expectAccessible(page, "vista sin clientes");
  } finally {
    await db.execute(
      sql`truncate table service_order_lines, service_orders, audit_logs`,
    );
    await db.execute(
      sql`delete from product_models where organization_id = ${SEED_ORGANIZATION_ID} and name = 'Modelo e2e 24.4.2'`,
    );
    await db.execute(
      sql`delete from organization_capabilities where organization_id = ${SEED_ORGANIZATION_ID} and capability = 'repairs'`,
    );
  }
});

test("caso 28 (brief-24.4.2, AC-11): el formulario y el aviso de duplicado a 375 px", async ({
  page,
}) => {
  await insertClient("Ana Pérez", { phone: PHONE });
  await login(page, ADMIN);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/clientes/nuevo");
  await expect(page.getByLabel("Nombre completo *")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await expectAccessible(page, "alta a 375 px");
  await page.getByText("Agregar documento y dirección (opcional)").click();
  expect(await noHorizontalScroll(page)).toBe(true);
  await expectAccessible(page, "alta con el domicilio abierto a 375 px");

  await page.getByLabel("Nombre completo *").fill("Otra Ana");
  await page.getByLabel("Teléfono WhatsApp").fill(PHONE);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(
    page.getByRole("group", { name: "Este teléfono ya está registrado" }),
  ).toBeFocused();
  expect(await noHorizontalScroll(page)).toBe(true);
  await expectAccessible(page, "aviso de duplicado a 375 px");
});
