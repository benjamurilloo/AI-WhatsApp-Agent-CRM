import type { Metadata } from "next";
import Link from "next/link";
import { getReceipt } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import {
  FORBIDDEN_PAGE_MESSAGE,
  RECEIPT_NOT_FOUND_MESSAGE,
  RECEIPT_VOID_ADMIN_ONLY_MESSAGE,
  RECEIPT_VOID_REASON_LABEL,
} from "@/app/(autenticado)/devoluciones/messages";
import { voidReceiptAction } from "./actions";
import { VoidForm } from "./void-form";

export const metadata: Metadata = {
  title: "Anular cobro — AI WhatsApp Agent CRM",
};

const TITLE = "Anular cobro";

const REASONS = Object.entries(RECEIPT_VOID_REASON_LABEL);

// Pantalla 32: la anulación de un cobro (brief-21.5, D-9; ADR 0022, punto 7), solo admin: el motivo
// de la lista y la confirmación, con lo que pasa con la caja. Corrige un cobro mal registrado;
// después se registra el correcto. Un cobro ya anulado no ofrece el formulario.
export default async function VoidReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const context = await requireSession();
  const { receiptId } = await params;
  const back = { href: `/cobros/${receiptId}`, label: "Volver al recibo" };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={RECEIPT_VOID_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const found = await getReceipt(context, receiptId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          found.code === "FORBIDDEN"
            ? FORBIDDEN_PAGE_MESSAGE
            : RECEIPT_NOT_FOUND_MESSAGE
        }
        back={{ href: "/caja/cobros", label: "Volver a los cobros" }}
      />
    );
  }
  const receipt = found.receipt;
  const amount = formatMoney(receipt.amount, receipt.currency);
  const destination = receipt.sale
    ? `de la venta ${receipt.sale.displayNumber}`
    : receipt.order
      ? `de la seña del pedido ${receipt.order.displayNumber}`
      : "";
  // Qué pasa con la caja (ADR 0022, punto 7): sale de lo esperado de la sesión abierta, o el arqueo
  // guardado no cambia.
  const cash = !receipt.isCash
    ? "No es efectivo: no mueve la caja."
    : receipt.sessionOpen
      ? `Es efectivo de la sesión ${receipt.session?.displayNumber ?? ""}, que sigue abierta: sale de lo esperado.`
      : `Es efectivo de la sesión ${receipt.session?.displayNumber ?? ""}, que ya se cerró: su arqueo no cambia y va a mostrar esta anulación como explicación de su diferencia. La caja abierta no se toca.`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Anular el recibo ${receipt.displayNumber}`}
          subtitle={`${amount} en ${receipt.paymentMethodName} ${destination}.`}
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {receipt.voided ? (
          <p>
            Este cobro ya está anulado por{" "}
            <span className="font-mono">{receipt.voided.displayNumber}</span>.{" "}
            <Link href={back.href} className={linkClass}>
              {back.label}
            </Link>
          </p>
        ) : (
          <VoidForm
            action={voidReceiptAction}
            field="receiptId"
            id={receipt.id}
            question={`¿Anular el recibo ${receipt.displayNumber} por ${amount}?`}
            explanation={`La anulación es otro comprobante, con su propio número, y anula el cobro entero: deja de contar en lo que falta cobrar. ${cash} Una anulación no se deshace; después podés registrar el cobro correcto.`}
            reasons={REASONS}
            cancelHref={back.href}
            submitLabel="Sí, anular el cobro"
          />
        )}
      </div>
    </main>
  );
}
