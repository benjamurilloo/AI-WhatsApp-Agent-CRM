import type { ReactNode } from "react";
import { getAppFrame } from "@/modules/organizations";
import { logoutAction } from "@/app/_auth/logout";
import { requireSession } from "@/app/_auth/session";
import { AppNav } from "@/app/_components/app-nav";
import { Avatar } from "@/app/_components/avatar";
import { Brand } from "@/app/_components/brand";
import { secondaryButtonClass } from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import { CollapsiblePanel } from "@/app/_components/mobile-nav";
import { ThemeSelector } from "@/app/_components/theme-selector";
import { readTheme } from "@/app/_theme/read-theme";

// Marco común de las páginas autenticadas (brief-3.7, D-7; wireframe 02): panel lateral con la
// marca y la navegación, y barra superior con la organización, el tema y el usuario (brief-15.1,
// D-4 a D-6). Solo muestra datos: un layout no se vuelve a ejecutar en cada navegación, así que
// cada página y cada acción verifican la sesión por su cuenta.
export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await requireSession();
  const frame = await getAppFrame(context);
  const theme = await readTheme();
  const links: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/productos", label: "Productos", icon: "package" },
    { href: "/clientes", label: "Clientes", icon: "users" },
    // Pedidos, para los dos roles (brief-19.2).
    { href: "/pedidos", label: "Pedidos", icon: "list" },
    // Ventas, para los dos roles (brief-20.2).
    { href: "/ventas", label: "Ventas", icon: "receipt" },
    // La caja del efectivo y los medios de pago, para los dos roles (brief-21.2, D-10).
    { href: "/caja", label: "Caja", icon: "banknote" },
    // Compras, solo para admin, como Usuarios (brief-22.2, D-9; ADR 0023, punto 12). /compras lleva
    // a los proveedores, y el enlace queda marcado en todas sus pantallas.
    ...(context.role === "admin"
      ? [{ href: "/compras", label: "Compras", icon: "truck" as const }]
      : []),
    { href: "/conversaciones", label: "Conversaciones", icon: "messageCircle" },
    { href: "/informacion", label: "Información", icon: "info" },
    ...(context.role === "admin"
      ? [{ href: "/usuarios", label: "Usuarios", icon: "user" as const }]
      : []),
  ];

  return (
    // Al imprimir, sin grilla: con el panel oculto, el contenido quedaría en su columna de 16rem
    // (brief-20.2, revisión independiente, R-1).
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] print:block">
      {/* La columna lleva el fondo de punta a punta; el panel queda fijo arriba al desplazarse. */}
      {/* La navegación y la barra no se imprimen (brief-20.2, D-5). */}
      <div className="border-b border-border bg-sidebar lg:border-r lg:border-b-0 print:hidden">
        <div className="px-4 py-3 lg:sticky lg:top-0 lg:max-h-dvh lg:overflow-y-auto lg:px-4 lg:py-6">
          <CollapsiblePanel brand={<Brand />}>
            <AppNav links={links} />
          </CollapsiblePanel>
        </div>
      </div>
      <div className="min-w-0">
        <header className="border-b border-border bg-surface print:hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 lg:px-8">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <Icon name="building" className="size-4 text-muted" />
              <span className="sr-only">Organización: </span>
              <span className="truncate">{frame.organizationName}</span>
            </p>
            <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
              <ThemeSelector current={theme} />
              <div className="flex items-center gap-2.5">
                <Avatar name={frame.userName} />
                <p className="text-sm leading-tight">
                  <span className="block font-semibold text-foreground">
                    {frame.userName}
                  </span>{" "}
                  <span className="text-muted">({frame.role})</span>
                </p>
              </div>
              <form action={logoutAction}>
                <button type="submit" className={secondaryButtonClass}>
                  <Icon name="logOut" className="size-4" />
                  Salir
                </button>
              </form>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
