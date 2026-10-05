import Link from "next/link";
import { Icon, type IconName } from "./icons";

// Barra de enlaces a las subpantallas de un detalle (brief-15.4, D-3): no son pestañas, son
// páginas. La actual lleva aria-current.
export function SubNav({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; icon: IconName; current: boolean }[];
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
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
