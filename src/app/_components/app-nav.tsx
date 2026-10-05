"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinkClass } from "./form-styles";
import { Icon, type IconName } from "./icons";

// Navegación del marco común (brief-3.7, D-7), como lista vertical del panel lateral con un ícono
// por sección (brief-15.1). Marca la sección actual con aria-current.
export function AppNav({
  links,
}: {
  links: { href: string; label: string; icon: IconName }[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-1">
        {links.map((link) => {
          const current =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`${navLinkClass} ${current ? "bg-action text-on-action shadow-sm" : "text-foreground hover:bg-surface-muted"}`}
              >
                <Icon name={link.icon} className="size-5" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
