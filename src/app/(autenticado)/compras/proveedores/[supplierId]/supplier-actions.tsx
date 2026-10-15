"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { deactivateSupplierAction, reactivateSupplierAction } from "../actions";
import type { SupplierChangeState } from "../messages";

// Desactivar con confirmación en un segundo paso de la URL y reactivar (brief-22.2, D-5 y D-9),
// con el mismo patrón que el cliente.

const initialState: SupplierChangeState = { status: "idle" };

function useErrorMessage(state: SupplierChangeState) {
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

export function DeactivateSupplierConfirm({
  supplierId,
  name,
}: {
  supplierId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    deactivateSupplierAction,
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
        Dejará de aparecer en la lista por defecto y conservará sus datos. Podés
        reactivarlo luego.
      </p>
      {message}
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="supplierId" value={supplierId} />
        <Link
          href={`/compras/proveedores/${supplierId}`}
          className={secondaryLinkClass}
        >
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Desactivando…" : "Sí, desactivar"}
        </button>
      </form>
    </div>
  );
}

export function ReactivateSupplierForm({ supplierId }: { supplierId: string }) {
  const [state, formAction, pending] = useActionState(
    reactivateSupplierAction,
    initialState,
  );
  const message = useErrorMessage(state);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="supplierId" value={supplierId} />
      {message}
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Reactivando…" : "Reactivar"}
        </button>
      </div>
    </form>
  );
}
