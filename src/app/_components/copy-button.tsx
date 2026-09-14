"use client";

import { useState } from "react";
import { secondaryButtonClass } from "./form-styles";

// Copia al portapapeles con la API del navegador, sin dependencias (brief-3.7, D-5).
// El valor queda solo en memoria: nada se guarda en almacenamiento del cliente.
export function CopyButton({ value }: { value: string }) {
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
      <button type="button" onClick={copy} className={secondaryButtonClass}>
        Copiar
      </button>
      <span role="status" className="text-sm text-slate-700">
        {status === "copied"
          ? "Copiada."
          : status === "failed"
            ? "No se pudo copiar: seleccioná el texto."
            : ""}
      </span>
    </>
  );
}
