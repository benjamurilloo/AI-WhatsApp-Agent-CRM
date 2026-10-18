// Esqueletos de carga (brief-23.2, D-3). El bloque es decorativo; lo que oye un lector de pantalla
// es el «Cargando…» de la región `role="status"`. Sin animación con `prefers-reduced-motion`. La
// carga de una pantalla entera es la barra de `navigation-progress.tsx`: un `loading.tsx` dejaba
// sin JavaScript la pantalla en el esqueleto.

export const LOADING_TEXT = "Cargando…";

// En lugar de un dato que todavía no llegó, dentro de una línea de texto.
export function InlineSkeleton() {
  return (
    <span role="status" className="inline-flex align-middle">
      <span className="sr-only">{LOADING_TEXT}</span>
      <span
        aria-hidden="true"
        className="inline-block h-4 w-24 animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none"
      />
    </span>
  );
}
