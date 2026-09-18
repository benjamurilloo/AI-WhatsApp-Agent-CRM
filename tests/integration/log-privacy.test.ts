import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { createClient, updateClient, type ClientInput } from "@/modules/crm";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { logEvent, newRequestId } from "@/shared/log";
import { resetDatabase } from "./reset-database";

// Privacidad de los logs en el camino de clientes, contra PostgreSQL real (brief-8.2, D-1).
//
// El camino de ingestión ya está cubierto por el caso 12 de ingestion-http.test.ts, que ejercita
// el endpoint con teléfono y cuerpo reales y afirma que no aparecen: no se repite acá.
// Lo que faltaba era el camino de la UI, que es donde una persona escribe los datos del cliente.
//
// Se prueban las dos mitades por separado, porque fallan por razones distintas:
//   1. el módulo de dominio no escribe nada en consola, pase lo que pase;
//   2. cuando la capa de acción registra el resultado —con el mismo `logEvent` y la misma forma
//      que `logDone` de clientes/actions.ts—, ningún dato personal llega a la línea.

const PASSWORD = "contraseña-correcta-larga";

// Datos personales que no deben aparecer en ninguna línea de log.
const PHONE = "+5491155559876";
const CLIENT_NAME = "Ana Kumquat Reservada";
const NOTES = "Toca el timbre dos veces, departamento 7B";

const ana: ClientInput = {
  displayName: CLIENT_NAME,
  phone: PHONE,
  notes: NOTES,
};

let storedHash: string;
let adminA: AuthContext;

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function seed() {
  const org = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio Privacidad') returning id`,
  );
  const organizationId = org.rows[0]!.id;
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values ('admin-privacidad@example.com', ${storedHash}, 'Admin', false) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, 'admin')`,
  );
  adminA = await contextFor("admin-privacidad@example.com");
}

// Captura todo lo que el proceso escriba por consola mientras corre `run`.
async function captureConsole(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const capture = (...args: unknown[]) => void lines.push(args.join(" "));
  const spies: MockInstance[] = [
    vi.spyOn(console, "log").mockImplementation(capture),
    vi.spyOn(console, "error").mockImplementation(capture),
    vi.spyOn(console, "warn").mockImplementation(capture),
    vi.spyOn(console, "info").mockImplementation(capture),
    vi.spyOn(console, "debug").mockImplementation(capture),
  ];
  try {
    await run();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  return lines;
}

const PERSONAL_DATA = [PHONE, CLIENT_NAME, NOTES, "5555-9876", "5491155559876"];

function expectNoPersonalData(lines: string[]) {
  const output = lines.join("\n");
  for (const personal of PERSONAL_DATA) {
    expect(output, `apareció un dato personal en el log`).not.toContain(
      personal,
    );
  }
}

beforeEach(async () => {
  storedHash ??= await hashPassword(PASSWORD);
  await resetDatabase(getDb());
  await seed();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("privacidad de los logs en el camino de clientes", () => {
  it("1. el módulo de dominio no escribe nada en consola, ni al crear ni al rechazar", async () => {
    const lines = await captureConsole(async () => {
      const created = await createClient(adminA, ana);
      expect(created.ok).toBe(true);

      // Mismo teléfono: CONFLICT. Es el rechazo que más cerca está de filtrar el valor,
      // porque lo produce una violación de unicidad de PostgreSQL sobre esa columna.
      const repeated = await createClient(adminA, {
        ...ana,
        displayName: "Otra persona",
      });
      expect(repeated.ok).toBe(false);

      // Teléfono inválido: VALIDATION_ERROR con el valor rechazado a la vista del servicio.
      const invalid = await createClient(adminA, {
        ...ana,
        phone: "1155559876",
      });
      expect(invalid.ok).toBe(false);
    });

    expect(
      lines,
      `el dominio escribió en consola: ${lines.join(" | ")}`,
    ).toEqual([]);
  });

  it("2. la línea que registra la acción no lleva datos personales en ningún resultado", async () => {
    const created = await createClient(adminA, ana);
    if (!created.ok) throw new Error("el alta debía funcionar");

    const lines = await captureConsole(async () => {
      // Los tres resultados que produce el alta, registrados como lo hace logDone de
      // clientes/actions.ts: ruta literal, código, ids y duración.
      const conflict = await createClient(adminA, ana);
      const invalid = await createClient(adminA, { ...ana, phone: "sin-mas" });
      const missing = await updateClient(
        adminA,
        "00000000-0000-4000-8000-000000000000",
        ana,
      );

      for (const result of [conflict, invalid, missing]) {
        if (result.ok) throw new Error("se esperaba un rechazo");
        logEvent({
          level: "warn",
          requestId: newRequestId(),
          route: "clientes.crear",
          code: result.code,
          userId: adminA.userId,
          organizationId: adminA.organizationId,
          durationMs: 12.4,
        });
      }
    });

    expect(lines).toHaveLength(3);
    expectNoPersonalData(lines);
    // Lo que sí tiene que estar: el resultado y los identificadores.
    const events = lines.map((line) => JSON.parse(line));
    expect(events.map((event) => event.code)).toEqual([
      "CONFLICT",
      "VALIDATION_ERROR",
      "NOT_FOUND",
    ]);
    for (const event of events) {
      expect(event).toMatchObject({
        route: "clientes.crear",
        organization_id: adminA.organizationId,
        user_id: adminA.userId,
      });
    }
  });

  it("3. un error inesperado con el teléfono en su mensaje se registra sin el teléfono", async () => {
    // El catch de la acción pasa el error crudo a logEvent. Se fuerza uno real: un trigger
    // temporal que falla al insertar, con el teléfono dentro del mensaje de la excepción.
    await getDb().execute(
      sql.raw(`create function fail_client_insert() returns trigger
        language plpgsql as $$ begin
          raise exception 'falla forzada para el cliente %', NEW.phone_e164;
        end $$`),
    );
    await getDb().execute(
      sql.raw(`create trigger fail_client_insert before insert on clients
        for each row execute function fail_client_insert()`),
    );

    let thrown: unknown;
    const lines = await captureConsole(async () => {
      try {
        await createClient(adminA, ana);
      } catch (error) {
        thrown = error;
        logEvent({
          level: "error",
          requestId: newRequestId(),
          route: "clientes.crear",
          code: "INTERNAL",
          userId: adminA.userId,
          organizationId: adminA.organizationId,
          error,
        });
      }
    });

    await getDb().execute(
      sql.raw(`drop trigger fail_client_insert on clients`),
    );
    await getDb().execute(sql.raw(`drop function fail_client_insert()`));

    // El error realmente traía el teléfono: si no, el test no probaría nada.
    expect(String(thrown)).toContain(PHONE);
    expect(lines).toHaveLength(1);
    expectNoPersonalData(lines);
    expect(JSON.parse(lines[0]!).error).toMatchObject({ name: "Error" });
  });
});
