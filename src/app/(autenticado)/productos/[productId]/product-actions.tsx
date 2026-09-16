"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { deactivateProductAction, reactivateProductAction } from "../actions";
import type { ProductChangeState } from "../messages";

// Desactivar con confirmación en un segundo paso de la URL y reactivar (wireframe 04),
// con el mismo patrón que la pantalla 10 (brief-3.7, D-6).

const initialState: ProductChangeState = { status: "idle" };

function useErrorMessage(state: ProductChangeState) {
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
  productId,
  name,
}: {
  productId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    deactivateProductAction,
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
        Dejará de aparecer en las búsquedas por defecto y no podrá recibir
        ajustes de stock. Podés reactivarlo luego.
      </p>
      {message}
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="productId" value={productId} />
        <Link href={`/productos/${productId}`} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Desactivando…" : "Sí, desactivar"}
        </button>
      </form>
    </div>
  );
}

export function ReactivateForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(
    reactivateProductAction,
    initialState,
  );
  const message = useErrorMessage(state);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      {message}
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Reactivando…" : "Reactivar"}
        </button>
      </div>
    </form>
  );
}
