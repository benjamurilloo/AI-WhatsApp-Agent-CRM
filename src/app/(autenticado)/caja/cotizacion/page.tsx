import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatAdjustment,
  getExchangeRatePage,
  type RateReading,
} from "@/modules/fx";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { DetailList, type DetailItem } from "@/app/_components/detail-list";
import {
  cardClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatExchangeRate } from "@/shared/money";
import { STALE_RATE_TEXT } from "../exchange";
import { noticeMessage } from "../messages";
import {
  ATTRIBUTION_TEXT,
  AUTOMATIC_OVERWRITES_MANUAL_TEXT,
  CLOSE_PANEL_LABEL,
  CURRENT_RATE_TITLE,
  HISTORY_TITLE,
  LOAD_RATE_LINK,
  LOAD_RATE_PANEL_TITLE,
  MANUAL_SOURCE_TEXT,
  NO_RATE_YET_MESSAGE,
  RATE_BECOMES_CURRENT_TEXT,
  RATE_FORBIDDEN_MESSAGE,
  RATE_HELP,
  RATE_NOTICE,
  RATE_TITLE,
  READING_SCHEDULE_TEXT,
  STALE_BADGE_TEXT,
  SETTINGS_HELP,
  SETTINGS_TITLE,
  SYSTEM_CURRENCIES_HELP,
  SYSTEM_CURRENCIES_TITLE,
  sourceText,
} from "./messages";
import { RateForm } from "./rate-form";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Tipo de cambio — AI WhatsApp Agent CRM",
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// La cotización (ADR 0025, punto 4; brief-29.4, D-4; brief-29.4.2, D-9): la vigente con su fuente,
// quién la cargó o qué dio DolarAPI, cuándo, el aviso de antigüedad, la fuente y el ajuste de la
// organización, la carga manual y el cambio de fuente para un admin, y el historial. Un viewer la ve
// sin los formularios. Sin moneda principal, la sección no existe: 404, como una capacidad ausente.
//
// *Desde la 24.7.3* ([brief-24.7.3](../../../../docs/decisions/brief-24.7.3-cotizacion-y-medios-de-pago.md);
// lámina 01 del lote 23-tipo-cambio): la forma de la lámina. **Ninguna regla cambió y no hay
// ninguna lectura nueva**: `getExchangeRatePage` ya devolvía todo esto, y lo que cambia es cómo se
// compone.
//
// **La pantalla deja de dibujarse como una sección de la caja** (D-1): la navegación y las migas ya
// la nombraban «Tipo de cambio», ítem de Finanzas hermano de Caja, y lo único que decía lo
// contrario era su propio encabezado. **La ruta no se mudó**: `/caja/cotizacion` la cubren las
// cuatro llamadas a `revalidatePath("/caja", "layout")` de los cobros, las anulaciones y las
// devoluciones, y mudarla es el defecto que la revisión de la 24.7.2 encontró en `/cuentas`.
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

  // La carga manual es un panel que abre y cierra por la URL (D-2), como el recibo de la 24.7.2-b:
  // **conserva la página del historial**, así que cerrarlo devuelve a donde estabas. La acción
  // redirige a la pantalla sin `?cargar=1`, de modo que guardar lo cierra solo; un error vuelve
  // con el parámetro puesto y el panel sigue abierto con su mensaje.
  const loading = isAdmin && single(query.cargar) === "1";
  const href = (options: { page?: number; loading?: boolean }) => {
    const params = new URLSearchParams();
    const target = options.page ?? page.page;
    if (target > 1) params.set("pagina", String(target));
    if (options.loading) params.set("cargar", "1");
    const search = params.toString();
    return search ? `/caja/cotizacion?${search}` : "/caja/cotizacion";
  };

  const showSettings = isAdmin && page.automaticAvailable;
  const current = page.current;
  const rows: DetailItem[] = current
    ? [
        {
          label: "Fuente",
          value: current.reading
            ? `${sourceText("dolarapi_blue")}`
            : MANUAL_SOURCE_TEXT,
        },
        ...(current.reading
          ? [
              {
                label: `Lectura de referencia (DolarAPI)`,
                value: `${page.quoteCurrency} ${formatExchangeRate(current.reading.sourceRate)}, del ${formatShortDateTime(current.reading.observedAt, timeZone)}`,
              },
              {
                label: `Ajuste en ${page.quoteCurrency}`,
                value: formatAdjustment(current.reading.adjustment),
              },
            ]
          : [
              {
                label: "Cargada por",
                value: current.recordedByName || "un usuario",
              },
            ]),
        {
          label: "Registrada",
          value: formatShortDateTime(current.recordedAt, timeZone),
        },
        ...(current.reading
          ? [
              {
                label: "Última confirmación",
                value: formatShortDateTime(current.asOf, timeZone),
              },
            ]
          : []),
      ]
    : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title={RATE_TITLE}
        subtitle={`La cotización entre ${page.mainCurrency}, la moneda principal, y ${page.quoteCurrency}.`}
        action={
          isAdmin && !loading
            ? { href: href({ loading: true }), label: LOAD_RATE_LINK }
            : null
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <div
        className={`mt-6 grid items-start gap-6 ${
          loading ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""
        }`}
      >
        {/* Con el panel abierto la pantalla se apila: el trabajo es cargar un valor, y dos
            columnas más el panel dejarían cada una en 310 px a 1024 px de ventana. */}
        <div
          className={`grid min-w-0 items-start gap-6 ${
            showSettings && !loading ? "lg:grid-cols-2" : ""
          }`}
        >
          <div className="flex min-w-0 flex-col gap-6">
            <SectionCard
              id="cotizacion-vigente-titulo"
              title={CURRENT_RATE_TITLE}
              icon="trendingUp"
            >
              {current ? (
                <div className="flex flex-col gap-3">
                  <p className="text-3xl font-bold tracking-tight tabular-nums">
                    {pair(current.rate)}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                    {current.stale ? (
                      <StatusBadge tone="warning" icon="clock">
                        {STALE_BADGE_TEXT}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="success" icon="circleCheck">
                        Vigente
                      </StatusBadge>
                    )}
                    <span>
                      · Actualizada{" "}
                      {formatShortDateTime(current.asOf, timeZone)}
                    </span>
                  </p>
                  {/* La oración entera del aviso **no entra en la insignia**: es
                      `whitespace-nowrap` y a 320 px desbordaba la pantalla en 239 px, medido por
                      el barrido de M-1 (revisión independiente, B-1). Va en el mismo recuadro que
                      usa el total de referencia, que envuelve. */}
                  {current.stale ? (
                    <p className="w-fit rounded-md bg-warning-soft px-2 py-1 text-sm text-on-warning-soft">
                      {STALE_RATE_TEXT}
                    </p>
                  ) : null}
                  <div className="border-t border-border pt-3">
                    <DetailList items={rows} />
                  </div>
                  {automatic ? (
                    <p className="text-sm text-muted">
                      {READING_SCHEDULE_TEXT}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p>{NO_RATE_YET_MESSAGE}</p>
                  <p className="text-sm text-muted">
                    Fuente de la organización: {sourceText(page.source)}
                    {automatic
                      ? `, con un ajuste de ${page.quoteCurrency} ${formatAdjustment(page.adjustment)}. ${READING_SCHEDULE_TEXT}`
                      : "."}
                  </p>
                </div>
              )}
            </SectionCard>

            <section
              aria-labelledby="cotizacion-historial-titulo"
              className={`${cardClass} min-w-0 p-5 sm:p-6`}
            >
              <h2
                id="cotizacion-historial-titulo"
                className="text-lg font-bold tracking-tight"
              >
                {HISTORY_TITLE}
              </h2>
              {page.total === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  Sin cotizaciones todavía.
                </p>
              ) : (
                <>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <caption className="sr-only">
                        Cotizaciones de la más nueva a la más vieja. Cada valor
                        es {page.quoteCurrency} por 1 {page.mainCurrency}.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className={tableHeadCellClass}>
                            Fecha y hora
                          </th>
                          <th scope="col" className={tableHeadCellClass}>
                            Tipo
                          </th>
                          <th scope="col" className={tableHeadCellClass}>
                            Origen
                          </th>
                          <th
                            scope="col"
                            className={`${tableHeadCellClass} text-right`}
                          >
                            Cotización ({page.quoteCurrency})
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.history.map((row) => (
                          <tr key={row.id}>
                            <td
                              className={`${tableCellClass} whitespace-nowrap`}
                            >
                              {formatShortDateTime(row.recordedAt, timeZone)}
                            </td>
                            <td className={tableCellClass}>
                              {row.reading ? "Automática" : "Manual"}
                            </td>
                            {/* Quién cargó una manual no se pierde: la lámina no tiene columna
                                «Cargó», así que el nombre viaja en el origen. */}
                            <td className={tableCellClass}>
                              {row.reading
                                ? readingText(row.reading)
                                : row.recordedByName
                                  ? `${MANUAL_SOURCE_TEXT} · ${row.recordedByName}`
                                  : MANUAL_SOURCE_TEXT}
                            </td>
                            <td
                              className={`${tableCellClass} whitespace-nowrap text-right tabular-nums`}
                            >
                              {formatExchangeRate(row.rate)}
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
                    hrefFor={(target) => href({ page: target, loading })}
                  />
                </>
              )}
              {automatic || page.current?.reading ? (
                <p className="mt-3 text-sm text-muted">{ATTRIBUTION_TEXT}</p>
              ) : null}
            </section>
          </div>

          {showSettings ? (
            <SectionCard
              id="cotizacion-fuente-titulo"
              title={SETTINGS_TITLE}
              description={SETTINGS_HELP}
              icon="pencil"
            >
              <SettingsForm
                source={page.source}
                adjustment={formatAdjustment(page.adjustment)}
                quoteCurrency={page.quoteCurrency}
              />
              {/* El par es del sistema y acá se lee: la moneda principal no se cambia desde esta
                  pantalla (ADR 0025, punto 2). */}
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-surface-muted px-3 py-3">
                <Icon
                  name="info"
                  className="mt-0.5 size-5 shrink-0 text-muted"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{SYSTEM_CURRENCIES_TITLE}</p>
                  <p>Moneda principal: {page.mainCurrency}</p>
                  <p>Otra moneda: {page.quoteCurrency}</p>
                  <p className="mt-1 text-muted">{SYSTEM_CURRENCIES_HELP}</p>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>

        {loading ? (
          <aside
            aria-labelledby="cotizacion-cargar-titulo"
            className={`${cardClass} order-first min-w-0 p-5 lg:order-none lg:sticky lg:top-6`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="cotizacion-cargar-titulo"
                className="min-w-0 text-lg font-bold tracking-tight"
              >
                {LOAD_RATE_PANEL_TITLE}
              </h2>
              <Link
                href={href({})}
                aria-label={CLOSE_PANEL_LABEL}
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <Icon name="close" className="size-4" />
              </Link>
            </div>
            <p className="mt-2 text-sm text-muted">{RATE_HELP}</p>

            <div className="mt-4">
              <RateForm
                mainCurrency={page.mainCurrency}
                quoteCurrency={page.quoteCurrency}
                cancelHref={href({})}
                notices={
                  <div className="flex flex-col gap-3">
                    <p className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
                      <Icon
                        name="info"
                        className="mt-0.5 size-5 shrink-0 text-muted"
                      />
                      <span>{RATE_BECOMES_CURRENT_TEXT}</span>
                    </p>
                    {automatic ? (
                      <p className="flex items-start gap-3 rounded-xl bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
                        <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
                        <span>{AUTOMATIC_OVERWRITES_MANUAL_TEXT}</span>
                      </p>
                    ) : null}
                  </div>
                }
              />
            </div>
          </aside>
        ) : null}
      </div>

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
