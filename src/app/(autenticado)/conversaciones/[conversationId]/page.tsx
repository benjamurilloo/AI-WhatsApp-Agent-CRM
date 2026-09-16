import type { Metadata } from "next";
import Link from "next/link";
import {
  CONVERSATION_STATUSES,
  getConversation,
  listConversationMessages,
} from "@/modules/conversations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  linkClass,
  pageTitleClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import {
  CHANNEL_LABEL,
  CONVERSATION_NOT_FOUND_MESSAGE,
  FORBIDDEN_PAGE_MESSAGE,
  NO_CLIENT_TEXT,
  NO_MESSAGES_MESSAGE,
  STATUS_LABEL,
} from "../messages";
import { StatusForm } from "./status-form";
import { Timeline } from "./timeline";
import { toTimelineItems } from "./timeline-items";

export const metadata: Metadata = {
  title: "Conversación — AI WhatsApp Agent CRM",
};

const TITLE = "Conversación";

// Pantalla 9 (wireframe 09): cabecera sin teléfono, timeline con los 50 mensajes más recientes y
// cambio de estado solo para admin (brief-6.4). Un viewer no recibe el formulario.
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p>
        <Link href="/conversaciones" className={linkClass}>
          Volver a conversaciones
        </Link>
      </p>

      <h1 className={`mt-4 ${pageTitleClass}`}>{title}</h1>
      <p className="mt-1 text-muted">
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

      {isAdmin ? (
        <section
          aria-labelledby="estado-titulo"
          className={`mt-6 ${cardClass} p-6`}
        >
          <h2 id="estado-titulo" className={sectionTitleClass}>
            Cambiar estado
          </h2>
          <div className="mt-3">
            <StatusForm
              conversationId={conversation.id}
              current={conversation.status}
              options={CONVERSATION_STATUSES.map((status) => ({
                value: status,
                label: STATUS_LABEL[status],
              }))}
            />
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="mensajes-titulo"
        className={`mt-6 ${cardClass} p-6`}
      >
        <h2 id="mensajes-titulo" className={sectionTitleClass}>
          Mensajes
        </h2>
        <div className="mt-4">
          {timeline.messages.length === 0 ? (
            <p>{NO_MESSAGES_MESSAGE}</p>
          ) : (
            <Timeline
              conversationId={conversation.id}
              initialItems={toTimelineItems(
                timeline.messages,
                timeline.timezone,
              )}
              initialBefore={timeline.before}
            />
          )}
        </div>
        <p className="mt-4 text-sm text-muted">Horas en {timeline.timezone}.</p>
      </section>
    </main>
  );
}
