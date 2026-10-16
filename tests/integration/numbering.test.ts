import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La numeración sin huecos contra PostgreSQL real (ADR 0019, punto 2; brief-19.2, AC-2).

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

function take(organizationId: string) {
  return getDb().transaction((tx) =>
    nextDocumentNumber(tx, organizationId, "order"),
  );
}

class IntentionalRollback extends Error {}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("nextDocumentNumber (AC-2)", () => {
  it("el primero es el 1 y crea la fila del contador; los siguientes, 2, 3…", async () => {
    const org = await createOrganization("Negocio A");
    expect(await take(org)).toBe(1);
    const row = await getDb().execute<{ last_number: string }>(
      sql`select last_number from document_counters
          where organization_id = ${org} and kind = 'order'`,
    );
    expect(row.rows[0]!.last_number).toBe("1");
    expect(await take(org)).toBe(2);
    expect(await take(org)).toBe(3);
  });

  it("cada organización tiene su serie", async () => {
    const orgA = await createOrganization("Negocio A");
    const orgB = await createOrganization("Negocio B");
    expect(await take(orgA)).toBe(1);
    expect(await take(orgA)).toBe(2);
    expect(await take(orgB)).toBe(1);
    expect(await take(orgA)).toBe(3);
  });

  it("una transacción revertida no consume el número", async () => {
    const org = await createOrganization("Negocio A");
    expect(await take(org)).toBe(1);
    await expect(
      getDb().transaction(async (tx) => {
        expect(await nextDocumentNumber(tx, org, "order")).toBe(2);
        throw new IntentionalRollback();
      }),
    ).rejects.toBeInstanceOf(IntentionalRollback);
    expect(await take(org)).toBe(2);
  });

  it("las altas simultáneas reciben números consecutivos distintos, también la primera vez", async () => {
    const org = await createOrganization("Negocio A");
    const numbers = await Promise.all(
      Array.from({ length: 8 }, () => take(org)),
    );
    expect([...numbers].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});

describe("la serie de la venta (brief-20.2, AC-2)", () => {
  it("la venta tiene su serie, independiente de la del pedido", async () => {
    const org = await createOrganization("Negocio A");
    expect(await take(org)).toBe(1);
    expect(await take(org)).toBe(2);
    const sale = () =>
      getDb().transaction((tx) => nextDocumentNumber(tx, org, "sale"));
    expect(await sale()).toBe(1);
    expect(await take(org)).toBe(3);
    expect(await sale()).toBe(2);
  });
});

describe("formatDocumentNumber", () => {
  it("el prefijo del pedido y seis dígitos; pasado el millón, todos los dígitos", () => {
    expect(formatDocumentNumber("order", 1)).toBe("P-000001");
    expect(formatDocumentNumber("order", 123)).toBe("P-000123");
    expect(formatDocumentNumber("order", 1_234_567)).toBe("P-1234567");
  });

  it("el prefijo de la venta es V (brief-20.2)", () => {
    expect(formatDocumentNumber("sale", 45)).toBe("V-000045");
    expect(formatDocumentNumber("sale", 1_234_567)).toBe("V-1234567");
  });

  it("el prefijo de la anulación es A (brief-20.4)", () => {
    expect(formatDocumentNumber("sale_void", 45)).toBe("A-000045");
    expect(formatDocumentNumber("sale_void", 1_234_567)).toBe("A-1234567");
  });

  it("el prefijo de la sesión de caja es C (brief-21.2)", () => {
    expect(formatDocumentNumber("cash_session", 45)).toBe("C-000045");
    expect(formatDocumentNumber("cash_session", 1_234_567)).toBe("C-1234567");
  });

  it("el prefijo del cobro es R (brief-21.3)", () => {
    expect(formatDocumentNumber("receipt", 123)).toBe("R-000123");
    expect(formatDocumentNumber("receipt", 1_234_567)).toBe("R-1234567");
  });

  it("los prefijos de la anulación de un cobro, la devolución y su anulación son AR, D y AD (brief-21.5)", () => {
    expect(formatDocumentNumber("receipt_void", 12)).toBe("AR-000012");
    expect(formatDocumentNumber("refund", 7)).toBe("D-000007");
    expect(formatDocumentNumber("refund_void", 2)).toBe("AD-000002");
    expect(formatDocumentNumber("refund", 1_234_567)).toBe("D-1234567");
  });

  it("el prefijo de la orden de compra es OC (brief-22.3, H-5)", () => {
    expect(formatDocumentNumber("purchase_order", 4)).toBe("OC-000004");
    expect(formatDocumentNumber("purchase_order", 1_234_567)).toBe(
      "OC-1234567",
    );
  });
});
