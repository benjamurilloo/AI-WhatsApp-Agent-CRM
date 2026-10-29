// Clases de los ítems de «Más acciones» (more-actions.tsx). Viven fuera de ese módulo porque es
// "use client": un componente de servidor que importa una constante de él recibe una referencia de
// cliente, no el texto, y la clase sale como el código de una función (brief-24.4.1).

// Cada ítem es un enlace o un botón con esta clase; los destructivos suman moreActionDangerClass y
// van al final.
export const moreActionItemClass =
  "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

export const moreActionDangerClass = "text-danger hover:bg-danger-soft";
