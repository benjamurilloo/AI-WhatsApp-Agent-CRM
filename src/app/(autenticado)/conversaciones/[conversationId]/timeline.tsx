"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  formMessageClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { loadOlderMessagesAction } from "../actions";
import { EMPTY_BODY_TEXT, startsDay, type TimelineItem } from "../messages";

// Timeline de la pantalla 9 (wireframe 09): lista semántica del más antiguo al más reciente.
// "Cargar mensajes anteriores" agrega 50 arriba sin mover la lectura (D-3): se mide el primer
// mensaje visible antes y después de agregarlos, y se compensa la diferencia. El cuerpo se
// renderiza como texto: React lo escapa, sin HTML ni enlaces automáticos.

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
    const element = document.getElementById(`mensaje-${saved.id}`);
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
      const element = first
        ? document.getElementById(`mensaje-${first.id}`)
        : null;
      anchor.current =
        first && element
          ? { id: first.id, top: element.getBoundingClientRect().top }
          : null;
      setItems((current) => [...result.items, ...current]);
      setBefore(result.before);
      setAnnouncement(
        result.items.length === 1
          ? "Se cargó 1 mensaje anterior."
          : `Se cargaron ${result.items.length} mensajes anteriores.`,
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
        aria-label="Mensajes"
        className="flex flex-col gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {items.map((item, index) => {
          const outbound = item.direction === "outbound";
          return (
            <li
              key={item.id}
              id={`mensaje-${item.id}`}
              className="flex flex-col gap-1"
            >
              {startsDay(items, index) ? (
                <p className="my-2 text-center text-xs font-bold tracking-wider text-muted">
                  <span aria-hidden="true">── </span>
                  {item.day}
                  <span aria-hidden="true"> ──</span>
                </p>
              ) : null}
              <div
                className={`flex w-full flex-col gap-1 sm:max-w-[75%] ${outbound ? "sm:items-end sm:self-end" : "sm:items-start sm:self-start"}`}
              >
                <p className="text-sm text-muted">
                  <span className="font-semibold text-foreground">
                    {item.directionLabel}
                  </span>{" "}
                  · {item.time}
                </p>
                <p
                  className={`w-full rounded-lg border px-3 py-2 break-words whitespace-pre-wrap ${outbound ? "border-primary bg-primary-soft text-on-primary-soft" : "border-border bg-surface-muted text-foreground"} ${item.body === null ? "italic" : ""}`}
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
