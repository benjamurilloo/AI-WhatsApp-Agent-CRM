import { and, asc, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  tenderValues,
  type CurrencyAmountRow,
  type ReceiptTender,
  type VoidRef,
} from "./repository";
import {
  supplierPaymentTarget,
  supplierPaymentVoidReason,
  supplierPaymentVoids,
  supplierPayments,
} from "./schema";

// Acceso a supplier_payments y supplier_payment_voids (ADR 0023, punto 8; brief-22.6, D-2, D-3 y
// D-12). Toda consulta filtra por organization_id en SQL, también las lecturas por id. Las únicas
// escrituras son insertSupplierPayment e insertSupplierPaymentVoid, y nada cambia ni borra: lo vigila
// tests/guards/cash-writes.test.ts. Los privilegios de crm_app y los triggers de la 0051 son las
// otras defensas.

type Executor = Db | DbTransaction;

export type SupplierPaymentTarget =
  (typeof supplierPaymentTarget.enumValues)[number];
export type SupplierPaymentVoidReason =
  (typeof supplierPaymentVoidReason.enumValues)[number];

export type SupplierPaymentRow = {
  id: string;
  number: number;
  target: SupplierPaymentTarget;
  goodsReceiptId: string | null;
  supplierId: string;
  paymentMethodId: string;
  sessionId: string | null;
  currency: string;
  // Con la escala de la base ("1234.50").
  amount: string;
  // Lo que salió o volvió en otra moneda, si la hubo (brief-29.4.3, D-2), como en el cobro.
  tenderedCurrency: string | null;
  tenderedAmount: string | null;
  exchangeRate: string | null;
  exchangeRateId: string | null;
  createdBy: string;
  createdAt: Date;
  // Su anulación, si la tiene: las lecturas la muestran y no la cuentan.
  voided: VoidRef | null;
};

const voidColumns = {
  id: supplierPaymentVoids.id,
  number: supplierPaymentVoids.number,
  reason: supplierPaymentVoids.reason,
  sessionId: supplierPaymentVoids.sessionId,
  createdBy: supplierPaymentVoids.createdBy,
  createdAt: supplierPaymentVoids.createdAt,
};

const baseColumns = {
  id: supplierPayments.id,
  number: supplierPayments.number,
  target: supplierPayments.target,
  goodsReceiptId: supplierPayments.goodsReceiptId,
  supplierId: supplierPayments.supplierId,
  paymentMethodId: supplierPayments.paymentMethodId,
  sessionId: supplierPayments.sessionId,
  currency: supplierPayments.currency,
  amount: supplierPayments.amount,
  tenderedCurrency: supplierPayments.tenderedCurrency,
  tenderedAmount: supplierPayments.tenderedAmount,
  exchangeRate: supplierPayments.exchangeRate,
  exchangeRateId: supplierPayments.exchangeRateId,
  createdBy: supplierPayments.createdBy,
  createdAt: supplierPayments.createdAt,
};

const columns = { ...baseColumns, voided: voidColumns };

// Un pago tiene a lo sumo una anulación (supplier_payment_voids_supplier_payment_unique).
const voidJoin = and(
  eq(supplierPaymentVoids.organizationId, supplierPayments.organizationId),
  eq(supplierPaymentVoids.supplierPaymentId, supplierPayments.id),
);

function select(executor: Executor) {
  return executor
    .select(columns)
    .from(supplierPayments)
    .leftJoin(supplierPaymentVoids, voidJoin);
}

// El destino y su clave: supplier_payments_target_check rechaza cualquier otra combinación.
export type NewSupplierPayment = {
  organizationId: string;
  number: number;
  destination:
    { target: "goods_receipt"; goodsReceiptId: string } | { target: "account" };
  supplierId: string;
  paymentMethodId: string;
  sessionId: string | null;
  currency: string;
  amount: string;
  // Lo que salió en otra moneda (brief-29.4.3, D-4), o null.
  tender: ReceiptTender | null;
  createdBy: string;
};

export async function insertSupplierPayment(
  tx: DbTransaction,
  payment: NewSupplierPayment,
): Promise<SupplierPaymentRow> {
  const { destination, tender, ...rest } = payment;
  const rows = await tx
    .insert(supplierPayments)
    .values({
      ...rest,
      ...tenderValues(tender),
      target: destination.target,
      goodsReceiptId:
        destination.target === "goods_receipt"
          ? destination.goodsReceiptId
          : null,
    })
    .returning(baseColumns);
  return { ...rows[0]!, voided: null };
}

export type NewSupplierPaymentVoid = {
  organizationId: string;
  number: number;
  supplierPaymentId: string;
  currency: string;
  amount: string;
  reason: SupplierPaymentVoidReason;
  // La sesión abierta del pago en efectivo, o ninguna: supplier_payment_voids_check_copy() rechaza
  // cualquier otra.
  sessionId: string | null;
  // Lo que salió en otra moneda, copiado del pago: desde la 0055 también lo compara el trigger
  // (brief-29.4.3, D-2).
  tender: ReceiptTender | null;
  createdBy: string;
};

export async function insertSupplierPaymentVoid(
  tx: DbTransaction,
  row: NewSupplierPaymentVoid,
): Promise<{ id: string; number: number }> {
  const { tender, ...rest } = row;
  const rows = await tx
    .insert(supplierPaymentVoids)
    .values({ ...rest, ...tenderValues(tender) })
    .returning({
      id: supplierPaymentVoids.id,
      number: supplierPaymentVoids.number,
    });
  return rows[0]!;
}

// Una anulación doble que llegó hasta la base (D-8): solo esta restricción, por su nombre.
export function isSupplierPaymentAlreadyVoided(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "supplier_payment_voids_supplier_payment_unique"
  );
}

export async function findSupplierPayment(
  organizationId: string,
  paymentId: string,
  executor: Executor = getDb(),
): Promise<SupplierPaymentRow | undefined> {
  const rows = await select(executor)
    .where(
      and(
        eq(supplierPayments.organizationId, organizationId),
        eq(supplierPayments.id, paymentId),
      ),
    )
    .limit(1);
  return rows[0];
}

// Los pagos de un proveedor, anulados incluidos, para su cuenta (ADR 0023, punto 9). Con tx, dentro
// del pago, con el bloqueo de cobros tomado.
export function findSupplierPayments(
  organizationId: string,
  supplierId: string,
  executor: Executor = getDb(),
): Promise<SupplierPaymentRow[]> {
  return select(executor)
    .where(
      and(
        eq(supplierPayments.organizationId, organizationId),
        eq(supplierPayments.supplierId, supplierId),
      ),
    )
    .orderBy(supplierPayments.number);
}

// Los pagos vigentes de toda la organización, para la lista de proveedores a los que se les debe
// (brief-22.7, D-7): solo los que cuentan en la regla, por proveedor y por número.
export function findAccountsSupplierPayments(
  organizationId: string,
  executor: Executor,
): Promise<SupplierPaymentRow[]> {
  return select(executor)
    .where(
      and(
        eq(supplierPayments.organizationId, organizationId),
        isNull(supplierPaymentVoids.id),
      ),
    )
    .orderBy(asc(supplierPayments.supplierId), asc(supplierPayments.number));
}

export function findGoodsReceiptPayments(
  organizationId: string,
  goodsReceiptId: string,
): Promise<SupplierPaymentRow[]> {
  return select(getDb())
    .where(
      and(
        eq(supplierPayments.organizationId, organizationId),
        eq(supplierPayments.goodsReceiptId, goodsReceiptId),
      ),
    )
    .orderBy(supplierPayments.number);
}

// Los pagos en efectivo de una sesión: los únicos con sesión. Anulados incluidos: lo esperado los
// resta todos y suma aparte las anulaciones que impactaron en ella.
export function findSessionSupplierPayments(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<SupplierPaymentRow[]> {
  return select(executor)
    .where(
      and(
        eq(supplierPayments.organizationId, organizationId),
        eq(supplierPayments.sessionId, sessionId),
      ),
    )
    .orderBy(supplierPayments.number);
}

// Lo anulado mientras la sesión estaba abierta: las anulaciones que impactaron en ella.
export function findSessionSupplierPaymentVoids(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<CurrencyAmountRow[]> {
  return executor
    .select({
      // Lo que vuelve a la caja: lo que salió, si fue en otra moneda (brief-29.4.3, D-5).
      currency: sql<string>`coalesce(${supplierPaymentVoids.tenderedCurrency}, ${supplierPaymentVoids.currency})`,
      amount: sql<string>`coalesce(${supplierPaymentVoids.tenderedAmount}, ${supplierPaymentVoids.amount})`,
    })
    .from(supplierPaymentVoids)
    .where(
      and(
        eq(supplierPaymentVoids.organizationId, organizationId),
        eq(supplierPaymentVoids.sessionId, sessionId),
      ),
    );
}

// Las anulaciones posteriores al cierre de una sesión de sus pagos en efectivo (D-9): solo las lee
// un admin.
export type LateSupplierPaymentVoidRow = {
  number: number;
  sourceId: string;
  sourceNumber: number;
  currency: string;
  amount: string;
  reason: SupplierPaymentVoidReason;
  createdAt: Date;
};

export function findLateSupplierPaymentVoids(
  organizationId: string,
  sessionId: string,
): Promise<LateSupplierPaymentVoidRow[]> {
  return getDb()
    .select({
      number: supplierPaymentVoids.number,
      sourceId: supplierPayments.id,
      sourceNumber: supplierPayments.number,
      currency: sql<string>`coalesce(${supplierPaymentVoids.tenderedCurrency}, ${supplierPaymentVoids.currency})`,
      amount: sql<string>`coalesce(${supplierPaymentVoids.tenderedAmount}, ${supplierPaymentVoids.amount})`,
      reason: supplierPaymentVoids.reason,
      createdAt: supplierPaymentVoids.createdAt,
    })
    .from(supplierPaymentVoids)
    .innerJoin(supplierPayments, voidJoin)
    .where(
      and(
        eq(supplierPayments.organizationId, organizationId),
        eq(supplierPayments.sessionId, sessionId),
        sql`${supplierPaymentVoids.sessionId} is null`,
      ),
    )
    .orderBy(supplierPaymentVoids.createdAt);
}

// La lista (D-13): el estado, el proveedor y el número, de un pago o de su anulación.
export type SupplierPaymentListQuery = {
  organizationId: string;
  status: "all" | "current" | "voided";
  supplierId: string | null;
  number: { kind: "payment" | "void"; value: number } | null;
};

const isVoided = sql`exists (
  select 1 from supplier_payment_voids v
  where v.organization_id = ${supplierPayments.organizationId}
    and v.supplier_payment_id = ${supplierPayments.id})`;

function listConditions(query: SupplierPaymentListQuery): SQL | undefined {
  return and(
    eq(supplierPayments.organizationId, query.organizationId),
    query.status === "voided" ? isVoided : undefined,
    query.status === "current" ? sql`not ${isVoided}` : undefined,
    query.supplierId !== null
      ? eq(supplierPayments.supplierId, query.supplierId)
      : undefined,
    query.number?.kind === "payment"
      ? eq(supplierPayments.number, query.number.value)
      : undefined,
    query.number?.kind === "void"
      ? sql`exists (
          select 1 from supplier_payment_voids v
          where v.organization_id = ${supplierPayments.organizationId}
            and v.supplier_payment_id = ${supplierPayments.id}
            and v.number = ${query.number.value})`
      : undefined,
  );
}

export async function countSupplierPayments(
  query: SupplierPaymentListQuery,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(supplierPayments)
    .where(listConditions(query));
  return rows[0]!.total;
}

// Del más nuevo al más viejo.
export function findSupplierPaymentsPage(
  query: SupplierPaymentListQuery,
  limit: number,
  offset: number,
): Promise<SupplierPaymentRow[]> {
  return select(getDb())
    .where(listConditions(query))
    .orderBy(desc(supplierPayments.number))
    .limit(limit)
    .offset(offset);
}
