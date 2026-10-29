import Link from "next/link";
import {
  CONVERSATIONS_PAGE_SIZE,
  type ClientActivityResult,
} from "@/modules/conversations";
import {
  labelClass,
  linkClass,
  secondaryButtonClass,
  selectClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { StatTile } from "@/app/_components/stat-tile";
import { ConversationTable } from "@/app/(autenticado)/conversaciones/conversation-table";
import {
  clientSectionsHref,
  type ClientSectionsView,
} from "@/app/(autenticado)/conversaciones/filters";
import {
  NO_CLIENT_CONVERSATION_RESULTS_MESSAGE,
  NO_CLIENT_CONVERSATIONS_MESSAGE,
} from "@/app/(autenticado)/conversaciones/messages";
import { daysSinceText } from "./stats";

// Actividad del cliente en la pantalla 7 (wireframe 07; brief-6.4, D-4). La página crea la
// promesa sin esperarla y cada parte la espera. Desde la 24.4.1, sin Suspense: con él, sin
// JavaScript quedaba el esqueleto (brief-24.4.1, AC-1). Sin contenido de mensajes.

type Activity = Promise<ClientActivityResult>;

// Estadísticas del cliente (brief-15.4, D-6): la cantidad de conversaciones, sin filtro de
// estado, y los días desde la última interacción. Sin el total de mensajes: exigiría una consulta
// nueva. Desde la 24.4.1, arriba de las conversaciones en la pestaña Actividad.
export async function ClientStats({ activity }: { activity: Activity }) {
  const result = await activity;
  if (!result.ok) return <p className="text-sm text-muted">—</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StatTile
        icon="messageCircle"
        value={String(result.total)}
        label={result.total === 1 ? "Conversación" : "Conversaciones"}
      />
      <StatTile
        icon="calendar"
        value={
          result.lastInteraction
            ? daysSinceText(result.lastInteraction.at, new Date())
            : "—"
        }
        label="Desde la última interacción"
      />
    </div>
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
        className="flex flex-wrap items-end gap-3"
      >
        {/* El filtro vuelve a la pestaña Actividad (brief-24.4.1, AC-7). */}
        <input type="hidden" name="pestana" value="actividad" />
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
          <Icon name="filter" className="size-4" />
          Filtrar
        </button>
        {filtered ? (
          <Link href={clearHref} className={`${linkClass} py-2`}>
            Limpiar filtro
          </Link>
        ) : null}
        {result.clientHasConversations ? (
          <Link
            href={`/conversaciones?estado=todos&cliente=${clientId}`}
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
          <Pagination
            label="Paginación de conversaciones"
            className="mt-4"
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
            hrefFor={(target) =>
              clientSectionsHref(clientId, {
                ...view,
                conversationPage: target,
              })
            }
          />
          <p className="mt-4 text-sm text-muted">
            Fechas en {result.timezone}.
          </p>
        </>
      )}
    </>
  );
}
