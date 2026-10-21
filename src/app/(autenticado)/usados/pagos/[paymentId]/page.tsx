import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTradeInPayment } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getTradeIn, tradeInsAllowed } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";
import { voidCashNote } from "@/app/(autenticado)/compras/pagos/messages";
import { PrintButton } from "../../../compras/ordenes/[orderId]/print-button";
import { PhoneText } from "../../../clientes/phone-text";
import {
  noticeMessage,
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_NOT_FOUND_MESSAGE,
  PAYMENT_VOID_REASON_LABEL,
  TRADE_IN_LEGEND,
  UNKNOWN_CLIENT_TEXT,
} from "../../messages";
import { VoidTradeInPaymentForm } from "./void-form";

export const metadata: Metadata = {
  title: "Pago de un usado — AI WhatsApp Agent CRM",
};

const TITLE = "Pago de un usado";

type SearchParams = Record<string, string | string[] | undefined>;

// El comprobante del pago de un usado comprado (brief-29.7.2, D-6), que es también su página imprimible:
// la organización, el número, la fecha y el autor, el cliente leído de su ficha al imprimir (como el PU,
// U-5 de la 29.7), el usado, el medio, la sesión de caja si fue en efectivo, el monto, lo que salió en la
// otra moneda y la leyenda. Al imprimir queda solo el comprobante. Uno vigente se anula con un motivo de
// la lista. Solo admin y con la capacidad trade_ins.
export default async function TradeInPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await tradeInsAllowed(context))) notFound();
  const { paymentId } = await params;
  const query = await searchParams;
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
  const href = `/usados/pagos/${payment.id}`;
  const [timeZone, frame, tradeIn] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    payment.tradeIn
      ? getTradeIn(context, payment.tradeIn.id)
      : Promise.resolve(null),
  ]);
  const client = tradeIn?.ok ? tradeIn.tradeIn.client : null;
  const notice = noticeMessage(query.aviso);
  const voided = payment.voided;
  const back = payment.tradeIn
    ? { href: `/usados/${payment.tradeIn.id}`, label: "Volver al usado" }
    : { href: "/usados", label: "Volver a los usados" };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href={back.href} label={back.label} />
        <DetailHeader
          title={`Pago ${payment.displayNumber}`}
          leading={<HeaderIcon name="banknote" />}
          subtitle={
            <p>
              Monto:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(payment.amount, payment.currency)}
              </span>
            </p>
          }
          actions={<PrintButton />}
        />
        <div role="status" className="mt-4 empty:hidden">
          {notice ? <ActionNotice>{notice}</ActionNotice> : null}
        </div>
        {voided ? (
          <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            Anulado por{" "}
            <Link
              href={`${href}/anulacion`}
              className={`${linkClass} font-mono`}
            >
              {voided.displayNumber}
            </Link>{" "}
            el {formatShortDateTime(voided.createdAt, timeZone)}:{" "}
            {PAYMENT_VOID_REASON_LABEL[voided.reason]}.
          </p>
        ) : null}
      </div>

      <article
        data-comprobante
        aria-labelledby="pago-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{TRADE_IN_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="pago-titulo" className="text-lg font-semibold">
              Pago de un usado{" "}
              <span className="font-mono">{payment.displayNumber}</span>
            </h2>
            {voided ? (
              <p className="font-semibold uppercase">
                Anulado por{" "}
                <span className="font-mono">{voided.displayNumber}</span>
              </p>
            ) : null}
            <p className="text-sm">
              {formatFullDateTime(payment.createdAt, timeZone)}
            </p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Cliente</dt>
            <dd className="font-semibold">
              {client?.displayName ?? UNKNOWN_CLIENT_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Teléfono</dt>
            <dd>
              <PhoneText phone={client?.phone ?? null} emptyText="—" />
            </dd>
          </div>
          <div>
            <dt className="text-muted">DNI</dt>
            <dd className="tabular-nums">
              {client?.contact?.documentNumber ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Usado</dt>
            <dd>
              {payment.tradeIn ? (
                <Link
                  href={`/usados/${payment.tradeIn.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {payment.tradeIn.displayNumber}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Medio de pago</dt>
            <dd>{payment.paymentMethodName}</dd>
          </div>
          {payment.session ? (
            <div>
              <dt className="text-muted">Sesión de caja</dt>
              <dd>
                <Link
                  href={`/caja/sesiones/${payment.session.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {payment.session.displayNumber}
                </Link>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">Registró</dt>
            <dd>{payment.createdByName ?? "Usuario no disponible"}</dd>
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

      <div className="mt-6 print:hidden">
        <SectionCard id="anulacion-titulo" title="Anulación" icon="close">
          {voided ? (
            <>
              <p className="text-sm">
                Anulación{" "}
                <span className="font-mono">{voided.displayNumber}</span> ·{" "}
                {PAYMENT_VOID_REASON_LABEL[voided.reason]}
              </p>
              <p className="mt-4 text-sm">
                <Link href={`${href}/anulacion`} className={linkClass}>
                  Ver el comprobante de la anulación
                </Link>
              </p>
            </>
          ) : (
            <VoidTradeInPaymentForm
              paymentId={payment.id}
              cashNote={voidCashNote(payment.session)}
            />
          )}
        </SectionCard>
      </div>

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
