"use client";

import { Icon } from "@/app/_components/icons";
import { secondaryButtonClass } from "@/app/_components/form-styles";

// «Imprimir» abre el diálogo del navegador, desde el que también se guarda como PDF para mandarle la
// orden al proveedor (brief-22.3, D-10), como el de la venta. Sin JavaScript el botón no hace nada,
// y queda el menú de impresión del navegador.
export function PrintButton() {
  return (
    <button
      type="button"
      className={secondaryButtonClass}
      onClick={() => window.print()}
    >
      <Icon name="printer" className="size-4" />
      Imprimir o guardar PDF
    </button>
  );
}
