import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTradeInPaymentForm } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { tradeInsAllowed } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import {
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_NO_METHODS_MESSAGE,
  PAYMENT_NOT_PURCHASE_MESSAGE,
  PAYMENT_PAID_MESSAGE,
  PAYMENT_TITLE,
  PAYMENT_TRADE_IN_VOIDED_MESSAGE,
  TRADE_IN_NOT_FOUND_MESSAGE,
} from "../../messages";
import { TradeInPaymentForm } from "./payment-form";

export const metadata: Metadata = {
  title: "Pagar un usado — AI WhatsApp Agent CRM",
};

// El pago de un usado comprado (brief-29.7.2, D-6), solo admin y con la capacidad trade_ins. Lo que
// falta es el valor menos los pagos vigentes; el medio, de los elegibles, y el monto, propuesto en lo que
// falta. Un usado de permuta, anulado o ya pagado no ofrece el formulario. Al guardar va al comprobante
// del pago. Con moneda principal, ?moneda= elige la moneda que sale, como el pago de una recepción.
export default async function TradeInPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ tradeInId: string }>;
  searchParams: Promise<{ moneda?: string | string[] }>;
}) {
  const context = await requireSession();
  if (!(await tradeInsAllowed(context))) notFound();
  const { tradeInId } = await params;
  const { moneda } = await searchParams;
  const back = { href: `/usados/${tradeInId}`, label: "Volver al usado" };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={PAYMENT_TITLE}
        message={PAYMENT_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const found = await getTradeInPaymentForm(context, tradeInId);
  if (!found.ok) {
    return (
      <PageNotice
        title={PAYMENT_TITLE}
        message={
          found.code === "FORBIDDEN"
            ? PAYMENT_ADMIN_ONLY_MESSAGE
            : TRADE_IN_NOT_FOUND_MESSAGE
        }
        back={{ href: "/usados", label: "Volver a los usados" }}
      />
    );
  }
  const { form } = found;
  const { tradeIn } = form;
  const money = (value: string) => formatMoney(value, tradeIn.currency);
  const blocked = tradeIn.voided
    ? PAYMENT_TRADE_IN_VOIDED_MESSAGE
    : tradeIn.destination !== "purchase"
      ? PAYMENT_NOT_PURCHASE_MESSAGE
      : form.outstanding === "0.00"
        ? PAYMENT_PAID_MESSAGE
        : form.paymentMethods.length === 0
          ? PAYMENT_NO_METHODS_MESSAGE
          : null;
  const exchange = receiptExchange({
    offer: form.exchange,
    targetCurrency: tradeIn.currency,
    outstanding: form.outstanding,
    outstandingInput: form.outstandingInput,
    chosen: typeof moneda === "string" ? moneda.toUpperCase() : undefined,
    basePath: `/usados/${tradeIn.id}/pago`,
    timezone: await getOrganizationTimezone(context),
    movement: "payment",
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Pagar el usado ${tradeIn.displayNumber}`}
          subtitle={
            tradeIn.voided
              ? "La recepción está anulada."
              : `Falta pagar ${money(form.outstanding)}.`
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        <dl className="mb-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Valor reconocido</dt>
            <dd className="tabular-nums">{money(tradeIn.value)}</dd>
          </div>
          <div>
            <dt className="text-muted">Pagado</dt>
            <dd className="tabular-nums">{money(form.paid)}</dd>
          </div>
        </dl>
        {blocked ? (
          <p>
            {blocked}{" "}
            {form.paymentMethods.length === 0 &&
            !tradeIn.voided &&
            tradeIn.destination === "purchase" ? (
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
          <TradeInPaymentForm
            tradeInId={tradeIn.id}
            currency={tradeIn.currency}
            cancelHref={back.href}
            defaultAmount={form.outstandingInput}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
            exchange={exchange}
          />
        )}
      </div>
    </main>
  );
}
