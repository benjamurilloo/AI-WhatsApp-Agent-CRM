"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { FormState } from "@/app/_auth/messages";
import {
  buttonClass,
  fieldErrorClass,
  formMessageClass,
  inputClass,
  labelClass,
} from "@/app/_components/form-styles";
import { PasswordField } from "@/app/_components/password-field";
import { loginAction } from "./actions";

const initialState: FormState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );
  const [blocked, setBlocked] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  const error = state.status === "error" ? state : null;
  const emailError = error?.field === "email" ? error.message : null;
  const formMessage = error && error.field === null ? error.message : null;

  useEffect(() => {
    if (state.status !== "error") return;
    // Foco al primer error del formulario (Screens.md, reglas comunes).
    if (state.field === "email") emailRef.current?.focus();
    else messageRef.current?.focus();

    if (state.retryAfterSeconds === null) return;
    // RATE_LIMITED: el botón queda deshabilitado hasta que se pueda reintentar.
    setBlocked(true);
    const timer = setTimeout(
      () => setBlocked(false),
      state.retryAfterSeconds * 1000,
    );
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          // Se vuelve a montar en cada respuesta para conservar el email tipeado.
          key={error?.requestId ?? "inicial"}
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={error?.email ?? ""}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          className={inputClass}
        />
        {emailError ? (
          <p id="email-error" className={fieldErrorClass}>
            {emailError}
          </p>
        ) : null}
      </div>

      <PasswordField
        label="Contraseña"
        name="password"
        autoComplete="current-password"
      />

      <div aria-live="polite" aria-atomic="true">
        {formMessage ? (
          <p ref={messageRef} tabIndex={-1} className={formMessageClass}>
            {formMessage}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending || blocked}
        className={buttonClass}
      >
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
