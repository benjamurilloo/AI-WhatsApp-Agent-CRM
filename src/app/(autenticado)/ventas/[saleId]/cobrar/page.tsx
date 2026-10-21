import type { Metadata } from "next";
import Link from "next/link";
import { getSaleReceiptForm } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { formatDate } from "@/app/_format/date-time";
import { requireSession } from "@/app/_auth/session";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import {
  NO_ACTIVE_METHODS_MESSAGE,
  RECEIPT_ADMIN_ONLY_MESSAGE,
  RECEIPT_COLLECTED_MESSAGE,
  RECEIPT_SALE_NOT_FOUND_MESSAGE,
  RECEIPT_SALE_VOIDED_MESSAGE,
} from "./messages";
import { createSaleReceiptAction } from "./actions";
import { ReceiptForm } from "./receipt-form";

export const metadata: Metadata = {
  title: "Registrar cobro — AI WhatsApp Agent CRM",
};

const TITLE = "Registrar cobro";

// Pantalla 28 (brief-21.3, D-8): el cobro de una venta, solo admin. El medio, de los activos, y el
// monto, propuesto en lo que falta. Una venta anulada o ya cobrada no ofrece el formulario. Al
// guardar vuelve al detalle de la venta con el aviso y el enlace al recibo. Desde la 29.4, con moneda
// principal, ?moneda= elige la moneda que entra (brief-29.4, D-6). Desde la 29.7.2, «Permuta» con cada
// usado del cliente que tiene algo disponible (brief-29.7.2, D-6).
// Un monto de la base («300.00») en centavos, para comparar sin redondeos.
function cents(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole! + fraction.padEnd(2, "0").slice(0, 2));
}

export default async function SaleReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{
    moneda?: string | string[];
    usado?: string | string[];
  }>;
}) {
  const context = await requireSession();
  const { saleId } = await params;
  const { moneda, usado } = await searchParams;
  const back = { href: `/ventas/${saleId}`, label: "Volver a la venta" };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={RECEIPT_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const form = await getSaleReceiptForm(context, saleId);
  if (!form.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          form.code === "FORBIDDEN"
            ? RECEIPT_ADMIN_ONLY_MESSAGE
            : RECEIPT_SALE_NOT_FOUND_MESSAGE
        }
        back={{ href: "/ventas", label: "Volver a ventas" }}
      />
    );
  }
  const { sale } = form;
  const timezone = await getOrganizationTimezone(context);
  // ?usado= elige un usado de la permuta y propone el menor entre lo que queda y lo que falta
  // (brief-29.7.2, D-6). La permuta va en la moneda de la venta.
  const chosenTradeIn =
    form.permuta?.tradeIns.find((tradeIn) => tradeIn.id === usado) ?? null;
  const chosenPermuta = chosenTradeIn
    ? {
        tradeInId: chosenTradeIn.id,
        amount:
          cents(chosenTradeIn.available) < cents(form.outstanding)
            ? chosenTradeIn.availableInput
            : form.outstandingInput,
      }
    : null;
  const permuta = form.permuta
    ? {
        ...form.permuta,
        tradeIns: form.permuta.tradeIns.map((tradeIn) => ({
          ...tradeIn,
          received: formatDate(tradeIn.createdAt, timezone),
        })),
      }
    : null;
  const exchange = receiptExchange({
    offer: form.exchange,
    targetCurrency: sale.currency,
    outstanding: form.outstanding,
    outstandingInput: form.outstandingInput,
    chosen: chosenPermuta
      ? sale.currency
      : typeof moneda === "string"
        ? moneda.toUpperCase()
        : undefined,
    basePath: `/ventas/${sale.id}/cobrar`,
    timezone,
  });
  const blocked = form.voided
    ? RECEIPT_SALE_VOIDED_MESSAGE
    : form.outstanding === "0.00"
      ? RECEIPT_COLLECTED_MESSAGE
      : form.paymentMethods.length === 0 && form.permuta === null
        ? NO_ACTIVE_METHODS_MESSAGE
        : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Registrar cobro de ${sale.displayNumber}`}
          subtitle={
            form.voided
              ? "La venta está anulada."
              : `Falta cobrar ${formatMoney(form.outstanding, sale.currency)}.`
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {blocked ? (
          <p>
            {blocked}{" "}
            {form.paymentMethods.length === 0 && !form.voided ? (
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
            // Elegir un usado vuelve a montar el formulario: sin esto, después de un rechazo quedaría
            // lo enviado y no lo propuesto.
            key={chosenPermuta?.tradeInId ?? "sin-usado"}
            action={createSaleReceiptAction}
            target={{ field: "saleId", id: sale.id }}
            cancelHref={back.href}
            submitLabel="Registrar cobro"
            currency={sale.currency}
            outstanding={form.outstandingInput}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
            exchange={exchange}
            permuta={permuta}
            chosenPermuta={chosenPermuta}
            permutaPath={`/ventas/${sale.id}/cobrar`}
          />
        )}
      </div>
    </main>
  );
}
