import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTradeInPayment } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getTradeIn, tradeInsAllowed } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatFullDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";
import { PrintButton } from "../../../../compras/ordenes/[orderId]/print-button";
import {
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_NOT_FOUND_MESSAGE,
  PAYMENT_VOID_REASON_LABEL,
  TRADE_IN_LEGEND,
  UNKNOWN_CLIENT_TEXT,
} from "../../../messages";

export const metadata: Metadata = {
  title: "Anulación del pago de un usado — AI WhatsApp Agent CRM",
};

const TITLE = "Anulación del pago de un usado";

// El comprobante de la anulación del pago de un usado, APPU (brief-29.7.2, D-6), imprimible, como el de
// la anulación de un pago a un proveedor: el pago que anula, el cliente leído de su ficha, el medio, el
// motivo, qué pasó con la caja y el monto. Solo admin y con la capacidad trade_ins.
export default async function TradeInPaymentVoidPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const context = await requireSession();
  if (!(await tradeInsAllowed(context))) notFound();
  const { paymentId } = await params;
  const found = await getTradeInPayment(context, paymentId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          found.code === "FORBIDDEN"
            ? PAYMENT_ADMIN_ONLY_MESSAGE
            : PAYMENT_NOT_FOUND_MESSAGE
        }
        back={{ href: "/usados", label: "Volver a los usados" }}
      />
    );
  }
  const payment = found.payment;
  const paymentHref = `/usados/pagos/${payment.id}`;
  const voided = payment.voided;
  if (!voided) {
    return (
      <PageNotice
        title={TITLE}
        message="Este pago no está anulado."
        back={{ href: paymentHref, label: "Volver al pago" }}
      />
    );
  }
  const [timeZone, frame, tradeIn] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    payment.tradeIn
      ? getTradeIn(context, payment.tradeIn.id)
      : Promise.resolve(null),
  ]);
  const client = tradeIn?.ok ? tradeIn.tradeIn.client : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink
          href={paymentHref}
          label={`Volver al pago ${payment.displayNumber}`}
        />
        <DetailHeader
          title={`Anulación ${voided.displayNumber}`}
          leading={<HeaderIcon name="receipt" />}
          subtitle={<p>Del pago {payment.displayNumber}</p>}
          actions={<PrintButton />}
        />
      </div>

      <article
        data-comprobante
        aria-labelledby="comprobante-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{TRADE_IN_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="comprobante-titulo" className="text-lg font-semibold">
              Anulación del pago de un usado{" "}
              <span className="font-mono">{voided.displayNumber}</span>
            </h2>
            <p className="text-sm">
              {formatFullDateTime(voided.createdAt, timeZone)}
            </p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Anula el pago</dt>
            <dd>
              <Link
                href={paymentHref}
                className={`${linkClass} font-mono print:no-underline`}
              >
                {payment.displayNumber}
              </Link>{" "}
              del {formatFullDateTime(payment.createdAt, timeZone)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Cliente</dt>
            <dd className="font-semibold">
              {client?.displayName ?? UNKNOWN_CLIENT_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Usado</dt>
            <dd className="font-mono">
              {payment.tradeIn?.displayNumber ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Medio de pago</dt>
            <dd>{payment.paymentMethodName}</dd>
          </div>
          <div>
            <dt className="text-muted">Motivo</dt>
            <dd>{PAYMENT_VOID_REASON_LABEL[voided.reason]}</dd>
          </div>
          <div>
            <dt className="text-muted">Caja</dt>
            <dd>
              {payment.voidSession ? (
                <>
                  Volvió a la sesión{" "}
                  <span className="font-mono">
                    {payment.voidSession.displayNumber}
                  </span>
                </>
              ) : (
                "No cambió ninguna sesión"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Registró</dt>
            <dd>{payment.voidedByName ?? "Usuario no disponible"}</dd>
          </div>
          <div>
            <dt className="text-muted">Monto</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatMoney(payment.amount, payment.currency)}
            </dd>
          </div>
          {payment.tender ? (
            <div>
              <dt className="text-muted">Lo que salió</dt>
              <dd className="tabular-nums">
                {tenderNote(payment.tender, true)}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-6 text-center text-sm font-semibold uppercase">
          {TRADE_IN_LEGEND}
        </p>
      </article>

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
