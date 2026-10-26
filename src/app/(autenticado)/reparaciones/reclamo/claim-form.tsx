"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { createWarrantyClaimAction } from "../actions";
import type { FormState } from "../messages";

// El formulario del alta de un reclamo de garantía (brief-29.9.2, D-5): el equipo y el cliente ya
// vienen elegidos, en campos ocultos; se escribe lo que reporta el cliente. Funciona sin JavaScript,
// conserva lo escrito tras un rechazo y lleva el foco al campo inválido.

const idle: FormState = { status: "idle" };

export function WarrantyClaimForm({
  target,
  back,
}: {
  target: { unitId: string; clientId: string } | { serviceOrderId: string };
  back: string;
}) {
  const [state, formAction, pending] = useActionState(
    createWarrantyClaimAction,
    idle,
  );
  const failed = state.status === "error" ? state : null;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field === "reportedIssue") {
      document.getElementById("reclamo-reporte")?.focus();
    } else errorRef.current?.focus();
  }, [state]);
  const issueError =
    failed && failed.field === "reportedIssue" ? failed.message : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {"unitId" in target ? (
        <>
          <input type="hidden" name="unitId" value={target.unitId} />
          <input type="hidden" name="clientId" value={target.clientId} />
        </>
      ) : (
        <input
          type="hidden"
          name="serviceOrderId"
          value={target.serviceOrderId}
        />
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="reclamo-reporte" className={labelClass}>
          Lo que reporta el cliente *
        </label>
        <textarea
          id="reclamo-reporte"
          name="reportedIssue"
          required
          rows={4}
          maxLength={1000}
          defaultValue={failed?.values.reportedIssue ?? ""}
          aria-invalid={issueError ? true : undefined}
          aria-describedby={issueError ? "reclamo-reporte-error" : undefined}
          className={inputClass}
        />
        {issueError ? (
          <p id="reclamo-reporte-error" className={fieldErrorClass}>
            {issueError}
          </p>
        ) : null}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {failed && failed.field === null ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {failed.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Creando…" : "Crear el reclamo"}
        </button>
        <Link href={back} className={secondaryLinkClass}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
