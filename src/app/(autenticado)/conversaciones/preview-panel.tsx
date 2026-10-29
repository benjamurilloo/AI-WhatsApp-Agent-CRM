import Link from "next/link";
import {
  getConversation,
  listConversationTimeline,
} from "@/modules/conversations";
import type { AuthContext } from "@/modules/organizations";
import { Avatar } from "@/app/_components/avatar";
import { cardClass, primaryLinkClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { readOpenRepair, RepairLine } from "./[conversationId]/client-context";
import { Timeline } from "./[conversationId]/timeline";
import { toTimelineItems } from "./[conversationId]/timeline-items";
import { AgentBadge } from "./conversation-table";
import {
  CHANNEL_LABEL,
  CONVERSATION_NOT_FOUND_MESSAGE,
  NO_CLIENT_TEXT,
  NO_MESSAGES_MESSAGE,
  OPEN_CONVERSATION_LABEL,
  PREVIEW_EMPTY_TEXT,
  PREVIEW_HINT,
  PREVIEW_VIEWER_HINT,
  PREVIEW_TITLE,
} from "./messages";
import { StatusBadge } from "./status-badge";

// El panel de vista previa de la bandeja en escritorio (brief-24.3.1, D-2; mockup 01): la
// conversación elegida con `?ver=`, para los dos roles y solo para leer. Lee aparte, como la
// pantalla 9, las últimas 8 entradas del hilo unido del cliente (D-2 decía 20; 8 entran en la pantalla
// como en 01, desvío declarado en el §Cierre): la consulta de la lista sigue sin traer ningún cuerpo
// (FR-CONV-01, enmendado). Sin elegir, no lee ningún hilo (D-3). Componente de servidor: no llega un
// teléfono, un email ni un importe.

const PREVIEW_ENTRIES = 8;

const panelClass = `${cardClass} flex min-h-96 flex-col gap-4 p-5`;

function PreviewFooter({ text }: { text: string }) {
  return (
    <div className="mt-auto flex flex-col items-center gap-1 border-t border-border pt-6 text-center">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full bg-surface-muted text-muted"
      >
        <Icon name="eye" className="size-5" />
      </span>
      <p className="font-semibold">{PREVIEW_TITLE}</p>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

export async function PreviewPanel({
  context,
  selectedId,
}: {
  context: AuthContext;
  selectedId: string;
}) {
  if (selectedId === "") {
    return (
      <section aria-label={PREVIEW_TITLE} className={panelClass}>
        <PreviewFooter text={PREVIEW_EMPTY_TEXT} />
      </section>
    );
  }

  const [found, timeline] = await Promise.all([
    getConversation(context, selectedId),
    listConversationTimeline(context, selectedId, {
      before: "",
      scope: "client",
      limit: PREVIEW_ENTRIES,
    }),
  ]);
  if (!found.ok || !timeline.ok) {
    return (
      <section aria-label={PREVIEW_TITLE} className={panelClass}>
        <p>{CONVERSATION_NOT_FOUND_MESSAGE}</p>
        <PreviewFooter text={PREVIEW_EMPTY_TEXT} />
      </section>
    );
  }
  const conversation = found.conversation;
  const name = conversation.client?.name ?? NO_CLIENT_TEXT;
  const repair = conversation.client
    ? await readOpenRepair(context, conversation.client.id)
    : null;
  const items = toTimelineItems(timeline.entries, timeline.timezone);

  return (
    <section aria-labelledby="vista-previa-titulo" className={panelClass}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {conversation.client ? (
            <Avatar
              name={conversation.client.name}
              tone="soft"
              className="size-12 text-base"
            />
          ) : null}
          <div className="min-w-0">
            <h2
              id="vista-previa-titulo"
              className="truncate text-lg font-bold tracking-tight"
            >
              <span className="sr-only">{PREVIEW_TITLE}: </span>
              {name}
            </h2>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Icon name="messageCircle" className="size-4 text-success" />
              {CHANNEL_LABEL[conversation.channel]}
            </p>
          </div>
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={conversation.status} />
            <AgentBadge paused={conversation.agentPausedAt !== null} />
          </span>
        </div>
        <Link
          href={`/conversaciones/${conversation.id}`}
          className={primaryLinkClass}
        >
          {OPEN_CONVERSATION_LABEL}
        </Link>
      </header>

      {repair ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-lg bg-surface-muted text-primary"
            >
              <Icon name="wrench" className="size-5" />
            </span>
            <div>
              <RepairLine order={repair} />
            </div>
          </div>
          <Link
            href={`/reparaciones/${repair.id}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Ver reparación
            <Icon name="arrowLeft" className="size-4 rotate-180" />
          </Link>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p>{NO_MESSAGES_MESSAGE}</p>
      ) : (
        <Timeline
          conversationId={conversation.id}
          initialItems={items}
          // Solo las últimas: el hilo entero está en «Abrir conversación».
          initialBefore={null}
          clientName={conversation.client?.name ?? null}
          separators={{}}
        />
      )}

      <PreviewFooter
        text={context.role === "admin" ? PREVIEW_HINT : PREVIEW_VIEWER_HINT}
      />
    </section>
  );
}
