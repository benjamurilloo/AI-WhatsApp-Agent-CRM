import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getTradeIn, tradeInsAllowed } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatFullDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { PrintButton } from "../../../compras/ordenes/[orderId]/print-button";
import { PhoneText } from "../../../clientes/phone-text";
import {
  DESTINATION_LABEL,
  TRADE_IN_LEGEND,
  TRADE_IN_NOT_FOUND_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
} from "../../messages";

export const metadata: Metadata = {
  title: "Comprobante de un usado — AI WhatsApp Agent CRM",
};

const TITLE = "Comprobante de un usado";

// El comprobante PU, imprimible (brief-29.7, D-7 y U-5): el número, el cliente, el equipo, el checklist,
// el valor y el destino. El nombre, el teléfono y, para un admin, el DNI se leen de la ficha al
// imprimir: el comprobante no los copia. Si la ficha se vació, muestra el nombre minimizado. Un viewer
// lo ve sin el valor ni el DNI, y con el teléfono enmascarado. Al imprimir queda solo el comprobante.
export default async function TradeInReceiptPage({
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
  const [timeZone, frame] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
  ]);
  const documentNumber = tradeIn.client?.contact?.documentNumber ?? null;

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
        aria-labelledby="usado-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{TRADE_IN_LEGEND}</p>
          </div>
          <div className="text-right">
            <h1 id="usado-titulo" className="text-lg font-semibold">
              Recepción de usado{" "}
              <span className="font-mono">{tradeIn.displayNumber}</span>
            </h1>
            <p className="text-sm">
              {formatFullDateTime(tradeIn.createdAt, timeZone)}
            </p>
            {tradeIn.void ? (
              <p className="text-sm font-semibold">
                Anulada por {tradeIn.void.displayNumber}
              </p>
            ) : null}
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Cliente</dt>
            <dd className="font-semibold">
              {tradeIn.client?.displayName ?? UNKNOWN_CLIENT_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Teléfono</dt>
            <dd>
              <PhoneText phone={tradeIn.client?.phone ?? null} emptyText="—" />
            </dd>
          </div>
          {context.role === "admin" ? (
            <div>
              <dt className="text-muted">DNI</dt>
              <dd className="tabular-nums">{documentNumber ?? "—"}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">Equipo</dt>
            <dd className="font-semibold">
              {tradeIn.productName ?? UNKNOWN_PRODUCT_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">IMEI o número de serie</dt>
            <dd className="font-mono">{tradeIn.serial}</dd>
          </div>
          <div>
            <dt className="text-muted">Batería y grado</dt>
            <dd>
              {tradeIn.batteryHealth}% · grado {tradeIn.grade?.name ?? "—"}
            </dd>
          </div>
          {tradeIn.value ? (
            <div>
              <dt className="text-muted">Valor reconocido</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(tradeIn.value.amount, tradeIn.value.currency)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">Destino</dt>
            <dd>{DESTINATION_LABEL[tradeIn.destination]}</dd>
          </div>
        </dl>

        {tradeIn.checks.length > 0 ? (
          <section aria-labelledby="checklist-titulo" className="mt-6">
            <h2 id="checklist-titulo" className="text-sm font-semibold">
              Checklist
            </h2>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {tradeIn.checks.map((check) => (
                <li key={check.position}>
                  {check.name}: {check.passed ? "pasó" : "no pasó"}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-8 text-center text-sm font-semibold uppercase">
          {TRADE_IN_LEGEND}
        </p>
      </article>
    </main>
  );
}
