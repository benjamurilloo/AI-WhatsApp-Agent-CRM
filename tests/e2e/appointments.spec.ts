import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { shiftDays } from "@/app/_format/date-time";
import { createDb, type Db } from "@/shared/db";
import { SEED_ORGANIZATION_ID, SEED_USERS, seedBasic } from "../../seeds/basic";
import {
  SEED_IPHONE_ORGANIZATION_ID,
  SEED_IPHONE_USERS,
  seedIphone,
} from "../../seeds/demo-iphone";
import { e2eDatabaseUrl } from "../integration/test-database";
import { E2E_PASSWORD } from "./global-setup";

// Los turnos de punta a punta (brief-29.10, D-7): Chromium, next start, Server Actions, appointments,
// knowledge, crm y PostgreSQL real. Un admin da un turno desde una franja libre del calendario, ve la
// franja llena, cambia el cupo y los motivos, cancela un turno y marca atendido otro que ya empezó, y lo
// ve en la ficha de la clienta; un viewer ve el calendario y el turno y no los opera. La tienda de
// ejemplo la siembra esta spec con lo que deja org:capability --profile iphone: appointments, 30
// minutos y un turno por franja, más un horario de 10 a 12 y de 16 a 18 todos los días. La borra al
// terminar.

const [ADMIN_IPHONE, VIEWER_IPHONE] = SEED_IPHONE_USERS;
const IPHONE = SEED_IPHONE_ORGANIZATION_ID;
const TIMEZONE = "America/Argentina/Buenos_Aires";

let db: Db;

const SEEDED_USER_IDS = [...SEED_USERS, ...SEED_IPHONE_USERS].map(
  (user) => user.id,
);

async function reset(keep: boolean) {
  await db.execute(
    sql`truncate table appointments, appointment_reasons, appointment_settings, unit_settings, service_settings, trade_in_margins, trade_in_settings, trade_in_payment_voids, trade_in_payments, trade_in_voids, trade_in_checklist_results, trade_ins, trade_in_checklist_items, service_order_lines, service_orders, repair_prices, repair_types, supplier_payment_voids, supplier_payments, goods_receipt_voids, goods_receipt_line_units, goods_receipt_lines, goods_receipts, purchase_order_lines, purchase_orders, suppliers, document_counters, refund_voids, refunds, receipt_voids, receipts, cash_movements, cash_session_closing_amounts, cash_session_closings, cash_session_opening_amounts, cash_sessions, sale_voids, sale_line_units, sale_lines, sales, order_line_units, order_lines, orders, audit_logs, inventory_movements, stock_units, unit_grades, inventories, product_images, product_costs, product_prices, attribute_values, products, ingestion_events`,
  );
  // El turno pedido por el agente deja su evento y su credencial (brief-29.10.2). ingestion_events es de
  // solo inserción: va en el TRUNCATE de arriba, la vía documentada (ADR 0013), con orders y appointments,
  // las dos que la nombran.
  await db.execute(
    sql`delete from ingestion_credentials where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from business_hour_exceptions where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from business_hours where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from payment_methods where organization_id = ${IPHONE}`,
  );
  await db.execute(sql`delete from clients where organization_id = ${IPHONE}`);
  await db.execute(
    sql`delete from attribute_options where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from attribute_definitions where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from product_models where organization_id = ${IPHONE}`,
  );
  await db.execute(
    sql`delete from organization_capabilities where organization_id = ${IPHONE}`,
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
      ? sql`delete from organizations where id not in (${SEED_ORGANIZATION_ID}, ${IPHONE})`
      : sql`delete from organizations where id <> ${SEED_ORGANIZATION_ID}`,
  );
  await seedBasic(db, E2E_PASSWORD);
  if (!keep) return;
  await seedIphone(db, E2E_PASSWORD);
  await db.execute(
    sql`insert into organization_capabilities (organization_id, capability, activated_by)
        values (${IPHONE}, 'appointments', ${ADMIN_IPHONE.id})`,
  );
  await db.execute(
    sql`insert into appointment_settings (organization_id, slot_minutes, capacity, is_example)
        values (${IPHONE}, 30, 1, true)`,
  );
  for (const [position, name] of [
    "Ver o comprar un equipo",
    "Retirar un equipo",
  ].entries()) {
    await db.execute(
      sql`insert into appointment_reasons (organization_id, name, position, is_example)
          values (${IPHONE}, ${name}, ${position}, true)`,
    );
  }
  for (let weekday = 1; weekday <= 7; weekday++) {
    await db.execute(
      sql`insert into business_hours (organization_id, weekday, opens_1, closes_1, opens_2, closes_2)
          values (${IPHONE}, ${weekday}, '10:00', '12:00', '16:00', '18:00')`,
    );
  }
  await db.execute(
    sql`insert into clients (organization_id, display_name) values (${IPHONE}, 'Lucía Gómez')`,
  );
}

async function today(): Promise<string> {
  const result = await db.execute<{ today: string }>(
    sql`select to_char(now() at time zone ${TIMEZONE}, 'YYYY-MM-DD') as today`,
  );
  return result.rows[0]!.today;
}

// Un turno escrito directo en la base: el servicio no deja dar uno que ya empezó. El pedido lo pide el
// agente (brief-29.10.2): con su credencial y el evento que lo creó, como lo deja la ingestión.
async function insertAppointment(
  startsAt: ReturnType<typeof sql>,
  status: "requested" | "confirmed" = "confirmed",
) {
  const ids = await db.execute<{ client: string; reason: string }>(
    sql`select (select id from clients where organization_id = ${IPHONE}) as client,
               (select id from appointment_reasons where organization_id = ${IPHONE}
                order by position limit 1) as reason`,
  );
  const { client, reason } = ids.rows[0]!;
  if (status === "confirmed") {
    const created = await db.execute<{ id: string }>(
      sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
            created_by, confirmed_at)
          values (${IPHONE}, ${client}, ${reason}, ${startsAt}, ${startsAt} + interval '30 minutes',
            'confirmed', ${ADMIN_IPHONE.id}, now())
          returning id`,
    );
    return created.rows[0]!.id;
  }
  const credential = await db.execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${IPHONE}, 'agente-whatsapp', 'ingest', 'e2e') returning id`,
  );
  const event = await db.execute<{ id: string }>(
    sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash,
          status, processed_at)
        values (${IPHONE}, 'agente-whatsapp', 'evt-e2e-turno', 'appointment.requested', 'e2e',
          'processed', now())
        returning id`,
  );
  const created = await db.execute<{ id: string }>(
    sql`insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
          created_by_credential_id, ingestion_event_id)
        values (${IPHONE}, ${client}, ${reason}, ${startsAt}, ${startsAt} + interval '30 minutes',
          'requested', ${credential.rows[0]!.id}, ${event.rows[0]!.id})
        returning id`,
  );
  return created.rows[0]!.id;
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

const nextStep = (page: Page) =>
  page.getByRole("region", { name: "Siguiente paso" });

test("un admin da un turno desde el calendario, ve la franja llena, configura, cancela, confirma uno pedido y marca atendido", async ({
  page,
}) => {
  test.slow();
  const future = shiftDays(await today(), 7);
  await login(page, ADMIN_IPHONE.email);

  await page.getByRole("link", { name: "Turnos" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Turnos", level: 1 }),
  ).toBeVisible();
  await expectAccessible(page, "calendario de la semana");

  await page.goto(`/turnos?fecha=${future}&vista=dia`);
  await page.getByRole("link", { name: /Dar un turno .* a las 10:00/ }).click();
  await expect(
    page.getByRole("radio", { name: "10:00 a 10:30" }),
  ).toBeChecked();
  await expectAccessible(page, "nuevo turno");
  const client = page.getByLabel("Cliente *", { exact: true });
  await client.fill("Luc");
  await expect(page.getByRole("option").first()).toBeVisible();
  await client.press("ArrowDown");
  await client.press("Enter");
  await page
    .getByLabel("Motivo *")
    .selectOption({ label: "Retirar un equipo" });
  await page.getByLabel("Nota").fill("Trae la caja");
  await page.getByRole("button", { name: "Dar el turno" }).click();
  await expect(page).toHaveURL(/\/turnos\/[0-9a-f-]+\?aviso=turno-creado$/);
  await expect(page.getByRole("status")).toContainText("Turno dado.");
  await expect(page.getByText("Confirmado").first()).toBeVisible();
  await expect(page.getByText("Trae la caja")).toBeVisible();
  await expectAccessible(page, "detalle del turno");
  const appointmentUrl = page.url().replace(/\?.*$/, "");

  // La franja quedó llena: no se ofrece otra vez.
  await page.goto(`/turnos?fecha=${future}&vista=dia`);
  const slots = page.getByRole("list", { name: /^Franjas del/ });
  await expect(
    slots.getByRole("listitem").filter({ hasText: "10:00 a 10:30" }),
  ).toContainText("Completa: 1 de 1");
  await expect(
    page.getByRole("link", { name: /10:00 a 10:30 · Lucía Gómez/ }),
  ).toBeVisible();
  await page.goto(`/turnos/nuevo?fecha=${future}`);
  await expect(page.getByRole("radio", { name: "10:00 a 10:30" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("radio", { name: "10:30 a 11:00" }),
  ).toBeVisible();

  // La configuración: el cupo y un motivo nuevo.
  await page.goto("/turnos/configuracion");
  await expectAccessible(page, "configuración de los turnos");
  await page.getByLabel("Turnos por franja *").fill("2");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Duración y cupo guardados.",
  );
  await page.getByLabel("Nombre *").fill("Cotizar un usado");
  await page.getByRole("button", { name: "Agregar el motivo" }).click();
  await expect(page.getByRole("status")).toContainText("Motivo agregado.");
  await expect(
    page.getByText("Cotizar un usado", { exact: true }),
  ).toBeVisible();
  await page.goto(`/turnos/nuevo?fecha=${future}`);
  await expect(
    page.getByRole("radio", { name: "10:00 a 10:30" }),
  ).toBeVisible();

  // Cancelar el turno libera la franja.
  await page.goto(appointmentUrl);
  await nextStep(page)
    .getByRole("button", { name: "Cancelar el turno" })
    .click();
  await expect(page).toHaveURL(/\?aviso=turno-cancelado$/);
  await expect(page.getByText("Cancelado").first()).toBeVisible();
  await expect(nextStep(page)).toHaveCount(0);

  // Un turno que pidió el agente se ve con su origen y se confirma (brief-29.10.2, D-5).
  const requested = await insertAppointment(
    sql`((${future}::date + '11:00'::time) at time zone ${TIMEZONE})`,
    "requested",
  );
  await page.goto(`/turnos?fecha=${future}&vista=dia`);
  await expect(
    page
      .getByRole("list", { name: /^Turnos del/ })
      .getByRole("listitem")
      .filter({ hasText: "11:00 a 11:30" }),
  ).toContainText("Pedido por el agente");
  await page.goto(`/turnos/${requested}`);
  await expect(page.getByText("Pedido").first()).toBeVisible();
  await expect(page.getByText("Agente · agente-whatsapp")).toBeVisible();
  await expectAccessible(page, "turno pedido por el agente");
  await nextStep(page).getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\?aviso=turno-confirmado$/);
  await expect(page.getByRole("status")).toContainText("Turno confirmado.");
  await expect(page.getByText("Confirmado").first()).toBeVisible();

  // Un turno que ya empezó se marca atendido.
  const started = await insertAppointment(sql`now() - interval '10 minutes'`);
  await page.goto(`/turnos/${started}`);
  await nextStep(page).getByRole("button", { name: "Marcar atendido" }).click();
  await expect(page).toHaveURL(/\?aviso=turno-atendido$/);
  await expect(page.getByText("Atendido").first()).toBeVisible();

  // La ficha de la clienta muestra sus turnos.
  await insertAppointment(
    sql`((${future}::date + '14:00'::time) at time zone ${TIMEZONE})`,
  );
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Lucía Gómez" }).click();
  // «Próxima atención», con el turno que sigue (brief-24.4.3, D-6).
  const attention = page.getByRole("region", { name: "Próxima atención" });
  await expect(
    attention.getByRole("link", { name: "Ver turno" }),
  ).toBeVisible();
  await expectAccessible(page, "próxima atención con un turno");
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 375, height: 800 });
  await expectAccessible(page, "próxima atención con un turno a 375 px");
  await page.setViewportSize(viewport);
  // Con más de una, «Ver todas» lleva a Operaciones con «En curso» (AC-6).
  await attention.getByRole("link", { name: "Ver todas" }).click();
  await expect(page).toHaveURL(/pestana=operaciones&estado=en_curso$/);
  const section = page.getByRole("region", { name: /^Operaciones de / });
  await expect(section.getByLabel("Estado")).toHaveValue("en_curso");
  await expect(
    section.getByRole("link", { name: /Ver detalle de turno/ }),
  ).toHaveCount(2);
  // En la pestaña Operaciones de la ficha (brief-24.4.1, D-5).
  await page
    .getByRole("navigation", { name: /^Secciones de / })
    .getByRole("link", { name: "Operaciones" })
    .click();
  await expect(
    section.getByRole("link", { name: /Ver detalle de turno/ }),
  ).toHaveCount(4);
  await section.getByRole("button", { name: "Nueva operación" }).click();
  await expect(
    section.getByRole("link", { name: "Turno", exact: true }),
  ).toHaveAttribute("href", /^\/turnos\/nuevo\?cliente=/);
});

test("un viewer ve el calendario y el turno, y no los opera", async ({
  page,
}) => {
  const future = shiftDays(await today(), 3);
  const appointment = await insertAppointment(
    sql`((${future}::date + '16:00'::time) at time zone ${TIMEZONE})`,
  );
  await login(page, VIEWER_IPHONE.email);
  await page.goto(`/turnos?fecha=${future}&vista=dia`);
  await expect(
    page.getByRole("link", { name: /16:00 a 16:30 · Lucía Gómez/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Dar un turno/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nuevo turno" })).toHaveCount(0);
  await page.goto(`/turnos/${appointment}`);
  await expect(page.getByText("Confirmado").first()).toBeVisible();
  await expect(nextStep(page)).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Historial de auditoría" }),
  ).toHaveCount(1);
  await page.goto("/turnos/nuevo");
  await expect(
    page.getByText("Solo un administrador puede dar turnos y configurarlos."),
  ).toBeVisible();
  await page.goto("/turnos/configuracion");
  await expect(
    page.getByText("Solo un administrador puede dar turnos y configurarlos."),
  ).toBeVisible();
});
