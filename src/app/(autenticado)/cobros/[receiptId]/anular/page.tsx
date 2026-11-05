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

// De dónde se vino (brief-24.7.2-b, D-3): el panel del listado manda su propia dirección, con los
// filtros y la página puestos, para que «Conservar recibo» devuelva **al listado donde estaba** y no
// a un listado limpio. Se acepta **solo** una dirección de esta aplicación que empiece por
// `/caja/cobros`: lo que llega por la URL no decide a dónde se va.
function backFrom(raw: string, receiptId: string) {
  return /^\/caja\/cobros(\?|$)/.test(raw)
    ? { href: raw, label: "Volver a los cobros" }
    : { href: `/cobros/${receiptId}`, label: "Volver al recibo" };
}

// Pantalla 32: la anulación de un cobro (brief-21.5, D-9; ADR 0022, punto 7), solo admin: el motivo
// de la lista y la confirmación, con lo que pasa con la caja. Corrige un cobro mal registrado;
// después se registra el correcto. Un cobro ya anulado no ofrece el formulario. Desde la 24.7.2-b
// tiene la forma de la tarjeta «¿Anular R-000183?» de la lámina 09 (D-4).
export default async function VoidReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptId: string }>;
  searchParams: Promise<{ volver?: string | string[] }>;
}) {
  const context = await requireSession();
  const { receiptId } = await params;
  const { volver } = await searchParams;
  const back = backFrom(
    (Array.isArray(volver) ? volver[0] : volver) ?? "",
    receiptId,
  );
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
  const applied = formatMoney(receipt.amount, receipt.currency);
  const destination = receipt.sale
    ? `para la venta ${receipt.sale.displayNumber}`
    : receipt.order
      ? `para la seña del pedido ${receipt.order.displayNumber}`
      : "a cuenta del cliente";
  const session = receipt.session?.displayNumber ?? "sin sesión";
  // Qué pasa con la caja (ADR 0022, punto 7): sale de lo esperado de la sesión abierta, o el arqueo
  // guardado no cambia.
  const cash = !receipt.isCash
    ? "no mueve la caja, porque no es efectivo"
    : receipt.sessionOpen
      ? `resta ${receipt.tender ? formatMoney(receipt.tender.amount, receipt.tender.currency) : applied} de la sesión ${session}, que sigue abierta`
      : `no cambia el arqueo de la sesión ${session}, que ya se cerró, y va a aparecer ahí como explicación de su diferencia`;
  // Los tres datos de la tarjeta de la lámina 09.
  const details = [
    { label: "Aplicado", value: applied },
    ...(receipt.tender
      ? [
          {
            label: "Recibido",
            value: formatMoney(receipt.tender.amount, receipt.tender.currency),
          },
        ]
      : []),
    {
      label: receipt.isCash ? "Efectivo" : "Medio",
      value: receipt.isCash
        ? `${session} ${receipt.sessionOpen ? "abierta" : "cerrada"}`
        : receipt.paymentMethodName,
    },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={TITLE}
          subtitle={`Del recibo ${receipt.displayNumber}, ${destination}.`}
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
            question={`¿Anular ${receipt.displayNumber}?`}
            details={details}
            explanation={`Deja de contar ${applied} ${destination} y ${cash}. No devuelve dinero: la anulación es otro comprobante, con su propio número, y no se deshace. Después podés registrar el cobro correcto.`}
            reasons={REASONS}
            cancelHref={back.href}
            cancelLabel="Conservar recibo"
            submitLabel="Anular recibo"
          />
        )}
      </div>
    </main>
  );
}
