import type { Metadata } from "next";
import Link from "next/link";
import { getSaleRefundForm } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatDate } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { NO_ACTIVE_METHODS_MESSAGE } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import { VOID_REASON_LABEL } from "@/app/(autenticado)/ventas/messages";
import { createSaleRefundAction } from "@/app/(autenticado)/devoluciones/actions";
import {
  NOTHING_TO_REFUND_MESSAGE,
  REFUND_ADMIN_ONLY_MESSAGE,
  SALE_NOT_FOUND_MESSAGE,
  SALE_NOT_REFUNDABLE_MESSAGE,
} from "@/app/(autenticado)/devoluciones/messages";
import {
  RefundForm,
  RefundPreviewNotice,
} from "@/app/(autenticado)/devoluciones/refund-form";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";

export const metadata: Metadata = {
  title: "Devolver — AI WhatsApp Agent CRM",
};

const TITLE = "Registrar devolución";
const NO_CLIENT_NOTE =
  "Sin cliente: la devolución se registra sobre la venta anulada.";

// Pantalla 35: la devolución de una venta sin cliente anulada (brief-21.5, D-9; ADR 0022, punto 6),
// solo admin: lo cobrado queda a devolver sobre la venta, y solo una devolución lo salda. Con
// cliente o vigente, no se devuelve desde acá. Desde la 29.4.3, una venta en la moneda principal se
// devuelve también en la otra (brief-29.4.3, D-7), con ?moneda= como el cobro.
//
// Desde la 24.7.2-b tiene la forma de la lámina 07 del lote V2-10: el aviso de previsión, las dos
// tarjetas de contexto —la venta y su anulación— y el formulario con su revisión de importes.
// **Ninguna de las dos tarjetas cuesta una consulta nueva** (H-5, verificado contra `HEAD`): la
// anulación venía del `LEFT JOIN` que `getSaleForReceipt` ya hacía, y lo único que se agregó al
// `select` fue su motivo. La otra entrada del mismo formulario es `/clientes/[id]/devolver`, y
// **las dos tienen esta forma** (AC-6): es una pantalla con dos caminos, no dos pantallas.
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
  const timeZone = await getOrganizationTimezone(context);
  const exchange = receiptExchange({
    offer: form.exchange,
    targetCurrency: sale.currency,
    outstanding: form.toRefund.amount,
    outstandingInput: form.toRefund.amountInput,
    chosen: typeof moneda === "string" ? moneda.toUpperCase() : undefined,
    basePath: `/ventas/${sale.id}/devolver`,
    timezone: timeZone,
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
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={TITLE}
          subtitle={
            form.refundable
              ? `Queda a devolver ${formatMoney(form.toRefund.amount, sale.currency)} de ${sale.displayNumber}.`
              : "Esta venta no tiene nada a devolver desde acá."
          }
        />
      </div>

      {blocked ? null : (
        <div className="mt-6">
          <RefundPreviewNotice />
        </div>
      )}

      {/* Las dos tarjetas de contexto de la lámina: qué venta es y por qué está anulada. Quien
          devuelve plata tiene que ver las dos cosas **antes** de escribir el importe. */}
      <section
        aria-label="La venta y su anulación"
        className={`mt-4 ${cardClass} grid gap-5 p-5 md:grid-cols-3`}
      >
        <div className="flex min-w-0 gap-3">
          <Icon name="fileText" className="mt-0.5 size-5 shrink-0 text-muted" />
          <div className="min-w-0">
            <p className="text-sm text-muted">Venta</p>
            <p className="flex flex-wrap items-center gap-2">
              <Link
                href={`/ventas/${sale.id}`}
                className={`${linkClass} font-mono`}
              >
                {sale.displayNumber}
              </Link>
              {sale.voidRef ? (
                <StatusBadge tone="neutral" icon="circleX">
                  Anulada
                </StatusBadge>
              ) : null}
            </p>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted">Fecha de emisión:</dt>
                <dd>{formatDate(sale.issuedAt, timeZone)}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted">Importe cobrado:</dt>
                <dd className="tabular-nums">
                  {formatMoney(sale.collected, sale.currency)}
                </dd>
              </div>
              {sale.collectedMethods.length > 0 ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted">Medio de cobro:</dt>
                  <dd>{sale.collectedMethods.join(" y ")}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>

        {sale.voidRef ? (
          <div className="flex min-w-0 gap-3 md:border-l md:border-border md:pl-5">
            <Icon
              name="fileText"
              className="mt-0.5 size-5 shrink-0 text-muted"
            />
            <div className="min-w-0">
              <p className="text-sm text-muted">Anulación</p>
              <p>
                <Link
                  href={`/ventas/${sale.id}/anulacion`}
                  className={`${linkClass} font-mono`}
                >
                  {sale.voidRef.displayNumber}
                </Link>
              </p>
              <dl className="mt-2 flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted">Fecha:</dt>
                  <dd>{formatDate(sale.voidRef.createdAt, timeZone)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted">Motivo:</dt>
                  <dd>{VOID_REASON_LABEL[sale.voidRef.reason]}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        <p className="flex min-w-0 items-start gap-2 text-sm text-muted md:border-l md:border-border md:pl-5">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          <span>{NO_CLIENT_NOTE}</span>
        </p>
      </section>

      {blocked ? (
        <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
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
        </div>
      ) : (
        <div className="mt-6">
          <RefundForm
            action={createSaleRefundAction}
            target={{ field: "saleId", id: sale.id }}
            cancelHref={back.href}
            available={[form.toRefund]}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
            exchange={exchange}
            reviewLabels={{
              current: "A devolver actual",
              remaining: "Quedará por devolver",
            }}
          />
        </div>
      )}
    </main>
  );
}
