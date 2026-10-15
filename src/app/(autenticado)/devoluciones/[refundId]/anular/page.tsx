import type { Metadata } from "next";
import Link from "next/link";
import { getRefund } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import { VoidForm } from "@/app/(autenticado)/cobros/[receiptId]/anular/void-form";
import { voidRefundAction } from "../../actions";
import {
  FORBIDDEN_PAGE_MESSAGE,
  REFUND_ADMIN_ONLY_MESSAGE,
  REFUND_NOT_FOUND_MESSAGE,
  REFUND_VOID_REASON_LABEL,
} from "../../messages";

export const metadata: Metadata = {
  title: "Anular devolución — AI WhatsApp Agent CRM",
};

const TITLE = "Anular devolución";

const REASONS = Object.entries(REFUND_VOID_REASON_LABEL);

// Pantalla 36: la anulación de una devolución (brief-21.5, D-9; ADR 0022, punto 7), solo admin, con
// el formulario de la anulación de un cobro: corrige una devolución mal registrada, y lo devuelto
// vuelve a estar a favor o a devolver.
export default async function VoidRefundPage({
  params,
}: {
  params: Promise<{ refundId: string }>;
}) {
  const context = await requireSession();
  const { refundId } = await params;
  const back = {
    href: `/devoluciones/${refundId}`,
    label: "Volver a la devolución",
  };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={REFUND_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
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
  const amount = formatMoney(refund.amount, refund.currency);
  const cash = !refund.isCash
    ? "No es efectivo: no mueve la caja."
    : refund.sessionOpen
      ? `Es efectivo de la sesión ${refund.session?.displayNumber ?? ""}, que sigue abierta: vuelve a lo esperado.`
      : `Es efectivo de la sesión ${refund.session?.displayNumber ?? ""}, que ya se cerró: su arqueo no cambia y va a mostrar esta anulación. La caja abierta no se toca.`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Anular la devolución ${refund.displayNumber}`}
          subtitle={`${amount} en ${refund.paymentMethodName}.`}
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {refund.voided ? (
          <p>
            Esta devolución ya está anulada por{" "}
            <span className="font-mono">{refund.voided.displayNumber}</span>.{" "}
            <Link href={back.href} className={linkClass}>
              {back.label}
            </Link>
          </p>
        ) : (
          <VoidForm
            action={voidRefundAction}
            field="refundId"
            id={refund.id}
            question={`¿Anular la devolución ${refund.displayNumber} por ${amount}?`}
            explanation={`La anulación es otro comprobante, con su propio número, y anula la devolución entera: lo devuelto vuelve a estar a favor o a devolver. ${cash} Una anulación no se deshace.`}
            reasons={REASONS}
            cancelHref={back.href}
            submitLabel="Sí, anular la devolución"
          />
        )}
      </div>
    </main>
  );
}
