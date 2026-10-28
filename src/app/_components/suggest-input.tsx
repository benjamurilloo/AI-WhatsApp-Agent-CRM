"use client";

import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  filterSuggestions,
  groupSuggestions,
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
// Las sugerencias del servidor pueden llegar agrupadas (brief-23.3, D-5): cada grupo es un
// `role="group"` con su título como nombre, dentro del listbox, y cada opción dice además su tipo
// en su nombre accesible, porque no todos los lectores anuncian el grupo. Sin grupos, la lista de siempre.
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
  // La altura y el ancho de la lista, si no sirven los de siempre.
  listClassName?: string;
  // En el diálogo de búsqueda (brief-24.2, D-1): la lista va debajo del campo, en el flujo, y no
  // se cierra al perder el foco ni con Escape, que cierra el diálogo.
  inline?: boolean;
  // Cuántas sugerencias llegaron del servidor, o null si el texto no alcanza para pedirlas.
  onResults?: (count: number | null) => void;
  // Al elegir una opción que lleva a otra página.
  onNavigate?: () => void;
};

type Source =
  | { options: readonly string[]; load?: never; skipPhones?: never }
  | {
      options?: never;
      load: (text: string) => Promise<RemoteSuggestion[]>;
      // Un texto que parece teléfono no pide sugerencias: esa búsqueda es exacta.
      skipPhones?: boolean;
    };

type Item = {
  id: string;
  label: string;
  detail?: string;
  detailStyle?: "code" | "text";
  href?: string;
  group?: string;
  spokenKind?: string;
};

export function SuggestInput({
  options,
  load,
  skipPhones = false,
  type = "text",
  children,
  listClassName = "max-h-60 min-w-60",
  inline = false,
  onResults,
  onNavigate,
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
      onResults?.(null);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const found = await load(query);
        if (ticket === lastRequest.current) {
          // Lista nueva: la opción marcada de la anterior ya no significa nada.
          setRemote(found);
          setActive(-1);
          onResults?.(found.length);
        }
      } catch {
        if (ticket === lastRequest.current) {
          setRemote([]);
          onResults?.(0);
        }
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
      onNavigate?.();
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
    } else if (event.key === "Enter" && expanded && shown[active]) {
      // Elegir no envía el formulario; Enter sin una opción activa sí, como siempre.
      event.preventDefault();
      choose(shown[active]);
    } else if (event.key === "Escape" && expanded && !inline) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  function renderOption(item: Item, index: number) {
    return (
      <li
        key={item.id}
        id={optionId(index)}
        role="option"
        aria-selected={index === active}
        // Con el tipo, el nombre se arma entero: un texto oculto dentro de la opción lo leería con un
        // espacio de más («Ana Pérez , cliente»).
        aria-label={
          item.spokenKind
            ? [item.label, item.spokenKind, item.detail]
                .filter(Boolean)
                .join(", ")
            : undefined
        }
        // mousedown, no click: el campo no pierde el foco antes de elegir.
        onMouseDown={(event) => {
          event.preventDefault();
          choose(item);
        }}
        className={`cursor-pointer px-3 py-2 ${inline ? "rounded-lg" : ""} ${index === active ? "bg-primary-soft text-on-primary-soft" : "hover:bg-surface-muted"}`}
      >
        {/* En el diálogo, la fila elegida dice qué hace Enter (v2, V2-01 §05). El lector ya anuncia
            la opción activa: esto es solo para la vista. */}
        {inline && index === active ? (
          <span
            aria-hidden="true"
            className="float-right ml-3 text-sm font-semibold text-primary"
          >
            Abrir ↵
          </span>
        ) : null}
        {item.label}
        {item.detail ? (
          <>
            {" "}
            <span
              className={
                item.detailStyle === "text"
                  ? "block text-sm text-muted"
                  : "block font-mono text-xs whitespace-nowrap"
              }
            >
              {item.detail}
            </span>
          </>
        ) : null}
      </li>
    );
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
          if (inline) return;
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
        className={
          inline
            ? `mt-3 ${listClassName} overflow-y-auto text-base text-foreground`
            : `absolute inset-x-0 top-full z-20 mt-1 ${listClassName} overflow-y-auto rounded-xl border border-border-strong bg-surface py-1 text-base text-foreground shadow-lg`
        }
      >
        {expanded
          ? groupSuggestions(shown).map((group) =>
              group.title === null ? (
                <Fragment key="">
                  {group.items.map(({ item, index }) =>
                    renderOption(item, index),
                  )}
                </Fragment>
              ) : (
                <li
                  key={group.title}
                  role="group"
                  aria-labelledby={`${listId}-grupo-${group.items[0]!.index}`}
                  className="py-1"
                >
                  <span
                    id={`${listId}-grupo-${group.items[0]!.index}`}
                    className="block px-3 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase"
                  >
                    {group.title}
                  </span>
                  <ul role="presentation">
                    {group.items.map(({ item, index }) =>
                      renderOption(item, index),
                    )}
                  </ul>
                </li>
              ),
            )
          : null}
      </ul>
    </div>
  );
}
