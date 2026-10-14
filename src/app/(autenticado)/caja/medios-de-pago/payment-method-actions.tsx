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
import {
  createInitialPaymentMethodsAction,
  deactivatePaymentMethodAction,
  reactivatePaymentMethodAction,
} from "../actions";
import type { PaymentMethodChangeState } from "../messages";

// La lista inicial, desactivar con confirmación en un segundo paso de la URL y reactivar (brief-21.2,
// D-6 y D-10), con el patrón de las etiquetas.

const initialState: PaymentMethodChangeState = { status: "idle" };

function useErrorMessage(state: PaymentMethodChangeState) {
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

export function InitialPaymentMethodsForm() {
  const [state, formAction, pending] = useActionState(
    createInitialPaymentMethodsAction,
    initialState,
  );
  const message = useErrorMessage(state);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {message}
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Creando…" : "Crear la lista inicial"}
        </button>
      </div>
    </form>
  );
}

export function DeactivatePaymentMethodConfirm({
  paymentMethodId,
  name,
}: {
  paymentMethodId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    deactivatePaymentMethodAction,
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
      aria-labelledby="confirmar-desactivar-medio"
      className="flex flex-col gap-3 rounded-lg border border-danger bg-danger-soft p-4"
    >
      <p
        id="confirmar-desactivar-medio"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold text-on-danger-soft"
      >
        ¿Desactivar el medio de pago &quot;{name}&quot;?
      </p>
      <p className="text-sm text-on-danger-soft">
        No se va a ofrecer para registrar cobros nuevos. Lo que ya se registró
        con él lo conserva. Podés reactivarlo luego.
      </p>
      {message}
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="paymentMethodId" value={paymentMethodId} />
        <Link href="/caja/medios-de-pago" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Desactivando…" : "Sí, desactivar"}
        </button>
      </form>
    </div>
  );
}

export function ReactivatePaymentMethodForm({
  paymentMethodId,
  name,
}: {
  paymentMethodId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    reactivatePaymentMethodAction,
    initialState,
  );
  const message = useErrorMessage(state);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="paymentMethodId" value={paymentMethodId} />
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
