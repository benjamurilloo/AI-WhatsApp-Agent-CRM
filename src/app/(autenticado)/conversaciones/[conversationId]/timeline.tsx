"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/app/_components/avatar";
import {
  formMessageClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import { loadOlderMessagesAction } from "../actions";
import {
  EMPTY_BODY_TEXT,
  ERASED_NOTE_TEXT,
  NOTE_LABEL,
  NOTE_ONLY_TEAM_TEXT,
  startsConversation,
  startsDay,
  type MessageTimelineItem,
  type TimelineItem,
} from "../messages";

// Timeline de la pantalla 9 (wireframe 09): lista semántica del más antiguo al más reciente.
// "Cargar mensajes anteriores" agrega 50 arriba sin mover la lectura (D-3): se mide el primer
// mensaje visible antes y después de agregarlos, y se compensa la diferencia. El cuerpo se
// renderiza como texto: React lo escapa, sin HTML ni enlaces automáticos. Desde la 15.4, los
// mensajes son burbujas: el texto que dice quién envía se conserva, así el color no informa solo
// (brief-15.4, D-7). Desde la 24.3, las notas internas van intercaladas por fecha (brief-24.3,
// D-5): se distinguen por el candado y el texto «Nota interna» y «Solo equipo», no solo por el
// color. Desde la 24.3.1, la forma de los mockups 02 y 04 (brief-24.3.1): la fecha en una píldora,
// el avatar de quien escribe, las burbujas del negocio en lila claro con la hora abajo, y un
// separador entre las conversaciones del hilo unido del cliente (D-1). Quién escribe y la hora van
// primero para un lector de pantalla, como antes; lo visible los repite fuera del árbol.

// El id del elemento: un mensaje y una nota son de tablas distintas.
const elementId = (item: TimelineItem) =>
  item.type === "message" ? `mensaje-${item.id}` : `nota-${item.id}`;

type Anchor = { id: string; top: number };

const OUTBOUND_AVATAR_ICON: Record<
  Exclude<MessageTimelineItem["avatar"], "client">,
  IconName
> = {
  agent: "bot",
  person: "user",
  business: "building",
};

function MessageAvatar({
  item,
  clientName,
}: {
  item: MessageTimelineItem;
  clientName: string | null;
}) {
  if (item.avatar === "client" && clientName) {
    return <Avatar name={clientName} tone="soft" className="size-9 text-xs" />;
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-on-primary-soft"
    >
      <Icon
        name={
          item.avatar === "client" ? "user" : OUTBOUND_AVATAR_ICON[item.avatar]
        }
        className="size-4"
      />
    </span>
  );
}

export function Timeline({
  conversationId,
  initialItems,
  initialBefore,
  clientName,
  separators,
}: {
  conversationId: string;
  initialItems: TimelineItem[];
  initialBefore: string | null;
  // Nombre del cliente para su avatar; null sin cliente.
  clientName: string | null;
  // El texto del separador de cada conversación del hilo unido, por id (D-1).
  separators: Record<string, string>;
}) {
  const [items, setItems] = useState(initialItems);
  const [before, setBefore] = useState(initialBefore);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const anchor = useRef<Anchor | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const united = Object.keys(separators).length > 1;

  useLayoutEffect(() => {
    const saved = anchor.current;
    if (!saved) return;
    anchor.current = null;
    const element = document.getElementById(saved.id);
    if (element) {
      window.scrollBy(0, element.getBoundingClientRect().top - saved.top);
    }
    // Sin botón, el foco pasaría al documento: queda en la lista.
    if (before === null) listRef.current?.focus();
  }, [items, before]);

  function loadOlder() {
    if (!before) return;
    setError(null);
    startTransition(async () => {
      const result = await loadOlderMessagesAction(conversationId, before);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const first = items[0];
      const element = first ? document.getElementById(elementId(first)) : null;
      anchor.current =
        first && element
          ? { id: elementId(first), top: element.getBoundingClientRect().top }
          : null;
      setItems((current) => [...result.items, ...current]);
      setBefore(result.before);
      setAnnouncement(
        result.items.length === 1
          ? "Se cargó 1 entrada anterior."
          : `Se cargaron ${result.items.length} entradas anteriores.`,
      );
    });
  }

  const anchored = new Set<string>();
  return (
    <div className="flex flex-col gap-4">
      {before ? (
        <p className="text-center">
          <button
            type="button"
            onClick={loadOlder}
            disabled={pending}
            className={secondaryButtonClass}
          >
            {pending
              ? "Cargando mensajes anteriores…"
              : "Cargar mensajes anteriores"}
          </button>
        </p>
      ) : null}
      <div aria-live="polite" aria-atomic="true">
        {error ? <p className={formMessageClass}>{error}</p> : null}
        <p className="sr-only">{announcement}</p>
      </div>
      <ol
        ref={listRef}
        tabIndex={-1}
        aria-label="Mensajes y notas"
        className="flex flex-col gap-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {items.map((item, index) => {
          // Si dos conversaciones se intercalan, el separador se repite; el ancla, solo la primera vez.
          const anchor = !anchored.has(item.conversationId);
          const separator =
            united &&
            (index === 0 || startsConversation(items, index)) &&
            separators[item.conversationId] ? (
              <p
                id={anchor ? `conversacion-${item.conversationId}` : undefined}
                className="my-2 flex scroll-mt-24 items-center gap-3 text-xs font-semibold text-muted"
              >
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
                {separators[item.conversationId]}
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </p>
            ) : null;
          if (separator) anchored.add(item.conversationId);
          const day =
            startsDay(items, index) || separator ? (
              <p className="my-1 self-center rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-muted">
                {item.dayLabel}
              </p>
            ) : null;
          if (item.type === "note") {
            return (
              <li
                key={elementId(item)}
                id={elementId(item)}
                className="flex flex-col gap-2"
              >
                {separator}
                {day}
                <div className="flex w-full gap-3 rounded-xl border border-on-warning-soft/20 bg-warning-soft px-4 py-3 text-on-warning-soft">
                  <Icon name="lock" className="mt-0.5 size-5" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        <span className="font-semibold">{NOTE_LABEL}</span> ·{" "}
                        {item.author} · {item.time}
                      </span>
                      <span className="rounded-md bg-on-warning-soft/10 px-2 py-0.5 text-xs font-semibold">
                        {NOTE_ONLY_TEAM_TEXT}
                      </span>
                    </p>
                    <p
                      className={`mt-1 break-words whitespace-pre-wrap text-foreground ${item.body === null ? "italic" : ""}`}
                    >
                      {item.body ?? ERASED_NOTE_TEXT}
                    </p>
                  </div>
                </div>
              </li>
            );
          }
          const outbound = item.direction === "outbound";
          return (
            <li
              key={elementId(item)}
              id={elementId(item)}
              className="flex flex-col gap-2"
            >
              {separator}
              {day}
              <div
                className={`flex items-start gap-3 ${outbound ? "flex-row-reverse" : ""}`}
              >
                <MessageAvatar item={item} clientName={clientName} />
                <div
                  className={`flex min-w-0 max-w-[85%] flex-col gap-1 sm:max-w-[75%] ${outbound ? "items-end" : "items-start"}`}
                >
                  {/* Quién y cuándo, en el orden de siempre para un lector de pantalla; lo visible
                      lo repite con la forma del mockup y queda fuera del árbol. */}
                  <p className="sr-only">
                    {item.directionLabel}
                    {item.senderLabel ? ` · ${item.senderLabel}` : null} ·{" "}
                    {item.time}
                  </p>
                  {outbound ? (
                    <p
                      aria-hidden="true"
                      className="text-xs font-semibold text-muted"
                    >
                      {item.senderLabel ?? item.directionLabel}
                    </p>
                  ) : null}
                  {item.kindLabel ? (
                    <p className="text-xs font-semibold text-muted">
                      {item.kindLabel}
                    </p>
                  ) : null}
                  <p
                    className={`rounded-2xl px-4 py-2.5 break-words whitespace-pre-wrap ${outbound ? "rounded-tr-sm bg-primary-soft text-foreground" : "rounded-tl-sm bg-surface-muted text-foreground"} ${item.body === null ? "italic" : ""}`}
                  >
                    {item.body ?? EMPTY_BODY_TEXT}
                  </p>
                  <p
                    aria-hidden="true"
                    className="text-xs text-muted tabular-nums"
                  >
                    {item.time}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
