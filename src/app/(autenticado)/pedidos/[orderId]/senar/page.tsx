import type { Metadata } from "next";
import Link from "next/link";
import { getOrderReceiptForm } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import { NO_ACTIVE_METHODS_MESSAGE } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import { ReceiptForm } from "@/app/(autenticado)/ventas/[saleId]/cobrar/receipt-form";
import { createOrderReceiptAction } from "./actions";
import {
  DEPOSIT_ADMIN_ONLY_MESSAGE,
  DEPOSIT_COMPLETE_MESSAGE,
  DEPOSIT_ORDER_NOT_FOUND_MESSAGE,
  orderNotOpenMessage,
} from "./messages";

export const metadata: Metadata = {
  title: "Registrar seña — AI WhatsApp Agent CRM",
};

const TITLE = "Registrar seña";

// La seña de un pedido (brief-21.4, D-8), solo admin: el mismo formulario del cobro de una venta,
// con el monto propuesto en lo que le falta al pedido. Un pedido entregado o cancelado, o ya
// cubierto por sus señas, no ofrece el formulario. Al guardar vuelve al pedido con el aviso.
export default async function OrderReceiptPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const context = await requireSession();
  const { orderId } = await params;
  const back = { href: `/pedidos/${orderId}`, label: "Volver al pedido" };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={DEPOSIT_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const form = await getOrderReceiptForm(context, orderId);
  if (!form.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          form.code === "FORBIDDEN"
            ? DEPOSIT_ADMIN_ONLY_MESSAGE
            : DEPOSIT_ORDER_NOT_FOUND_MESSAGE
        }
        back={{ href: "/pedidos", label: "Volver a pedidos" }}
      />
    );
  }
  const { order } = form;
  const open = order.status === "pending" || order.status === "confirmed";
  const blocked = !open
    ? orderNotOpenMessage(order.status)
    : form.outstanding === "0.00"
      ? DEPOSIT_COMPLETE_MESSAGE
      : form.paymentMethods.length === 0
        ? NO_ACTIVE_METHODS_MESSAGE
        : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Registrar seña de ${order.displayNumber}`}
          subtitle={
            open
              ? `Le falta ${formatMoney(form.outstanding, order.currency)}.`
              : "El pedido no admite señas."
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {blocked ? (
          <p>
            {blocked}{" "}
            {open && form.outstanding !== "0.00" ? (
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
          <ReceiptForm
            action={createOrderReceiptAction}
            target={{ field: "orderId", id: order.id }}
            cancelHref={back.href}
            submitLabel="Registrar seña"
            currency={order.currency}
            outstanding={form.outstandingInput}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
          />
        )}
      </div>
    </main>
  );
}
