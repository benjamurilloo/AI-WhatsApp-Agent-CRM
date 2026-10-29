import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getConversation,
  getConversationThread,
  listConversationTimeline,
  NOTE_MAX_LENGTH,
  type ConversationTimelineEntry,
} from "@/modules/conversations";
import { requireSession } from "@/app/_auth/session";
import { Avatar } from "@/app/_components/avatar";
import { HeaderIcon } from "@/app/_components/detail-header";
import { cardClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import {
  calendarDayIn,
  formatDate,
  formatShortDateTime,
  formatTime,
} from "@/app/_format/date-time";
import {
  agentPausedSinceText,
  BACK_TO_CHATS_LABEL,
  BACK_TO_LIST_LABEL,
  CHANNEL_LABEL,
  CONVERSATION_NOT_FOUND_MESSAGE,
  conversationSeparatorText,
  FORBIDDEN_PAGE_MESSAGE,
  NO_CLIENT_TEXT,
  NO_MESSAGES_MESSAGE,
} from "../messages";
import { StatusBadge } from "../status-badge";
import { AgentStrip } from "./agent-strip";
import { ClientContext } from "./client-context";
import { ContextDisclosure } from "./context-disclosure";
import { NoteForm } from "./note-form";
import { StatusActions } from "./status-actions";
import { Timeline } from "./timeline";
import { toTimelineItems } from "./timeline-items";

export const metadata: Metadata = {
  title: "Conversación — AI WhatsApp Agent CRM",
};

const TITLE = "Conversación";

// La hora de la última respuesta del agente del hilo cargado, para «Actividad del agente»
// (brief-24.3.1, D-4): solo la hora si fue hoy.
function lastAgentReply(
  entries: ConversationTimelineEntry[],
  timeZone: string,
): string | null {
  const last = entries.findLast(
    (entry) =>
      entry.type === "message" &&
      entry.direction === "outbound" &&
      entry.sentBy === "agent",
  );
  if (!last || last.type !== "message") return null;
  return calendarDayIn(timeZone, last.sentAt) === calendarDayIn(timeZone)
    ? formatTime(last.sentAt, timeZone)
    : formatShortDateTime(last.sentAt, timeZone);
}

// Pantalla 9 (wireframe 09): cabecera sin teléfono, timeline con las 50 entradas más recientes y
// cambio de estado solo para admin (brief-6.4). Un viewer no recibe los formularios. Sin campo para
// escribir al cliente ni tildes de leído (brief-15.4, D-7; ADR 0017). Desde la 24.3, al patrón de
// la v2 (brief-24.3): el estado en el encabezado con «Cerrar conversación» o «Reabrir» y «Más
// acciones» (D-7), la franja del agente para los dos roles con tomar y reactivar para admin (D-7),
// las notas intercaladas en el hilo (D-5), la nota interna al pie para admin (D-8) y el contexto
// del cliente al costado, o con «Ver contexto» en el teléfono (D-6 y D-9). Desde la 24.3.1, el hilo
// une las conversaciones del cliente (brief-24.3.1, D-1): una anterior redirige a la más reciente,
// con el ancla de su separador, y las acciones son de la más reciente. La forma es la del mockup 02:
// la flecha con «Conversaciones», y el encabezado, la franja, el hilo y la nota en una tarjeta.
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const context = await requireSession();
  const { conversationId } = await params;

  const thread = await getConversationThread(context, conversationId);
  if (thread.ok && thread.latestId !== conversationId.toLowerCase()) {
    redirect(
      `/conversaciones/${thread.latestId}#conversacion-${conversationId.toLowerCase()}`,
    );
  }
  const [found, timeline] = thread.ok
    ? await Promise.all([
        getConversation(context, thread.latestId),
        listConversationTimeline(context, thread.latestId, {
          before: "",
          scope: "client",
        }),
      ])
    : [thread, thread];
  if (!found.ok || !timeline.ok || !thread.ok) {
    const code = !found.ok ? found.code : !timeline.ok ? timeline.code : null;
    if (code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={CONVERSATION_NOT_FOUND_MESSAGE}
        back={{ href: "/conversaciones", label: "Volver" }}
      />
    );
  }

  const conversation = found.conversation;
  const isAdmin = context.role === "admin";
  const title = conversation.client?.name ?? NO_CLIENT_TEXT;
  const timeZone = timeline.timezone;
  const items = toTimelineItems(timeline.entries, timeZone);
  const last = items.at(-1);
  const separators = Object.fromEntries(
    thread.conversations.map((item) => [
      item.id,
      conversationSeparatorText(
        formatDate(item.startedAt, timeZone),
        item.status,
      ),
    ]),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <p>
        <Link
          href="/conversaciones"
          className="inline-flex items-center gap-3 rounded-lg text-2xl font-bold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Icon name="arrowLeft" className="size-6 text-muted" />
          <span className="sr-only">Volver a </span>
          <span className="lg:hidden">{BACK_TO_CHATS_LABEL}</span>
          <span className="max-lg:hidden">{BACK_TO_LIST_LABEL}</span>
        </Link>
      </p>

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <ContextDisclosure>
            <ClientContext
              context={context}
              clientId={conversation.client?.id ?? null}
              timeZone={timeZone}
              lastAgentReplyAt={lastAgentReply(timeline.entries, timeZone)}
            />
          </ContextDisclosure>
        </div>

        <section
          aria-labelledby="conversacion-titulo"
          className={`${cardClass} flex min-w-0 flex-col gap-5 p-4 sm:p-6 lg:col-start-1 lg:row-start-1`}
        >
          <header className="flex flex-wrap items-start justify-between gap-4">
            {/* Con lugar, las acciones van a la derecha del nombre, como en 02. */}
            <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-3 sm:gap-4">
              {conversation.client ? (
                <Avatar
                  name={conversation.client.name}
                  tone="soft"
                  className="size-11 text-base sm:size-14 sm:text-xl"
                />
              ) : (
                <HeaderIcon name="messageCircle" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1
                    id="conversacion-titulo"
                    className="text-xl font-bold tracking-tight break-words sm:text-2xl"
                  >
                    {title}
                  </h1>
                  <StatusBadge status={conversation.status} />
                </div>
                {/* En el teléfono, sin el subtítulo, como en 04. */}
                <p className="mt-1 text-sm text-muted max-sm:hidden">
                  <Icon
                    name="messageCircle"
                    className="mr-1.5 inline size-4 align-[-3px] text-success"
                  />
                  {CHANNEL_LABEL[conversation.channel]} · Iniciada el{" "}
                  {formatShortDateTime(conversation.startedAt, timeZone)}
                  {conversation.lastMessageAt ? (
                    <>
                      {" "}
                      · Último mensaje el{" "}
                      {formatShortDateTime(
                        conversation.lastMessageAt,
                        timeZone,
                      )}
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            {isAdmin ? (
              <StatusActions
                conversationId={conversation.id}
                current={conversation.status}
              />
            ) : null}
          </header>

          <AgentStrip
            conversationId={conversation.id}
            pausedSince={
              conversation.agentPausedAt
                ? agentPausedSinceText(
                    formatShortDateTime(conversation.agentPausedAt, timeZone),
                  )
                : null
            }
            canPause={conversation.status !== "closed"}
            canChange={isAdmin}
          />

          <div>
            {items.length === 0 ? (
              <p>{NO_MESSAGES_MESSAGE}</p>
            ) : (
              // Una nota nueva cambia la última entrada: el hilo vuelve a empezar desde ella.
              <Timeline
                key={last ? `${last.type}-${last.id}` : "vacio"}
                conversationId={conversation.id}
                initialItems={items}
                initialBefore={timeline.before}
                clientName={conversation.client?.name ?? null}
                separators={separators}
              />
            )}
            <p className="mt-4 text-sm text-muted">Horas en {timeZone}.</p>
            {isAdmin ? (
              <NoteForm
                conversationId={conversation.id}
                maxLength={NOTE_MAX_LENGTH}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
