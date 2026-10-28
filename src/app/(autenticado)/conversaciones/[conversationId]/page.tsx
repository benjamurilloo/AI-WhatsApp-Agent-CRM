import type { Metadata } from "next";
import {
  getConversation,
  listConversationTimeline,
  NOTE_MAX_LENGTH,
} from "@/modules/conversations";
import { requireSession } from "@/app/_auth/session";
import { Avatar } from "@/app/_components/avatar";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import {
  agentPausedSinceText,
  CHANNEL_LABEL,
  CONVERSATION_NOT_FOUND_MESSAGE,
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

// Pantalla 9 (wireframe 09): cabecera sin teléfono, timeline con las 50 entradas más recientes y
// cambio de estado solo para admin (brief-6.4). Un viewer no recibe los formularios. Sin campo para
// escribir al cliente ni tildes de leído (brief-15.4, D-7; ADR 0017). Desde la 24.3, al patrón de
// la v2 (brief-24.3): el estado en el encabezado con «Cerrar conversación» o «Reabrir» y «Más
// acciones» (D-7), la franja del agente para los dos roles con tomar y reactivar para admin (D-7),
// las notas intercaladas en el hilo (D-5), la nota interna al pie para admin (D-8) y el contexto
// del cliente al costado, o con «Ver contexto» en el teléfono (D-6 y D-9).
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const context = await requireSession();
  const { conversationId } = await params;

  const [found, timeline] = await Promise.all([
    getConversation(context, conversationId),
    listConversationTimeline(context, conversationId, { before: "" }),
  ]);
  if (!found.ok || !timeline.ok) {
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/conversaciones" label="Volver a conversaciones" />

      <DetailHeader
        title={title}
        leading={
          conversation.client ? (
            <Avatar
              name={conversation.client.name}
              className="size-14 text-xl sm:size-16 sm:text-2xl"
            />
          ) : (
            <HeaderIcon name="messageCircle" />
          )
        }
        badges={<StatusBadge status={conversation.status} />}
        subtitle={
          <p>
            {CHANNEL_LABEL[conversation.channel]} · Iniciada el{" "}
            {formatShortDateTime(conversation.startedAt, timeZone)}
            {conversation.lastMessageAt ? (
              <>
                {" "}
                · Último mensaje el{" "}
                {formatShortDateTime(conversation.lastMessageAt, timeZone)}
              </>
            ) : null}
          </p>
        }
        primary={
          isAdmin ? (
            <StatusActions
              conversationId={conversation.id}
              current={conversation.status}
            />
          ) : null
        }
      />

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

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-start-3 lg:row-start-1">
          <ContextDisclosure>
            <ClientContext
              context={context}
              clientId={conversation.client?.id ?? null}
              timeZone={timeZone}
            />
          </ContextDisclosure>
        </div>

        <SectionCard
          id="mensajes-titulo"
          title="Mensajes"
          icon="messagesSquare"
          className="min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-1"
        >
          {items.length === 0 ? (
            <p>{NO_MESSAGES_MESSAGE}</p>
          ) : (
            // Una nota nueva cambia la última entrada: el hilo vuelve a empezar desde ella.
            <Timeline
              key={last ? `${last.type}-${last.id}` : "vacio"}
              conversationId={conversation.id}
              initialItems={items}
              initialBefore={timeline.before}
            />
          )}
          <p className="mt-4 text-sm text-muted">Horas en {timeZone}.</p>
          {isAdmin ? (
            <NoteForm
              conversationId={conversation.id}
              maxLength={NOTE_MAX_LENGTH}
            />
          ) : null}
        </SectionCard>
      </div>
    </main>
  );
}
