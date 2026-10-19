import { sql, type SQL } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readerDatabase,
  runReader,
  type FetchLike,
} from "../../scripts/fx/lectura.ts";
import { hashPassword, login } from "@/modules/auth";
import {
  createExchangeSettings,
  getExchangeRatePage,
  getExchangeSetup,
  recordExchangeRate,
  updateExchangeSettings,
} from "@/modules/fx";
import {
  getAuthContext,
  setMainCurrency,
  type AuthContext,
} from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La lectura de la cotización contra PostgreSQL real (brief-29.4.2, D-13): las dos funciones con el
// rol del lector, sus privilegios, la regla de D-3 a D-5, la fuente y el ajuste con auditoría, la
// antigüedad desde la última confirmación y el lector entero con un fetch del test. El host real no
// se llama nunca. A tiene USD y ARS; B, USD y EUR; C no tiene moneda principal.

const PASSWORD = "contraseña-correcta-larga";
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function addAdmin(
  organizationId: string,
  email: string,
  role: "admin" | "viewer" = "admin",
) {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${email}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${userId}, ${role})`,
  );
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function fixCurrency(
  organizationId: string,
  adminEmail: string,
  quoteCurrency: string,
) {
  await getDb().transaction(async (tx) => {
    const fixed = await setMainCurrency(tx, {
      organizationId,
      currency: "USD",
      adminEmail,
    });
    if (!fixed.ok) throw new Error(`moneda rechazada: ${fixed.code}`);
    const settings = await createExchangeSettings(tx, {
      organizationId,
      quoteCurrency,
      actorUserId: fixed.actorUserId,
    });
    if (!settings.ok) throw new Error("configuración rechazada");
  });
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name) values ('Tienda A') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name) values ('Tienda B') returning id`,
  );
  const orgC = await returningId(
    sql`insert into organizations (name) values ('Negocio C') returning id`,
  );
  await addAdmin(orgA, "admin-a@example.com");
  await addAdmin(orgA, "viewer-a@example.com", "viewer");
  await addAdmin(orgB, "admin-b@example.com");
  await addAdmin(orgC, "admin-c@example.com");
  await fixCurrency(orgA, "admin-a@example.com", "ARS");
  await fixCurrency(orgB, "admin-b@example.com", "EUR");
  return {
    orgA,
    orgB,
    orgC,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

async function settings(
  context: AuthContext,
  source: string,
  adjustment: string,
) {
  const result = await updateExchangeSettings(context, { source, adjustment });
  if (!result.ok)
    throw new Error(`fuente rechazada: ${JSON.stringify(result)}`);
  return result;
}

async function manual(context: AuthContext, value: string) {
  const result = await recordExchangeRate(context, {
    rate: value,
    confirmLargeChange: true,
  });
  if (!result.ok) throw new Error(`cotización rechazada: ${result.code}`);
}

// Una conexión con el rol del lector, como la de crm-fx-reader.
let reader: Client | null = null;

async function readerClient(): Promise<Client> {
  if (reader) return reader;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("set role crm_fx_reader");
  reader = client;
  return client;
}

async function record(organizationId: string, venta: string) {
  const client = await readerClient();
  return readerDatabase(client).record(
    organizationId,
    venta,
    "2026-10-19T12:57:00.000Z",
  );
}

async function rates(organizationId: string) {
  const result = await getDb().execute<{
    rate: string;
    source: string;
    source_rate: string | null;
    adjustment: string | null;
    recorded_by: string | null;
  }>(
    sql`select rate, source, source_rate, adjustment, recorded_by from exchange_rates
        where organization_id = ${organizationId}
        order by recorded_at, id`,
  );
  return result.rows;
}

async function lastConfirmedAt(organizationId: string) {
  const result = await getDb().execute<{ last_confirmed_at: string | null }>(
    sql`select last_confirmed_at from exchange_rate_settings
        where organization_id = ${organizationId}`,
  );
  const value = result.rows[0]!.last_confirmed_at;
  return value === null ? null : new Date(value);
}

async function rejection(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      message?: string;
      cause?: { constraint?: string; message?: string };
    };
    return `${e.cause?.constraint ?? ""} ${e.cause?.message ?? e.message ?? ""}`;
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

const DOLARAPI_BODY = (venta: string) =>
  `{"moneda":"USD","casa":"blue","nombre":"Blue","compra":1535,"venta":${venta},"fechaActualizacion":"2026-10-19T12:57:00.000Z"}`;

function fakeFetch(body: string | null, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    if (body === null) throw new TypeError("fetch failed");
    return { ok: true, status: 200, body: new Response(body).body };
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterEach(async () => {
  await reader?.end();
  reader = null;
});

describe("el rol del lector (D-2, AC-3)", () => {
  it("no tiene privilegios sobre tablas ni secuencias; solo ejecuta las dos funciones", async () => {
    // Por oid: cualquier tabla, vista o secuencia de cualquier esquema que no sea del sistema.
    const tables = await getDb().execute<{ relname: string }>(
      sql`select c.relname from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname not in ('pg_catalog', 'information_schema')
            and n.nspname not like 'pg_toast%'
            and c.relkind in ('r', 'p', 'v', 'm', 'f')
            and (has_table_privilege('crm_fx_reader', c.oid, 'SELECT')
              or has_table_privilege('crm_fx_reader', c.oid, 'INSERT')
              or has_table_privilege('crm_fx_reader', c.oid, 'UPDATE')
              or has_table_privilege('crm_fx_reader', c.oid, 'DELETE'))`,
    );
    expect(tables.rows).toEqual([]);
    const sequences = await getDb().execute<{ relname: string }>(
      sql`select c.relname from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname not in ('pg_catalog', 'information_schema')
            and case when c.relkind = 'S'
              then has_sequence_privilege('crm_fx_reader', c.oid, 'USAGE')
              else false end`,
    );
    expect(sequences.rows).toEqual([]);

    const functions = await getDb().execute<{
      name: string;
      reader: boolean;
      app: boolean;
      definer: boolean;
      config: string[] | null;
      public_execute: boolean;
    }>(
      sql`select p.proname as name,
            has_function_privilege('crm_fx_reader', p.oid, 'EXECUTE') as reader,
            has_function_privilege('crm_app', p.oid, 'EXECUTE') as app,
            p.prosecdef as definer,
            p.proconfig as config,
            exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('fx_reader_targets', 'fx_record_reading')
          order by p.proname`,
    );
    expect(functions.rows).toEqual([
      {
        name: "fx_reader_targets",
        reader: true,
        app: false,
        definer: true,
        config: ["search_path=public, pg_temp"],
        public_execute: false,
      },
      {
        name: "fx_record_reading",
        reader: true,
        app: false,
        definer: true,
        config: ["search_path=public, pg_temp"],
        public_execute: false,
      },
    ]);

    // Ninguna otra función de public la ejecuta el lector más que las de PUBLIC por defecto.
    const others = await getDb().execute<{ name: string }>(
      sql`select p.proname as name from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosecdef
            and p.proname not in ('fx_reader_targets', 'fx_record_reading')
            and has_function_privilege('crm_fx_reader', p.oid, 'EXECUTE')`,
    );
    expect(others.rows).toEqual([]);
  });

  it("crm_app cambia solo la fuente y el ajuste de la configuración (B-1)", async () => {
    const columns = await getDb().execute<{
      column_name: string;
      can_update: boolean;
    }>(
      sql`select column_name,
            has_column_privilege('crm_app', 'public.exchange_rate_settings', column_name, 'UPDATE')
              as can_update
          from information_schema.columns
          where table_schema = 'public' and table_name = 'exchange_rate_settings'
          order by column_name`,
    );
    expect(
      columns.rows
        .filter((row) => row.can_update)
        .map((row) => row.column_name),
    ).toEqual(["adjustment", "source"]);
    expect(columns.rows.length).toBe(8);
  });

  it("con su rol, leer o escribir una tabla directamente se rechaza", async () => {
    const s = await seed();
    const client = await readerClient();
    await expect(client.query("select * from exchange_rates")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      client.query("update exchange_rate_settings set adjustment = 0"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      client.query(
        `insert into exchange_rates (organization_id, base_currency, quote_currency, rate, source,
           source_rate, adjustment, source_observed_at)
         values ($1, 'USD', 'ARS', 2000, 'dolarapi_blue', 2000, 0, now())`,
        [s.orgA],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("fx_reader_targets y fx_record_reading (D-3)", () => {
  it("solo son objetivo las organizaciones con la fuente automática, USD y ARS", async () => {
    const s = await seed();
    const client = await readerClient();
    const database = readerDatabase(client);
    expect(await database.targets()).toEqual([]);
    await settings(s.adminA, "dolarapi_blue", "10");
    expect(await database.targets()).toEqual([s.orgA]);
    // B no puede elegir la automática (EUR), y C no tiene configuración.
    expect(await record(s.orgB, "1555")).toBe("not_a_target");
    expect(await record(s.orgC, "1555")).toBe("not_a_target");
    // A en manual tampoco es objetivo.
    await settings(s.adminA, "manual", "10");
    expect(await database.targets()).toEqual([]);
    expect(await record(s.orgA, "1555")).toBe("not_a_target");
    expect(await rates(s.orgA)).toEqual([]);
  });

  it("guarda venta + ajuste, confirma sin una fila nueva, y guarda de nuevo si cambia", async () => {
    const s = await seed();
    await settings(s.adminA, "dolarapi_blue", "10");
    expect(await lastConfirmedAt(s.orgA)).toBeNull();

    // La primera, sin ninguna cotización: se guarda.
    expect(await record(s.orgA, "1555")).toBe("inserted");
    expect(await rates(s.orgA)).toEqual([
      {
        rate: "1565.000000",
        source: "dolarapi_blue",
        source_rate: "1555.000000",
        adjustment: "10.00",
        recorded_by: null,
      },
    ]);
    const firstConfirmation = await lastConfirmedAt(s.orgA);
    expect(firstConfirmation).not.toBeNull();

    // Igual: no hay fila nueva, avanza la confirmación.
    expect(await record(s.orgA, "1555")).toBe("confirmed");
    expect(await rates(s.orgA)).toHaveLength(1);
    expect((await lastConfirmedAt(s.orgA))!.getTime()).toBeGreaterThan(
      firstConfirmation!.getTime(),
    );

    // Con decimales, dentro del 10 %: fila nueva.
    expect(await record(s.orgA, "1580.25")).toBe("inserted");
    expect((await rates(s.orgA)).at(-1)).toMatchObject({
      rate: "1590.250000",
      source_rate: "1580.250000",
    });

    // Un ajuste nuevo cambia el valor en la próxima lectura, con la misma venta.
    await settings(s.adminA, "dolarapi_blue", "-5,50");
    expect(await record(s.orgA, "1580.25")).toBe("inserted");
    expect((await rates(s.orgA)).at(-1)).toMatchObject({
      rate: "1574.750000",
      adjustment: "-5.50",
    });
  });

  it("rechaza sin escribir: más de un 10 %, menor que 1 y un valor inválido", async () => {
    const s = await seed();
    await settings(s.adminA, "dolarapi_blue", "10");
    expect(await record(s.orgA, "1555")).toBe("inserted");
    const confirmation = await lastConfirmedAt(s.orgA);

    expect(await record(s.orgA, "1800")).toBe("rejected_large_change");
    for (const venta of [
      "",
      "-5",
      "1e3",
      "1555.1234567",
      "1234567890",
      " 1555",
    ]) {
      expect(await record(s.orgA, venta)).toBe("rejected_invalid");
    }
    expect(await record(s.orgA, "0")).toBe("rejected_invalid");
    expect(await rates(s.orgA)).toHaveLength(1);
    expect(await lastConfirmedAt(s.orgA)).toEqual(confirmation);

    // Menor que 1, con un ajuste negativo, sobre una organización sin cotización todavía.
    const t = await seed2();
    await settings(t.admin, "dolarapi_blue", "-1");
    expect(await record(t.org, "1.5")).toBe("rejected_below_one");
    // Un ajuste cerca del máximo desborda numeric(18, 6): se rechaza, no falla (B-7).
    await settings(t.admin, "dolarapi_blue", "999.999.999.999");
    expect(await record(t.org, "1555")).toBe("rejected_too_large");
    expect(await rates(t.org)).toEqual([]);
  });

  it("después de un salto real, una carga manual cercana destraba al lector (D-4)", async () => {
    const s = await seed();
    await settings(s.adminA, "dolarapi_blue", "10");
    expect(await record(s.orgA, "1555")).toBe("inserted");
    // El blue sube un 15 %: cada lectura se rechaza.
    expect(await record(s.orgA, "1790")).toBe("rejected_large_change");
    expect(await record(s.orgA, "1790")).toBe("rejected_large_change");
    // El admin carga a mano un valor cercano, con la fuente automática.
    await manual(s.adminA, "1780");
    expect(await record(s.orgA, "1790")).toBe("inserted");
    expect((await rates(s.orgA)).at(-1)).toMatchObject({
      rate: "1800.000000",
      source: "dolarapi_blue",
    });
  });

  it("una carga manual no se pisa mientras la fuente no cambie de valor (R-M12)", async () => {
    const s = await seed();
    await settings(s.adminA, "dolarapi_blue", "10");
    expect(await record(s.orgA, "1555")).toBe("inserted");
    await manual(s.adminA, "1600");
    expect(await record(s.orgA, "1555")).toBe("confirmed");
    const setup = await getExchangeSetup(s.orgA);
    expect(setup?.current?.source).toBe("manual");
    // Cuando la fuente cambia, la pisa.
    expect(await record(s.orgA, "1560")).toBe("inserted");
    expect((await getExchangeSetup(s.orgA))?.current?.source).toBe(
      "dolarapi_blue",
    );
  });

  it("al volver a la automática, la próxima lectura reemplaza a la manual aunque no cambie (D-5)", async () => {
    const s = await seed();
    await settings(s.adminA, "dolarapi_blue", "10");
    expect(await record(s.orgA, "1555")).toBe("inserted");
    await settings(s.adminA, "manual", "10");
    await manual(s.adminA, "1600");
    await settings(s.adminA, "dolarapi_blue", "10");
    expect(await record(s.orgA, "1555")).toBe("inserted");
    const current = (await getExchangeSetup(s.orgA))?.current;
    expect(current?.source).toBe("dolarapi_blue");
    expect(current?.recordedBy).toBeNull();
    // Y la siguiente igual ya solo confirma.
    expect(await record(s.orgA, "1555")).toBe("confirmed");
  });
});

// Una organización más, con USD y ARS y sin cotización.
async function seed2() {
  const org = await returningId(
    sql`insert into organizations (name) values ('Tienda D') returning id`,
  );
  await addAdmin(org, "admin-d@example.com");
  await fixCurrency(org, "admin-d@example.com", "ARS");
  return { org, admin: await contextFor("admin-d@example.com") };
}

describe("el esquema de la 0054 (D-2)", () => {
  it("los CHECK de una automática y la configuración que no cambia de dueño ni se borra", async () => {
    const s = await seed();
    const insert = (columns: SQL) =>
      getDb().execute(
        sql`insert into exchange_rates (organization_id, base_currency, quote_currency, rate,
              source, recorded_by, source_rate, adjustment, source_observed_at)
            values (${s.orgA}, 'USD', 'ARS', ${columns})`,
      );
    expect(
      await rejection(
        insert(
          sql`'1565', 'dolarapi_blue', ${s.adminA.userId}, '1555', '10', now()`,
        ),
      ),
    ).toMatch(/exchange_rates_author_by_source/);
    expect(
      await rejection(
        insert(sql`'1565', 'dolarapi_blue', null, '1555', null, now()`),
      ),
    ).toMatch(/exchange_rates_reading_by_source/);
    expect(
      await rejection(
        insert(sql`'1565', 'manual', ${s.adminA.userId}, '1555', '10', now()`),
      ),
    ).toMatch(/exchange_rates_reading_by_source/);
    expect(
      await rejection(
        insert(sql`'1566', 'dolarapi_blue', null, '1555', '10', now()`),
      ),
    ).toMatch(/exchange_rates_reading_sum/);

    expect(
      await rejection(
        getDb().execute(
          sql`delete from exchange_rate_settings where organization_id = ${s.orgA}`,
        ),
      ),
    ).toMatch(/no se borra/);
    expect(
      await rejection(
        getDb().execute(
          sql`update exchange_rate_settings set quote_currency = 'EUR'
              where organization_id = ${s.orgA}`,
        ),
      ),
    ).toMatch(/no cambian/);
    // source_changed_at lo mantiene el trigger: no se escribe a mano.
    await getDb().execute(
      sql`update exchange_rate_settings set source_changed_at = '2000-01-01'
          where organization_id = ${s.orgA}`,
    );
    const kept = await getDb().execute<{ year: number }>(
      sql`select extract(year from source_changed_at)::int as year
          from exchange_rate_settings where organization_id = ${s.orgA}`,
    );
    expect(kept.rows[0]!.year).toBeGreaterThan(2000);
  });
});

describe("la fuente y el ajuste (D-9, AC-6)", () => {
  it("el admin los cambia con auditoría; sin cambios, no audita", async () => {
    const s = await seed();
    expect(await settings(s.adminA, "dolarapi_blue", "10")).toEqual({
      ok: true,
      changed: true,
      toAutomatic: true,
    });
    expect(await settings(s.adminA, "dolarapi_blue", "10,00")).toEqual({
      ok: true,
      changed: false,
      toAutomatic: false,
    });
    expect(await settings(s.adminA, "dolarapi_blue", "12")).toEqual({
      ok: true,
      changed: true,
      toAutomatic: false,
    });
    await settings(s.adminA, "dolarapi_blue", "10");
    const audits = await getDb().execute<{ action: string; diff: unknown }>(
      sql`select action, diff from audit_logs
          where organization_id = ${s.orgA} and entity_type = 'exchange_rate_setting'
            and action = 'update'
          order by created_at, id`,
    );
    expect(audits.rows).toEqual([
      {
        action: "update",
        diff: {
          before: { source: "manual", adjustment: "0.00" },
          after: { source: "dolarapi_blue", adjustment: "10.00" },
        },
      },
      {
        action: "update",
        diff: {
          before: { source: "dolarapi_blue", adjustment: "10.00" },
          after: { source: "dolarapi_blue", adjustment: "12.00" },
        },
      },
      {
        action: "update",
        diff: {
          before: { source: "dolarapi_blue", adjustment: "12.00" },
          after: { source: "dolarapi_blue", adjustment: "10.00" },
        },
      },
    ]);
    const page = await getExchangeRatePage(s.adminA);
    expect(page.ok && page.value.source).toBe("dolarapi_blue");
    expect(page.ok && page.value.adjustment).toBe(1000n);
    expect(page.ok && page.value.automaticAvailable).toBe(true);
  });

  it("un viewer no puede, un ajuste inválido se rechaza, y sin ARS no hay automática", async () => {
    const s = await seed();
    expect(
      await updateExchangeSettings(s.viewerA, {
        source: "dolarapi_blue",
        adjustment: "10",
      }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(
      await updateExchangeSettings(s.adminA, {
        source: "dolarapi_blue",
        adjustment: "10,555",
      }),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      field: "adjustment",
      reason: "decimals",
    });
    expect(
      await updateExchangeSettings(s.adminA, {
        source: "infodolar",
        adjustment: "10",
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR", field: "source" });
    expect(
      await updateExchangeSettings(s.adminB, {
        source: "dolarapi_blue",
        adjustment: "10",
      }),
    ).toMatchObject({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "automatic_unavailable",
    });
    const page = await getExchangeRatePage(s.adminB);
    expect(page.ok && page.value.automaticAvailable).toBe(false);
  });
});

describe("la antigüedad desde la última confirmación (H-6, AC-7)", () => {
  it("una automática confirmada no es vieja; una manual se mide desde su carga", async () => {
    const s = await seed();
    await settings(s.adminA, "dolarapi_blue", "10");
    expect(await record(s.orgA, "1555")).toBe("inserted");
    // La fila se guardó hace una semana y se confirmó hace una hora.
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const hourAgo = new Date(Date.now() - 3600 * 1000);
    await getDb().execute(
      sql`alter table exchange_rates disable trigger exchange_rates_insert_only`,
    );
    await getDb().execute(
      sql`update exchange_rates set recorded_at = ${weekAgo} where organization_id = ${s.orgA}`,
    );
    await getDb().execute(
      sql`alter table exchange_rates enable trigger exchange_rates_insert_only`,
    );
    await getDb().execute(
      sql`update exchange_rate_settings set last_confirmed_at = ${hourAgo}
          where organization_id = ${s.orgA}`,
    );
    const current = (await getExchangeSetup(s.orgA))!.current!;
    expect(current.asOf.getTime()).toBe(hourAgo.getTime());
    expect(current.stale).toBe(false);
    expect(current.reading).toMatchObject({
      sourceRate: 1555_000000n,
      adjustment: 1000n,
    });

    // Una manual cargada ahora: su antigüedad es su carga, aunque la confirmación sea vieja.
    await manual(s.adminA, "1570");
    const later = (await getExchangeSetup(s.orgA))!.current!;
    expect(later.source).toBe("manual");
    expect(later.asOf).toEqual(later.recordedAt);
    expect(later.reading).toBeNull();
  });
});

describe("el lector entero (D-6, AC-4)", () => {
  it("guarda con una respuesta buena y sale con 0", async () => {
    const s = await seed();
    await settings(s.adminA, "dolarapi_blue", "10");
    const lines: string[] = [];
    const calls: string[] = [];
    const code = await runReader({
      fetch: fakeFetch(DOLARAPI_BODY("1555"), calls),
      database: readerDatabase(await readerClient()),
      log: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(calls).toEqual(["https://dolarapi.com/v1/dolares/blue"]);
    expect((await rates(s.orgA)).at(-1)).toMatchObject({ rate: "1565.000000" });
    expect(lines).toContain(`${s.orgA}: inserted.`);
  });

  it("sin organizaciones con la fuente automática no consulta", async () => {
    await seed();
    const calls: string[] = [];
    const code = await runReader({
      fetch: fakeFetch(DOLARAPI_BODY("1555"), calls),
      database: readerDatabase(await readerClient()),
      log: () => undefined,
    });
    expect(code).toBe(0);
    expect(calls).toEqual([]);
  });

  it("sale distinto de cero y no escribe si la consulta falla o no cumple", async () => {
    const s = await seed();
    await settings(s.adminA, "dolarapi_blue", "10");
    const database = readerDatabase(await readerClient());
    for (const body of [
      null,
      "no es json",
      DOLARAPI_BODY('"1555"'),
      DOLARAPI_BODY("1.555e3"),
      DOLARAPI_BODY("1555").replace('"blue"', '"oficial"'),
    ]) {
      const lines: string[] = [];
      const code = await runReader({
        fetch: fakeFetch(body),
        database,
        log: (line) => lines.push(line),
      });
      expect(code).toBe(1);
      expect(lines.join("\n")).toMatch(/FALLA/);
    }
    expect(await rates(s.orgA)).toEqual([]);
    expect(await lastConfirmedAt(s.orgA)).toBeNull();
  });

  it("sale distinto de cero si una organización se rechaza, aunque otra se guarde", async () => {
    const s = await seed();
    const t = await seed2();
    await settings(s.adminA, "dolarapi_blue", "10");
    await settings(t.admin, "dolarapi_blue", "10");
    await manual(t.admin, "1000");
    const lines: string[] = [];
    const code = await runReader({
      fetch: fakeFetch(DOLARAPI_BODY("1555")),
      database: readerDatabase(await readerClient()),
      log: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    expect(lines).toContain(`${s.orgA}: inserted.`);
    expect(lines).toContain(`FALLA: ${t.org}: rejected_large_change.`);
  });
});
