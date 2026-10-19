import type { Metadata } from "next";
import Link from "next/link";
import { getRefund } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  dangerOutlineLinkClass,
  linkClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { PageNotice } from "@/app/_components/page-notice";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";
import { PrintButton } from "@/app/(autenticado)/cobros/[receiptId]/print-button";
import {
  CONSUMER_TEXT,
  FORBIDDEN_PAGE_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  REFUND_NOT_FOUND_MESSAGE,
  REFUND_NOTICE,
  REFUND_VOID_NOTICE,
  REFUND_VOID_REASON_LABEL,
  UNKNOWN_CLIENT_TEXT,
  voidReasonText,
} from "../messages";

export const metadata: Metadata = {
  title: "Devolución — AI WhatsApp Agent CRM",
};

const TITLE = "Devolución";

// Pantalla 33 (brief-21.5, D-9; ADR 0022, punto 11): el comprobante de una devolución, imprimible como
// el recibo. Lleva la organización, el número y la fecha, el cliente o «Consumidor final», el destino
// (la cuenta del cliente o la venta), el medio, el monto y la leyenda. Para los dos roles; el
// contacto del cliente no va en el comprobante. Si está anulada, el sello con su anulación; un admin
// la anula desde acá.
export default async function RefundPage({
  params,
  searchParams,
}: {
  params: Promise<{ refundId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const { refundId } = await params;
  const query = await searchParams;
  const found = await getRefund(context, refundId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          found.code === "FORBIDDEN"
            ? FORBIDDEN_PAGE_MESSAGE
            : REFUND_NOT_FOUND_MESSAGE
        }
        back={{
          href: "/caja/devoluciones",
          label: "Volver a las devoluciones",
        }}
      />
    );
  }
  const refund = found.refund;
  const [timeZone, frame] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
  ]);
  const clientName =
    refund.clientId === null
      ? CONSUMER_TEXT
      : (refund.client?.displayName ?? UNKNOWN_CLIENT_TEXT);
  const back = refund.sale
    ? { href: `/ventas/${refund.sale.id}`, label: "Volver a la venta" }
    : { href: "/caja/devoluciones", label: "Volver a las devoluciones" };
  const notice = query.anulada
    ? refund.voided
      ? REFUND_VOID_NOTICE
      : null
    : query.registrada
      ? REFUND_NOTICE
      : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href={back.href} label={back.label} />
        <DetailHeader
          title={`Devolución ${refund.displayNumber}`}
          leading={<HeaderIcon name="undo" />}
          subtitle={
            <p>
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(refund.amount, refund.currency)}
              </span>{" "}
              en {refund.paymentMethodName}
            </p>
          }
          actions={
            <>
              {context.role === "admin" && !refund.voided ? (
                <Link
                  href={`/devoluciones/${refund.id}/anular`}
                  className={dangerOutlineLinkClass}
                >
                  Anular devolución
                </Link>
              ) : null}
              <PrintButton />
            </>
          }
        />
        <div role="status" className="mt-4 empty:hidden">
          {notice ? <ActionNotice>{notice}</ActionNotice> : null}
        </div>
        {refund.voided ? (
          <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            Anulada por{" "}
            <span className="font-mono">{refund.voided.displayNumber}</span> el{" "}
            {formatShortDateTime(refund.voided.createdAt, timeZone)}:{" "}
            {voidReasonText(REFUND_VOID_REASON_LABEL, refund.voided.reason)}.
            Anuló {refund.voidedByName ?? "un usuario no disponible"}. Lo
            devuelto vuelve a estar a favor o a devolver.
            {/* Lo que salió en la otra moneda (brief-29.4.3, D-7; revisión R1-8). */}
            {refund.tender ? (
              <>
                {" "}
                Salieron{" "}
                {formatMoney(refund.tender.amount, refund.tender.currency)}, que
                vuelven a la caja si fue en efectivo.
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <article
        data-comprobante
        aria-labelledby="devolucion-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="devolucion-titulo" className="text-lg font-semibold">
              Devolución{" "}
              <span className="font-mono">{refund.displayNumber}</span>
            </h2>
            <p className="text-sm">
              {formatFullDateTime(refund.createdAt, timeZone)}
            </p>
            {refund.voided ? (
              <p className="text-sm font-semibold uppercase">
                Anulada por {refund.voided.displayNumber}
              </p>
            ) : null}
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Devolvimos a</dt>
            <dd className="font-semibold">{clientName}</dd>
          </div>
          <div>
            <dt className="text-muted">Desde</dt>
            <dd>
              {refund.sale ? (
                <>
                  La venta{" "}
                  <Link
                    href={`/ventas/${refund.sale.id}`}
                    className={`${linkClass} font-mono print:no-underline`}
                  >
                    {refund.sale.displayNumber}
                  </Link>
                </>
              ) : (
                "El saldo a favor de su cuenta"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Medio de pago</dt>
            <dd>{refund.paymentMethodName}</dd>
          </div>
          <div>
            <dt className="text-muted">Monto</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatMoney(refund.amount, refund.currency)}
            </dd>
          </div>
          {refund.tender ? (
            <div>
              <dt className="text-muted">Lo que salió</dt>
              <dd className="tabular-nums">
                {tenderNote(refund.tender, true)}
              </dd>
            </div>
          ) : null}
          {refund.session ? (
            <div className="print:hidden">
              <dt className="text-muted">Sesión de caja</dt>
              <dd className="font-mono">
                <Link
                  href={`/caja/sesiones/${refund.session.id}`}
                  className={linkClass}
                >
                  {refund.session.displayNumber}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-6 text-center text-sm font-semibold uppercase">
          {NOT_AN_INVOICE_LEGEND}
        </p>
      </article>

      <p className="mt-6 text-sm text-muted print:hidden">
        Registró {refund.createdByName ?? "un usuario no disponible"}. Fechas en{" "}
        {timeZone}.
      </p>
    </main>
  );
}
