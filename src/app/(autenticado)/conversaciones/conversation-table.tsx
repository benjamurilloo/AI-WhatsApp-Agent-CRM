import Link from "next/link";
import type { ConversationSummary } from "@/modules/conversations";
import {
  cardClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatShortDateTime } from "@/app/_format/date-time";
import { CHANNEL_LABEL, NO_CLIENT_TEXT } from "./messages";
import { StatusBadge } from "./status-badge";

// Conversaciones de la pantalla 8 y de la sección de la 7 (wireframes 07 y 08): tabla en
// escritorio y tarjetas en móvil; la versión oculta no entra al árbol de accesibilidad. Sin
// contenido de mensajes ni teléfono. Componente de servidor.
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
                  <Link
                    href={`/conversaciones/${conversation.id}`}
                    className={linkClass}
                  >
                    {linkText(conversation)}
                  </Link>
                </td>
                <td className={tableCellClass}>
                  {CHANNEL_LABEL[conversation.channel]}
                </td>
                <td className={tableCellClass}>
                  <StatusBadge status={conversation.status} />
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
            <p className="font-semibold">
              <Link
                href={`/conversaciones/${conversation.id}`}
                className={linkClass}
              >
                {linkText(conversation)}
              </Link>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={conversation.status} />
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
