// Paleta fija de las etiquetas de clientes (brief-16.1, D-4). La usan el CHECK de la base, la
// validación del servicio y la pantalla, así que no pueden separarse. Cada color tiene sus tokens
// de fondo y de texto en claro y en oscuro, con el contraste comprobado por axe.
export const TAG_COLORS = [
  "gray",
  "violet",
  "blue",
  "green",
  "amber",
  "red",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export const DEFAULT_TAG_COLOR: TagColor = "gray";

export function isTagColor(value: unknown): value is TagColor {
  return (TAG_COLORS as readonly unknown[]).includes(value);
}
