import Link from "next/link";
import { Icon, type IconName } from "./icons";

// Barra de enlaces a las subpantallas de un detalle (brief-15.4, D-3): no son pestañas, son
// páginas. La actual lleva aria-current. Desde la 24.3, cada enlace puede llevar una cantidad, que
// es parte de su nombre accesible («Abiertas 12»; brief-24.3, D-1).
//
// **Desde la 24.7.1, un «Más» opcional** (brief-24.7.1, D-3): los destinos secundarios de una
// sección con muchos. *Es un desvío de la lista cerrada de esa subfase, autorizado por el usuario el
// 2026-11-04*, y se hizo acá y no con una barra propia de caja justamente para que **no haya dos
// barras de sección en el sistema**: una copia a mano de un componente compartido es lo que el
// recorrido de la 24.6.2-d encontró en el encabezado de la venta.
//
// **Sin `more`, nada cambia**: las pantallas que no lo pasan dibujan exactamente lo de antes.
//
// Dos reglas que vienen del lote V2-13 y del V2-10, y que el componente hace cumplir:
//
// - **no se duplica en el menú lo que ya está visible**;
// - **el menú no esconde la sección activa**: si la actual es secundaria, sube a la barra y sale
//   del menú, para que nunca haya que abrir un desplegable para saber dónde estás.
//
// Es un `<details>`, así que abre y cierra **sin JavaScript**, como las demás piezas de la fase.
export type SubNavItem = {
  href: string;
  label: string;
  // Opcional desde la 24.3.1: las pestañas de la bandeja van sin ícono, como la v2.
  icon?: IconName;
  current: boolean;
  count?: number;
};

export function SubNav({
  label,
  items,
  more,
  scroll = false,
}: {
  label: string;
  // Opción de la 24.3.1: en el teléfono, una sola fila con su propio desplazamiento.
  scroll?: boolean;
  items: SubNavItem[];
  more?: SubNavItem[];
}) {
  // La sección activa nunca se esconde: si es una de las secundarias, se dibuja en la barra.
  const activaEnMas = (more ?? []).filter((item) => item.current);
  const visibles = [...items, ...activaEnMas];
  const enMenu = (more ?? []).filter((item) => !item.current);
  return (
    <nav aria-label={label} className="mt-6 border-b border-border">
      <ul
        className={
          scroll
            ? "-mb-px flex gap-x-5 overflow-x-auto sm:flex-wrap sm:gap-x-6 sm:gap-y-1 sm:overflow-visible"
            : "-mb-px flex flex-wrap gap-x-6 gap-y-1"
        }
      >
        {visibles.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 ${scroll ? "whitespace-nowrap" : ""} text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                item.current
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {item.icon ? <Icon name={item.icon} className="size-4" /> : null}
              {item.label}
              {/* El espacio separa la cantidad en el nombre accesible; en el flex no se ve. */}
              {item.count === undefined ? null : " "}
              {item.count === undefined ? null : (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${item.current ? "bg-primary-soft text-on-primary-soft" : "bg-surface-muted text-foreground"}`}
                >
                  {item.count}
                </span>
              )}
            </Link>
          </li>
        ))}
        {enMenu.length > 0 ? (
          <li>
            <details className="relative">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-muted hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                Más
                <Icon name="chevronDown" className="size-4" />
              </summary>
              <ul className="absolute right-0 z-20 mt-1 w-max min-w-44 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                {enMenu.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                    >
                      {item.icon ? (
                        <Icon name={item.icon} className="size-4" />
                      ) : null}
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
