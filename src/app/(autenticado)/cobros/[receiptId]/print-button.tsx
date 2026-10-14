"use client";

import { Icon } from "@/app/_components/icons";
import { secondaryButtonClass } from "@/app/_components/form-styles";

// «Imprimir» del recibo, como el del arqueo y el de la venta: abre el diálogo del navegador, desde
// el que también se guarda como PDF. Propio de los cobros para no depender de la carpeta de otra
// pantalla (revisión independiente de la 21.2, R-11). Sin JavaScript queda el menú del navegador.
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
