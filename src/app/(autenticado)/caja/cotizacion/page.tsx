import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  formatAdjustment,
  getExchangeRatePage,
  type RateReading,
} from "@/modules/fx";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  cardClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatExchangeRate } from "@/shared/money";
import { CashSubNav } from "../cash-sub-nav";
import { STALE_RATE_TEXT } from "../exchange";
import { noticeMessage } from "../messages";
import {
  ATTRIBUTION_TEXT,
  AUTOMATIC_OVERWRITES_MANUAL_TEXT,
  NO_RATE_YET_MESSAGE,
  RATE_FORBIDDEN_MESSAGE,
  RATE_HELP,
  RATE_NOTICE,
  RATE_TITLE,
  READING_SCHEDULE_TEXT,
  SETTINGS_HELP,
  sourceText,
} from "./messages";
import { RateForm } from "./rate-form";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Cotización — AI WhatsApp Agent CRM",
};

type SearchParams = Record<string, string | string[] | undefined>;

// La cotización (ADR 0025, punto 4; brief-29.4, D-4; brief-29.4.2, D-9): la vigente con su fuente,
// quién la cargó o qué dio DolarAPI, cuándo, el aviso de antigüedad, la fuente y el ajuste de la
// organización, la carga manual y el cambio de fuente para un admin, y el historial. Un viewer la ve
// sin los formularios. Sin moneda principal, la sección no existe: 404, como una capacidad ausente.
export default async function ExchangeRatePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const result = await getExchangeRatePage(context, query.pagina);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return <PageNotice title={RATE_TITLE} message={RATE_FORBIDDEN_MESSAGE} />;
  }
  const page = result.value;
  const timeZone = await getOrganizationTimezone(context);
  const isAdmin = context.role === "admin";
  const notice = noticeMessage(RATE_NOTICE, query.aviso);
  const pair = (rate: bigint) =>
    `1 ${page.mainCurrency} = ${page.quoteCurrency} ${formatExchangeRate(rate)}`;
  const pageCount = Math.max(1, Math.ceil(page.total / page.pageSize));
  const automatic = page.source === "dolarapi_blue";
  // «DolarAPI 1.555,00 + ajuste 10,00»
  const readingText = (reading: RateReading) =>
    `DolarAPI ${formatExchangeRate(reading.sourceRate)} + ajuste ${formatAdjustment(reading.adjustment)}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Caja"
        subtitle={`La cotización entre ${page.mainCurrency}, la moneda principal, y ${page.quoteCurrency}.`}
      />
      <CashSubNav current="cotizacion" />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <SectionCard
        id="cotizacion-vigente-titulo"
        title="Cotización vigente"
        icon="trendingUp"
        className="mt-6"
      >
        {page.current ? (
          <div className="flex flex-col gap-2">
            <p className="text-2xl font-semibold tabular-nums">
              {pair(page.current.rate)}
            </p>
            {page.current.reading ? (
              <p className="text-sm text-muted">
                Fuente: {readingText(page.current.reading)}. Dato de DolarAPI
                del{" "}
                {formatShortDateTime(page.current.reading.observedAt, timeZone)}
                ; guardada el{" "}
                {formatShortDateTime(page.current.recordedAt, timeZone)} y
                confirmada por última vez el{" "}
                {formatShortDateTime(page.current.asOf, timeZone)}.
              </p>
            ) : (
              <p className="text-sm text-muted">
                Fuente: {sourceText("manual")}. Cargada por{" "}
                {page.current.recordedByName || "un usuario"} el{" "}
                {formatShortDateTime(page.current.recordedAt, timeZone)}.
              </p>
            )}
            {page.current.stale ? (
              <p className="w-fit rounded-md bg-warning-soft px-2 py-1 text-sm text-on-warning-soft">
                {STALE_RATE_TEXT}
              </p>
            ) : null}
          </div>
        ) : (
          <p>{NO_RATE_YET_MESSAGE}</p>
        )}
        <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm">
          <p>
            Fuente de la organización: {sourceText(page.source)}
            {automatic
              ? `, con un ajuste de ${page.quoteCurrency} ${formatAdjustment(page.adjustment)}. ${READING_SCHEDULE_TEXT}`
              : "."}
          </p>
          {automatic || page.current?.reading ? (
            <p className="text-muted">{ATTRIBUTION_TEXT}</p>
          ) : null}
        </div>
      </SectionCard>

      {isAdmin && page.automaticAvailable ? (
        <SectionCard
          id="cotizacion-fuente-titulo"
          title="Fuente y ajuste"
          description={SETTINGS_HELP}
          icon="pencil"
          className="mt-6"
        >
          <SettingsForm
            source={page.source}
            adjustment={formatAdjustment(page.adjustment)}
            quoteCurrency={page.quoteCurrency}
          />
        </SectionCard>
      ) : null}

      {isAdmin ? (
        <SectionCard
          id="cotizacion-cargar-titulo"
          title="Cargar una cotización"
          description={
            automatic
              ? `${RATE_HELP} ${AUTOMATIC_OVERWRITES_MANUAL_TEXT}`
              : RATE_HELP
          }
          icon="plus"
          className="mt-6"
        >
          <RateForm
            mainCurrency={page.mainCurrency}
            quoteCurrency={page.quoteCurrency}
          />
        </SectionCard>
      ) : null}

      <section aria-labelledby="cotizacion-historial-titulo" className="mt-6">
        <h2
          id="cotizacion-historial-titulo"
          className="text-base font-semibold"
        >
          Historial
        </h2>
        {page.total === 0 ? (
          <p className="mt-2 text-sm text-muted">Sin cotizaciones todavía.</p>
        ) : (
          <>
            <div className={`mt-3 overflow-x-auto ${cardClass}`}>
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Cotizaciones de la más nueva a la más vieja
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Fecha
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Cotización
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Fuente
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Cargó
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.history.map((row) => (
                    <tr key={row.id}>
                      <td className={`${tableCellClass} whitespace-nowrap`}>
                        {formatShortDateTime(row.recordedAt, timeZone)}
                      </td>
                      <td
                        className={`${tableCellClass} whitespace-nowrap text-right tabular-nums`}
                      >
                        {pair(row.rate)}
                      </td>
                      <td className={tableCellClass}>
                        {row.reading
                          ? readingText(row.reading)
                          : sourceText(row.source)}
                      </td>
                      <td className={tableCellClass}>
                        {row.reading ? "Automática" : row.recordedByName || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page.page}
              pageCount={pageCount}
              rangeText={shownRangeText({
                page: page.page,
                pageSize: page.pageSize,
                shown: page.history.length,
                total: page.total,
                singular: "cotización",
                plural: "cotizaciones",
              })}
              hrefFor={(target) => `/caja/cotizacion?pagina=${target}`}
            />
          </>
        )}
      </section>
      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
