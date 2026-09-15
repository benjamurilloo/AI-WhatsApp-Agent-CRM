// Clases compartidas de las pantallas (brief-3.5, D-2), sobre los tokens del diseño visual base
// (brief-4.0, D-1 y D-5): nunca colores directos. Contraste AA y foco visible en claro y en
// oscuro (Screens.md, reglas comunes).

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const control =
  "rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground";

const buttonBase = `inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

const primary = "bg-primary text-on-primary hover:bg-primary-hover";

export const labelClass = "text-sm font-semibold text-foreground";

export const inputClass = `w-full min-w-0 ${control} aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger ${focusRing}`;

export const buttonClass = `w-full ${buttonBase} ${primary}`;

export const secondaryButtonClass = `inline-flex shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted ${focusRing}`;

export const fieldErrorClass = "text-sm font-medium text-danger";

export const formMessageClass = `rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-on-danger-soft ${focusRing}`;

// Pantallas con marco común (brief-3.7).

export const inlineButtonClass = `${buttonBase} ${primary}`;

export const dangerButtonClass = `${buttonBase} bg-danger text-on-danger hover:bg-danger-hover`;

export const primaryLinkClass = `${buttonBase} ${primary}`;

export const secondaryLinkClass = secondaryButtonClass;

export const linkClass = `rounded-sm font-semibold text-primary underline decoration-1 underline-offset-4 hover:decoration-2 ${focusRing}`;

export const selectClass = `${control} ${focusRing}`;

export const radioClass = `h-4 w-4 accent-primary ${focusRing}`;

export const noticeClass = `rounded-md border border-success bg-success-soft px-3 py-2 text-sm text-on-success-soft ${focusRing}`;

export const navLinkClass = `block rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${focusRing}`;

// Estructura de página (brief-4.0, D-5).

export const pageTitleClass =
  "text-2xl font-bold tracking-tight text-balance text-foreground";

export const sectionTitleClass = "text-lg font-bold tracking-tight";

export const mutedTextClass = "text-sm text-muted";

export const cardClass = "rounded-xl border border-border bg-surface";

export const tableHeadCellClass =
  "bg-surface-muted px-4 py-2.5 text-xs font-bold tracking-wider text-muted uppercase";

export const tableCellClass = "border-t border-border px-4 py-3 align-middle";

const badgeClass =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap";

export const roleBadgeClass = `${badgeClass} bg-primary-soft text-on-primary-soft`;

export const activeBadgeClass = `${badgeClass} bg-success-soft text-on-success-soft`;

export const inactiveBadgeClass = `${badgeClass} bg-surface-muted text-muted`;
