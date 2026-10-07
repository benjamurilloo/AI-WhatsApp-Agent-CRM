"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  secondaryButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import type { ClientChangeState } from "../messages";
import {
  createSuggestedTagsAction,
  deactivateTagAction,
  reactivateTagAction,
} from "./actions";

// Crear las sugeridas (D-3), desactivar con confirmación en un segundo paso de la URL y reactivar
// (D-8), con el mismo patrón que la ficha del cliente.

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

export function SuggestedTagsForm() {
  const [state, formAction, pending] = useActionState(
    createSuggestedTagsAction,
    initialState,
  );
  const message = useErrorMessage(state);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {message}
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Creando…" : "Crear las sugeridas"}
        </button>
      </div>
    </form>
  );
}

export function DeactivateTagConfirm({
  tagId,
  name,
}: {
  tagId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    deactivateTagAction,
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
      aria-labelledby="confirmar-desactivar-etiqueta"
      className="flex flex-col gap-3 rounded-lg border border-danger bg-danger-soft p-4"
    >
      <p
        id="confirmar-desactivar-etiqueta"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold text-on-danger-soft"
      >
        ¿Desactivar la etiqueta &quot;{name}&quot;?
      </p>
      <p className="text-sm text-on-danger-soft">
        No se va a ofrecer para agregar ni para filtrar. Los clientes que ya la
        tienen la conservan, como inactiva. Podés reactivarla luego.
      </p>
      {message}
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="tagId" value={tagId} />
        <Link href="/clientes/etiquetas" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Desactivando…" : "Sí, desactivar"}
        </button>
      </form>
    </div>
  );
}

export function ReactivateTagForm({
  tagId,
  name,
}: {
  tagId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    reactivateTagAction,
    initialState,
  );
  const message = useErrorMessage(state);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="tagId" value={tagId} />
      <div>
        <button
          type="submit"
          disabled={pending}
          className={secondaryButtonClass}
        >
          {pending ? "Reactivando…" : "Reactivar"}
          <span className="sr-only"> {name}</span>
        </button>
      </div>
      {message}
    </form>
  );
}
