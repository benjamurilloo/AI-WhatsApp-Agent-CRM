"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { filterSuggestions } from "./suggest-filter";

// Campo de texto con sugerencias propias (brief-15.2, D-5), en lugar del `datalist`, cuya ventana
// dibuja el navegador fuera de la interfaz. Patrón combobox de ARIA 1.2 con lista: el foco queda
// siempre en el campo, la opción activa se anuncia con aria-activedescendant, las flechas mueven,
// Enter elige y Escape cierra. Sin JavaScript es el campo de texto de siempre, con el mismo name.
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
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function SuggestInput({
  options,
  ...input
}: InputProps & { options: readonly string[] }) {
  const listId = `${useId()}-sugerencias`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(input.defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const shown = filterSuggestions(options, text);
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

  function show(value: string) {
    setText(value);
    setActive(-1);
    setOpen(true);
  }

  function choose(value: string) {
    if (inputRef.current) inputRef.current.value = value;
    setText(value);
    setActive(-1);
    setOpen(false);
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
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={
          expanded && active >= 0 ? optionId(active) : undefined
        }
        // Sin el historial del navegador: solo las sugerencias de la lista.
        autoComplete="off"
        onInput={(event) => show(event.currentTarget.value)}
        onClick={(event) => show(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Sugerencias"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border-strong bg-surface py-1 text-base text-foreground shadow-lg"
      >
        {expanded
          ? shown.map((value, index) => (
              <li
                key={value}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // mousedown, no click: el campo no pierde el foco antes de elegir.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(value);
                }}
                className={`cursor-pointer px-3 py-2 ${index === active ? "bg-primary-soft text-on-primary-soft" : "hover:bg-surface-muted"}`}
              >
                {value}
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}
