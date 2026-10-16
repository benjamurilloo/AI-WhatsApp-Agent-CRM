import type { Metadata } from "next";
import Link from "next/link";
import { getGoodsReceiptPaymentForm } from "@/modules/cash";
import { getSupplier } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import { UNKNOWN_SUPPLIER_TEXT } from "../../../ordenes/messages";
import {
  NO_ACTIVE_METHODS_MESSAGE,
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_RECEIPT_NOT_FOUND_MESSAGE,
  PAYMENT_RECEIPT_PAID_MESSAGE,
  PAYMENT_RECEIPT_VOIDED_MESSAGE,
} from "../../../pagos/messages";
import { SupplierPaymentForm } from "../../../pagos/payment-form";

export const metadata: Metadata = {
  title: "Pagar recepción — AI WhatsApp Agent CRM",
};

const TITLE = "Pagar recepción";

// Pantalla 50 (brief-22.6, D-13): el pago de una recepción, solo admin. Lo que falta sale de la cuenta
// entera del proveedor (H-6); el medio, de los activos, y el monto, propuesto en lo que falta. Una
// recepción anulada o ya pagada no ofrece el formulario. Al guardar va al comprobante del pago.
export default async function GoodsReceiptPaymentPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const context = await requireSession();
  const { receiptId } = await params;
  const back = {
    href: `/compras/recepciones/${receiptId}`,
    label: "Volver a la recepción",
  };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={PAYMENT_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const found = await getGoodsReceiptPaymentForm(context, receiptId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          found.code === "FORBIDDEN"
            ? PAYMENT_ADMIN_ONLY_MESSAGE
            : PAYMENT_RECEIPT_NOT_FOUND_MESSAGE
        }
        back={{ href: "/compras/recepciones", label: "Volver a recepciones" }}
      />
    );
  }
  const { form } = found;
  const { receipt } = form;
  const supplier = await getSupplier(context, receipt.supplierId);
  const supplierName = supplier.ok ? supplier.supplier.name : null;
  const blocked = receipt.voided
    ? PAYMENT_RECEIPT_VOIDED_MESSAGE
    : form.outstanding === "0.00"
      ? PAYMENT_RECEIPT_PAID_MESSAGE
      : form.paymentMethods.length === 0
        ? NO_ACTIVE_METHODS_MESSAGE
        : null;
  const money = (value: string) => formatMoney(value, receipt.currency);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Pagar la recepción ${receipt.displayNumber}`}
          subtitle={
            receipt.voided
              ? "La recepción está anulada."
              : `Falta pagar ${money(form.outstanding)}.`
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        <dl className="mb-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Proveedor</dt>
            <dd className="font-semibold">
              {supplierName ?? UNKNOWN_SUPPLIER_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Total de la recepción</dt>
            <dd className="tabular-nums">{money(receipt.total)}</dd>
          </div>
          <div>
            <dt className="text-muted">Pagado</dt>
            <dd className="tabular-nums">{money(form.paid)}</dd>
          </div>
          <div>
            <dt className="text-muted">Imputado desde la cuenta</dt>
            <dd className="tabular-nums">{money(form.imputed)}</dd>
          </div>
        </dl>
        {blocked ? (
          <p>
            {blocked}{" "}
            {form.paymentMethods.length === 0 && !receipt.voided ? (
              <Link href="/caja/medios-de-pago" className={linkClass}>
                Ir a los medios de pago
              </Link>
            ) : (
              <Link href={back.href} className={linkClass}>
                {back.label}
              </Link>
            )}
          </p>
        ) : (
          <SupplierPaymentForm
            target={{
              kind: "goods_receipt",
              goodsReceiptId: receipt.id,
              currency: receipt.currency,
            }}
            cancelHref={back.href}
            defaultCurrency={receipt.currency}
            defaultAmount={form.outstandingInput}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
          />
        )}
      </div>
    </main>
  );
}
