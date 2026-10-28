import Link from "next/link";
import type { ConversationSummary } from "@/modules/conversations";
import {
  cardClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Avatar } from "@/app/_components/avatar";
import { Icon } from "@/app/_components/icons";
import { StatusBadge as Badge } from "@/app/_components/status-badge";
import { formatShortDateTime } from "@/app/_format/date-time";
import {
  AGENT_ACTIVE_LABEL,
  CHANNEL_LABEL,
  HUMAN_ATTENTION_LABEL,
  NO_CLIENT_TEXT,
} from "./messages";
import { StatusBadge } from "./status-badge";

// Conversaciones de la pantalla 8 y de la sección de la 7 (wireframes 07 y 08): tabla en
// escritorio y tarjetas en móvil; la versión oculta no entra al árbol de accesibilidad. Sin
// contenido de mensajes ni teléfono. Componente de servidor. Desde la brief-15.1, con avatar del
// cliente y un ícono genérico de canal junto a su nombre (D-8). Desde la brief-16.3, la marca
// «Agente pausado» junto al estado (D-4). Desde la 24.3, cada fila dice «Atención humana» o «Agente
// activo» (brief-24.3, D-3), y la tarjeta del teléfono lleva el avatar (D-9).

// Texto con ícono decorativo: el color acompaña, no informa solo.
export function AgentBadge({ paused }: { paused: boolean }) {
  return paused ? (
    <Badge tone="warning" icon="circlePause">
      {HUMAN_ATTENTION_LABEL}
    </Badge>
  ) : (
    <Badge tone="neutral" icon="power">
      {AGENT_ACTIVE_LABEL}
    </Badge>
  );
}

export function ConversationTable({
  conversations,
  timeZone,
  caption,
  showClient,
}: {
  conversations: ConversationSummary[];
  timeZone: string;
  caption: string;
  showClient: boolean;
}) {
  const last = (value: Date | null) =>
    value ? formatShortDateTime(value, timeZone) : "—";
  // El enlace al detalle lleva un nombre propio aunque la conversación no tenga cliente.
  const linkText = (conversation: ConversationSummary) =>
    showClient
      ? (conversation.client?.name ?? NO_CLIENT_TEXT)
      : `Conversación del ${formatShortDateTime(conversation.startedAt, timeZone)}`;

  return (
    <>
      <div className={`mt-6 hidden overflow-hidden md:block ${cardClass}`}>
        <table className="w-full border-collapse text-left text-[0.9375rem]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={tableHeadCellClass}>
                {showClient ? "Cliente" : "Conversación"}
              </th>
              <th scope="col" className={tableHeadCellClass}>
                Canal
              </th>
              <th scope="col" className={tableHeadCellClass}>
                Estado
              </th>
              {showClient ? (
                <th scope="col" className={tableHeadCellClass}>
                  Inicio
                </th>
              ) : null}
              <th scope="col" className={tableHeadCellClass}>
                Último mensaje
              </th>
              <th scope="col" className={`${tableHeadCellClass} text-right`}>
                Mensajes
              </th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((conversation) => (
              <tr key={conversation.id}>
                <td className={`${tableCellClass} font-semibold`}>
                  <span className="flex items-center gap-3">
                    {showClient && conversation.client ? (
                      <Avatar name={conversation.client.name} />
                    ) : null}
                    <Link
                      href={`/conversaciones/${conversation.id}`}
                      className={linkClass}
                    >
                      {linkText(conversation)}
                    </Link>
                  </span>
                </td>
                <td className={tableCellClass}>
                  <span className="flex items-center gap-2">
                    <Icon
                      name="messageCircle"
                      className="size-4 text-success"
                    />
                    {CHANNEL_LABEL[conversation.channel]}
                  </span>
                </td>
                <td className={tableCellClass}>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={conversation.status} />
                    <AgentBadge paused={conversation.agentPausedAt !== null} />
                  </span>
                </td>
                {showClient ? (
                  <td className={`${tableCellClass} whitespace-nowrap`}>
                    {formatShortDateTime(conversation.startedAt, timeZone)}
                  </td>
                ) : null}
                <td className={`${tableCellClass} whitespace-nowrap`}>
                  {last(conversation.lastMessageAt)}
                </td>
                <td className={`${tableCellClass} text-right tabular-nums`}>
                  {conversation.messageCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={caption} className="mt-6 flex flex-col gap-3 md:hidden">
        {conversations.map((conversation) => (
          <li key={conversation.id} className={`${cardClass} p-4`}>
            <p className="flex items-center gap-3 font-semibold">
              {showClient && conversation.client ? (
                <Avatar name={conversation.client.name} />
              ) : null}
              <Link
                href={`/conversaciones/${conversation.id}`}
                className={`${linkClass} min-w-0 break-words`}
              >
                {linkText(conversation)}
              </Link>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={conversation.status} />
              <AgentBadge paused={conversation.agentPausedAt !== null} />
              <span>{CHANNEL_LABEL[conversation.channel]}</span>
            </p>
            <p className="mt-1 text-sm text-muted tabular-nums">
              Último {last(conversation.lastMessageAt)} ·{" "}
              {conversation.messageCount}{" "}
              {conversation.messageCount === 1 ? "mensaje" : "mensajes"}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
