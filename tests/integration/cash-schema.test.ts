import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de los medios de pago y de la caja contra PostgreSQL real (brief-21.2, AC-1): privilegios,
// solo inserción, la cadena de sesiones, la sesión cerrada, los CHECK, las claves compuestas y el
// trigger de «es efectivo», probados con SQL directo y con el rol dueño, que es el que no frenan los
// privilegios. Lo esperado lo calcula el servicio (D-4), no la base.

type Executor = { execute: (query: SQL) => Promise<unknown> };

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertUser(email: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, 'hash', 'Ana') returning id`,
  );
  return result.rows[0]!.id;
}

async function insertSession(
  executor: Executor,
  values: {
    organizationId: string;
    userId: string;
    number: number;
    previousSessionId?: string | null;
  },
): Promise<string> {
  const result = (await executor.execute(
    sql`insert into cash_sessions (organization_id, number, previous_session_id, opened_by)
        values (${values.organizationId}, ${values.number},
                ${values.previousSessionId ?? null}, ${values.userId})
        returning id`,
  )) as { rows: { id: string }[] };
  return result.rows[0]!.id;
}

function insertClosing(
  executor: Executor,
  values: { organizationId: string; sessionId: string; userId: string },
) {
  return executor.execute(
    sql`insert into cash_session_closings (organization_id, session_id, closed_by)
        values (${values.organizationId}, ${values.sessionId}, ${values.userId})`,
  );
}

function insertOpeningAmount(
  executor: Executor,
  values: {
    organizationId: string;
    sessionId: string;
    currency?: string;
    amount?: string;
  },
) {
  return executor.execute(
    sql`insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
        values (${values.organizationId}, ${values.sessionId}, ${values.currency ?? "ARS"},
                ${values.amount ?? "100"})`,
  );
}

function insertClosingAmount(
  executor: Executor,
  values: {
    organizationId: string;
    sessionId: string;
    currency?: string;
    counted?: string;
    expected?: string;
  },
) {
  return executor.execute(
    sql`insert into cash_session_closing_amounts (organization_id, session_id, currency, counted,
                                                  expected)
        values (${values.organizationId}, ${values.sessionId}, ${values.currency ?? "ARS"},
                ${values.counted ?? "100"}, ${values.expected ?? "100"})`,
  );
}

function insertMovement(
  executor: Executor,
  values: {
    organizationId: string;
    sessionId: string;
    userId: string;
    kind?: string;
    reason?: string;
    amount?: string;
    currency?: string;
  },
) {
  return executor.execute(
    sql`insert into cash_movements (organization_id, session_id, kind, currency, amount, reason,
                                    created_by)
        values (${values.organizationId}, ${values.sessionId}, ${values.kind ?? "contribution"},
                ${values.currency ?? "ARS"}, ${values.amount ?? "10"},
                ${values.reason ?? "change_fund"}, ${values.userId})`,
  );
}

function insertPaymentMethod(
  executor: Executor,
  values: { organizationId: string; name: string; isCash?: boolean },
) {
  return executor.execute(
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${values.organizationId}, ${values.name}, ${values.isCash ?? false})`,
  );
}

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; constraint: string | undefined; message: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: { code?: string; constraint?: string; message?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      constraint: e.cause?.constraint ?? e.constraint,
      message: e.cause?.message ?? e.message ?? "",
    };
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

async function privileges(table: string) {
  const result = await getDb().execute<{ privilege: string }>(
    sql`select privilege_type as privilege from information_schema.role_table_grants
        where grantee = 'crm_app' and table_name = ${table}
        order by privilege_type`,
  );
  return result.rows.map((row) => row.privilege);
}

// A con una sesión cerrada (la primera, con su inicial, su movimiento y su cierre) y la siguiente,
// abierta; B con su usuario y nada más.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const userId = await insertUser("ana@example.com");
  const closed = await insertSession(getDb(), {
    organizationId: orgA,
    userId,
    number: 1,
  });
  await insertOpeningAmount(getDb(), {
    organizationId: orgA,
    sessionId: closed,
  });
  await insertMovement(getDb(), {
    organizationId: orgA,
    sessionId: closed,
    userId,
  });
  await insertClosingAmount(getDb(), {
    organizationId: orgA,
    sessionId: closed,
    counted: "110",
    expected: "110",
  });
  await insertClosing(getDb(), {
    organizationId: orgA,
    sessionId: closed,
    userId,
  });
  const open = await insertSession(getDb(), {
    organizationId: orgA,
    userId,
    number: 2,
    previousSessionId: closed,
  });
  return { orgA, orgB, userId, closed, open };
}

const INSERT_ONLY = [
  "cash_sessions",
  "cash_session_opening_amounts",
  "cash_session_closings",
  "cash_session_closing_amounts",
  "cash_movements",
];

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los valores nuevos de los enums (AC-1)", () => {
  async function enumValues(name: string) {
    const result = await getDb().execute<{ value: string }>(
      sql`select e.enumlabel as value from pg_enum e
          join pg_type t on t.oid = e.enumtypid
          where t.typname = ${name} order by e.enumsortorder`,
    );
    return result.rows.map((row) => row.value);
  }

  it("suma la sesión de caja, el medio de pago y el cierre", async () => {
    expect(await enumValues("document_kind")).toContain("cash_session");
    expect(await enumValues("audit_entity_type")).toEqual(
      expect.arrayContaining(["cash_session", "payment_method"]),
    );
    expect(await enumValues("audit_action")).toContain("close");
  });

  it("los tipos y los motivos de los movimientos son los de D-2", async () => {
    expect(await enumValues("cash_movement_kind")).toEqual([
      "contribution",
      "withdrawal",
    ]);
    expect(await enumValues("cash_movement_reason")).toEqual([
      "change_fund",
      "owner_contribution",
      "bank_deposit",
      "owner_withdrawal",
      "correction",
      "other",
    ]);
  });
});

describe("privilegios y solo inserción (AC-1)", () => {
  it("crm_app tiene SELECT e INSERT en las tablas de la caja, sin UPDATE ni DELETE", async () => {
    for (const table of INSERT_ONLY) {
      expect(await privileges(table), table).toEqual(["INSERT", "SELECT"]);
    }
  });

  it("crm_app tiene SELECT, INSERT y UPDATE en payment_methods, sin DELETE", async () => {
    expect(await privileges("payment_methods")).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE",
    ]);
  });

  it("el trigger rechaza UPDATE y DELETE en cada tabla de la caja, también al dueño", async () => {
    await seed();
    for (const table of INSERT_ONLY) {
      const update = await pgError(
        getDb().execute(
          sql`update ${sql.identifier(table)} set organization_id = organization_id`,
        ),
      );
      expect(update.code, table).toBe("P0001");
      expect(update.message).toContain("solo inserción: UPDATE");
      const remove = await pgError(
        getDb().execute(sql`delete from ${sql.identifier(table)}`),
      );
      expect(remove.code, table).toBe("P0001");
      expect(remove.message).toContain("solo inserción: DELETE");
    }
  });

  it("crm_app no puede actualizar ni borrar una sesión", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(
              sql`update cash_sessions set number = 9 where id = ${s.open}`,
            ),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(sql`delete from payment_methods where false`),
          ),
        )
      ).code,
    ).toBe("42501");
  });
});

describe("la cadena de sesiones (AC-1; ADR 0022, punto 8)", () => {
  it("una sola primera sesión por organización", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertSession(getDb(), {
          organizationId: s.orgA,
          userId: s.userId,
          number: 3,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "cash_sessions_first_unique",
    });
    // Otra organización tiene su propia primera.
    await insertSession(getDb(), {
      organizationId: s.orgB,
      userId: s.userId,
      number: 1,
    });
  });

  it("cada sesión tiene a lo sumo una siguiente", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertSession(getDb(), {
          organizationId: s.orgA,
          userId: s.userId,
          number: 3,
          previousSessionId: s.closed,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "cash_sessions_previous_unique",
    });
  });

  it("una sesión no se abre si la anterior no tiene cierre", async () => {
    const s = await seed();
    const rejected = await pgError(
      insertSession(getDb(), {
        organizationId: s.orgA,
        userId: s.userId,
        number: 3,
        previousSessionId: s.open,
      }),
    );
    expect(rejected.code).toBe("P0001");
    expect(rejected.message).toContain("no está cerrada");
  });

  it("la anterior es de la misma organización", async () => {
    const s = await seed();
    await insertClosing(getDb(), {
      organizationId: s.orgA,
      sessionId: s.open,
      userId: s.userId,
    });
    // El trigger no encuentra el cierre en B; la clave compuesta tampoco encontraría la sesión.
    expect(
      (
        await pgError(
          insertSession(getDb(), {
            organizationId: s.orgB,
            userId: s.userId,
            number: 1,
            previousSessionId: s.open,
          }),
        )
      ).code,
    ).toBe("P0001");
    // Con el trigger apagado, la clave compuesta.
    expect(
      await pgError(
        getDb().transaction(async (tx) => {
          await tx.execute(
            sql`alter table cash_sessions disable trigger cash_sessions_chain`,
          );
          await insertSession(tx, {
            organizationId: s.orgB,
            userId: s.userId,
            number: 1,
            previousSessionId: s.open,
          });
        }),
      ),
    ).toMatchObject({ code: "23503", constraint: "cash_sessions_previous_fk" });
  });

  it("el número es único por organización y positivo", async () => {
    const s = await seed();
    await insertClosing(getDb(), {
      organizationId: s.orgA,
      sessionId: s.open,
      userId: s.userId,
    });
    expect(
      await pgError(
        insertSession(getDb(), {
          organizationId: s.orgA,
          userId: s.userId,
          number: 2,
          previousSessionId: s.open,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "cash_sessions_organization_number_unique",
    });
    expect(
      (
        await pgError(
          insertSession(getDb(), {
            organizationId: s.orgA,
            userId: s.userId,
            number: 0,
            previousSessionId: s.open,
          }),
        )
      ).constraint,
    ).toBe("cash_sessions_number_positive");
  });

  it("una sesión se cierra a lo sumo una vez", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertClosing(getDb(), {
          organizationId: s.orgA,
          sessionId: s.closed,
          userId: s.userId,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "cash_session_closings_session_unique",
    });
  });
});

describe("una sesión cerrada no cambia (AC-1; ADR 0022, punto 8)", () => {
  it("rechaza un inicial, un cierre por moneda y un movimiento en una sesión cerrada", async () => {
    const s = await seed();
    const target = { organizationId: s.orgA, sessionId: s.closed };
    for (const query of [
      insertOpeningAmount(getDb(), { ...target, currency: "USD" }),
      insertClosingAmount(getDb(), { ...target, currency: "USD" }),
      insertMovement(getDb(), { ...target, userId: s.userId }),
    ]) {
      const rejected = await pgError(query);
      expect(rejected.code).toBe("P0001");
      expect(rejected.message).toContain("está cerrada");
    }
  });

  it("la sesión abierta sí los recibe", async () => {
    const s = await seed();
    const target = { organizationId: s.orgA, sessionId: s.open };
    await insertOpeningAmount(getDb(), target);
    await insertMovement(getDb(), { ...target, userId: s.userId });
    await insertClosingAmount(getDb(), target);
  });
});

describe("CHECK y claves compuestas (AC-1)", () => {
  it("el motivo corresponde al tipo del movimiento", async () => {
    const s = await seed();
    const target = {
      organizationId: s.orgA,
      sessionId: s.open,
      userId: s.userId,
    };
    expect(
      (
        await pgError(
          insertMovement(getDb(), {
            ...target,
            kind: "contribution",
            reason: "bank_deposit",
          }),
        )
      ).constraint,
    ).toBe("cash_movements_reason_fits_kind");
    expect(
      (
        await pgError(
          insertMovement(getDb(), {
            ...target,
            kind: "withdrawal",
            reason: "change_fund",
          }),
        )
      ).constraint,
    ).toBe("cash_movements_reason_fits_kind");
    // Corrección y Otro valen para los dos.
    for (const kind of ["contribution", "withdrawal"]) {
      for (const reason of ["correction", "other"]) {
        await insertMovement(getDb(), { ...target, kind, reason, amount: "1" });
      }
    }
    // Un motivo fuera de la lista no es del enum.
    expect(
      (await pgError(insertMovement(getDb(), { ...target, reason: "expense" })))
        .code,
    ).toBe("22P02");
  });

  it("los montos: movimiento positivo; inicial, contado y esperado, cero o positivos", async () => {
    const s = await seed();
    const target = { organizationId: s.orgA, sessionId: s.open };
    expect(
      (
        await pgError(
          insertMovement(getDb(), { ...target, userId: s.userId, amount: "0" }),
        )
      ).constraint,
    ).toBe("cash_movements_amount_positive");
    expect(
      (await pgError(insertOpeningAmount(getDb(), { ...target, amount: "-1" })))
        .constraint,
    ).toBe("cash_session_opening_amounts_amount_non_negative");
    expect(
      (
        await pgError(
          insertClosingAmount(getDb(), { ...target, counted: "-1" }),
        )
      ).constraint,
    ).toBe("cash_session_closing_amounts_counted_non_negative");
    expect(
      (
        await pgError(
          insertClosingAmount(getDb(), { ...target, expected: "-1" }),
        )
      ).constraint,
    ).toBe("cash_session_closing_amounts_expected_non_negative");
    await insertOpeningAmount(getDb(), { ...target, amount: "0" });
    await insertClosingAmount(getDb(), {
      ...target,
      counted: "0",
      expected: "0",
    });
  });

  it("la moneda tiene tres letras mayúsculas y va una vez por sesión", async () => {
    const s = await seed();
    const target = { organizationId: s.orgA, sessionId: s.open };
    expect(
      (
        await pgError(
          insertOpeningAmount(getDb(), { ...target, currency: "ars" }),
        )
      ).constraint,
    ).toBe("cash_session_opening_amounts_currency_format");
    expect(
      (
        await pgError(
          insertMovement(getDb(), {
            ...target,
            userId: s.userId,
            currency: "PESO",
          }),
        )
      ).constraint,
    ).toBe("cash_movements_currency_format");
    expect(
      (
        await pgError(
          insertClosingAmount(getDb(), { ...target, currency: "Ars" }),
        )
      ).constraint,
    ).toBe("cash_session_closing_amounts_currency_format");
    await insertOpeningAmount(getDb(), target);
    expect(await pgError(insertOpeningAmount(getDb(), target))).toMatchObject({
      code: "23505",
      constraint: "cash_session_opening_amounts_pkey",
    });
  });

  it("nada apunta a una sesión de otra organización", async () => {
    const s = await seed();
    const foreign = { organizationId: s.orgB, sessionId: s.open };
    expect(
      await pgError(insertMovement(getDb(), { ...foreign, userId: s.userId })),
    ).toMatchObject({ code: "23503", constraint: "cash_movements_session_fk" });
    expect(await pgError(insertOpeningAmount(getDb(), foreign))).toMatchObject({
      code: "23503",
      constraint: "cash_session_opening_amounts_session_fk",
    });
    expect(await pgError(insertClosingAmount(getDb(), foreign))).toMatchObject({
      code: "23503",
      constraint: "cash_session_closing_amounts_session_fk",
    });
    expect(
      await pgError(insertClosing(getDb(), { ...foreign, userId: s.userId })),
    ).toMatchObject({
      code: "23503",
      constraint: "cash_session_closings_session_fk",
    });
  });

  it("las horas salen de clock_timestamp", async () => {
    const result = await getDb().execute<{
      table_name: string;
      column_default: string;
    }>(
      sql`select table_name, column_default from information_schema.columns
          where (table_name, column_name) in (('cash_sessions', 'opened_at'),
            ('cash_session_closings', 'closed_at'), ('cash_movements', 'created_at'))
          order by table_name`,
    );
    expect(result.rows.map((row) => row.column_default)).toEqual([
      "clock_timestamp()",
      "clock_timestamp()",
      "clock_timestamp()",
    ]);
  });
});

describe("payment_methods (AC-1; ADR 0022, punto 10)", () => {
  it("el nombre es único por organización sin distinguir mayúsculas", async () => {
    const s = await seed();
    await insertPaymentMethod(getDb(), {
      organizationId: s.orgA,
      name: "Efectivo",
    });
    expect(
      await pgError(
        insertPaymentMethod(getDb(), {
          organizationId: s.orgA,
          name: "EFECTIVO",
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "payment_methods_organization_name_lower_unique",
    });
    await insertPaymentMethod(getDb(), {
      organizationId: s.orgB,
      name: "Efectivo",
    });
  });

  it("el nombre tiene de 1 a 40 caracteres, sin espacios al borde", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          insertPaymentMethod(getDb(), { organizationId: s.orgA, name: "" }),
        )
      ).constraint,
    ).toBe("payment_methods_name_length");
    expect(
      (
        await pgError(
          insertPaymentMethod(getDb(), {
            organizationId: s.orgA,
            name: "x".repeat(41),
          }),
        )
      ).constraint,
    ).toBe("payment_methods_name_length");
    expect(
      (
        await pgError(
          insertPaymentMethod(getDb(), {
            organizationId: s.orgA,
            name: " Pago ",
          }),
        )
      ).constraint,
    ).toBe("payment_methods_name_trimmed");
  });

  it("«es efectivo» y la organización no cambian; el nombre y el estado, sí", async () => {
    const s = await seed();
    await insertPaymentMethod(getDb(), {
      organizationId: s.orgA,
      name: "Efectivo",
      isCash: true,
    });
    const isCash = await pgError(
      getDb().execute(sql`update payment_methods set is_cash = false`),
    );
    expect(isCash.code).toBe("P0001");
    expect(isCash.message).toContain("no cambia si es efectivo");
    const organization = await pgError(
      getDb().execute(
        sql`update payment_methods set organization_id = ${s.orgB}`,
      ),
    );
    expect(organization.code).toBe("P0001");
    await asAppRole((tx) =>
      tx.execute(
        sql`update payment_methods set name = 'Contado', is_active = false`,
      ),
    );
  });
});
