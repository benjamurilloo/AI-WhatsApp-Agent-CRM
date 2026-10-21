import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getAppFrame } from "@/modules/organizations";
import { logoutAction } from "@/app/_auth/logout";
import { requireSession } from "@/app/_auth/session";
import { AppNav } from "@/app/_components/app-nav";
import { Avatar } from "@/app/_components/avatar";
import { Brand } from "@/app/_components/brand";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import {
  inputClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { BottomNav, SidebarColumn } from "@/app/_components/mobile-nav";
import type { NavLink } from "@/app/_components/nav-links";
import { NavigationProgress } from "@/app/_components/navigation-progress";
import { SearchIcon } from "@/app/_components/page-header";
import { SuggestInput } from "@/app/_components/suggest-input";
import { ThemeSelector } from "@/app/_components/theme-selector";
import { UserMenu } from "@/app/_components/user-menu";
import { readTheme } from "@/app/_theme/read-theme";
import { searchEverythingAction } from "./buscar/actions";

// Marco común de las páginas autenticadas (brief-3.7, D-7; wireframe 02), con el aspecto de los
// mockups del rediseño (brief-23.1): panel lateral con la marca, la navegación y el usuario al
// pie; barra superior con las migas, la búsqueda global (brief-23.3), el tema y el menú del usuario; y debajo de lg, una barra
// inferior en lugar del panel. Solo muestra datos: un layout no se vuelve a ejecutar en cada
// navegación, así que cada página y cada acción verifican la sesión por su cuenta.
export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await requireSession();
  const frame = await getAppFrame(context);
  const theme = await readTheme();
  // El orden de los mockups (brief-23.1, D-4).
  const links: NavLink[] = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/conversaciones", label: "Conversaciones", icon: "messageCircle" },
    { href: "/clientes", label: "Clientes", icon: "users" },
    { href: "/productos", label: "Productos", icon: "package" },
    // Modelos y atributos, solo con la capacidad variants (ADR 0024, punto 3; brief-29.2, D-3). Cada
    // página de /modelos vuelve a comprobar la capacidad: el menú no alcanza.
    ...(frame.capabilities.includes("variants")
      ? [{ href: "/modelos", label: "Modelos", icon: "layers" as const }]
      : []),
    // Los grados de las unidades, solo con la capacidad serialized_units (brief-29.5, D-5), con la
    // misma regla: la página vuelve a comprobarla.
    ...(frame.capabilities.includes("serialized_units")
      ? [{ href: "/grados", label: "Grados", icon: "tag" as const }]
      : []),
    // Las reparaciones, para los dos roles y solo con la capacidad repairs (brief-29.6, D-10), con la
    // misma regla: cada página vuelve a comprobarla.
    ...(frame.capabilities.includes("repairs")
      ? [
          {
            href: "/reparaciones",
            label: "Reparaciones",
            icon: "wrench" as const,
          },
        ]
      : []),
    // Los usados, para los dos roles y solo con la capacidad trade_ins (brief-29.7, D-7), con la misma
    // regla: cada página vuelve a comprobarla.
    ...(frame.capabilities.includes("trade_ins")
      ? [
          {
            href: "/usados",
            label: "Usados",
            icon: "smartphone" as const,
          },
        ]
      : []),
    // Pedidos, para los dos roles (brief-19.2).
    { href: "/pedidos", label: "Pedidos", icon: "list" },
    // Ventas, para los dos roles (brief-20.2).
    { href: "/ventas", label: "Ventas", icon: "receipt" },
    // La caja del efectivo y los medios de pago, para los dos roles (brief-21.2, D-10).
    { href: "/caja", label: "Caja", icon: "banknote" },
    // Compras, solo para admin, como Usuarios (brief-22.2, D-9; ADR 0023, punto 12). /compras lleva
    // a las órdenes de compra desde la 22.3 (brief-22.3, D-10), y el enlace queda marcado en todas
    // sus pantallas.
    ...(context.role === "admin"
      ? [{ href: "/compras", label: "Compras", icon: "truck" as const }]
      : []),
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
      <SidebarColumn>
        <div className="flex flex-col gap-6 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:py-6">
          <Brand />
          <AppNav links={links} />
          {/* El usuario al pie del panel, como texto (brief-23.1, D-5): las acciones están en el
              menú de la barra superior. */}
          <div className="mt-auto hidden items-center gap-3 border-t border-border pt-4 lg:flex">
            <Avatar name={frame.userName} />
            <p className="min-w-0 text-sm leading-tight">
              <span className="block truncate font-semibold text-foreground">
                {frame.userName}
              </span>
              <span className="text-muted">{frame.role}</span>
            </p>
          </div>
        </div>
      </SidebarColumn>
      {/* Debajo de lg, el margen inferior deja ver lo que tapa la barra inferior. */}
      <div className="min-w-0 pb-24 lg:pb-0 print:pb-0">
        <header className="border-b border-border bg-surface print:hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-8">
            <span className="lg:hidden">
              <Brand />
            </span>
            <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
              <Breadcrumbs
                organizationName={frame.organizationName}
                links={links}
              />
            </div>
            {/* La búsqueda global desde lg (brief-23.3, D-5): un formulario GET a /buscar, con las
                sugerencias agrupadas mientras se escribe. Enter sin una opción elegida abre la
                página de resultados; sin JavaScript, es el formulario solo. */}
            <form
              method="get"
              action="/buscar"
              role="search"
              aria-label="Búsqueda global"
              className="hidden w-full max-w-md lg:block"
            >
              <label htmlFor="busqueda-global" className="sr-only">
                Buscar en el sistema
              </label>
              <div className="relative">
                <SuggestInput
                  id="busqueda-global"
                  name="q"
                  type="search"
                  placeholder="Buscar en el sistema…"
                  className={`${inputClass} pl-9`}
                  listClassName="max-h-[min(28rem,70dvh)] min-w-80"
                  load={searchEverythingAction}
                >
                  <SearchIcon />
                </SuggestInput>
              </div>
            </form>
            <div className="ml-auto flex items-center gap-3">
              {/* Debajo de lg, la lupa lleva a /buscar (D-5). Se llama como el campo de escritorio, y
                  no «Buscar», que es el nombre del buscador de cada lista. */}
              <Link
                href="/buscar"
                aria-label="Buscar en el sistema"
                className={`${secondaryButtonClass} lg:hidden`}
              >
                <Icon name="search" className="size-4" />
              </Link>
              <ThemeSelector current={theme} />
              <UserMenu userName={frame.userName}>
                <p className="text-sm leading-tight">
                  <span className="block font-semibold text-foreground">
                    {frame.userName}
                  </span>{" "}
                  <span className="text-muted">({frame.role})</span>
                </p>
                <form
                  action={logoutAction}
                  className="mt-3 border-t border-border pt-3"
                >
                  <button
                    type="submit"
                    className={`w-full ${secondaryButtonClass}`}
                  >
                    <Icon name="logOut" className="size-4" />
                    Salir
                  </button>
                </form>
              </UserMenu>
            </div>
          </div>
        </header>
        {children}
      </div>
      <BottomNav links={links} />
      {/* La barra de carga (brief-23.2, D-3): useSearchParams pide su propio suspenso. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
    </div>
  );
}
