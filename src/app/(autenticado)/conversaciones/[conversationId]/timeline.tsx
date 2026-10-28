"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  formMessageClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { loadOlderMessagesAction } from "../actions";
import {
  EMPTY_BODY_TEXT,
  ERASED_NOTE_TEXT,
  NOTE_LABEL,
  NOTE_ONLY_TEAM_TEXT,
  startsDay,
  type TimelineItem,
} from "../messages";

// Timeline de la pantalla 9 (wireframe 09): lista semántica del más antiguo al más reciente.
// "Cargar mensajes anteriores" agrega 50 arriba sin mover la lectura (D-3): se mide el primer
// mensaje visible antes y después de agregarlos, y se compensa la diferencia. El cuerpo se
// renderiza como texto: React lo escapa, sin HTML ni enlaces automáticos. Desde la 15.4, los
// mensajes son burbujas: el texto que dice quién envía se conserva, así el color no informa solo
// (brief-15.4, D-7). Desde la 24.3, las notas internas van intercaladas por fecha (brief-24.3,
// D-5): se distinguen por el candado y el texto «Nota interna» y «Solo equipo», no solo por el
// color.

// El id del elemento: un mensaje y una nota son de tablas distintas.
const elementId = (item: TimelineItem) =>
  item.type === "message" ? `mensaje-${item.id}` : `nota-${item.id}`;

type Anchor = { id: string; top: number };

export function Timeline({
  conversationId,
  initialItems,
  initialBefore,
}: {
  conversationId: string;
  initialItems: TimelineItem[];
  initialBefore: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [before, setBefore] = useState(initialBefore);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const anchor = useRef<Anchor | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

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
        className="flex flex-col gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {items.map((item, index) => {
          const day = startsDay(items, index) ? (
            <p className="my-3 flex items-center gap-3 text-xs font-bold tracking-wider text-muted">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              {item.day}
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </p>
          ) : null;
          if (item.type === "note") {
            return (
              <li
                key={elementId(item)}
                id={elementId(item)}
                className="flex flex-col gap-1"
              >
                {day}
                <div className="w-full rounded-xl border border-dashed border-border-strong bg-warning-soft px-4 py-2.5 text-on-warning-soft sm:mx-auto sm:max-w-[85%]">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs">
                    <Icon name="lock" className="size-3.5" />
                    <span className="font-semibold">{NOTE_LABEL}</span>·{" "}
                    <span>{item.author}</span>· <span>{item.time}</span>·{" "}
                    <span>{NOTE_ONLY_TEAM_TEXT}</span>
                  </p>
                  <p
                    className={`mt-1 break-words whitespace-pre-wrap ${item.body === null ? "italic" : ""}`}
                  >
                    {item.body ?? ERASED_NOTE_TEXT}
                  </p>
                </div>
              </li>
            );
          }
          const outbound = item.direction === "outbound";
          return (
            <li
              key={elementId(item)}
              id={elementId(item)}
              className="flex flex-col gap-1"
            >
              {day}
              <div
                className={`flex w-full flex-col gap-1 sm:max-w-[75%] ${outbound ? "sm:items-end sm:self-end" : "sm:items-start sm:self-start"}`}
              >
                <p className="text-xs text-muted">
                  <span className="font-semibold text-foreground">
                    {item.directionLabel}
                  </span>
                  {item.senderLabel ? ` · ${item.senderLabel}` : null} ·{" "}
                  {item.time}
                </p>
                {item.kindLabel ? (
                  <p className="text-xs font-semibold text-muted">
                    {item.kindLabel}
                  </p>
                ) : null}
                <p
                  className={`w-full rounded-2xl border px-4 sm:w-auto py-2.5 break-words whitespace-pre-wrap ${outbound ? "rounded-tr-sm border-action bg-action text-on-action" : "rounded-tl-sm border-border bg-surface-muted text-foreground"} ${item.body === null ? "italic" : ""}`}
                >
                  {item.body ?? EMPTY_BODY_TEXT}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
