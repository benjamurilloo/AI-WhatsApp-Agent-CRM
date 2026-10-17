// Clases compartidas de las pantallas (brief-3.5, D-2), sobre los tokens del diseño visual base
// (brief-4.0, D-1 y D-5): nunca colores directos. Contraste AA y foco visible en claro y en
// oscuro (Screens.md, reglas comunes).

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const control =
  "rounded-xl border border-border-strong bg-surface px-3 py-2 text-base text-foreground";

const buttonBase = `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

// El relleno primario usa action, no primary (brief-15.1, D-2).
const primary = "bg-action text-on-action shadow-sm hover:bg-action-hover";

export const labelClass = "text-sm font-semibold text-foreground";

export const inputClass = `w-full min-w-0 ${control} aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger ${focusRing}`;

export const buttonClass = `w-full ${buttonBase} ${primary}`;

export const secondaryButtonClass = `inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted ${focusRing}`;

// Secundario de los mockups (brief-23.1, D-3): borde y texto violeta sobre la superficie, 7,10:1 en
// claro y 6,55:1 en oscuro. secondaryButtonClass, neutro, es el «terciario» de los mockups. Cada
// pantalla decide en la Fase 24 qué botón pasa a esta clase.
export const outlineButtonClass = `inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-primary bg-surface px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-soft ${focusRing}`;

export const fieldErrorClass = "text-sm font-medium text-danger";

export const formMessageClass = `rounded-xl border border-danger bg-danger-soft px-3 py-2 text-sm text-on-danger-soft ${focusRing}`;

// Pantallas con marco común (brief-3.7).

export const inlineButtonClass = `${buttonBase} ${primary}`;

export const dangerButtonClass = `${buttonBase} bg-danger text-on-danger hover:bg-danger-hover`;

export const primaryLinkClass = `${buttonBase} ${primary}`;

export const secondaryLinkClass = secondaryButtonClass;

// Acción peligrosa que abre una confirmación, como «Desactivar» (brief-15.4): borde y texto en
// danger sobre la superficie. El paso que confirma sigue siendo dangerButtonClass.
export const dangerOutlineLinkClass = `inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-danger bg-surface px-3 py-2 text-sm font-semibold text-danger hover:bg-danger-soft ${focusRing}`;

export const linkClass = `rounded-sm font-semibold text-primary underline decoration-1 underline-offset-4 hover:decoration-2 ${focusRing}`;

export const selectClass = `${control} ${focusRing}`;

export const radioClass = `h-4 w-4 accent-primary ${focusRing}`;

export const noticeClass = `rounded-xl border border-success bg-success-soft px-3 py-2 text-sm text-on-success-soft ${focusRing}`;

export const navLinkClass = `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${focusRing}`;

// Estructura de página (brief-4.0, D-5).

export const pageTitleClass =
  "text-3xl font-extrabold tracking-tight text-balance text-foreground";

// Subtítulo de una pantalla, debajo del título (brief-15.1).
export const pageSubtitleClass = "mt-1 text-base text-muted";

export const sectionTitleClass = "text-lg font-bold tracking-tight";

export const mutedTextClass = "text-sm text-muted";

export const cardClass = "rounded-xl border border-border bg-surface shadow-sm";

// Cuadro del ícono de una tarjeta (brief-15.1).
export const iconTileClass =
  "grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary";

export const tableHeadCellClass =
  "bg-surface-muted px-4 py-2.5 text-xs font-bold tracking-wider text-muted uppercase";

export const tableCellClass = "border-t border-border px-4 py-3 align-middle";

const badgeClass =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap";

export const roleBadgeClass = `${badgeClass} bg-primary-soft text-on-primary-soft`;

// El punto acompaña al texto, no lo reemplaza (brief-15.1).
export const activeBadgeClass = `${badgeClass} gap-1.5 bg-success-soft text-on-success-soft before:size-1.5 before:rounded-full before:bg-current before:content-['']`;

export const inactiveBadgeClass = `${badgeClass} bg-surface-muted text-muted`;
