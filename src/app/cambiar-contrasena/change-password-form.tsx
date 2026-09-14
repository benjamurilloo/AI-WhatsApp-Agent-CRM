"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/_auth/messages";
import { buttonClass, formMessageClass } from "@/app/_components/form-styles";
import { PasswordField } from "@/app/_components/password-field";
import { changePasswordAction } from "./actions";

const initialState: FormState = { status: "idle" };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState,
  );
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  const error = state.status === "error" ? state : null;
  const fieldError = (field: string) =>
    error?.field === field ? error.message : null;
  const formMessage = error && error.field === null ? error.message : null;

  useEffect(() => {
    if (state.status !== "error") return;
    // Foco al primer error del formulario (Screens.md, reglas comunes).
    if (state.field === "newPassword") newPasswordRef.current?.focus();
    else if (state.field === "confirmation") confirmationRef.current?.focus();
    else messageRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <PasswordField
        label="Nueva contraseña"
        name="newPassword"
        autoComplete="new-password"
        error={fieldError("newPassword")}
        inputRef={newPasswordRef}
      />
      <PasswordField
        label="Repetir nueva contraseña"
        name="confirmation"
        autoComplete="new-password"
        error={fieldError("confirmation")}
        inputRef={confirmationRef}
      />

      <div aria-live="polite" aria-atomic="true">
        {formMessage ? (
          <p ref={messageRef} tabIndex={-1} className={formMessageClass}>
            {formMessage}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Guardando…" : "Guardar y continuar"}
      </button>
    </form>
  );
}
