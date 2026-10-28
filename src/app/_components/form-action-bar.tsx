import type { ReactNode } from "react";

// Barra de guardado de un formulario (brief-24.1, D-8; criterios v2, §Ubicación de botones): al pie,
// pegada abajo mientras se desplaza el formulario, con «Cancelar edición» y la acción con su
// nombre. Es la única barra de acciones del formulario: no hay otro guardar arriba ni flotante.
// Para que el campo enfocado no quede debajo de la barra (WCAG 2.4.11), el documento reserva su
// alto con scroll-padding-bottom (form-action-bar en globals.css). En el teléfono la barra
// inferior del marco se retira en los formularios (brief-24.1, D-7), así que la barra queda
// contra el borde.
export function FormActionBar({
  status,
  children,
}: {
  // Un texto opcional a la izquierda, por ejemplo «Cambios sin guardar».
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="form-action-bar sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm print:hidden">
      {status ? <p className="mr-auto text-sm text-muted">{status}</p> : null}
      {children}
    </div>
  );
}
