import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CONVERSATIONS_PAGE_SIZE,
  listConversations,
  type ConversationListField,
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
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { ConversationTable } from "./conversation-table";
import {
  conversationFiltersHref,
  hasActiveConversationFilters,
  parseConversationView,
  PERIOD_KEYS,
  PERIOD_LABEL,
  toListFilters,
  type ConversationView,
  type SearchParams,
} from "./filters";
import {
  CHOOSE_CLIENT_MESSAGE,
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

// Pantalla 8 (wireframe 08): filtros y página en la URL, sin contenido de mensajes (FR-CONV-01).
// El filtro de cliente busca con crm en dos pasos (brief-6.4, D-1): un resultado se aplica, varios
// se ofrecen para elegir. Nunca se muestra el teléfono.
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
  const result =
    choices === null && !clientMissing
      ? await listConversations(context, toListFilters(view, timeZone))
      : null;
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
        subtitle="Analizá y gestioná todas las conversaciones con tus clientes."
      />

      <form
        key={conversationFiltersHref(view)}
        method="get"
        action="/conversaciones"
        className="mt-6 flex flex-wrap items-end gap-3"
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
                aria-invalid={periodInvalid || undefined}
                aria-describedby={periodInvalid ? "periodo-error" : undefined}
                className={inputClass}
              />
            </div>
          </>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="estado" className={labelClass}>
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={view.status}
            className={selectClass}
          >
            <option value="todos">Todos</option>
            <option value="abierta">Abierta</option>
            <option value="pendiente">Pendiente</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>
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
        {view.clientId ? (
          <input type="hidden" name="cliente" value={view.clientId} />
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="buscar_cliente" className={labelClass}>
              Cliente
            </label>
            <div className="relative">
              <SearchIcon />
              <input
                id="buscar_cliente"
                name="buscar_cliente"
                type="search"
                defaultValue={view.clientSearch}
                placeholder="Nombre del cliente"
                className={`${inputClass} w-60 pl-9`}
              />
            </div>
          </div>
        )}
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/conversaciones" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

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
        <div className={`mt-8 ${cardClass} p-6`}>
          <p>
            {result.organizationHasConversations
              ? NO_CONVERSATION_RESULTS_MESSAGE
              : NO_CONVERSATIONS_MESSAGE}
          </p>
          {result.organizationHasConversations ? (
            <p className="mt-3">
              <Link href="/conversaciones" className={linkClass}>
                Limpiar filtros
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <ConversationTable
            conversations={result.conversations}
            timeZone={result.timezone}
            caption="Conversaciones de la organización"
            showClient
          />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: CONVERSATIONS_PAGE_SIZE,
              shown: result.conversations.length,
              total: result.total,
              singular: "conversación",
              plural: "conversaciones",
            })}
            hrefFor={(page) => conversationFiltersHref({ ...view, page })}
          />
        </>
      )}

      <p className="mt-6 flex items-center gap-2 text-sm text-muted">
        <Icon name="mapPin" className="size-4" />
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
