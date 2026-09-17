import { Suspense } from "react";
import type { Metadata } from "next";
import { getMetricsPeriod } from "@/modules/analytics";
import { requireSession } from "@/app/_auth/session";
import {
  fieldErrorClass,
  formMessageClass,
  inputClass,
  labelClass,
  mutedTextClass,
  pageTitleClass,
  secondaryButtonClass,
  selectClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import {
  ActiveConversationsCard,
  ConversationsStartedCard,
  FirstResponseTimeCard,
  InboundMessagesCard,
  IngestionErrorsCard,
  MessagesPerConversationCard,
  OutboundMessagesCard,
  RespondedConversationsCard,
  ResponseCoverageCard,
  StatusDistributionCard,
  UniqueClientsCard,
  type CardContext,
} from "./_dashboard/cards";
import {
  DailyActivitySection,
  SERIES_KEYS,
  type SeriesKey,
} from "./_dashboard/daily-chart";
import {
  FORBIDDEN_PAGE_MESSAGE,
  PERIOD_INVALID_MESSAGE,
  TODAY_EXCLUDED_NOTE,
} from "./_dashboard/messages";
import { MetricCard, MetricSkeleton } from "./_dashboard/metric-card";
import {
  dashboardHref,
  formatCalendarDay,
  parseDashboardView,
  periodInputFor,
  PERIOD_KEYS,
  PERIOD_LABEL,
  type SearchParams,
} from "./_dashboard/period";
import { shiftDays } from "@/app/_format/date-time";

// Pantalla 2 — Dashboard (brief-7.4; Screens.md §2, wireframe 02). Las doce métricas del catálogo,
// cada tarjeta con su propia consulta y su propio estado de carga y de error (D-2), y el período
// compartido resuelto una sola vez (D-6). Solo lee: ningún valor es editable (FR-MET-03).

export const metadata: Metadata = {
  title: "Dashboard — AI WhatsApp Agent CRM",
};

const CARD_GRID = "mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const params = await searchParams;
  const view = parseDashboardView(params);
  const rawSeries = params.serie;
  const series: SeriesKey = SERIES_KEYS.includes(rawSeries as SeriesKey)
    ? (rawSeries as SeriesKey)
    : "conversaciones";

  // Primera resolución: el período por defecto, que además trae la zona horaria y, con su fin, el
  // "hoy" del reloj de la base, que es el que necesitan los atajos de 7 y 90 días.
  const base = await getMetricsPeriod(context, { from: "", to: "" });
  if (!base.ok) {
    return (
      <PageNotice
        title="Dashboard"
        message={
          base.code === "FORBIDDEN"
            ? FORBIDDEN_PAGE_MESSAGE
            : PERIOD_INVALID_MESSAGE
        }
      />
    );
  }
  const today = shiftDays(base.period.to, 1);
  const input = periodInputFor(view, today);
  const resolved =
    view.period === "30d" ? base : await getMetricsPeriod(context, input);
  if (!resolved.ok && resolved.code === "FORBIDDEN") {
    return <PageNotice title="Dashboard" message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const period = resolved.ok ? resolved.period : null;
  const invalidFields = resolved.ok ? [] : resolved.fields;
  const periodInvalid = invalidFields.length > 0;
  const retryHref = dashboardHref(view);
  const cards: CardContext | null = period
    ? { context, input, retryHref }
    : null;
  const seriesHref = (key: SeriesKey) => {
    const url = new URL(retryHref, "https://crm.invalid");
    if (key !== "conversaciones") url.searchParams.set("serie", key);
    else url.searchParams.delete("serie");
    return `${url.pathname}${url.search}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className={pageTitleClass}>Dashboard</h1>

      <form
        key={retryHref}
        method="get"
        action="/"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="periodo" className={labelClass}>
            Período
          </label>
          <select
            id="periodo"
            name="periodo"
            defaultValue={view.period}
            className={selectClass}
          >
            {PERIOD_KEYS.map((key) => (
              <option key={key} value={key}>
                {PERIOD_LABEL[key]}
              </option>
            ))}
          </select>
        </div>
        {view.period === "personalizado" ? (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="desde" className={labelClass}>
                Desde
              </label>
              <input
                id="desde"
                name="desde"
                type="date"
                defaultValue={view.from}
                aria-invalid={invalidFields.includes("from") || undefined}
                aria-describedby={periodInvalid ? "periodo-error" : undefined}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="hasta" className={labelClass}>
                Hasta
              </label>
              <input
                id="hasta"
                name="hasta"
                type="date"
                defaultValue={view.to}
                aria-invalid={invalidFields.includes("to") || undefined}
                aria-describedby={periodInvalid ? "periodo-error" : undefined}
                className={inputClass}
              />
            </div>
          </>
        ) : null}
        {series === "conversaciones" ? null : (
          <input type="hidden" name="serie" value={series} />
        )}
        <button type="submit" className={secondaryButtonClass}>
          Aplicar
        </button>
      </form>

      {period ? (
        <p className={`mt-3 ${mutedTextClass}`}>
          Del {formatCalendarDay(period.from)} al {formatCalendarDay(period.to)}
          {period.to === shiftDays(today, -1)
            ? ` (${TODAY_EXCLUDED_NOTE})`
            : ""}{" "}
          · Zona horaria: {period.timezone}
        </p>
      ) : (
        <p
          id="periodo-error"
          role="alert"
          className={`mt-3 ${formMessageClass}`}
        >
          {PERIOD_INVALID_MESSAGE}
        </p>
      )}
      {periodInvalid ? (
        <p className={`mt-2 ${fieldErrorClass}`}>
          Ninguna métrica se calculó con este período.
        </p>
      ) : null}

      {cards === null ? null : (
        <>
          <div className={CARD_GRID}>
            <Suspense fallback={<LoadingCard metric={1} />}>
              <ConversationsStartedCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={2} />}>
              <ActiveConversationsCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={3} />}>
              <UniqueClientsCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={4} />}>
              <InboundMessagesCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={5} />}>
              <OutboundMessagesCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={6} />}>
              <MessagesPerConversationCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={7} />}>
              <RespondedConversationsCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={8} />}>
              <ResponseCoverageCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={9} />}>
              <FirstResponseTimeCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={11} />}>
              <StatusDistributionCard {...cards} />
            </Suspense>
            <Suspense fallback={<LoadingCard metric={12} />}>
              <IngestionErrorsCard {...cards} />
            </Suspense>
          </div>

          <div className="mt-6">
            <Suspense
              fallback={
                <p className={mutedTextClass}>Cargando la evolución diaria…</p>
              }
            >
              <DailyActivitySection
                cards={cards}
                series={series}
                seriesHref={seriesHref}
              />
            </Suspense>
          </div>
        </>
      )}
    </main>
  );
}

function LoadingCard({
  metric,
}: {
  metric: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | 12;
}) {
  return (
    <MetricCard metric={metric}>
      <MetricSkeleton />
    </MetricCard>
  );
}
