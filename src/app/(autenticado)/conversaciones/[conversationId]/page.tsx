import type { Metadata } from "next";
import Link from "next/link";
import {
  CONVERSATION_STATUSES,
  getConversation,
  listConversationMessages,
} from "@/modules/conversations";
import { requireSession } from "@/app/_auth/session";
import { Avatar } from "@/app/_components/avatar";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { DetailList } from "@/app/_components/detail-list";
import { linkClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import {
  CHANNEL_LABEL,
  CONVERSATION_NOT_FOUND_MESSAGE,
  FORBIDDEN_PAGE_MESSAGE,
  NO_CLIENT_TEXT,
  NO_MESSAGES_MESSAGE,
  STATUS_LABEL,
} from "../messages";
import { StatusBadge } from "../status-badge";
import { StatusForm } from "./status-form";
import { Timeline } from "./timeline";
import { toTimelineItems } from "./timeline-items";

export const metadata: Metadata = {
  title: "Conversación — AI WhatsApp Agent CRM",
};

const TITLE = "Conversación";

// Pantalla 9 (wireframe 09): cabecera sin teléfono, timeline con los 50 mensajes más recientes y
// cambio de estado solo para admin (brief-6.4). Un viewer no recibe el formulario. Presentación
// de la 15.4: los mensajes como burbujas y, al costado, los datos de la conversación y el cambio
// de estado. Sin campo para escribir ni tildes de leído (brief-15.4, D-7).
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const context = await requireSession();
  const { conversationId } = await params;

  const [found, timeline] = await Promise.all([
    getConversation(context, conversationId),
    listConversationMessages(context, conversationId, { before: "" }),
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
        subtitle={
          <p>
            {CHANNEL_LABEL[conversation.channel]} · Estado:{" "}
            <span className="font-semibold text-foreground">
              {STATUS_LABEL[conversation.status]}
            </span>
            {conversation.client ? (
              <>
                {" · "}
                <Link
                  href={`/clientes/${conversation.client.id}`}
                  className={linkClass}
                >
                  Ver cliente
                </Link>
              </>
            ) : null}
          </p>
        }
      />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <SectionCard
          id="mensajes-titulo"
          title="Mensajes"
          icon="messagesSquare"
          className="lg:col-span-2"
        >
          {timeline.messages.length === 0 ? (
            <p>{NO_MESSAGES_MESSAGE}</p>
          ) : (
            <Timeline
              conversationId={conversation.id}
              initialItems={toTimelineItems(timeline.messages, timeZone)}
              initialBefore={timeline.before}
            />
          )}
          <p className="mt-4 text-sm text-muted">Horas en {timeZone}.</p>
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard
            id="conversacion-titulo"
            title="Conversación"
            icon="info"
          >
            <DetailList
              items={[
                {
                  label: "Cliente",
                  value: conversation.client?.name ?? NO_CLIENT_TEXT,
                },
                {
                  label: "Estado",
                  value: <StatusBadge status={conversation.status} />,
                },
                {
                  label: "Canal",
                  value: CHANNEL_LABEL[conversation.channel],
                },
                {
                  label: "Iniciada",
                  value: formatShortDateTime(conversation.startedAt, timeZone),
                },
                {
                  label: "Último mensaje",
                  value: conversation.lastMessageAt
                    ? formatShortDateTime(conversation.lastMessageAt, timeZone)
                    : null,
                },
              ]}
            />
          </SectionCard>

          {isAdmin ? (
            <SectionCard
              id="estado-titulo"
              title="Cambiar estado"
              icon="circleCheck"
            >
              <StatusForm
                conversationId={conversation.id}
                current={conversation.status}
                options={CONVERSATION_STATUSES.map((status) => ({
                  value: status,
                  label: STATUS_LABEL[status],
                }))}
              />
            </SectionCard>
          ) : null}
        </div>
      </div>
    </main>
  );
}
