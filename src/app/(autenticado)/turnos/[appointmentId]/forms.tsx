"use client";

import { useActionState, useEffect, useRef } from "react";
import type { AppointmentTarget } from "@/modules/appointments";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { changeAppointmentStatusAction } from "../actions";
import { TARGET_LABEL, type ChangeState } from "../messages";

// Un cambio de estado del turno (brief-29.10, D-2 y D-4): un botón por destino. Funciona sin
// JavaScript; ante un rechazo, el mensaje toma el foco.

const idle: ChangeState = { status: "idle" };

const BUTTON: Record<AppointmentTarget, string> = {
  confirmed: inlineButtonClass,
  attended: inlineButtonClass,
  no_show: secondaryButtonClass,
  cancelled: dangerButtonClass,
};

export function AppointmentStatusForm({
  appointmentId,
  targets,
}: {
  appointmentId: string;
  targets: AppointmentTarget[];
}) {
  const [state, formAction, pending] = useActionState(
    changeAppointmentStatusAction,
    idle,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <div className="flex flex-wrap gap-3">
        {targets.map((target) => (
          <button
            key={target}
            type="submit"
            name="target"
            value={target}
            disabled={pending}
            className={BUTTON[target]}
          >
            {TARGET_LABEL[target]}
          </button>
        ))}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
