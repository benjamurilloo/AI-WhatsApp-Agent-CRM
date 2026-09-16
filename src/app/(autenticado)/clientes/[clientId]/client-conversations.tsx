import Link from "next/link";
import type { ClientActivityResult } from "@/modules/conversations";
import {
  cardClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  selectClass,
} from "@/app/_components/form-styles";
import { formatShortDateTime } from "@/app/_format/date-time";
import { ConversationTable } from "@/app/(autenticado)/conversaciones/conversation-table";
import {
  clientSectionsHref,
  type ClientSectionsView,
} from "@/app/(autenticado)/conversaciones/filters";
import {
  CHANNEL_LABEL,
  NO_CLIENT_CONVERSATION_RESULTS_MESSAGE,
  NO_CLIENT_CONVERSATIONS_MESSAGE,
  NO_INTERACTIONS_TEXT,
} from "@/app/(autenticado)/conversaciones/messages";

// Actividad del cliente en la pantalla 7 (wireframe 07; brief-6.4, D-4). La página crea la
// promesa sin esperarla, y cada parte la espera dentro de su Suspense: los datos del cliente se
// muestran antes. Sin contenido de mensajes.

type Activity = Promise<ClientActivityResult>;

export async function LastInteraction({ activity }: { activity: Activity }) {
  const result = await activity;
  if (!result.ok) return <>—</>;
  if (!result.lastInteraction) return <>{NO_INTERACTIONS_TEXT}</>;
  return (
    <>
      {formatShortDateTime(result.lastInteraction.at, result.timezone)} ·{" "}
      {CHANNEL_LABEL[result.lastInteraction.channel]}
    </>
  );
}

export async function ClientConversations({
  clientId,
  clientName,
  activity,
  view,
}: {
  clientId: string;
  clientName: string;
  activity: Activity;
  view: ClientSectionsView;
}) {
  const result = await activity;
  if (!result.ok) return null;
  const filtered = view.conversationStatus !== "todos";
  const clearHref = clientSectionsHref(clientId, {
    ...view,
    conversationStatus: "todos",
    conversationPage: 1,
  });

  return (
    <>
      <form
        key={clientSectionsHref(clientId, view)}
        method="get"
        action={`/clientes/${clientId}`}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        {view.auditPage > 1 ? (
          <input type="hidden" name="auditoria" value={view.auditPage} />
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="estado_conv" className={labelClass}>
            Estado
          </label>
          <select
            id="estado_conv"
            name="estado_conv"
            defaultValue={view.conversationStatus}
            className={selectClass}
          >
            <option value="todos">Todos</option>
            <option value="abierta">Abierta</option>
            <option value="pendiente">Pendiente</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>
        <button type="submit" className={secondaryButtonClass}>
          Filtrar
        </button>
        {filtered ? (
          <Link href={clearHref} className={`${linkClass} py-2`}>
            Limpiar filtro
          </Link>
        ) : null}
        {result.clientHasConversations ? (
          <Link
            href={`/conversaciones?cliente=${clientId}`}
            className={`${linkClass} py-2 sm:ml-auto`}
          >
            Ver en Conversaciones
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <div className="mt-4">
          <p>
            {result.clientHasConversations
              ? NO_CLIENT_CONVERSATION_RESULTS_MESSAGE
              : NO_CLIENT_CONVERSATIONS_MESSAGE}
          </p>
          {result.clientHasConversations ? (
            <p className="mt-3">
              <Link href={clearHref} className={linkClass}>
                Limpiar filtro
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <ConversationTable
            conversations={result.conversations}
            timeZone={result.timezone}
            caption={`Conversaciones de ${clientName}`}
            showClient={false}
          />
          {result.pageCount > 1 ? (
            <nav
              aria-label="Paginación de conversaciones"
              className="mt-4 flex flex-wrap items-center justify-center gap-4"
            >
              {result.page > 1 ? (
                <Link
                  href={clientSectionsHref(clientId, {
                    ...view,
                    conversationPage: result.page - 1,
                  })}
                  className={linkClass}
                >
                  Página anterior
                </Link>
              ) : null}
              <p className="text-sm text-muted tabular-nums">
                Página {result.page} de {result.pageCount} · {result.total}{" "}
                {result.total === 1 ? "conversación" : "conversaciones"}
              </p>
              {result.page < result.pageCount ? (
                <Link
                  href={clientSectionsHref(clientId, {
                    ...view,
                    conversationPage: result.page + 1,
                  })}
                  className={linkClass}
                >
                  Página siguiente
                </Link>
              ) : null}
            </nav>
          ) : null}
          <p className="mt-4 text-sm text-muted">
            Fechas en {result.timezone}.
          </p>
        </>
      )}
    </>
  );
}

// Skeleton con la forma de la sección mientras llega la actividad (Screens, reglas comunes).
export function ClientConversationsSkeleton() {
  return (
    <div aria-hidden="true" className="mt-4 flex flex-col gap-3">
      <div className="h-10 w-48 animate-pulse rounded-md bg-surface-muted" />
      <div className={`h-32 animate-pulse ${cardClass} bg-surface-muted`} />
    </div>
  );
}
