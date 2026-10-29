"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { moreActionItemClass } from "@/app/_components/more-action-styles";
import { Icon } from "@/app/_components/icons";
import { deactivateClientAction, reactivateClientAction } from "../actions";
import type { ClientChangeState } from "../messages";

// Desactivar con confirmación en un segundo paso de la URL y reactivar (wireframe 07), con el
// mismo patrón que la pantalla 4.

const initialState: ClientChangeState = { status: "idle" };

function useErrorMessage(state: ClientChangeState) {
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

export function DeactivateConfirm({
  clientId,
  name,
}: {
  clientId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    deactivateClientAction,
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
        ¿Desactivar &quot;{name}&quot;?
      </p>
      <p className="text-sm text-on-danger-soft">
        Dejará de aparecer en la lista por defecto y conservará su teléfono.
        Podés reactivarlo luego.
      </p>
      {message}
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="clientId" value={clientId} />
        <Link href={`/clientes/${clientId}`} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Desactivando…" : "Sí, desactivar"}
        </button>
      </form>
    </div>
  );
}

export function ReactivateForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(
    reactivateClientAction,
    initialState,
  );
  const message = useErrorMessage(state);

  // Desde la 24.4.1, un ítem de «Más acciones» (brief-24.4.1, D-2).
  return (
    <form action={formAction}>
      <input type="hidden" name="clientId" value={clientId} />
      {message}
      <button type="submit" disabled={pending} className={moreActionItemClass}>
        <Icon name="power" className="size-4" />
        {pending ? "Reactivando…" : "Reactivar"}
      </button>
    </form>
  );
}
