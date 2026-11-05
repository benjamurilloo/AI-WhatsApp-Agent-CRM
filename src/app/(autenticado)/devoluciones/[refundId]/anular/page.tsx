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
// vuelve a estar a favor o a devolver. Desde la 24.7.2-b, con la forma de la tarjeta de la lámina
// 09 (D-4): `Screens.md` §36 dice que usa «la confirmación de la pantalla 32», así que rediseñar
// una sola las habría separado y habría dejado la contradicción escrita en el documento.
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
  const applied = formatMoney(refund.amount, refund.currency);
  const session = refund.session?.displayNumber ?? "sin sesión";
  const cash = !refund.isCash
    ? "no mueve la caja, porque no es efectivo"
    : refund.sessionOpen
      ? `vuelve a lo esperado de la sesión ${session}, que sigue abierta`
      : `no cambia el arqueo de la sesión ${session}, que ya se cerró, y va a aparecer ahí como explicación de su diferencia`;
  const details = [
    { label: "Devuelto", value: applied },
    ...(refund.tender
      ? [
          {
            label: "Salió",
            value: formatMoney(refund.tender.amount, refund.tender.currency),
          },
        ]
      : []),
    {
      label: refund.isCash ? "Efectivo" : "Medio",
      value: refund.isCash
        ? `${session} ${refund.sessionOpen ? "abierta" : "cerrada"}`
        : refund.paymentMethodName,
    },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={TITLE}
          subtitle={`De la devolución ${refund.displayNumber}${
            refund.sale ? `, de la venta ${refund.sale.displayNumber}` : ""
          }.`}
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
            question={`¿Anular ${refund.displayNumber}?`}
            details={details}
            explanation={`Lo devuelto vuelve a estar a favor o a devolver, y ${cash}. La anulación es otro comprobante, con su propio número, y no se deshace.`}
            reasons={REASONS}
            cancelHref={back.href}
            cancelLabel="Conservar devolución"
            submitLabel="Anular devolución"
          />
        )}
      </div>
    </main>
  );
}
