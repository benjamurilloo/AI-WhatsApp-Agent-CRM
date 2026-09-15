import type { ReactNode } from "react";
import { getAppFrame } from "@/modules/organizations";
import { logoutAction } from "@/app/_auth/logout";
import { requireSession } from "@/app/_auth/session";
import { AppNav } from "@/app/_components/app-nav";
import { secondaryButtonClass } from "@/app/_components/form-styles";
import { ThemeSelector } from "@/app/_components/theme-selector";
import { readTheme } from "@/app/_theme/read-theme";

// Marco común mínimo de las páginas autenticadas (brief-3.7, D-7; wireframe 02), como barra
// superior (brief-4.0, D-7). Solo muestra datos: un layout no se vuelve a ejecutar en cada
// navegación, así que cada página y cada acción verifican la sesión por su cuenta. Los enlaces a
// pantallas de fases posteriores se agregan con cada fase.
export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await requireSession();
  const frame = await getAppFrame(context);
  const theme = await readTheme();
  const links = [
    { href: "/", label: "Inicio" },
    ...(context.role === "admin"
      ? [{ href: "/usuarios", label: "Usuarios" }]
      : []),
  ];

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-md bg-primary text-sm font-extrabold text-on-primary"
            >
              {frame.organizationName.trim().charAt(0).toUpperCase()}
            </span>
            <p className="font-extrabold tracking-tight">
              {frame.organizationName}
            </p>
          </div>
          <AppNav links={links} />
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">
                {frame.userName}
              </span>{" "}
              ({frame.role})
            </p>
            <ThemeSelector current={theme} />
            <form action={logoutAction}>
              <button type="submit" className={secondaryButtonClass}>
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
