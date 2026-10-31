import Link from "next/link";
import type { ModelTotals } from "@/modules/inventory";
import { NO_MODEL_GROUP } from "@/modules/inventory";
import { linkClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { formatQuantity, quantityFromDatabase } from "@/shared/quantity";

// El encabezado de un grupo del catálogo agrupado por modelo (brief-24.5.1, D-2, D-3 y D-4).
//
// Tres cosas en una fila, y dos destinos distintos, como las láminas 01 y 07:
// - el chevron, que cierra o abre el grupo; es un enlace con el estado en la URL, así que funciona
//   sin JavaScript;
// - el nombre del modelo con sus sumas debajo, que describen el **resultado filtrado entero** y no
//   la página que se ve;
// - «Ver modelo», que lleva a su ficha en /modelos/<id> (AC-4).
//
// El nombre es texto y no enlace, como en la v2: así el grupo tiene un solo enlace a la ficha del
// modelo y no dos con nombres distintos al mismo destino. El grupo «Sin modelo» no tiene ficha
// adónde ir, así que no lleva «Ver modelo».
//
// Las clases deshacen las del encabezado de tabla que lo contiene (versalitas y espaciado): el
// nombre de un modelo se escribe como se llama.
export function ModelGroupHeading({
  name,
  modelId,
  collapsed,
  href,
  totals,
  filtered,
}: {
  name: string;
  modelId: string;
  collapsed: boolean;
  href: string;
  totals: ModelTotals | null;
  filtered: boolean;
}) {
  const hasModel = modelId !== NO_MODEL_GROUP;
  // El texto ya formateado decide el plural: "1" es singular y cualquier otra cosa, plural. Así no
  // hay que saber en qué escala guarda la base una cantidad.
  const available = totals ? formatQuantity(totals.quantityAvailable) : "";
  const reserved = totals ? formatQuantity(totals.quantityReserved) : "";
  const hasReserved =
    totals !== null && quantityFromDatabase(totals.quantityReserved) > 0n;
  return (
    <span className="flex w-full items-center gap-3 tracking-normal normal-case">
      <Link
        href={href}
        aria-expanded={!collapsed}
        aria-label={
          collapsed ? `Abrir el grupo ${name}` : `Cerrar el grupo ${name}`
        }
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-surface"
      >
        <Icon name={collapsed ? "chevronRight" : "chevronDown"} />
      </Link>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold text-foreground">{name}</span>
        {totals ? (
          <span className="text-xs font-normal text-muted">
            {totals.products}{" "}
            {totals.products === 1 ? "presentación" : "presentaciones"}
            {" · "}
            {available} {available === "1" ? "disponible" : "disponibles"}
            {hasReserved ? (
              <>
                {" · "}
                {reserved} {reserved === "1" ? "reservada" : "reservadas"}
              </>
            ) : null}
            {/* Con un filtro puesto, las sumas son de lo filtrado y no del modelo entero: decirlo,
                para no afirmar un total que no es el del modelo (brief-24.5.1, D-2). */}
            {filtered ? " (del resultado filtrado)" : null}
          </span>
        ) : null}
      </span>
      {hasModel ? (
        <Link
          href={`/modelos/${modelId}`}
          className={`${linkClass} ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold`}
        >
          Ver modelo
          <Icon name="chevronRight" className="size-4" />
        </Link>
      ) : null}
    </span>
  );
}
