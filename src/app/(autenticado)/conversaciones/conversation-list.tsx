import Link from "next/link";
import type { ConversationSummary } from "@/modules/conversations";
import { Avatar } from "@/app/_components/avatar";
import { cardClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { calendarDayIn, formatDate, formatTime } from "@/app/_format/date-time";
import { AgentBadge } from "./conversation-table";
import { NO_CLIENT_TEXT } from "./messages";
import { StatusBadge } from "./status-badge";

// La bandeja como lista de chats (brief-24.3.1, D-1 y D-2; mockups 01 y 03): una fila por cliente,
// con su avatar, su nombre, la hora del último mensaje y las insignias de estado y de agente, sin
// el texto de ningún mensaje ni el teléfono (FR-CONV-01). En escritorio, una fila abre el panel de
// vista previa con `?ver=` y la elegida lleva aria-current; en el teléfono, la tarjeta abre el
// hilo. La versión oculta no entra al árbol de accesibilidad. Componente de servidor.

// La hora si fue hoy, como en WhatsApp; si no, el día y el mes.
export function lastMessageText(value: Date | null, timeZone: string): string {
  if (value === null) return "—";
  return calendarDayIn(timeZone, value) === calendarDayIn(timeZone)
    ? formatTime(value, timeZone)
    : formatDate(value, timeZone).slice(0, 5);
}

function Row({
  conversation,
  timeZone,
}: {
  conversation: ConversationSummary;
  timeZone: string;
}) {
  const name = conversation.client?.name ?? NO_CLIENT_TEXT;
  return (
    <>
      {conversation.client ? (
        <Avatar
          name={conversation.client.name}
          tone="soft"
          className="size-12 text-base"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-muted text-muted"
        >
          <Icon name="user" className="size-5" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-semibold text-foreground">{name}</span>
          <span className="shrink-0 text-sm text-muted tabular-nums">
            {lastMessageText(conversation.lastMessageAt, timeZone)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={conversation.status} />
          <AgentBadge paused={conversation.agentPausedAt !== null} />
        </span>
      </span>
    </>
  );
}

export function ConversationList({
  conversations,
  timeZone,
  selectedId,
  previewHref,
}: {
  conversations: ConversationSummary[];
  timeZone: string;
  selectedId: string;
  // El enlace de una fila al panel de vista previa, con los filtros de la bandeja.
  previewHref: (conversationId: string) => string;
}) {
  return (
    <>
      <ul
        aria-label="Conversaciones de la organización"
        className={`hidden flex-col p-2 lg:flex ${cardClass}`}
      >
        {conversations.map((conversation) => {
          const selected = conversation.id === selectedId;
          return (
            <li
              key={conversation.id}
              className="border-b border-border last:border-b-0"
            >
              <Link
                href={previewHref(conversation.id)}
                aria-current={selected ? "true" : undefined}
                scroll={false}
                className={`my-1 flex items-center gap-3 rounded-xl px-3 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${selected ? "bg-primary-soft/70" : "hover:bg-surface-muted"}`}
              >
                <Row conversation={conversation} timeZone={timeZone} />
                <Icon name="chevronRight" className="size-5 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>

      <ul
        aria-label="Conversaciones de la organización"
        className="flex flex-col gap-3 lg:hidden"
      >
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Link
              href={`/conversaciones/${conversation.id}`}
              className={`flex items-center gap-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${cardClass}`}
            >
              <Row conversation={conversation} timeZone={timeZone} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
