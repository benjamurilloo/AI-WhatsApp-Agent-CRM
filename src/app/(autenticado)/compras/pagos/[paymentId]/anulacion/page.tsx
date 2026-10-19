import type { Metadata } from "next";
import Link from "next/link";
import { getSupplierPayment } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getSupplier } from "@/modules/purchasing";
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
import { PrintButton } from "../../../ordenes/[orderId]/print-button";
import {
  NOT_AN_INVOICE_LEGEND,
  UNKNOWN_SUPPLIER_TEXT,
} from "../../../ordenes/messages";
import {
  ACCOUNT_TARGET_TEXT,
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_NOT_FOUND_MESSAGE,
  PAYMENT_VOID_NOT_FOUND_MESSAGE,
  PAYMENT_VOID_REASON_LABEL,
} from "../../messages";

export const metadata: Metadata = {
  title: "Anulación de pago — AI WhatsApp Agent CRM",
};

const TITLE = "Anulación de pago";

// Pantalla 54 (brief-22.6, D-13; ADR 0023, punto 13): el comprobante de la anulación de un pago,
// imprimible. Un pago tiene a lo sumo una anulación, así que la ruta cuelga de él. Lleva la
// organización, el número y la fecha de la anulación, el pago que anula con su destino y su proveedor,
// el monto, el motivo, la sesión en la que impactó si alguna, y la leyenda. Solo admin.
export default async function SupplierPaymentVoidPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const context = await requireSession();
  const { paymentId } = await params;
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
  const paymentHref = `/compras/pagos/${payment.id}`;
  const voided = payment.voided;
  if (!voided) {
    return (
      <PageNotice
        title={TITLE}
        message={PAYMENT_VOID_NOT_FOUND_MESSAGE}
        back={{ href: paymentHref, label: "Volver al pago" }}
      />
    );
  }
  const [timeZone, frame, supplier] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    getSupplier(context, payment.supplierId),
  ]);

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
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="comprobante-titulo" className="text-lg font-semibold">
              Anulación de pago{" "}
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
            <dt className="text-muted">Proveedor</dt>
            <dd className="font-semibold">
              {supplier.ok ? supplier.supplier.name : UNKNOWN_SUPPLIER_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Destino del pago</dt>
            <dd>
              {payment.goodsReceipt ? (
                <>
                  Recepción{" "}
                  <span className="font-mono">
                    {payment.goodsReceipt.displayNumber}
                  </span>
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
          {NOT_AN_INVOICE_LEGEND}
        </p>
      </article>

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
