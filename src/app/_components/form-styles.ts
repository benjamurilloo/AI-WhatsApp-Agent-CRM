// Clases compartidas de los formularios (brief-3.5, D-2). Contraste AA y foco visible
// (Screens.md, reglas comunes).

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";

export const labelClass = "text-sm font-medium text-slate-900";

export const inputClass = `w-full min-w-0 rounded-md border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 aria-invalid:border-red-700 ${focusRing}`;

export const buttonClass = `w-full rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-500 ${focusRing}`;

export const secondaryButtonClass = `shrink-0 rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 ${focusRing}`;

export const fieldErrorClass = "text-sm text-red-700";

export const formMessageClass = `rounded-md border border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800 ${focusRing}`;
