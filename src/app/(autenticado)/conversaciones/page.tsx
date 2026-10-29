import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CONVERSATION_STATUSES,
  getConversationCounts,
  listConversations,
  type ConversationCounts,
  type ConversationListField,
  type ConversationStatus,
} from "@/modules/conversations";
import { getClient, searchClients } from "@/modules/crm";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SubNav } from "@/app/_components/sub-nav";
import { ConversationList } from "./conversation-list";
import { PreviewPanel } from "./preview-panel";
import {
  conversationFiltersHref,
  DEFAULT_VIEW,
  hasActiveConversationFilters,
  hasMoreFilters,
  parseConversationView,
  PERIOD_KEYS,
  PERIOD_LABEL,
  SORT_LABEL,
  STATUS_PARAM,
  STATUS_TAB_LABEL,
  STATUS_TABS,
  toListFilters,
  type ConversationView,
  type SortKey,
  type SearchParams,
  type StatusKey,
} from "./filters";
import {
  ALL_CHIP_LABEL,
  CHOOSE_CLIENT_MESSAGE,
  HUMAN_ATTENTION_LABEL,
  FILTERS_SHORT_LABEL,
  MORE_FILTERS_LABEL,
  ONE_ROW_PER_CLIENT_TEXT,
  SEARCH_PLACEHOLDER,
  CLIENT_FILTER_NOT_FOUND_MESSAGE,
  FORBIDDEN_PAGE_MESSAGE,
  MORE_CLIENTS_MESSAGE,
  NO_CLIENT_MATCH_MESSAGE,
  NO_CONVERSATION_RESULTS_MESSAGE,
  NO_CONVERSATIONS_MESSAGE,
  PERIOD_INVALID_MESSAGE,
  periodHasError,
} from "./messages";

export const metadata: Metadata = {
  title: "Conversaciones — AI WhatsApp Agent CRM",
};

const TITLE = "Conversaciones";

type ClientChoice = { id: string; name: string; isActive: boolean };

// Un chip de la bandeja (brief-24.3.1; mockup 01): enlace con aria-current si está aplicado.
function chipClass(current: boolean): string {
  return `inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    current
      ? "border-transparent bg-primary-soft text-on-primary-soft"
      : "border-border bg-surface text-foreground hover:bg-surface-muted"
  }`;
}

// La cantidad de una pestaña, o la del chip, con «Atención humana» aplicada o no.
function countFor(
  counts: ConversationCounts,
  status: StatusKey,
  pausedOnly: boolean,
): number {
  const param = STATUS_PARAM[status];
  const statuses: readonly ConversationStatus[] =
    param === "all" ? CONVERSATION_STATUSES : [param];
  let sum = 0;
  for (const key of statuses) {
    sum += pausedOnly ? counts[key].paused : counts[key].total;
  }
  return sum;
}

// Pantalla 8 (wireframe 08): filtros y página en la URL, sin contenido de mensajes (FR-CONV-01).
// El filtro de cliente busca con crm en dos pasos (brief-6.4, D-1): un resultado se aplica, varios
// se ofrecen para elegir. Nunca se muestra el teléfono. Desde la 24.3, al patrón de la v2
// (brief-24.3): las pestañas de estado con su cantidad, Abiertas por defecto (D-1), el chip
// «Atención humana», que filtra el agente pausado (D-3), la búsqueda de cliente por nombre o
// teléfono y el resto de los filtros en «Más filtros» (D-4). Todo son enlaces o un formulario GET:
// funciona sin JavaScript. Desde la 24.3.1, como chat (brief-24.3.1; mockups 01 y 03): una fila por
// cliente con su conversación más reciente (D-1), los chips, la búsqueda y «Más filtros» en una
// línea, y en escritorio el panel de vista previa de la elegida con `?ver=` (D-2), que sin elegir
// no lee ningún hilo (D-3).
export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const view = parseConversationView(await searchParams);

  let choices: ClientChoice[] | null = null;
  let moreChoices = false;
  if (view.clientSearch) {
    const found = await searchClients(context, {
      text: view.clientSearch,
      activity: "all",
      page: 1,
    });
    if (!found.ok) {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    const [only] = found.clients;
    if (found.total === 1 && only) {
      redirect(
        conversationFiltersHref({
          ...view,
          clientId: only.id,
          clientSearch: "",
          page: 1,
        }),
      );
    }
    moreChoices = found.total > found.clients.length;
    choices = found.clients.map((client) => ({
      id: client.id,
      name: client.displayName,
      isActive: client.isActive,
    }));
  }

  // Nombre del cliente elegido; uno inexistente deja la lista sin resultados.
  let chosenClient: string | null = null;
  let clientMissing = false;
  if (view.clientId) {
    const found = await getClient(context, view.clientId);
    if (found.ok) chosenClient = found.client.displayName;
    else if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    } else clientMissing = true;
  }

  const timeZone = await getOrganizationTimezone(context);
  const listFilters = toListFilters(view, timeZone);
  const [result, counted] =
    choices === null && !clientMissing
      ? await Promise.all([
          listConversations(context, listFilters),
          getConversationCounts(context, listFilters),
        ])
      : [null, null];
  const counts = counted?.ok ? counted.counts : null;
  if (result && !result.ok && result.code === "FORBIDDEN") {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const invalidFields: ConversationListField[] =
    result && !result.ok && result.code === "VALIDATION_ERROR"
      ? result.fields
      : [];
  const periodInvalid = periodHasError(invalidFields);
  const filtered = hasActiveConversationFilters(view);
  const withoutClient: ConversationView = {
    ...view,
    clientId: "",
    clientSearch: "",
    page: 1,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Atendé consultas, ventas y servicio técnico desde un solo lugar."
      />

      <SubNav
        scroll
        label="Estado de las conversaciones"
        items={STATUS_TABS.map((status) => ({
          href: conversationFiltersHref({ ...view, status, page: 1 }),
          label: STATUS_TAB_LABEL[status],
          current: view.status === status,
          count: counts ? countFor(counts, status, view.attention) : undefined,
        }))}
      />

      <div className="mt-5 flex flex-wrap items-start gap-3">
        <Link
          href={conversationFiltersHref({ ...view, attention: false, page: 1 })}
          aria-current={view.attention ? undefined : "true"}
          // En el teléfono no entra en la fila: «Atención humana» se quita con otro toque (mockup 03).
          className={`order-2 max-sm:hidden lg:order-none ${chipClass(!view.attention)}`}
        >
          {ALL_CHIP_LABEL}
        </Link>
        <Link
          href={conversationFiltersHref({
            ...view,
            attention: !view.attention,
            page: 1,
          })}
          aria-current={view.attention ? "true" : undefined}
          className={`order-2 lg:order-none ${chipClass(view.attention)}`}
        >
          {HUMAN_ATTENTION_LABEL}
          {counts ? " " : null}
          {counts ? (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground tabular-nums">
              {countFor(counts, view.status, true)}
            </span>
          ) : null}
          {view.attention ? (
            <span className="sr-only"> (filtro aplicado: quitarlo)</span>
          ) : null}
        </Link>

        <form
          key={conversationFiltersHref(view)}
          method="get"
          action="/conversaciones"
          // Sin caja propia: la búsqueda y «Más filtros» se ordenan con los chips.
          className="contents"
        >
          {view.status !== DEFAULT_VIEW.status ? (
            <input type="hidden" name="estado" value={view.status} />
          ) : null}
          {view.attention ? (
            <input type="hidden" name="atencion" value="humana" />
          ) : null}
          {view.pageSize !== DEFAULT_VIEW.pageSize ? (
            <input type="hidden" name="filas" value={view.pageSize} />
          ) : null}
          {view.clientId ? (
            <input type="hidden" name="cliente" value={view.clientId} />
          ) : (
            <div className="relative order-1 w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
              <label htmlFor="buscar_cliente" className="sr-only">
                Buscar cliente
              </label>
              <SearchIcon />
              <input
                id="buscar_cliente"
                name="buscar_cliente"
                type="search"
                placeholder={SEARCH_PLACEHOLDER}
                defaultValue={view.clientSearch}
                className={`${inputClass} min-h-11 rounded-full pl-9`}
              />
              {/* Enter busca; el botón aparece al llegar con el teclado. Anclado siempre dentro del
                  campo: en su lugar del flujo, oculto, desbordaba la página a 375 px. */}
              <button
                type="submit"
                className={`sr-only top-1 right-1 focus:not-sr-only focus:absolute ${inlineButtonClass}`}
              >
                Buscar
              </button>
            </div>
          )}
          <details
            open={hasMoreFilters(view)}
            className="group relative order-3 ml-auto lg:order-none lg:ml-0"
          >
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
              <Icon name="filter" className="size-4" />
              <span className="sm:hidden">{FILTERS_SHORT_LABEL}</span>
              <span className="max-sm:hidden">{MORE_FILTERS_LABEL}</span>
              <Icon
                name="chevronDown"
                className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div
              className={`absolute right-0 z-30 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4 ${cardClass} shadow-lg`}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="periodo" className={labelClass}>
                  Período (último mensaje)
                </label>
                <select
                  id="periodo"
                  name="periodo"
                  defaultValue={view.period}
                  className={selectClass}
                >
                  {PERIOD_KEYS.map((period) => (
                    <option key={period} value={period}>
                      {PERIOD_LABEL[period]}
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
                      aria-invalid={periodInvalid || undefined}
                      aria-describedby={
                        periodInvalid ? "periodo-error" : undefined
                      }
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
                      aria-invalid={periodInvalid || undefined}
                      aria-describedby={
                        periodInvalid ? "periodo-error" : undefined
                      }
                      className={inputClass}
                    />
                  </div>
                </>
              ) : null}
              <div className="flex flex-col gap-1">
                <label htmlFor="canal" className={labelClass}>
                  Canal
                </label>
                <select
                  id="canal"
                  name="canal"
                  defaultValue={view.channel}
                  className={selectClass}
                >
                  <option value="todos">Todos</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="orden" className={labelClass}>
                  Ordenar por
                </label>
                <select
                  id="orden"
                  name="orden"
                  defaultValue={view.sort}
                  className={selectClass}
                >
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                    <option key={key} value={key}>
                      {SORT_LABEL[key]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={inlineButtonClass}>
                Aplicar filtros
              </button>
            </div>
          </details>
        </form>
      </div>

      {filtered ? (
        <p className="mt-3">
          <Link href="/conversaciones" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        </p>
      ) : null}

      {view.clientId && !clientMissing ? (
        <p className="mt-4 text-sm">
          Cliente: <span className="font-semibold">{chosenClient}</span> ·{" "}
          <Link
            href={conversationFiltersHref(withoutClient)}
            className={linkClass}
          >
            Quitar cliente
          </Link>
        </p>
      ) : null}

      {periodInvalid ? (
        <p id="periodo-error" className="mt-4 text-sm font-medium text-danger">
          {PERIOD_INVALID_MESSAGE}
        </p>
      ) : null}

      {choices !== null ? (
        <div className={`mt-8 ${cardClass} p-6`}>
          {choices.length === 0 ? (
            <p>{NO_CLIENT_MATCH_MESSAGE}</p>
          ) : (
            <>
              <p id="elegir-cliente">{CHOOSE_CLIENT_MESSAGE}</p>
              <ul
                aria-labelledby="elegir-cliente"
                className="mt-3 flex flex-col gap-2"
              >
                {choices.map((choice) => (
                  <li key={choice.id}>
                    <Link
                      href={conversationFiltersHref({
                        ...view,
                        clientId: choice.id,
                        clientSearch: "",
                        page: 1,
                      })}
                      className={linkClass}
                    >
                      {choice.name}
                    </Link>
                    {choice.isActive ? null : (
                      <span className="text-sm text-muted"> · Inactivo</span>
                    )}
                  </li>
                ))}
              </ul>
              {moreChoices ? (
                <p className="mt-3 text-sm text-muted">
                  {MORE_CLIENTS_MESSAGE}
                </p>
              ) : null}
            </>
          )}
          <p className="mt-3">
            <Link
              href={conversationFiltersHref(withoutClient)}
              className={linkClass}
            >
              Quitar la búsqueda de cliente
            </Link>
          </p>
        </div>
      ) : clientMissing ? (
        <div className={`mt-8 ${cardClass} p-6`}>
          <p>{CLIENT_FILTER_NOT_FOUND_MESSAGE}</p>
          <p className="mt-3">
            <Link href="/conversaciones" className={linkClass}>
              Limpiar filtros
            </Link>
          </p>
        </div>
      ) : !result?.ok ? (
        <div className={`mt-8 ${cardClass} p-6`}>
          <p>{NO_CONVERSATION_RESULTS_MESSAGE}</p>
          <p className="mt-3">
            <Link href="/conversaciones" className={linkClass}>
              Limpiar filtros
            </Link>
          </p>
        </div>
      ) : result.total === 0 ? (
        <EmptyState
          icon="messageCircle"
          title={
            result.organizationHasConversations
              ? NO_CONVERSATION_RESULTS_MESSAGE
              : NO_CONVERSATIONS_MESSAGE
          }
          description={
            result.organizationHasConversations
              ? "Probá con otras palabras o quitá algún filtro."
              : "Las conversaciones de WhatsApp que registra el agente aparecen acá."
          }
          actions={
            result.organizationHasConversations
              ? [
                  {
                    href: "/conversaciones",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : []
          }
        />
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="min-w-0">
            <ConversationList
              conversations={result.conversations}
              timeZone={result.timezone}
              selectedId={view.selected}
              previewHref={(id) =>
                conversationFiltersHref({ ...view, selected: id })
              }
            />
            <p className="mt-3 text-xs text-muted">{ONE_ROW_PER_CLIENT_TEXT}</p>
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              rangeText={shownRangeText({
                page: result.page,
                pageSize: view.pageSize,
                shown: result.conversations.length,
                total: result.total,
                singular: "conversación",
                plural: "conversaciones",
              })}
              hrefFor={(page) => conversationFiltersHref({ ...view, page })}
              pageSize={{
                current: view.pageSize,
                hrefFor: (pageSize) =>
                  conversationFiltersHref({ ...view, pageSize, page: 1 }),
              }}
            />
          </div>
          <div className="hidden min-w-0 lg:sticky lg:top-24 lg:block">
            <PreviewPanel context={context} selectedId={view.selected} />
          </div>
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 text-sm text-muted">
        <Icon name="mapPin" className="size-4" />
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
