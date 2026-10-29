"use client";

import { useState } from "react";
import { secondaryButtonClass } from "./form-styles";
import { Icon } from "./icons";

// Copia al portapapeles con la API del navegador, sin dependencias (brief-3.7, D-5).
// El valor queda solo en memoria: nada se guarda en almacenamiento del cliente.
// Desde la 24.4.1, `label` pone el botón con solo el ícono, como los datos de contacto de la v2,
// con ese nombre accesible («Copiar teléfono»); sin label, es el botón «Copiar» de siempre.
export function CopyButton({
  value,
  label,
  copiedText = "Copiada.",
}: {
  value: string;
  label?: string;
  copiedText?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className={
          label
            ? "grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            : secondaryButtonClass
        }
      >
        {label ? <Icon name="copy" className="size-5" /> : "Copiar"}
      </button>
      {/* Con label, un aviso aria-live propio sin role="status": la ficha ya tiene una región con
          ese rol, y dos harían ambigua la región de avisos. */}
      <span
        role={label ? undefined : "status"}
        aria-live={label ? "polite" : undefined}
        className={label ? "sr-only" : "text-sm text-muted"}
      >
        {status === "copied"
          ? copiedText
          : status === "failed"
            ? "No se pudo copiar: seleccioná el texto."
            : ""}
      </span>
    </>
  );
}
