import type { Metadata } from "next";
import Link from "next/link";
import { getClientRefundForm } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import {
  cardClass,
  linkClass,
  primaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import { NO_ACTIVE_METHODS_MESSAGE } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import { createAccountRefundAction } from "@/app/(autenticado)/devoluciones/actions";
import {
  ACCOUNT_KEEPS_CURRENCY_NOTE,
  CLIENT_NOT_FOUND_MESSAGE,
  NOTHING_IN_FAVOR_DETAIL,
  NOTHING_IN_FAVOR_TITLE,
  REFUND_ADMIN_ONLY_MESSAGE,
} from "@/app/(autenticado)/devoluciones/messages";
import {
  RefundForm,
  RefundPreviewNotice,
} from "@/app/(autenticado)/devoluciones/refund-form";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";

export const metadata: Metadata = {
  title: "Devolver saldo a favor — AI WhatsApp Agent CRM",
};

const TITLE = "Registrar devolución";

// Pantalla 35: la devolución desde la cuenta de un cliente (brief-21.5, D-9; ADR 0022, punto 7),
// solo admin. Muestra solo lo que está a favor por moneda, que es lo único que se devuelve (H-2):
// el estado de cuenta es de la 21.6 (H-10). Se llega desde la venta anulada y el pedido cancelado,
// donde se ve que algo pasó a la cuenta. Desde la 21.6 (brief-21.6, D-7), también desde la ficha, y
// enlaza el estado de cuenta. Desde la 29.4.3, lo que está a favor en la moneda principal se devuelve
// también en la otra (brief-29.4.3, D-7), con ?moneda= como el cobro.
//
// **Es la otra entrada del mismo formulario** que `/ventas/[id]/devolver` (`Screens.md` §35), y desde
// la 24.7.2-b las dos tienen la forma de la lámina 07 (AC-6): el aviso de previsión, «Datos de la
// devolución» y «Revisión de importes». Lo que cambia es el contexto de arriba, porque es distinto:
// allá la venta anulada y su anulación, acá el cliente y lo que tiene a favor. **Rediseñar una sola
// de las dos entradas es el defecto bloqueante que la 24.7.2 cometió con su lámina 02.**
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
  // Sin saldo a favor no hay formulario que mostrar, y tampoco un rechazo: no es un error, es que
  // no hay nada que devolver. Tiene su propia tarjeta (lámina 09), separada del caso «no hay medios
  // de pago activos», que sí es algo para resolver.
  const nothingInFavor = form.inFavor.length === 0;
  const blocked =
    !nothingInFavor && form.paymentMethods.length === 0
      ? NO_ACTIVE_METHODS_MESSAGE
      : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={TITLE}
          // Sin saldo a favor **no se dice dos veces**: lo explica la tarjeta de abajo, con su
          // motivo. Repetirlo acá es el defecto que la 24.6.2-e corrigió en el listado de ventas,
          // donde una venta anulada decía «Anulada» en dos lugares.
          subtitle={
            form.inFavor.length === 0
              ? `Acá se devuelve lo que quedó a favor en la cuenta de ${name}.`
              : `${name} tiene a favor ${form.inFavor
                  .map((row) => formatMoney(row.amount, row.currency))
                  .join(" y ")}.`
          }
        />
      </div>
      {nothingInFavor ? (
        <section
          aria-labelledby="sin-saldo-titulo"
          className={`mt-6 ${cardClass} p-5 sm:p-6`}
        >
          <p className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon name="info" className="size-5" />
            </span>
            <span id="sin-saldo-titulo" className="text-base font-semibold">
              {NOTHING_IN_FAVOR_TITLE}
            </span>
          </p>
          <p className="mt-3 text-sm">{NOTHING_IN_FAVOR_DETAIL}</p>
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
            <Icon name="fileText" className="mt-0.5 size-4 shrink-0" />
            <span>
              {ACCOUNT_KEEPS_CURRENCY_NOTE} Consultá el estado actualizado.
            </span>
          </p>
          <p className="mt-4">
            <Link
              href={`/clientes/${clientId}/cuenta`}
              className={primaryLinkClass}
            >
              Ver cuenta
            </Link>
          </p>
        </section>
      ) : (
        <>
          {blocked ? null : (
            <div className="mt-6">
              <RefundPreviewNotice />
            </div>
          )}
          {/* La tarjeta de contexto, hermana de las dos de la lámina 07: allá son la venta y su
              anulación, acá es de dónde sale lo que está a favor. */}
          <section
            aria-label="De dónde sale lo que está a favor"
            className={`mt-4 ${cardClass} flex gap-3 p-5`}
          >
            <Icon
              name="fileText"
              className="mt-0.5 size-5 shrink-0 text-muted"
            />
            <p className="min-w-0 text-sm text-muted">
              Lo que está a favor es lo cobrado que no se imputa a ninguna venta
              con saldo: lo de ventas anuladas, señas de pedidos cancelados y
              excedentes. Lo que cubre una venta con saldo no se devuelve.{" "}
              <Link href={`/clientes/${clientId}/cuenta`} className={linkClass}>
                Ver estado de cuenta
              </Link>
            </p>
          </section>
          {blocked ? (
            <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
              <p>
                {blocked}{" "}
                <Link href="/caja/medios-de-pago" className={linkClass}>
                  Ir a los medios de pago
                </Link>
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <RefundForm
                action={createAccountRefundAction}
                target={{ field: "clientId", id: form.client.id }}
                cancelHref={back.href}
                available={form.inFavor}
                paymentMethods={form.paymentMethods}
                hasOpenSession={form.openSession !== null}
                exchange={exchange}
                reviewLabels={{
                  current: "A favor actual",
                  remaining: "Quedará a favor",
                }}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
