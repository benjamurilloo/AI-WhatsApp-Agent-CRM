"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  labelClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import {
  changeRoleAction,
  deactivateMemberAction,
  reactivateMemberAction,
} from "../actions";
import type { MemberChangeState } from "../messages";

const initialState: MemberChangeState = { status: "idle" };

// Mensaje de error del formulario, con el foco al aparecer (Screens.md, reglas comunes).
function useErrorMessage(state: MemberChangeState) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);
  return (
    <div aria-live="polite" aria-atomic="true">
      {state.status === "error" ? (
        <p ref={ref} tabIndex={-1} className={formMessageClass}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function RoleForm({
  memberId,
  role,
}: {
  memberId: string;
  role: "admin" | "viewer";
}) {
  const [state, formAction, pending] = useActionState(
    changeRoleAction,
    initialState,
  );
  const message = useErrorMessage(state);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-4">
      <input type="hidden" name="memberId" value={memberId} />
      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Rol del usuario</legend>
        <div className="flex gap-6">
          {(["admin", "viewer"] as const).map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="radio"
                name="role"
                value={option}
                defaultChecked={role === option}
                className={radioClass}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
      {message}
      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/usuarios" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar rol"}
        </button>
      </div>
    </form>
  );
}

// Segundo paso de la desactivación (brief-3.7, D-6): recibe el foco al aparecer.
export function DeactivateConfirm({
  memberId,
  name,
  isSelf,
}: {
  memberId: string;
  name: string;
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    deactivateMemberAction,
    initialState,
  );
  const message = useErrorMessage(state);
  const titleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-labelledby="confirmar-desactivar"
      className="flex flex-col gap-3 rounded-lg border border-danger bg-danger-soft p-4"
    >
      <p
        id="confirmar-desactivar"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold text-on-danger-soft"
      >
        ¿Desactivar a {name}?
      </p>
      <p className="text-sm text-on-danger-soft">
        {isSelf
          ? "Es tu propia cuenta: se cierra tu sesión y no vas a poder ingresar hasta que otro admin te reactive."
          : "No va a poder ingresar hasta que lo reactives, y se cierran sus sesiones abiertas."}
      </p>
      {message}
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="memberId" value={memberId} />
        <Link href={`/usuarios/${memberId}`} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Desactivando…" : "Sí, desactivar"}
        </button>
      </form>
    </div>
  );
}

export function ReactivateForm({ memberId }: { memberId: string }) {
  const [state, formAction, pending] = useActionState(
    reactivateMemberAction,
    initialState,
  );
  const message = useErrorMessage(state);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="memberId" value={memberId} />
      {message}
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Reactivando…" : "Reactivar"}
        </button>
      </div>
    </form>
  );
}
