import type { ReactNode } from "react";
import { cardClass, iconTileClass, sectionTitleClass } from "./form-styles";
import { Icon, type IconName } from "./icons";

// Tarjeta de una sección de un detalle o de un formulario (brief-15.4): ícono, título y, si
// corresponde, una descripción y una acción a la derecha. La región toma el nombre del título.
export function SectionCard({
  id,
  title,
  icon,
  description,
  action,
  className = "",
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`${cardClass} min-w-0 p-5 sm:p-6 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={iconTileClass}>
            <Icon name={icon} />
          </span>
          <div className="min-w-0">
            <h2 id={id} className={sectionTitleClass}>
              {title}
            </h2>
            {description ? (
              <p className="text-sm text-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
