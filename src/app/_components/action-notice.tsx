import type { ReactNode } from "react";
import { noticeClass } from "./form-styles";
import { Icon } from "./icons";

// Aviso después de una acción (brief-23.2, D-5): el texto de siempre con el tilde del mockup. No se
// cierra solo (WCAG 2.2.1) y desaparece en la navegación siguiente. Va dentro de la región
// `role="status"` o `aria-live` de cada pantalla, que es la que lo anuncia; el tilde es
// decorativo.
export function ActionNotice({ children }: { children: ReactNode }) {
  return (
    <p className={`${noticeClass} flex items-start gap-2`}>
      <Icon name="circleCheck" className="mt-0.5 size-4" />
      <span>{children}</span>
    </p>
  );
}
