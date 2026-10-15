import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de la caja, los medios de pago y, desde la 21.3, los cobros (brief-21.2, AC-8; brief-21.3,
// AC-8; ADR 0022, puntos 2, 8 y 10): en src/, las siete tablas de cash solo se escriben desde las
// funciones autorizadas de src/modules/cash/repository.ts; las cinco de la caja y receipts solo se
// insertan, y payment_methods solo se inserta y se actualiza, sin borrarse. Es la tercera defensa,
// después de los privilegios de crm_app y de los triggers de la 0042 y la 0043: crm_app tiene INSERT
// en todas, así que la base no rechaza una sesión, un movimiento, un cierre o un cobro escritos
// fuera de cash, sin el bloqueo de cobros, sin número o sin auditoría.
//
// Además fija qué caso de uso llama a cada escritura de la caja: el inicial solo se escribe al
// abrir, el cierre por moneda solo al cerrar (brief-21.2, D-1), y el cobro solo desde
// createSaleReceipt, que copia de la venta el cliente y la moneda (brief-21.3, D-3), y desde la 21.4
// desde createOrderReceipt, la seña, que los copia del pedido (brief-21.4, D-4 y AC-8). Los
// ayudantes que comparten no escriben. Eso no lo puede defender la base.
//
// Desde la 21.5 (brief-21.5, AC-10), las tres tablas de la anulación y la devolución: receipt_voids
// solo desde voidReceipt, refunds solo desde createRefund y refund_voids solo desde voidRefund. Cada
// uno toma el bloqueo de cobros y comprueba lo devuelto o lo esperado antes de escribir.
//
// Desde la 21.6 (brief-21.6, AC-9 y H-9), el cobro a cuenta: receipts también desde
// createAccountReceipt, que copia el cliente de la cuenta y no lleva venta ni pedido. Un cuarto caso
// de uso sigue rechazado.
//
// Ve y no ve lo mismo que sale-writes.

const REPOSITORY = "src/modules/cash/repository.ts";
const SERVICE = "src/modules/cash/service.ts";

const AUTHORIZED = new Map([
  ["insertPaymentMethod", ["insert payment_methods"]],
  ["updatePaymentMethodName", ["update payment_methods"]],
  ["updatePaymentMethodActive", ["update payment_methods"]],
  ["insertCashSession", ["insert cash_sessions"]],
  ["insertOpeningAmounts", ["insert cash_session_opening_amounts"]],
  ["insertClosingAmounts", ["insert cash_session_closing_amounts"]],
  ["insertClosing", ["insert cash_session_closings"]],
  ["insertMovement", ["insert cash_movements"]],
  ["insertReceipt", ["insert receipts"]],
  ["insertReceiptVoid", ["insert receipt_voids"]],
  ["insertRefund", ["insert refunds"]],
  ["insertRefundVoid", ["insert refund_voids"]],
]);

// Qué caso de uso del servicio llama a cada escritura de la caja.
const CALLERS = new Map([
  ["insertCashSession", ["openCashSession"]],
  ["insertOpeningAmounts", ["openCashSession"]],
  ["insertClosingAmounts", ["closeCashSession"]],
  ["insertClosing", ["closeCashSession"]],
  ["insertMovement", ["recordCashMovement"]],
  [
    "insertReceipt",
    ["createSaleReceipt", "createOrderReceipt", "createAccountReceipt"],
  ],
  ["insertReceiptVoid", ["voidReceipt"]],
  ["insertRefund", ["createRefund"]],
  ["insertRefundVoid", ["voidRefund"]],
]);

const TABLES = new Map([
  ["paymentmethods", "payment_methods"],
  ["payment_methods", "payment_methods"],
  ["cashsessions", "cash_sessions"],
  ["cash_sessions", "cash_sessions"],
  ["cashsessionopeningamounts", "cash_session_opening_amounts"],
  ["cash_session_opening_amounts", "cash_session_opening_amounts"],
  ["cashsessionclosings", "cash_session_closings"],
  ["cash_session_closings", "cash_session_closings"],
  ["cashsessionclosingamounts", "cash_session_closing_amounts"],
  ["cash_session_closing_amounts", "cash_session_closing_amounts"],
  ["cashmovements", "cash_movements"],
  ["cash_movements", "cash_movements"],
  ["receipts", "receipts"],
  ["receiptvoids", "receipt_voids"],
  ["receipt_voids", "receipt_voids"],
  ["refunds", "refunds"],
  ["refundvoids", "refund_voids"],
  ["refund_voids", "refund_voids"],
]);

const SQL_NAMES =
  "payment_methods|cash_sessions|cash_session_opening_amounts|cash_session_closings|cash_session_closing_amounts|cash_movements|receipts|receipt_voids|refunds|refund_voids";
const DRIZZLE_NAMES =
  "paymentMethods|cashSessions|cashSessionOpeningAmounts|cashSessionClosings|cashSessionClosingAmounts|cashMovements|receipts|receiptVoids|refunds|refundVoids";

// La tabla en SQL: su nombre, con o sin esquema y comillas, o el objeto de Drizzle interpolado.
// El nombre queda en el grupo 2 o en el 3.
const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?(${SQL_NAMES})"?\b|\$\{\s*(?:\w+\.)?(${DRIZZLE_NAMES})\s*\}`;

const WRITE_PATTERNS = [
  new RegExp(
    String.raw`\.(insert|update|delete)\(\s*(?:\w+\.)?(${DRIZZLE_NAMES})\s*\)`,
    "g",
  ),
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

type Write = { line: number; operation: string; fn: string | null };

function functionsOf(code: string) {
  return [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function findCashWrites(code: string): Write[] {
  const functions = functionsOf(code);
  return WRITE_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} ${TABLES.get((match[2] ?? match[3])!.toLowerCase())}`,
      fn:
        functions.find((f) => match.index >= f.start && match.index < f.end)
          ?.name ?? null,
    })),
  ).sort((a, b) => a.line - b.line);
}

function findViolations(file: string, code: string): string[] {
  return findCashWrites(code)
    .filter(
      ({ operation, fn }) =>
        !(
          file === REPOSITORY &&
          fn !== null &&
          AUTHORIZED.get(fn)?.includes(operation)
        ),
    )
    .map(({ line, operation }) => `${file}:${line} ${operation}`);
}

// Las llamadas a las escrituras de la caja en el servicio, con el caso de uso que las hace.
function findCalls(code: string): { write: string; fn: string | null }[] {
  const functions = functionsOf(code);
  const writes = [...CALLERS.keys()].join("|");
  return [
    ...code.matchAll(new RegExp(String.raw`\brepository\.(${writes})\(`, "g")),
  ].map((match) => ({
    write: match[1]!,
    fn:
      functions.find((f) => match.index >= f.start && match.index < f.end)
        ?.name ?? null,
  }));
}

function findCallerViolations(code: string): string[] {
  return findCalls(code)
    .filter(({ write, fn }) => !(fn && CALLERS.get(write)?.includes(fn)))
    .map(({ write, fn }) => `${write} desde ${fn ?? "fuera de una función"}`);
}

describe("detección de escrituras de la caja", () => {
  it.each([
    {
      name: "insert de una sesión fuera de su función",
      file: REPOSITORY,
      code: "export async function seedSession(tx) {\n  await tx.insert(cashSessions).values(v);\n}",
    },
    {
      name: "update de una sesión, aun desde su función",
      file: REPOSITORY,
      code: "export async function insertCashSession(tx) {\n  await tx\n    .update(cashSessions)\n    .set({ number: 1 });\n}",
    },
    {
      name: "delete de un movimiento con Drizzle",
      file: REPOSITORY,
      code: "export async function insertMovement(tx) {\n  await tx.delete(cashMovements);\n}",
    },
    {
      name: "el cierre insertado desde la función de sus montos",
      file: REPOSITORY,
      code: "export async function insertClosingAmounts(tx) {\n  await tx.insert(cashSessionClosings).values(v);\n}",
    },
    {
      name: "el inicial insertado desde la función del cierre",
      file: REPOSITORY,
      code: "export async function insertClosing(tx) {\n  await tx.insert(cashSessionOpeningAmounts).values(v);\n}",
    },
    {
      name: "un medio de pago borrado",
      file: REPOSITORY,
      code: "export async function updatePaymentMethodActive(tx) {\n  await tx.delete(paymentMethods);\n}",
    },
    {
      name: "un medio de pago actualizado fuera de sus funciones",
      file: REPOSITORY,
      code: "export async function setCash(tx) {\n  await tx.update(paymentMethods).set({ isCash: true });\n}",
    },
    {
      name: "escritura fuera de toda función",
      file: REPOSITORY,
      code: "const add = (tx) => tx\n  .insert(cashMovements)\n  .values(v);",
    },
    {
      name: "la función autorizada en otro archivo",
      file: "src/modules/sales/repository.ts",
      code: "export async function insertMovement(tx) {\n  await tx.insert(cashMovements).values(v);\n}",
    },
    {
      name: "SQL literal de insert en otro módulo",
      file: "src/modules/orders/repository.ts",
      code: "await tx.execute(sql`INSERT INTO cash_movements (amount) VALUES (1)`);",
    },
    {
      name: "SQL literal de delete del cierre en la aplicación",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`delete from "cash_session_closings"`);',
    },
    {
      name: "insert con la tabla interpolada",
      file: "src/modules/cash/service.ts",
      code: "await tx.execute(sql`insert into ${cashSessionClosingAmounts} (counted) values (1)`);",
    },
    {
      name: "update con la tabla interpolada por espacio de nombres",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`update ${schema.paymentMethods} set is_cash = true`);",
    },
    {
      name: "nombre con esquema entre comillas",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`update "public"."cash_sessions" set number = 1`);',
    },
    {
      name: "Drizzle con import de espacio de nombres",
      file: "src/modules/cash/service.ts",
      code: "await tx.insert(cashSchema.cashMovements).values(v);",
    },
    {
      name: "un cobro insertado fuera de su función",
      file: REPOSITORY,
      code: "export async function seedReceipt(tx) {\n  await tx.insert(receipts).values(v);\n}",
    },
    {
      name: "un cobro actualizado, aun desde su función",
      file: REPOSITORY,
      code: "export async function insertReceipt(tx) {\n  await tx\n    .update(receipts)\n    .set({ amount: 1 });\n}",
    },
    {
      name: "un cobro borrado con SQL literal en ventas",
      file: "src/modules/sales/repository.ts",
      code: "await tx.execute(sql`DELETE FROM receipts WHERE sale_id = ${id}`);",
    },
    {
      name: "un cobro insertado con SQL literal y esquema en la aplicación",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`insert into "public"."receipts" (amount) values (1)`);',
    },
    {
      name: "una anulación de cobro insertada fuera de su función",
      file: REPOSITORY,
      code: "export async function seedVoid(tx) {\n  await tx.insert(receiptVoids).values(v);\n}",
    },
    {
      name: "una devolución insertada desde la función de su anulación",
      file: REPOSITORY,
      code: "export async function insertRefundVoid(tx) {\n  await tx.insert(refunds).values(v);\n}",
    },
    {
      name: "una anulación de devolución borrada con SQL literal en la aplicación",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`delete from refund_voids`);",
    },
    {
      name: "una devolución actualizada, aun desde su función",
      file: REPOSITORY,
      code: "export async function insertRefund(tx) {\n  await tx.update(refunds).set({ amount: 1 });\n}",
    },
    {
      name: "TRUNCATE TABLE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`truncate table only cash_session_opening_amounts`);",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "las escrituras autorizadas",
      code: "export async function insertCashSession(tx, s) {\n  const rows = await tx.insert(cashSessions).values(s).returning(c);\n}\nexport async function insertPaymentMethod(tx) {\n  return inNameSavepoint(tx, async (savepoint) => {\n    await savepoint\n      .insert(paymentMethods)\n      .values(v);\n  });\n}",
    },
    {
      name: "una lectura con una subconsulta de las sesiones",
      code: "export function findLastSession() {\n  return db.select(c).from(cashSessions).where(sql`not exists (select 1 from cash_sessions n where n.previous_session_id = ${cashSessions.id})`);\n}",
    },
    {
      name: "la escritura de otra tabla de nombre parecido",
      code: "export async function touch() {\n  await db.execute(sql`update cash_sessions_archive set x = 1`);\n  await db.execute(sql`delete from payment_methods_old`);\n  await db.execute(sql`insert into receipts_draft (x) values (1)`);\n}",
    },
  ])("permite: $name", ({ code }) => {
    expect(findViolations(REPOSITORY, code)).toEqual([]);
  });

  it.each([
    {
      name: "el inicial escrito desde el cierre",
      code: "export async function closeCashSession(c) {\n  await repository.insertOpeningAmounts(tx, o, s, a);\n}",
    },
    {
      name: "el cierre escrito desde un movimiento",
      code: "export async function recordCashMovement(c) {\n  await repository.insertClosing(tx, v);\n}",
    },
    {
      name: "un cobro escrito desde un movimiento",
      code: "export async function recordCashMovement(c) {\n  await repository.insertReceipt(tx, v);\n}",
    },
    {
      name: "un cobro escrito desde un caso de uso nuevo",
      code: "export async function createAdvanceReceipt(c) {\n  await repository.insertReceipt(tx, v);\n}",
    },
    {
      name: "un cobro escrito desde un ayudante que comparten el cobro y la seña",
      code: "export async function readPayment(c) {\n  await repository.insertReceipt(tx, v);\n}",
    },
    {
      name: "una anulación de cobro escrita desde la devolución",
      code: "export async function createRefund(c) {\n  await repository.insertReceiptVoid(tx, v);\n}",
    },
    {
      name: "una devolución escrita desde la anulación de un cobro",
      code: "export async function voidReceipt(c) {\n  await repository.insertRefund(tx, v);\n}",
    },
    {
      name: "una anulación de devolución escrita desde un ayudante",
      code: "export async function impactedSession(c) {\n  await repository.insertRefundVoid(tx, v);\n}",
    },
    {
      name: "una sesión creada desde un caso de uso nuevo",
      code: "export async function reopenCashSession(c) {\n  await repository.insertCashSession(tx, v);\n}",
    },
  ])("detecta el llamador: $name", ({ code }) => {
    expect(findCallerViolations(code)).not.toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe la caja ni los medios fuera de las funciones autorizadas", () => {
    const violations = files.flatMap((file) =>
      findViolations(file, readFileSync(file, "utf8")),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(
      violations,
      `Escrituras no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("el repositorio tiene exactamente las escrituras autorizadas", () => {
    const writes = findCashWrites(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual([
      "insertPaymentMethod: insert payment_methods",
      "updatePaymentMethodName: update payment_methods",
      "updatePaymentMethodActive: update payment_methods",
      "insertCashSession: insert cash_sessions",
      "insertOpeningAmounts: insert cash_session_opening_amounts",
      "insertClosingAmounts: insert cash_session_closing_amounts",
      "insertClosing: insert cash_session_closings",
      "insertMovement: insert cash_movements",
      "insertReceipt: insert receipts",
      "insertReceiptVoid: insert receipt_voids",
      "insertRefund: insert refunds",
      "insertRefundVoid: insert refund_voids",
    ]);
  });

  it("cada escritura de la caja la llama solo su caso de uso", () => {
    const code = readFileSync(SERVICE, "utf8");
    expect(findCallerViolations(code)).toEqual([]);
    // Y cada una se llama: si una deja de llamarse, la guarda se queda sin objeto.
    expect(new Set(findCalls(code).map(({ write }) => write))).toEqual(
      new Set(CALLERS.keys()),
    );
  });

  it("fuera de cash nadie importa su repositorio", () => {
    const outside = files.filter(
      (file) =>
        !file.startsWith("src/modules/cash/") &&
        /modules\/cash\/repository/.test(readFileSync(file, "utf8")),
    );
    expect(outside).toEqual([]);
  });
});
