import { describe, expect, it } from "vitest";
import {
  imputeAccount,
  outstandingOf,
  standaloneSale,
  type AccountInput,
  type AccountReceipt,
  type AccountSale,
  type CurrencyAccount,
} from "./imputation";

// La regla de imputación (ADR 0022, punto 9; brief-21.3, D-2 y AC-2): los ejemplos del punto 9
// escritos a mano y las propiedades con un generador propio de semilla fija, sin dependencia nueva
// (H-7). Los montos van en centavos, como Money.

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

function sale(
  id: string,
  number: number,
  total: bigint,
  issued: number,
  { currency = "ARS", voided = false } = {},
): AccountSale {
  return { id, number, currency, total, issuedAt: day(issued), voided };
}

const toSale = (
  saleId: string,
  amount: bigint,
  currency = "ARS",
): AccountReceipt => ({ target: "sale", saleId, currency, amount });

const empty = { receipts: [], refunds: [] };

describe("los ejemplos del punto 9", () => {
  it("sin nada no hay monedas", () => {
    expect(imputeAccount({ sales: [], receipts: [], refunds: [] })).toEqual([]);
  });

  it("una venta sin cobros debe su total", () => {
    const [ars] = imputeAccount({ sales: [sale("a", 1, 1000n, 1)], ...empty });
    expect(ars).toEqual({
      currency: "ARS",
      debit: 1000n,
      credit: 0n,
      balance: 1000n,
      retained: 0n,
      inFavor: 0n,
      sales: [
        {
          saleId: "a",
          number: 1,
          issuedAt: day(1),
          total: 1000n,
          direct: 0n,
          imputed: 0n,
          outstanding: 1000n,
        },
      ],
    });
  });

  it("los cobros directos se suman hasta el total, en uno o varios", () => {
    const [ars] = imputeAccount({
      sales: [sale("a", 1, 1000n, 1)],
      receipts: [toSale("a", 300n), toSale("a", 700n)],
      refunds: [],
    });
    expect(ars!.sales[0]).toMatchObject({ direct: 1000n, outstanding: 0n });
    expect(ars!.balance).toBe(0n);
  });

  it("lo cobrado de una venta anulada se imputa a la vigente más vieja con saldo (H-8)", () => {
    const [ars] = imputeAccount({
      sales: [
        sale("vieja", 1, 500n, 1),
        sale("anulada", 2, 800n, 2, { voided: true }),
        sale("nueva", 3, 1000n, 3),
      ],
      receipts: [toSale("vieja", 200n), toSale("anulada", 600n)],
      refunds: [],
    });
    expect(ars!.sales).toMatchObject([
      { saleId: "vieja", direct: 200n, imputed: 300n, outstanding: 0n },
      { saleId: "nueva", direct: 0n, imputed: 300n, outstanding: 700n },
    ]);
    // La anulada deja de contar al debe; lo cobrado sí cuenta al haber.
    expect(ars).toMatchObject({ debit: 1500n, credit: 800n, balance: 700n });
  });

  it("lo que sobra del remanente es saldo a favor", () => {
    const [ars] = imputeAccount({
      sales: [
        sale("vigente", 1, 100n, 1),
        sale("anulada", 2, 900n, 2, { voided: true }),
      ],
      receipts: [toSale("anulada", 900n)],
      refunds: [],
    });
    expect(ars).toMatchObject({ inFavor: 800n, balance: -800n });
    expect(ars!.sales[0]).toMatchObject({ imputed: 100n, outstanding: 0n });
  });

  it("a igual fecha, el remanente va primero a la de menor número", () => {
    const [ars] = imputeAccount({
      sales: [
        sale("segunda", 8, 100n, 1),
        sale("primera", 7, 100n, 1),
        sale("anulada", 9, 150n, 2, { voided: true }),
      ],
      receipts: [toSale("anulada", 150n)],
      refunds: [],
    });
    expect(ars!.sales).toMatchObject([
      { saleId: "primera", imputed: 100n, outstanding: 0n },
      { saleId: "segunda", imputed: 50n, outstanding: 50n },
    ]);
  });

  it("los cobros a cuenta, las señas canceladas y las devoluciones forman el remanente (21.4 a 21.6)", () => {
    const [ars] = imputeAccount({
      sales: [sale("a", 1, 1000n, 1)],
      receipts: [
        { target: "account", currency: "ARS", amount: 400n },
        {
          target: "order",
          orderId: "p",
          currency: "ARS",
          amount: 300n,
          currentSaleId: null,
          cancelled: true,
        },
      ],
      refunds: [{ currency: "ARS", amount: 200n }],
    });
    expect(ars!.sales[0]).toMatchObject({ imputed: 500n, outstanding: 500n });
    expect(ars).toMatchObject({ credit: 500n, balance: 500n, inFavor: 0n });
  });

  it("la seña de un pedido con venta vigente es un cobro directo de esa venta", () => {
    const [ars] = imputeAccount({
      sales: [sale("vieja", 1, 500n, 1), sale("del-pedido", 2, 1000n, 2)],
      receipts: [
        {
          target: "order",
          orderId: "p",
          currency: "ARS",
          amount: 400n,
          currentSaleId: "del-pedido",
          cancelled: false,
        },
      ],
      refunds: [],
    });
    expect(ars!.sales).toMatchObject([
      { saleId: "vieja", direct: 0n, outstanding: 500n },
      { saleId: "del-pedido", direct: 400n, outstanding: 600n },
    ]);
  });

  it("la seña retenida no cuenta: se muestra aparte", () => {
    const [ars] = imputeAccount({
      sales: [sale("a", 1, 1000n, 1)],
      receipts: [
        {
          target: "order",
          orderId: "p",
          currency: "ARS",
          amount: 250n,
          currentSaleId: null,
          cancelled: false,
        },
      ],
      refunds: [],
    });
    expect(ars).toMatchObject({ retained: 250n, credit: 0n, balance: 1000n });
    expect(ars!.sales[0]).toMatchObject({ outstanding: 1000n });
  });

  it("cada moneda va aparte", () => {
    const accounts = imputeAccount({
      sales: [
        sale("pesos", 1, 1000n, 2),
        sale("dolares", 2, 50n, 1, { currency: "USD" }),
        sale("anulada", 3, 500n, 3, { voided: true }),
      ],
      receipts: [toSale("anulada", 500n)],
      refunds: [],
    });
    expect(accounts.map((account) => account.currency)).toEqual(["ARS", "USD"]);
    expect(outstandingOf(accounts, "pesos")).toMatchObject({ imputed: 500n });
    expect(outstandingOf(accounts, "dolares")).toMatchObject({
      imputed: 0n,
      outstanding: 50n,
    });
    expect(outstandingOf(accounts, "anulada")).toBeNull();
  });

  it("una entrada que contradice las reglas se lanza: otra moneda, una venta que no está, devoluciones de más", () => {
    expect(() =>
      imputeAccount({
        sales: [sale("a", 1, 100n, 1)],
        receipts: [toSale("a", 10n, "USD")],
        refunds: [],
      }),
    ).toThrow();
    expect(() =>
      imputeAccount({ sales: [], receipts: [toSale("x", 10n)], refunds: [] }),
    ).toThrow();
    expect(() =>
      imputeAccount({
        sales: [sale("a", 1, 100n, 1)],
        receipts: [{ target: "account", currency: "ARS", amount: 10n }],
        refunds: [{ currency: "ARS", amount: 11n }],
      }),
    ).toThrow();
  });
});

describe("la venta sin cliente (ADR 0022, puntos 3 y 6)", () => {
  it("lo que falta es su total menos sus cobros", () => {
    expect(
      standaloneSale({
        total: 1000n,
        collected: 300n,
        refunded: 0n,
        voided: false,
      }),
    ).toEqual({
      collected: 300n,
      outstanding: 700n,
      toRefund: 0n,
    });
  });

  it("anulada, lo cobrado queda a devolver", () => {
    expect(
      standaloneSale({
        total: 1000n,
        collected: 300n,
        refunded: 0n,
        voided: true,
      }),
    ).toEqual({
      collected: 300n,
      outstanding: 0n,
      toRefund: 300n,
    });
  });

  it("anulada, lo que queda a devolver es lo cobrado menos lo devuelto (brief-21.5, H-1)", () => {
    expect(
      standaloneSale({
        total: 1000n,
        collected: 300n,
        refunded: 120n,
        voided: true,
      }),
    ).toEqual({ collected: 300n, outstanding: 0n, toRefund: 180n });
  });

  it("lo devuelto nunca supera lo cobrado: si lo hiciera, es un defecto (brief-21.5, D-5)", () => {
    expect(() =>
      standaloneSale({
        total: 1000n,
        collected: 300n,
        refunded: 301n,
        voided: true,
      }),
    ).toThrow();
  });
});

// Generador propio con semilla fija (mulberry32): cada corrida ve los mismos casos, y un caso que
// falla se reproduce con su semilla.
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)]!;
  return { next, int, pick };
}

type Random = ReturnType<typeof random>;

// Un estado posible: los cobros directos nunca superan lo que faltaba al cobrar, pero el generador
// los deja pasar del total a veces, para probar que el exceso no se pierde; las devoluciones nunca
// superan lo que está a favor (punto 9, paso 2).
function generate(r: Random): AccountInput {
  const currencies = ["ARS", "USD", "CLP"].slice(0, r.int(1, 3));
  const sales: AccountSale[] = [];
  const receipts: AccountReceipt[] = [];
  const count = r.int(0, 7);
  for (let i = 0; i < count; i++) {
    sales.push(
      sale(`v${i}`, i + 1, BigInt(r.int(1, 5000)), r.int(1, 5), {
        currency: r.pick(currencies),
        voided: r.next() < 0.25,
      }),
    );
  }
  const sourcesOf = new Map<string, bigint>();
  const addSource = (currency: string, amount: bigint) =>
    sourcesOf.set(currency, (sourcesOf.get(currency) ?? 0n) + amount);
  const receiptCount = r.int(0, 10);
  for (let i = 0; i < receiptCount; i++) {
    const kind = r.next();
    const amount = BigInt(r.int(1, 3000));
    if (kind < 0.55 && sales.length > 0) {
      const target = r.pick(sales);
      receipts.push(toSale(target.id, amount, target.currency));
      if (target.voided) addSource(target.currency, amount);
    } else if (kind < 0.85) {
      const current = sales.filter((s) => !s.voided);
      const roll = r.next();
      const currency = r.pick(currencies);
      if (roll < 0.4 && current.length > 0) {
        const target = r.pick(current);
        receipts.push({
          target: "order",
          orderId: `p${i}`,
          currency: target.currency,
          amount,
          currentSaleId: target.id,
          cancelled: false,
        });
      } else {
        const cancelled = roll < 0.7;
        receipts.push({
          target: "order",
          orderId: `p${i}`,
          currency,
          amount,
          currentSaleId: null,
          cancelled,
        });
        if (cancelled) addSource(currency, amount);
      }
    } else {
      const currency = r.pick(currencies);
      receipts.push({ target: "account", currency, amount });
      addSource(currency, amount);
    }
  }
  const refunds = [...sourcesOf.entries()]
    .filter(() => r.next() < 0.5)
    .map(([currency, available]) => ({
      currency,
      amount: BigInt(r.int(0, Number(available))),
    }))
    .filter((refund) => refund.amount > 0n);
  return { sales, receipts, refunds };
}

function shuffle<T>(r: Random, items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const CASES = 500;

function forAll(
  property: (input: AccountInput, r: Random, seed: number) => void,
) {
  for (let seed = 1; seed <= CASES; seed++) {
    const r = random(seed);
    const input = generate(r);
    try {
      property(input, r, seed);
    } catch (error) {
      throw new Error(`semilla ${seed}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
}

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

function isRetained(receipt: AccountReceipt): boolean {
  return (
    receipt.target === "order" &&
    receipt.currentSaleId === null &&
    !receipt.cancelled
  );
}

describe(`las propiedades (${CASES} casos de semilla fija cada una)`, () => {
  it("ninguna venta recibe más que su total, y lo que falta nunca es negativo", () => {
    forAll((input) => {
      for (const account of imputeAccount(input)) {
        for (const row of account.sales) {
          expect(row.direct + row.imputed).toBeLessThanOrEqual(row.total);
          expect(row.direct).toBeGreaterThanOrEqual(0n);
          expect(row.imputed).toBeGreaterThanOrEqual(0n);
          expect(row.outstanding).toBe(row.total - row.direct - row.imputed);
          expect(row.outstanding).toBeGreaterThanOrEqual(0n);
        }
      }
    });
  });

  it("el saldo es el debe menos el haber, y la suma de lo que falta menos el saldo a favor", () => {
    forAll((input) => {
      for (const account of imputeAccount(input)) {
        const debit = sum(
          input.sales
            .filter((s) => s.currency === account.currency && !s.voided)
            .map((s) => s.total),
        );
        const credit =
          sum(
            input.receipts
              .filter(
                (rc) => rc.currency === account.currency && !isRetained(rc),
              )
              .map((rc) => rc.amount),
          ) -
          sum(
            input.refunds
              .filter((rf) => rf.currency === account.currency)
              .map((rf) => rf.amount),
          );
        expect(account.debit).toBe(debit);
        expect(account.credit).toBe(credit);
        expect(account.balance).toBe(debit - credit);
        expect(account.balance).toBe(
          sum(account.sales.map((s) => s.outstanding)) - account.inFavor,
        );
      }
    });
  });

  it("cada peso del haber se cuenta una sola vez: en una venta o a favor", () => {
    forAll((input) => {
      for (const account of imputeAccount(input)) {
        expect(
          sum(account.sales.map((s) => s.direct + s.imputed)) + account.inFavor,
        ).toBe(account.credit);
      }
    });
  });

  it("el remanente va de la más vieja a la más nueva: si una venta recibe, las más viejas no deben, y nada queda a favor con deuda", () => {
    forAll((input) => {
      for (const account of imputeAccount(input)) {
        account.sales.forEach((row, index) => {
          if (row.imputed > 0n) {
            for (const older of account.sales.slice(0, index)) {
              expect(older.outstanding).toBe(0n);
            }
          }
          if (index > 0) {
            const previous = account.sales[index - 1]!;
            const order =
              previous.issuedAt.getTime() - row.issuedAt.getTime() ||
              previous.number - row.number;
            expect(order).toBeLessThan(0);
          }
        });
        if (account.inFavor > 0n) {
          expect(account.sales.every((s) => s.outstanding === 0n)).toBe(true);
        }
      }
    });
  });

  it("ninguna moneda se mezcla con otra: cada moneda sola da lo mismo", () => {
    forAll((input) => {
      const together = imputeAccount(input);
      for (const account of together) {
        const only = (currency: string) => currency === account.currency;
        const alone = imputeAccount({
          sales: input.sales.filter((s) => only(s.currency)),
          receipts: input.receipts.filter((rc) => only(rc.currency)),
          refunds: input.refunds.filter((rf) => only(rf.currency)),
        });
        expect(alone).toEqual([account]);
      }
    });
  });

  it("las señas retenidas no entran: sacarlas solo cambia lo retenido", () => {
    forAll((input) => {
      const without = imputeAccount({
        ...input,
        receipts: input.receipts.filter((rc) => !isRetained(rc)),
      });
      const withRetained = imputeAccount(input);
      const strip = (accounts: CurrencyAccount[]) =>
        accounts
          .map((account) => ({ ...account, retained: 0n }))
          .filter(
            (account) =>
              account.sales.length > 0 ||
              account.credit !== 0n ||
              account.inFavor !== 0n,
          );
      expect(strip(withRetained)).toEqual(strip(without));
      for (const account of withRetained) {
        expect(account.retained).toBe(
          sum(
            input.receipts
              .filter(
                (rc) => rc.currency === account.currency && isRetained(rc),
              )
              .map((rc) => rc.amount),
          ),
        );
      }
    });
  });

  it("no depende del orden en que llegan las filas", () => {
    forAll((input, r) => {
      const shuffled = {
        sales: shuffle(r, input.sales),
        receipts: shuffle(r, input.receipts),
        refunds: shuffle(r, input.refunds),
      };
      expect(imputeAccount(shuffled)).toEqual(imputeAccount(input));
    });
  });

  // brief-21.6, H-2 y D-11: el escenario literal de AC-5 de la 21.3, dos cobros de ventas distintas
  // del mismo cliente en cola en que el segundo ve lo imputado por el primero, no se puede dar. Un
  // cobro de una venta, hasta lo que le falta, no cambia lo imputado ni lo que falta de ninguna otra
  // venta, ni lo que queda a favor: solo baja lo que le falta a la suya. Lo que mueve el remanente
  // es el cobro a cuenta, que no es de una venta.
  it("un cobro de una venta, hasta lo que le falta, no cambia ninguna otra venta ni lo que queda a favor", () => {
    let withRemainder = 0;
    forAll((input, r) => {
      for (const account of imputeAccount(input)) {
        const pending = account.sales.filter((row) => row.outstanding > 0n);
        if (pending.length === 0) continue;
        const target = r.pick(pending);
        const amount = BigInt(r.int(1, Number(target.outstanding)));
        const [after] = imputeAccount({
          ...input,
          receipts: [
            ...input.receipts,
            toSale(target.saleId, amount, account.currency),
          ],
        }).filter((row) => row.currency === account.currency);
        if (account.sales.some((row) => row.imputed > 0n)) withRemainder++;
        expect(after!.inFavor).toBe(account.inFavor);
        for (const row of after!.sales) {
          const before = account.sales.find((s) => s.saleId === row.saleId)!;
          expect(row.imputed).toBe(before.imputed);
          expect(row.outstanding).toBe(
            row.saleId === target.saleId
              ? before.outstanding - amount
              : before.outstanding,
          );
        }
      }
    });
    // Sin remanente repartido, la propiedad sería trivial.
    expect(withRemainder).toBeGreaterThan(50);
  });

  it("el cobro a cuenta sí mueve lo que falta de otra venta: es el escenario que sí se da (D-11)", () => {
    const sales = [sale("vieja", 1, 1000n, 1), sale("nueva", 2, 1000n, 2)];
    const [before] = imputeAccount({ sales, ...empty });
    const [after] = imputeAccount({
      sales,
      receipts: [{ target: "account", currency: "ARS", amount: 1000n }],
      refunds: [],
    });
    expect(before!.sales[0]!.outstanding).toBe(1000n);
    expect(after!.sales[0]!.outstanding).toBe(0n);
    expect(after!.sales[1]!.outstanding).toBe(1000n);
  });

  it("el generador cubre los casos que importan", () => {
    let withImputed = 0;
    let withFavor = 0;
    let withRetained = 0;
    let withExcess = 0;
    forAll((input) => {
      const accounts = imputeAccount(input);
      if (accounts.some((a) => a.sales.some((s) => s.imputed > 0n)))
        withImputed++;
      if (accounts.some((a) => a.inFavor > 0n)) withFavor++;
      if (accounts.some((a) => a.retained > 0n)) withRetained++;
      const directs = new Map<string, bigint>();
      for (const rc of input.receipts) {
        if (rc.target === "sale") {
          directs.set(rc.saleId, (directs.get(rc.saleId) ?? 0n) + rc.amount);
        }
      }
      if (
        input.sales.some(
          (s) => !s.voided && (directs.get(s.id) ?? 0n) > s.total,
        )
      ) {
        withExcess++;
      }
    });
    // Sin estos, las propiedades pasarían sobre casos triviales.
    expect(withImputed).toBeGreaterThan(50);
    expect(withFavor).toBeGreaterThan(50);
    expect(withRetained).toBeGreaterThan(50);
    expect(withExcess).toBeGreaterThan(10);
  });
});
