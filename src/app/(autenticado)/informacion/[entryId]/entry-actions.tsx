"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import {
  deactivateKnowledgeAction,
  reactivateKnowledgeAction,
} from "../actions";
import type { KnowledgeChangeState } from "../messages";

// Desactivar con confirmación en un segundo paso de la URL y reactivar, con el mismo patrón que
// productos (brief-3.7, D-6). Ninguna entrada se borra (brief-11.2, D-4).

const initialState: KnowledgeChangeState = { status: "idle" };

function useErrorMessage(state: KnowledgeChangeState) {
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
  entryId,
  title,
}: {
  entryId: string;
  title: string;
}) {
  const [state, formAction, pending] = useActionState(
    deactivateKnowledgeAction,
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
        ¿Desactivar &quot;{title}&quot;?
      </p>
      <p className="text-sm text-on-danger-soft">
        Dejará de estar vigente, aunque esté dentro de sus fechas. Podés
        reactivarla luego.
      </p>
      {message}
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="entryId" value={entryId} />
        <Link href={`/informacion/${entryId}`} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Desactivando…" : "Sí, desactivar"}
        </button>
      </form>
    </div>
  );
}

export function ReactivateForm({ entryId }: { entryId: string }) {
  const [state, formAction, pending] = useActionState(
    reactivateKnowledgeAction,
    initialState,
  );
  const message = useErrorMessage(state);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="entryId" value={entryId} />
      {message}
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Reactivando…" : "Reactivar"}
        </button>
      </div>
    </form>
  );
}
