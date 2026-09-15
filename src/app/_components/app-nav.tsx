"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinkClass } from "./form-styles";

// Navegación del marco común (brief-3.7, D-7). Marca la sección actual con aria-current.
export function AppNav({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal">
      <ul className="flex flex-wrap gap-1">
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
                className={`${navLinkClass} ${current ? "bg-primary-soft text-on-primary-soft" : "text-muted hover:bg-surface-muted hover:text-foreground"}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
