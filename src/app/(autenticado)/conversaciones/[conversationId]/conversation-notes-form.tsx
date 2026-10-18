"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { addConversationNoteAction, loadOlderNotesAction } from "../actions";
import {
  ERASED_NOTE_TEXT,
  NO_NOTES_MESSAGE,
  NOTES_HINT,
  type NoteFormState,
  type NoteItem,
} from "../messages";
import { ActionNotice } from "@/app/_components/action-notice";

// Tarjeta «Notas» de la pantalla 9 (brief-16.4, D-6): la lista de la más reciente a la más vieja,
// de a 25, para admin y viewer, y arriba el formulario, solo para admin. El texto se renderiza como
// texto: React lo escapa, sin HTML ni enlaces, y conserva los saltos de línea. El resultado del
// formulario se anuncia con aria-live; un error recibe el foco, como en la pausa del agente.

const initialState: NoteFormState = { status: "idle" };

export function ConversationNotes({
  conversationId,
  initialItems,
  initialBefore,
  canAdd,
  maxLength,
}: {
  conversationId: string;
  initialItems: NoteItem[];
  initialBefore: string | null;
  canAdd: boolean;
  maxLength: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      {canAdd ? (
        <NoteForm conversationId={conversationId} maxLength={maxLength} />
      ) : null}
      {/* Una nota nueva cambia la primera página: la lista vuelve a empezar desde ella. */}
      <NoteList
        key={initialItems[0]?.id ?? "vacia"}
        conversationId={conversationId}
        initialItems={initialItems}
        initialBefore={initialBefore}
      />
    </div>
  );
}

function NoteForm({
  conversationId,
  maxLength,
}: {
  conversationId: string;
  maxLength: number;
}) {
  const [state, formAction, pending] = useActionState(
    addConversationNoteAction,
    initialState,
  );
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const failed = state.status === "error";

  useEffect(() => {
    if (state.status === "error") fieldRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="nota-texto" className={labelClass}>
        Nueva nota
      </label>
      <textarea
        ref={fieldRef}
        id="nota-texto"
        name="body"
        rows={3}
        required
        maxLength={maxLength}
        // Tras un rechazo, React reinicia el formulario a este valor: lo escrito se conserva.
        defaultValue={failed ? state.body : ""}
        aria-invalid={failed && state.invalidBody ? true : undefined}
        aria-describedby={failed ? "nota-error nota-ayuda" : "nota-ayuda"}
        className={inputClass}
      />
      <p id="nota-ayuda" className="text-sm text-muted">
        {NOTES_HINT}
      </p>
      <button
        type="submit"
        disabled={pending}
        className={`self-start ${inlineButtonClass}`}
      >
        {pending ? "Agregando…" : "Agregar nota"}
      </button>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "done" ? (
          <ActionNotice>{state.message}</ActionNotice>
        ) : state.status === "error" ? (
          <p id="nota-error" className={fieldErrorClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function NoteList({
  conversationId,
  initialItems,
  initialBefore,
}: {
  conversationId: string;
  initialItems: NoteItem[];
  initialBefore: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [before, setBefore] = useState(initialBefore);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);

  function loadOlder() {
    if (!before) return;
    setError(null);
    startTransition(async () => {
      const result = await loadOlderNotesAction(conversationId, before);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems((current) => [...current, ...result.items]);
      setBefore(result.before);
      setAnnouncement(
        result.items.length === 1
          ? "Se cargó 1 nota anterior."
          : `Se cargaron ${result.items.length} notas anteriores.`,
      );
      // Sin botón, el foco pasaría al documento: queda en la lista.
      if (result.before === null) listRef.current?.focus();
    });
  }

  if (items.length === 0) return <p>{NO_NOTES_MESSAGE}</p>;

  return (
    <div className="flex flex-col gap-3">
      <ol
        ref={listRef}
        tabIndex={-1}
        aria-label="Notas"
        className="flex flex-col gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1 border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <p className="text-xs text-muted">
              <span className="font-semibold text-foreground">
                {item.author}
              </span>{" "}
              · {item.when}
            </p>
            <p
              className={`break-words whitespace-pre-wrap ${item.body === null ? "italic text-muted" : ""}`}
            >
              {item.body ?? ERASED_NOTE_TEXT}
            </p>
          </li>
        ))}
      </ol>
      <div aria-live="polite" aria-atomic="true">
        {error ? <p className={formMessageClass}>{error}</p> : null}
        <p className="sr-only">{announcement}</p>
      </div>
      {before ? (
        <p>
          <button
            type="button"
            onClick={loadOlder}
            disabled={pending}
            className={secondaryButtonClass}
          >
            {pending ? "Cargando notas anteriores…" : "Ver anteriores"}
          </button>
        </p>
      ) : null}
    </div>
  );
}
