import type { TagColor } from "@/modules/crm";

// Chip de una etiqueta de cliente (brief-16.1, D-4 y D-8). El color acompaña al nombre, nunca lo
// reemplaza. Cinco colores usan los tonos suaves ya comprobados del tema; el azul tiene los suyos.
// Las clases van completas para que Tailwind las encuentre.

const TONE: Record<TagColor, string> = {
  gray: "bg-surface-muted text-foreground",
  violet: "bg-primary-soft text-on-primary-soft",
  blue: "bg-tag-blue-soft text-on-tag-blue-soft",
  green: "bg-success-soft text-on-success-soft",
  amber: "bg-warning-soft text-on-warning-soft",
  red: "bg-danger-soft text-on-danger-soft",
};

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  gray: "Gris",
  violet: "Violeta",
  blue: "Azul",
  green: "Verde",
  amber: "Ámbar",
  red: "Rojo",
};

// Los colores en el orden en que se ofrecen. El Record obliga a que estén los seis de la paleta.
export const TAG_COLOR_OPTIONS = Object.keys(TAG_COLOR_LABEL) as TagColor[];

export const tagChipBaseClass =
  "inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold";

export function tagToneClass(color: TagColor): string {
  return TONE[color];
}

// Una etiqueta inactiva se sigue mostrando en los clientes que la tienen, con borde punteado y el
// texto «(inactiva)»: el estado no depende del color (D-8).
export function TagChip({
  name,
  color,
  isActive = true,
}: {
  name: string;
  color: TagColor;
  isActive?: boolean;
}) {
  return (
    <span
      className={`${tagChipBaseClass} ${TONE[color]} ${isActive ? "" : "border border-dashed border-current"}`}
    >
      <span className="truncate">{name}</span>
      {isActive ? null : <span className="font-normal">(inactiva)</span>}
    </span>
  );
}
