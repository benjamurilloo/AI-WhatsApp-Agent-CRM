"use client";

import { useId, useState, type Ref } from "react";
import {
  fieldErrorClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "./form-styles";

// Campo de contraseña oculto por defecto, con un botón accesible para mostrarla (Screens.md §1).
export function PasswordField({
  label,
  name,
  autoComplete,
  error,
  inputRef,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  error?: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-controls={id}
          aria-label={`Ver ${label.toLowerCase()}`}
          className={secondaryButtonClass}
        >
          Ver
        </button>
      </div>
      {error ? (
        <p id={errorId} className={fieldErrorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
