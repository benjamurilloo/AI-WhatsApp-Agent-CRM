"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  REMOTE_DELAY_MS,
  REMOTE_MIN_LENGTH,
} from "@/app/_components/suggest-filter";

// Buscador que elige un valor para el formulario del alta (brief-19.2, D-7). Es el combobox de
// SuggestInput (brief-15.2, D-5 y D-6: ARIA 1.2 con lista, el foco siempre en el campo, flechas,
// Enter y Escape), con una diferencia: elegir no abre el detalle, le pasa la opción al formulario,
// que guarda su id en un campo oculto. Escribir después de elegir la descarta. Sin JavaScript es
// un campo de texto con el mismo name, y la acción reconoce el valor escrito.

export type PickerOption = { id: string; label: string; detail?: string };

export function Picker<T extends PickerOption>({
  id,
  name,
  value,
  placeholder,
  className,
  invalid,
  describedBy,
  load,
  onChoose,
  onType,
}: {
  id: string;
  name: string;
  // El texto del campo: lo controla el formulario, que lo reemplaza al elegir.
  value: string;
  placeholder?: string;
  className: string;
  invalid?: boolean;
  describedBy?: string;
  load: (text: string) => Promise<T[]>;
  onChoose: (option: T) => void;
  onType: (text: string) => void;
}) {
  const listId = `${useId()}-opciones`;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastRequest = useRef(0);
  const [options, setOptions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const expanded = open && options.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (active >= 0) {
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [active, listId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function request(text: string) {
    clearTimeout(timer.current);
    // Toda respuesta pedida antes de esta tecla queda vieja.
    const ticket = ++lastRequest.current;
    const query = text.trim();
    if (query.length < REMOTE_MIN_LENGTH) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const found = await load(query);
        if (ticket === lastRequest.current) {
          setOptions(found);
          setActive(-1);
        }
      } catch {
        if (ticket === lastRequest.current) setOptions([]);
      }
    }, REMOTE_DELAY_MS);
  }

  function choose(option: T) {
    setActive(-1);
    setOpen(false);
    onChoose(option);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        current === -1 && step === -1
          ? options.length - 1
          : (current + step + options.length) % options.length,
      );
    } else if (event.key === "Enter" && expanded) {
      // Con la lista abierta, Enter elige y nunca envía el formulario a medias.
      event.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        className={className}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={
          expanded && active >= 0 ? optionId(active) : undefined
        }
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        onChange={(event) => {
          onType(event.currentTarget.value);
          setOpen(true);
          setActive(-1);
          request(event.currentTarget.value);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Opciones"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 min-w-60 overflow-y-auto rounded-lg border border-border-strong bg-surface py-1 text-base text-foreground shadow-lg"
      >
        {expanded
          ? options.map((option, index) => (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // mousedown, no click: el campo no pierde el foco antes de elegir.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                className={`cursor-pointer px-3 py-2 ${index === active ? "bg-primary-soft text-on-primary-soft" : "hover:bg-surface-muted"}`}
              >
                {option.label}
                {option.detail ? (
                  <>
                    {" "}
                    <span className="block font-mono text-xs whitespace-nowrap">
                      {option.detail}
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
