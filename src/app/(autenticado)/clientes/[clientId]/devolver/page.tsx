import type { Metadata } from "next";
import Link from "next/link";
import { getClientRefundForm } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import { NO_ACTIVE_METHODS_MESSAGE } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import { createAccountRefundAction } from "@/app/(autenticado)/devoluciones/actions";
import {
  CLIENT_NOT_FOUND_MESSAGE,
  NOTHING_IN_FAVOR_MESSAGE,
  REFUND_ADMIN_ONLY_MESSAGE,
} from "@/app/(autenticado)/devoluciones/messages";
import { RefundForm } from "@/app/(autenticado)/devoluciones/refund-form";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";

export const metadata: Metadata = {
  title: "Devolver saldo a favor — AI WhatsApp Agent CRM",
};

const TITLE = "Devolver saldo a favor";

// Pantalla 35: la devolución desde la cuenta de un cliente (brief-21.5, D-9; ADR 0022, punto 7),
// solo admin. Muestra solo lo que está a favor por moneda, que es lo único que se devuelve (H-2):
// el estado de cuenta es de la 21.6 (H-10). Se llega desde la venta anulada y el pedido cancelado,
// donde se ve que algo pasó a la cuenta. Desde la 21.6 (brief-21.6, D-7), también desde la ficha, y
// enlaza el estado de cuenta. Desde la 29.4.3, lo que está a favor en la moneda principal se devuelve
// también en la otra (brief-29.4.3, D-7), con ?moneda= como el cobro.
export default async function ClientRefundPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ moneda?: string | string[] }>;
}) {
  const context = await requireSession();
  const { clientId } = await params;
  const { moneda } = await searchParams;
  const back = { href: `/clientes/${clientId}`, label: "Volver al cliente" };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={REFUND_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const form = await getClientRefundForm(context, clientId);
  if (!form.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          form.code === "FORBIDDEN"
            ? REFUND_ADMIN_ONLY_MESSAGE
            : CLIENT_NOT_FOUND_MESSAGE
        }
        back={{ href: "/clientes", label: "Volver a clientes" }}
      />
    );
  }
  const name = form.client.displayName ?? "Cliente sin nombre";
  const inFavorMain = form.exchange
    ? form.inFavor.find((row) => row.currency === form.exchange!.mainCurrency)
    : undefined;
  const exchange = inFavorMain
    ? receiptExchange({
        offer: form.exchange,
        targetCurrency: inFavorMain.currency,
        outstanding: inFavorMain.amount,
        outstandingInput: inFavorMain.amountInput,
        chosen: typeof moneda === "string" ? moneda.toUpperCase() : undefined,
        basePath: `/clientes/${form.client.id}/devolver`,
        timezone: await getOrganizationTimezone(context),
        movement: "refund",
        outstandingLabel: "A favor",
      })
    : null;
  const blocked =
    form.inFavor.length === 0
      ? NOTHING_IN_FAVOR_MESSAGE
      : form.paymentMethods.length === 0
        ? NO_ACTIVE_METHODS_MESSAGE
        : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Devolver saldo a favor de ${name}`}
          subtitle={
            form.inFavor.length === 0
              ? "No tiene saldo a favor."
              : `A favor: ${form.inFavor
                  .map((row) => formatMoney(row.amount, row.currency))
                  .join(" y ")}.`
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        <p className="mb-4 text-sm text-muted">
          Lo que está a favor es lo cobrado que no se imputa a ninguna venta con
          saldo: lo de ventas anuladas, señas de pedidos cancelados y
          excedentes. Lo que cubre una venta con saldo no se devuelve.{" "}
          <Link href={`/clientes/${clientId}/cuenta`} className={linkClass}>
            Ver estado de cuenta
          </Link>
        </p>
        {blocked ? (
          <p>
            {blocked}{" "}
            {form.inFavor.length > 0 ? (
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
            action={createAccountRefundAction}
            target={{ field: "clientId", id: form.client.id }}
            cancelHref={back.href}
            available={form.inFavor}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
            exchange={exchange}
          />
        )}
      </div>
    </main>
  );
}
