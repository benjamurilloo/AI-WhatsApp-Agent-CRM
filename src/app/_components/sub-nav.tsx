import Link from "next/link";
import { Icon, type IconName } from "./icons";

// Barra de enlaces a las subpantallas de un detalle (brief-15.4, D-3): no son pestañas, son
// páginas. La actual lleva aria-current. Desde la 24.3, cada enlace puede llevar una cantidad, que
// es parte de su nombre accesible («Abiertas 12»; brief-24.3, D-1).
export function SubNav({
  label,
  items,
  scroll = false,
}: {
  label: string;
  // Opción de la 24.3.1: en el teléfono, una sola fila con su propio desplazamiento.
  scroll?: boolean;
  items: {
    href: string;
    label: string;
    // Opcional desde la 24.3.1: las pestañas de la bandeja van sin ícono, como la v2.
    icon?: IconName;
    current: boolean;
    count?: number;
  }[];
}) {
  return (
    <nav aria-label={label} className="mt-6 border-b border-border">
      <ul
        className={
          scroll
            ? "-mb-px flex gap-x-5 overflow-x-auto sm:flex-wrap sm:gap-x-6 sm:gap-y-1 sm:overflow-visible"
            : "-mb-px flex flex-wrap gap-x-6 gap-y-1"
        }
      >
        {items.map((item) => (
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
      </ul>
    </nav>
  );
}
