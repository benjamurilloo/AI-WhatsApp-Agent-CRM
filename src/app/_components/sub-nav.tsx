import Link from "next/link";
import { Icon, type IconName } from "./icons";

// Barra de enlaces a las subpantallas de un detalle (brief-15.4, D-3): no son pestañas, son
// páginas. La actual lleva aria-current. Desde la 24.3, cada enlace puede llevar una cantidad, que
// es parte de su nombre accesible («Abiertas 12»; brief-24.3, D-1).
export function SubNav({
  label,
  items,
}: {
  label: string;
  items: {
    href: string;
    label: string;
    icon: IconName;
    current: boolean;
    count?: number;
  }[];
}) {
  return (
    <nav aria-label={label} className="mt-6 border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-x-6 gap-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                item.current
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              <Icon name={item.icon} className="size-4" />
              {item.label}
              {/* El espacio separa la cantidad en el nombre accesible; en el flex no se ve. */}
              {item.count === undefined ? null : " "}
              {item.count === undefined ? null : (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground tabular-nums">
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
