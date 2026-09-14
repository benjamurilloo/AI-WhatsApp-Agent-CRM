import type { ReactNode } from "react";
import { getAppFrame } from "@/modules/organizations";
import { logoutAction } from "@/app/_auth/logout";
import { requireSession } from "@/app/_auth/session";
import { AppNav } from "@/app/_components/app-nav";
import { secondaryButtonClass } from "@/app/_components/form-styles";

// Marco común mínimo de las páginas autenticadas (brief-3.7, D-7; wireframe 02).
// Solo muestra datos: un layout no se vuelve a ejecutar en cada navegación, así que cada
// página y cada acción verifican la sesión por su cuenta. Los enlaces a pantallas de fases
// posteriores se agregan con cada fase.
export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await requireSession();
  const frame = await getAppFrame(context);
  const links = [
    { href: "/", label: "Inicio" },
    ...(context.role === "admin"
      ? [{ href: "/usuarios", label: "Usuarios" }]
      : []),
  ];

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <p className="font-semibold text-slate-900">
            {frame.organizationName}
          </p>
          <AppNav links={links} />
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <p className="text-sm text-slate-700">
              {frame.userName} ({frame.role})
            </p>
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
