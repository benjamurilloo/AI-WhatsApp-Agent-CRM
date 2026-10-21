import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getTradeIn, tradeInsAllowed } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatFullDateTime } from "@/app/_format/date-time";
import { PrintButton } from "../../../compras/ordenes/[orderId]/print-button";
import {
  TRADE_IN_LEGEND,
  TRADE_IN_NOT_FOUND_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
  VOID_REASON_LABEL,
} from "../../messages";

export const metadata: Metadata = {
  title: "Anulación de un usado — AI WhatsApp Agent CRM",
};

const TITLE = "Anulación de un usado";

// El comprobante APU, imprimible (brief-29.7, D-5 y D-7): el número de la anulación, el usado que
// anula, el cliente, el equipo y el motivo. Una recepción sin anulación, 404. Los dos roles.
export default async function TradeInVoidReceiptPage({
  params,
}: {
  params: Promise<{ tradeInId: string }>;
}) {
  const context = await requireSession();
  if (!(await tradeInsAllowed(context))) notFound();
  const { tradeInId } = await params;
  const found = await getTradeIn(context, tradeInId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={TRADE_IN_NOT_FOUND_MESSAGE}
        back={{ href: "/usados", label: "Volver a los usados" }}
      />
    );
  }
  const tradeIn = found.tradeIn;
  if (!tradeIn.void) notFound();
  const [timeZone, frame] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink
          href={`/usados/${tradeIn.id}`}
          label={`Volver al usado ${tradeIn.displayNumber}`}
        />
        <PrintButton />
      </div>

      <article
        data-comprobante
        aria-labelledby="anulacion-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{TRADE_IN_LEGEND}</p>
          </div>
          <div className="text-right">
            <h1 id="anulacion-titulo" className="text-lg font-semibold">
              Anulación{" "}
              <span className="font-mono">{tradeIn.void.displayNumber}</span>
            </h1>
            <p className="text-sm">
              {formatFullDateTime(tradeIn.void.createdAt, timeZone)}
            </p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Anula la recepción</dt>
            <dd className="font-mono font-semibold">{tradeIn.displayNumber}</dd>
          </div>
          <div>
            <dt className="text-muted">Motivo</dt>
            <dd>{VOID_REASON_LABEL[tradeIn.void.reason]}</dd>
          </div>
          <div>
            <dt className="text-muted">Cliente</dt>
            <dd className="font-semibold">
              {tradeIn.client?.displayName ?? UNKNOWN_CLIENT_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Equipo</dt>
            <dd>
              {tradeIn.productName ?? UNKNOWN_PRODUCT_TEXT} ·{" "}
              <span className="font-mono">{tradeIn.serial}</span>
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-center text-sm font-semibold uppercase">
          {TRADE_IN_LEGEND}
        </p>
      </article>
    </main>
  );
}
