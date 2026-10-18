import type { Metadata } from "next";
import Link from "next/link";
import { getSupplierPayment } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { formatCuit, getSupplier } from "@/modules/purchasing";
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
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { PrintButton } from "../../ordenes/[orderId]/print-button";
import {
  NOT_AN_INVOICE_LEGEND,
  UNKNOWN_SUPPLIER_TEXT,
} from "../../ordenes/messages";
import {
  ACCOUNT_TARGET_TEXT,
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_NOT_FOUND_MESSAGE,
  PAYMENT_VOID_REASON_LABEL,
  paymentNoticeMessage,
  VOIDED_BADGE_TEXT,
  voidCashNote,
} from "../messages";
import { VoidSupplierPaymentConfirm } from "./void-confirm";

export const metadata: Metadata = {
  title: "Pago a proveedor — AI WhatsApp Agent CRM",
};

const TITLE = "Pago a proveedor";

type SearchParams = Record<string, string | string[] | undefined>;

// Pantalla 53 (brief-22.6, D-13; ADR 0023, punto 13): el comprobante del pago a un proveedor, que es
// también su página imprimible: la organización, el número, la fecha y el autor, el proveedor con sus
// datos de hoy, el destino, el medio, la sesión de caja si fue en efectivo, el monto y la leyenda. Al
// imprimir queda solo el comprobante. Uno vigente se anula en el paso ?confirmar=anular, que dice qué
// pasa con la caja. Solo admin: el proveedor y el monto son de compras (punto 12).
export default async function SupplierPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { paymentId } = await params;
  const query = await searchParams;
  const found = await getSupplierPayment(context, paymentId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={PAYMENT_ADMIN_ONLY_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={PAYMENT_NOT_FOUND_MESSAGE}
        back={{ href: "/compras/pagos", label: "Volver a pagos" }}
      />
    );
  }
  const payment = found.payment;
  const href = `/compras/pagos/${payment.id}`;
  const [timeZone, frame, supplier] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    getSupplier(context, payment.supplierId),
  ]);
  const notice = paymentNoticeMessage(query.aviso);
  const voided = payment.voided;
  const confirming = voided === null && query.confirmar === "anular";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href="/compras/pagos" label="Volver a pagos" />
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
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="pago-titulo" className="text-lg font-semibold">
              Pago a proveedor{" "}
              <span className="font-mono">{payment.displayNumber}</span>
            </h2>
            {voided ? (
              <p className="font-semibold uppercase">
                {VOIDED_BADGE_TEXT} por{" "}
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
            <dt className="text-muted">Proveedor</dt>
            <dd className="font-semibold">
              {supplier.ok ? (
                <Link
                  href={`/compras/proveedores/${supplier.supplier.id}`}
                  className={`${linkClass} print:no-underline`}
                >
                  {supplier.supplier.name}
                </Link>
              ) : (
                UNKNOWN_SUPPLIER_TEXT
              )}
            </dd>
          </div>
          {supplier.ok && supplier.supplier.cuit ? (
            <div>
              <dt className="text-muted">CUIT</dt>
              <dd>{formatCuit(supplier.supplier.cuit)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">Destino</dt>
            <dd>
              {payment.goodsReceipt ? (
                <>
                  Recepción{" "}
                  <Link
                    href={`/compras/recepciones/${payment.goodsReceipt.id}`}
                    className={`${linkClass} font-mono print:no-underline`}
                  >
                    {payment.goodsReceipt.displayNumber}
                  </Link>
                </>
              ) : (
                ACCOUNT_TARGET_TEXT
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
        </dl>

        <p className="mt-6 text-center text-sm font-semibold uppercase">
          {NOT_AN_INVOICE_LEGEND}
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
          ) : confirming ? (
            <VoidSupplierPaymentConfirm
              paymentId={payment.id}
              displayNumber={payment.displayNumber}
              cashNote={voidCashNote(payment.session)}
            />
          ) : (
            <>
              <p className="text-sm text-muted">Este pago está vigente.</p>
              <div className="mt-4">
                <Link
                  href={`${href}?confirmar=anular`}
                  className={dangerOutlineLinkClass}
                >
                  <Icon name="close" className="size-4" />
                  Anular el pago
                </Link>
              </div>
            </>
          )}
        </SectionCard>
      </div>

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
