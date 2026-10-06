"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  filterSuggestions,
  looksLikePhone,
  REMOTE_DELAY_MS,
  REMOTE_MIN_LENGTH,
  type RemoteSuggestion,
} from "./suggest-filter";

// Campo de texto con sugerencias propias (brief-15.2, D-5), en lugar del `datalist`, cuya ventana
// dibuja el navegador fuera de la interfaz. Patrón combobox de ARIA 1.2 con lista: el foco queda
// siempre en el campo, la opción activa se anuncia con aria-activedescendant, las flechas mueven,
// Enter elige y Escape cierra. Sin JavaScript es el campo de texto de siempre, con el mismo name.
//
// Dos fuentes: una lista fija (`options`), que se filtra en el navegador y al elegir completa el
// campo; o una Server Action (`load`, D-6), que se pide desde REMOTE_MIN_LENGTH caracteres y
// REMOTE_DELAY_MS después de la última tecla, descartando las respuestas viejas, y al elegir abre
// el detalle. Con `load`, Enter sin una opción activa envía el formulario: busca como siempre.
//
// El campo no es controlado: el formulario lo reinicia a defaultValue después de cada envío
// (useActionState), como a los demás campos. El estado solo guarda el texto con que se filtra.

type InputProps = {
  id: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  className: string;
  type?: "text" | "search";
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  // Un ícono posicionado sobre el campo, como la lupa de los buscadores: va dentro del contenedor
  // del campo y después de él, para que el campo no lo tape.
  children?: ReactNode;
};

type Source =
  | { options: readonly string[]; load?: never; skipPhones?: never }
  | {
      options?: never;
      load: (text: string) => Promise<RemoteSuggestion[]>;
      // Un texto que parece teléfono no pide sugerencias: esa búsqueda es exacta.
      skipPhones?: boolean;
    };

type Item = { id: string; label: string; detail?: string; href?: string };

export function SuggestInput({
  options,
  load,
  skipPhones = false,
  type = "text",
  children,
  ...input
}: InputProps & Source) {
  const router = useRouter();
  const listId = `${useId()}-sugerencias`;
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastRequest = useRef(0);
  const [text, setText] = useState(input.defaultValue ?? "");
  const [remote, setRemote] = useState<RemoteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const shown: Item[] = options
    ? filterSuggestions(options, text).map((value) => ({
        id: value,
        label: value,
      }))
    : remote;
  const expanded = open && shown.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  // La opción activa queda a la vista al moverse con las flechas por una lista larga.
  useEffect(() => {
    if (active >= 0) {
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [active, listId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function request(value: string) {
    if (!load) return;
    clearTimeout(timer.current);
    // Toda respuesta pedida antes de esta tecla queda vieja.
    const ticket = ++lastRequest.current;
    const query = value.trim();
    if (
      query.length < REMOTE_MIN_LENGTH ||
      (skipPhones && looksLikePhone(query))
    ) {
      setRemote([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const found = await load(query);
        if (ticket === lastRequest.current) setRemote(found);
      } catch {
        if (ticket === lastRequest.current) setRemote([]);
      }
    }, REMOTE_DELAY_MS);
  }

  function show(value: string) {
    setText(value);
    setActive(-1);
    setOpen(true);
  }

  function choose(item: Item) {
    setActive(-1);
    setOpen(false);
    if (item.href) {
      router.push(item.href);
      return;
    }
    if (inputRef.current) inputRef.current.value = item.label;
    setText(item.label);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) {
        show(event.currentTarget.value);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        current === -1 && step === -1
          ? shown.length - 1
          : (current + step + shown.length) % shown.length,
      );
    } else if (event.key === "Enter" && expanded && active >= 0) {
      // Elegir no envía el formulario; Enter sin una opción activa sí, como siempre.
      event.preventDefault();
      choose(shown[active]!);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <input
        {...input}
        ref={inputRef}
        type={type}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={
          expanded && active >= 0 ? optionId(active) : undefined
        }
        // Sin el historial del navegador: solo las sugerencias de la lista.
        autoComplete="off"
        onInput={(event) => {
          show(event.currentTarget.value);
          request(event.currentTarget.value);
        }}
        onClick={(event) => show(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
      />
      {children}
      <ul
        id={listId}
        role="listbox"
        aria-label="Sugerencias"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 min-w-60 overflow-y-auto rounded-lg border border-border-strong bg-surface py-1 text-base text-foreground shadow-lg"
      >
        {expanded
          ? shown.map((item, index) => (
              <li
                key={item.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // mousedown, no click: el campo no pierde el foco antes de elegir.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(item);
                }}
                className={`cursor-pointer px-3 py-2 ${index === active ? "bg-primary-soft text-on-primary-soft" : "hover:bg-surface-muted"}`}
              >
                {item.label}
                {item.detail ? (
                  <>
                    {" "}
                    <span className="block font-mono text-xs whitespace-nowrap">
                      {item.detail}
                    </span>
                  </>
                ) : null}
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}
