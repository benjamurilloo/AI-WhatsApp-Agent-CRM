"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { CopyButton } from "@/app/_components/copy-button";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  mutedTextClass,
  cardClass,
  pageTitleClass,
  primaryLinkClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { createMemberAction } from "../actions";
import type { NewMemberState } from "../messages";

const initialState: NewMemberState = { status: "idle" };

// Alta de un miembro (brief-3.7, D-6). Presentación de la 15.4: el formulario en una tarjeta y el
// aviso de la contraseña inicial con lo que realmente pasa, sin prometer un email (brief-15.4,
// D-8).

export function NewMemberForm() {
  const [state, formAction, pending] = useActionState(
    createMemberAction,
    initialState,
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const createdRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.status === "created") {
      createdRef.current?.focus();
      return;
    }
    if (state.status !== "error") return;
    // Foco al primer error del formulario (Screens.md, reglas comunes).
    const target = {
      name: nameRef,
      email: emailRef,
      role: roleRef,
    }[state.field ?? "name"];
    if (state.field) target.current?.focus();
    else messageRef.current?.focus();
  }, [state]);

  if (state.status === "created") {
    return (
      <section
        aria-labelledby="usuario-creado"
        className={`${cardClass} p-6 sm:p-8`}
      >
        <h1
          id="usuario-creado"
          ref={createdRef}
          tabIndex={-1}
          className={pageTitleClass}
        >
          Usuario creado
        </h1>
        <p className="mt-4">Contraseña inicial de {state.name}:</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code
            id="contrasena-inicial"
            className="rounded-md border border-dashed border-border-strong bg-surface-muted px-3 py-2 font-mono text-lg tracking-wider text-foreground"
          >
            {state.initialPassword}
          </code>
          <CopyButton value={state.initialPassword} />
        </div>
        <p className={`mt-4 ${mutedTextClass}`}>
          No se volverá a mostrar. Deberá cambiarla al ingresar.
        </p>
        <div className="mt-6 flex justify-end">
          <Link href="/usuarios" className={primaryLinkClass}>
            Entendido
          </Link>
        </div>
      </section>
    );
  }

  const error = state.status === "error" ? state : null;
  const values = error?.values ?? { name: "", email: "", role: "viewer" };
  const fieldError = (field: string) =>
    error?.field === field ? error.message : null;
  const formMessage = error && error.field === null ? error.message : null;
  // Los campos se vuelven a montar en cada respuesta para conservar lo tipeado.
  const key = error?.requestId ?? "inicial";

  return (
    <>
      <BackLink href="/usuarios" label="Volver a usuarios" />
      <DetailHeader
        title="Nuevo usuario"
        subtitle="Creá un usuario para que pueda ingresar al CRM."
      />
      <form action={formAction} noValidate className="mt-6 flex flex-col gap-6">
        <SectionCard
          id="form-usuario-titulo"
          title="Información general"
          icon="user"
          description="Completá los datos del nuevo usuario."
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className={labelClass}>
                Nombre
              </label>
              <input
                key={`name-${key}`}
                ref={nameRef}
                id="name"
                name="name"
                type="text"
                autoComplete="off"
                required
                defaultValue={values.name}
                aria-invalid={fieldError("name") ? true : undefined}
                aria-describedby={fieldError("name") ? "name-error" : undefined}
                className={inputClass}
              />
              {fieldError("name") ? (
                <p id="name-error" className={fieldErrorClass}>
                  {fieldError("name")}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                key={`email-${key}`}
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="off"
                required
                defaultValue={values.email}
                aria-invalid={fieldError("email") ? true : undefined}
                aria-describedby={
                  fieldError("email") ? "email-error" : undefined
                }
                className={inputClass}
              />
              {fieldError("email") ? (
                <p id="email-error" className={fieldErrorClass}>
                  {fieldError("email")}
                </p>
              ) : null}
            </div>

            <fieldset
              key={`role-${key}`}
              aria-describedby={fieldError("role") ? "role-error" : undefined}
              className="flex flex-col gap-2"
            >
              <legend className={labelClass}>Rol</legend>
              <div className="flex gap-6">
                {(["admin", "viewer"] as const).map((role, index) => (
                  <label key={role} className="flex items-center gap-2">
                    <input
                      ref={index === 0 ? roleRef : undefined}
                      type="radio"
                      name="role"
                      value={role}
                      defaultChecked={values.role === role}
                      className={radioClass}
                    />
                    {role}
                  </label>
                ))}
              </div>
              {fieldError("role") ? (
                <p id="role-error" className={fieldErrorClass}>
                  {fieldError("role")}
                </p>
              ) : null}
            </fieldset>

            <div className="flex gap-3 rounded-xl border border-border bg-primary-soft p-4 text-on-primary-soft">
              <Icon name="info" className="mt-0.5 size-5" />
              <div>
                <p className="font-semibold">Importante</p>
                <p className="mt-1 text-sm">
                  Se generará una contraseña inicial de un solo uso, que se
                  muestra una vez al crear el usuario. Compartila por un medio
                  seguro: el usuario la cambia al ingresar.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <div aria-live="polite" aria-atomic="true">
          {formMessage ? (
            <p ref={messageRef} tabIndex={-1} className={formMessageClass}>
              {formMessage}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Link href="/usuarios" className={secondaryLinkClass}>
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={inlineButtonClass}
          >
            {pending ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>
    </>
  );
}
