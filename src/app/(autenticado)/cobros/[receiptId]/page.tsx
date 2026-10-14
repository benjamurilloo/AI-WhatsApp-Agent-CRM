import type { Metadata } from "next";
import Link from "next/link";
import { getReceipt } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
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
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Recibo — AI WhatsApp Agent CRM",
};

const TITLE = "Recibo";
const NOT_FOUND_MESSAGE = "Este recibo no existe.";
const FORBIDDEN_MESSAGE = "No tenés permiso para ver esta página.";
const CONSUMER_TEXT = "Consumidor final";
const UNKNOWN_CLIENT_TEXT = "Cliente no disponible";
// ADR 0022, punto 11, como en la venta.
const NOT_AN_INVOICE_LEGEND = "Documento no válido como factura";

// Pantalla 29 (brief-21.3, D-8; ADR 0022, punto 11): el recibo de un cobro, imprimible como la venta.
// Lleva la organización, el número y la fecha, el cliente o «Consumidor final», la venta, el medio,
// el monto y la leyenda. Está fuera de /ventas porque la 21.4 y la 21.6 suman otros destinos. Para
// los dos roles; el contacto del cliente no va en el recibo. Desde la 21.4, el destino de una seña es
// su pedido (brief-21.4, D-8).
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const context = await requireSession();
  const { receiptId } = await params;
  const found = await getReceipt(context, receiptId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          found.code === "FORBIDDEN" ? FORBIDDEN_MESSAGE : NOT_FOUND_MESSAGE
        }
        back={{ href: "/caja/cobros", label: "Volver a los cobros" }}
      />
    );
  }
  const receipt = found.receipt;
  const [timeZone, frame] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
  ]);
  const clientName =
    receipt.clientId === null
      ? CONSUMER_TEXT
      : (receipt.client?.displayName ?? UNKNOWN_CLIENT_TEXT);
  // El destino: la venta de un cobro o el pedido de una seña (brief-21.4, D-8).
  const back = receipt.sale
    ? { href: `/ventas/${receipt.sale.id}`, label: "Volver a la venta" }
    : receipt.order
      ? { href: `/pedidos/${receipt.order.id}`, label: "Volver al pedido" }
      : { href: "/caja/cobros", label: "Volver a los cobros" };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href={back.href} label={back.label} />
        <DetailHeader
          title={`Recibo ${receipt.displayNumber}`}
          leading={<HeaderIcon name="receipt" />}
          subtitle={
            <p>
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(receipt.amount, receipt.currency)}
              </span>{" "}
              en {receipt.paymentMethodName}
            </p>
          }
          actions={<PrintButton />}
        />
      </div>

      <article
        data-comprobante
        aria-labelledby="recibo-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="recibo-titulo" className="text-lg font-semibold">
              Recibo <span className="font-mono">{receipt.displayNumber}</span>
            </h2>
            <p className="text-sm">
              {formatFullDateTime(receipt.createdAt, timeZone)}
            </p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Recibimos de</dt>
            <dd className="font-semibold">{clientName}</dd>
          </div>
          <div>
            <dt className="text-muted">
              {receipt.order ? "Seña del pedido" : "Por la venta"}
            </dt>
            <dd className="font-mono">
              {receipt.sale ? (
                <Link
                  href={`/ventas/${receipt.sale.id}`}
                  className={`${linkClass} print:no-underline`}
                >
                  {receipt.sale.displayNumber}
                </Link>
              ) : receipt.order ? (
                <Link
                  href={`/pedidos/${receipt.order.id}`}
                  className={`${linkClass} print:no-underline`}
                >
                  {receipt.order.displayNumber}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Medio de pago</dt>
            <dd>{receipt.paymentMethodName}</dd>
          </div>
          <div>
            <dt className="text-muted">Monto</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatMoney(receipt.amount, receipt.currency)}
            </dd>
          </div>
          {receipt.session ? (
            <div className="print:hidden">
              <dt className="text-muted">Sesión de caja</dt>
              <dd className="font-mono">
                <Link
                  href={`/caja/sesiones/${receipt.session.id}`}
                  className={linkClass}
                >
                  {receipt.session.displayNumber}
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
        Registró {receipt.createdByName ?? "un usuario no disponible"}. Fechas
        en {timeZone}.
      </p>
    </main>
  );
}
