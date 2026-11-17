import type { Metadata } from "next";
import Link from "next/link";
import { getGoodsReceiptPaymentForm } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { getSupplier } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import { UNKNOWN_SUPPLIER_TEXT } from "../../../ordenes/messages";
import {
  NOT_A_TRANSFER_NOTE,
  NO_ACTIVE_METHODS_MESSAGE,
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_RECEIPT_NOT_FOUND_MESSAGE,
  PAYMENT_RECEIPT_PAID_MESSAGE,
  PAYMENT_RECEIPT_VOIDED_MESSAGE,
} from "../../../pagos/messages";
import { SupplierPaymentForm } from "../../../pagos/payment-form";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";

export const metadata: Metadata = {
  title: "Pagar recepción — AI WhatsApp Agent CRM",
};

const TITLE = "Pagar recepción";

// Pantalla 50 (brief-22.6, D-13): el pago de una recepción, solo admin. Lo que falta sale de la cuenta
// entera del proveedor (H-6); el medio, de los activos, y el monto, propuesto en lo que falta. Una
// recepción anulada o ya pagada no ofrece el formulario. Al guardar va al comprobante del pago. Desde
// la 29.4.3, una recepción en la moneda principal se paga también en la otra (brief-29.4.3, D-7), con
// ?moneda= como el cobro. Desde la 24.8.2 tiene la forma de la lámina 09: la tarjeta de la
// recepción arriba, el formulario en dos columnas y el resumen de lo propuesto antes de confirmar.
// **Ninguna regla del pago cambia.**
export default async function GoodsReceiptPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptId: string }>;
  searchParams: Promise<{ moneda?: string | string[] }>;
}) {
  const context = await requireSession();
  const { receiptId } = await params;
  const { moneda } = await searchParams;
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
  const exchange = receiptExchange({
    offer: form.exchange,
    targetCurrency: receipt.currency,
    outstanding: form.outstanding,
    outstandingInput: form.outstandingInput,
    chosen: typeof moneda === "string" ? moneda.toUpperCase() : undefined,
    basePath: `/compras/recepciones/${receipt.id}/pagar`,
    timezone: await getOrganizationTimezone(context),
    movement: "payment",
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Pagar la recepción ${receipt.displayNumber}${
            supplierName ? ` · ${supplierName}` : ""
          }`}
          subtitle={
            receipt.voided
              ? "La recepción está anulada."
              : `Falta pagar ${money(form.outstanding)}.`
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {/* La tarjeta «Recepción» de la lámina 09: el código, el proveedor, el total y lo que falta.
            «Imputado desde la cuenta» se suma cuando lo hubo, porque si no, esa plata desaparece de
            la pantalla. */}
        <h2 className="text-base font-semibold">Recepción</h2>
        <dl className="mt-3 mb-5 grid gap-x-6 gap-y-3 rounded-xl border border-border px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-muted">Código</dt>
            <dd className="font-mono font-semibold">{receipt.displayNumber}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">Proveedor</dt>
            <dd className="font-semibold">
              {supplierName ?? UNKNOWN_SUPPLIER_TEXT}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">Total de la recepción</dt>
            <dd className="font-semibold tabular-nums">
              {money(receipt.total)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">Pendiente de pago</dt>
            <dd className="font-semibold tabular-nums">
              {money(form.outstanding)}
            </dd>
          </div>
          {form.imputed === "0.00" ? null : (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-muted">Imputado desde la cuenta</dt>
              <dd className="tabular-nums">{money(form.imputed)}</dd>
            </div>
          )}
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
            exchange={exchange}
            summary={{
              appliedLabel: "Aplicar a la recepción",
              applied: money(form.outstanding),
              outgoingLabel: "Registrar salida",
              // La tercera cifra de la lámina, pero solo cuando el pago sale en la otra moneda:
              // es lo que falta convertido con la cotización que la pantalla ofrece.
              outgoing:
                exchange &&
                exchange.tendered !== receipt.currency &&
                form.exchange?.outstanding
                  ? formatMoney(
                      form.exchange.outstanding,
                      form.exchange.currency,
                    )
                  : null,
              afterLabel: "Pendiente después",
              after: money("0.00"),
            }}
          />
        )}
        {blocked ? null : (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <span>{NOT_A_TRANSFER_NOTE}</span>
          </p>
        )}
      </div>
    </main>
  );
}
