import type { Metadata } from "next";
import Link from "next/link";
import { getSaleRefundForm } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import { NO_ACTIVE_METHODS_MESSAGE } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import { createSaleRefundAction } from "@/app/(autenticado)/devoluciones/actions";
import {
  NOTHING_TO_REFUND_MESSAGE,
  REFUND_ADMIN_ONLY_MESSAGE,
  SALE_NOT_FOUND_MESSAGE,
  SALE_NOT_REFUNDABLE_MESSAGE,
} from "@/app/(autenticado)/devoluciones/messages";
import { RefundForm } from "@/app/(autenticado)/devoluciones/refund-form";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";

export const metadata: Metadata = {
  title: "Devolver — AI WhatsApp Agent CRM",
};

const TITLE = "Devolver";

// Pantalla 35: la devolución de una venta sin cliente anulada (brief-21.5, D-9; ADR 0022, punto 6),
// solo admin: lo cobrado queda a devolver sobre la venta, y solo una devolución lo salda. Con
// cliente o vigente, no se devuelve desde acá. Desde la 29.4.3, una venta en la moneda principal se
// devuelve también en la otra (brief-29.4.3, D-7), con ?moneda= como el cobro.
export default async function SaleRefundPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ moneda?: string | string[] }>;
}) {
  const context = await requireSession();
  const { saleId } = await params;
  const { moneda } = await searchParams;
  const back = { href: `/ventas/${saleId}`, label: "Volver a la venta" };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={REFUND_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const form = await getSaleRefundForm(context, saleId);
  if (!form.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          form.code === "FORBIDDEN"
            ? REFUND_ADMIN_ONLY_MESSAGE
            : SALE_NOT_FOUND_MESSAGE
        }
        back={{ href: "/ventas", label: "Volver a ventas" }}
      />
    );
  }
  const { sale } = form;
  const exchange = receiptExchange({
    offer: form.exchange,
    targetCurrency: sale.currency,
    outstanding: form.toRefund.amount,
    outstandingInput: form.toRefund.amountInput,
    chosen: typeof moneda === "string" ? moneda.toUpperCase() : undefined,
    basePath: `/ventas/${sale.id}/devolver`,
    timezone: await getOrganizationTimezone(context),
    movement: "refund",
    outstandingLabel: "A devolver",
  });
  const nothing = form.toRefund.amount === "0.00";
  const blocked = !form.refundable
    ? SALE_NOT_REFUNDABLE_MESSAGE
    : nothing
      ? NOTHING_TO_REFUND_MESSAGE
      : form.paymentMethods.length === 0
        ? NO_ACTIVE_METHODS_MESSAGE
        : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Devolver lo cobrado de ${sale.displayNumber}`}
          subtitle={
            form.refundable
              ? `Queda a devolver ${formatMoney(form.toRefund.amount, sale.currency)}.`
              : "Esta venta no tiene nada a devolver desde acá."
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {blocked ? (
          <p>
            {blocked}{" "}
            {form.refundable && !nothing ? (
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
          <RefundForm
            action={createSaleRefundAction}
            target={{ field: "saleId", id: sale.id }}
            cancelHref={back.href}
            available={[form.toRefund]}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
            exchange={exchange}
          />
        )}
      </div>
    </main>
  );
}
