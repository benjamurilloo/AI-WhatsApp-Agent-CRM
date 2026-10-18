import Link from "next/link";
import { cardClass, outlineButtonClass, primaryLinkClass } from "./form-styles";
import { Icon, type IconName } from "./icons";

export type EmptyStateAction = {
  href: string;
  label: string;
  // «primary» para crear el primero; «outline» para volver atrás, como «Limpiar filtros».
  variant: "primary" | "outline";
};

const ACTION_ICON: Record<EmptyStateAction["variant"], IconName> = {
  primary: "plus",
  outline: "filter",
};

// Lista vacía o búsqueda sin resultados (brief-23.2, D-2): el ícono de la sección en un círculo
// violeta suave, el texto de siempre como título, una descripción y hasta dos acciones. El título
// es un párrafo y no un encabezado, para no romper la jerarquía de la página; el ícono es
// decorativo.
export function EmptyState({
  icon,
  title,
  description,
  actions = [],
  className = "mt-8",
}: {
  icon: IconName;
  title: string;
  description?: string;
  actions?: readonly EmptyStateAction[];
  className?: string;
}) {
  return (
    <div
      className={`${className} ${cardClass} flex flex-col items-center px-6 py-10 text-center`}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} className="size-7" />
      </span>
      <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      ) : null}
      {actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={
                action.variant === "primary"
                  ? primaryLinkClass
                  : outlineButtonClass
              }
            >
              <Icon name={ACTION_ICON[action.variant]} className="size-4" />
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
