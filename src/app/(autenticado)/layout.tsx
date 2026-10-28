import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getAppFrame, getMainCurrency } from "@/modules/organizations";
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
import {
  BottomNav,
  ContentColumn,
  SidebarColumn,
} from "@/app/_components/mobile-nav";
import { visibleGroups, type NavGroup } from "@/app/_components/nav-links";
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
  // Sin moneda principal, la cotización no existe (brief-29.4, D-4), como en el sub-menú de la caja.
  const mainCurrency = await getMainCurrency(context.organizationId);
  const theme = await readTheme();
  const admin = context.role === "admin";
  const has = (capability: (typeof frame.capabilities)[number]) =>
    frame.capabilities.includes(capability);
  // Los grupos por tarea de la v2 (brief-24.1, D-1). Cada destino aparece solo si su capacidad y
  // su rol lo permiten, y un grupo sin destinos no se muestra. El menú no alcanza: cada página
  // vuelve a comprobar la sesión, el rol y la capacidad.
  const groups: NavGroup[] = visibleGroups([
    {
      id: "inicio",
      label: null,
      links: [{ href: "/", label: "Inicio", icon: "home" }],
    },
    {
      id: "atencion",
      label: "Atención",
      links: [
        {
          href: "/conversaciones",
          label: "Conversaciones",
          icon: "messageCircle",
        },
        { href: "/clientes", label: "Clientes", icon: "users" },
        // Los turnos, para los dos roles y solo con la capacidad appointments (brief-29.10, D-5).
        ...(has("appointments")
          ? [{ href: "/turnos", label: "Turnos", icon: "calendar" as const }]
          : []),
      ],
    },
    {
      id: "catalogo",
      label: "Catálogo e inventario",
      links: [
        { href: "/productos", label: "Productos", icon: "package" },
        // Modelos y atributos, solo con la capacidad variants (ADR 0024, punto 3; brief-29.2, D-3).
        ...(has("variants")
          ? [{ href: "/modelos", label: "Modelos", icon: "layers" as const }]
          : []),
        // Los grados de las unidades, solo con la capacidad serialized_units (brief-29.5, D-5).
        ...(has("serialized_units")
          ? [{ href: "/grados", label: "Grados", icon: "tag" as const }]
          : []),
        // Los usados, para los dos roles y solo con la capacidad trade_ins (brief-29.7, D-7).
        ...(has("trade_ins")
          ? [{ href: "/usados", label: "Usados", icon: "smartphone" as const }]
          : []),
      ],
    },
    {
      id: "servicio",
      label: "Servicio técnico",
      // Las reparaciones, para los dos roles y solo con la capacidad repairs (brief-29.6, D-10).
      links: has("repairs")
        ? [{ href: "/reparaciones", label: "Reparaciones", icon: "wrench" }]
        : [],
    },
    {
      id: "comercial",
      label: "Comercial",
      // Pedidos y ventas, para los dos roles (brief-19.2 y brief-20.2).
      links: [
        { href: "/pedidos", label: "Pedidos", icon: "list" },
        { href: "/ventas", label: "Ventas", icon: "receipt" },
      ],
    },
    {
      id: "finanzas",
      label: "Finanzas",
      // La caja, los deudores y la cotización, para los dos roles (brief-21.2, D-10): sus
      // servicios autorizan a cualquier miembro (brief-24.1, H-4). La cotización, solo con moneda
      // principal.
      links: [
        { href: "/caja", label: "Caja", icon: "banknote" },
        {
          href: "/caja/deudores",
          label: "Cuentas de clientes",
          icon: "fileText",
        },
        ...(mainCurrency
          ? [
              {
                href: "/caja/cotizacion",
                label: "Tipo de cambio",
                icon: "trendingUp" as const,
              },
            ]
          : []),
      ],
    },
    {
      id: "abastecimiento",
      label: "Abastecimiento",
      // Solo para admin, como Usuarios (brief-22.2, D-9; ADR 0023, punto 12). /compras lleva a las
      // órdenes de compra desde la 22.3 (brief-22.3, D-10).
      links: admin
        ? [
            // «/compras» y no «/compras/ordenes» (adonde redirige): así «A pagar» y las demás
            // subrutas sin destino propio marcan Compras.
            { href: "/compras", label: "Compras", icon: "truck" },
            {
              href: "/compras/recepciones",
              label: "Recepciones",
              icon: "package",
            },
            { href: "/compras/pagos", label: "Pagos", icon: "creditCard" },
            {
              href: "/compras/proveedores",
              label: "Proveedores",
              icon: "building",
            },
          ]
        : [],
    },
    {
      id: "administracion",
      label: "Administración",
      links: [
        { href: "/informacion", label: "Información", icon: "info" },
        // El horario, para los dos roles (brief-24.1, H-4).
        { href: "/informacion/horario", label: "Horarios", icon: "clock" },
        ...(admin
          ? [{ href: "/usuarios", label: "Usuarios", icon: "user" as const }]
          : []),
      ],
    },
  ]);

  return (
    // Al imprimir, sin grilla: con el panel oculto, el contenido quedaría en su columna de 16rem
    // (brief-20.2, revisión independiente, R-1).
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] print:block">
      {/* La columna lleva el fondo de punta a punta; el panel queda fijo arriba al desplazarse. */}
      {/* La navegación y la barra no se imprimen (brief-20.2, D-5). */}
      <SidebarColumn>
        <div className="flex flex-col gap-6 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:py-6">
          <Brand />
          <AppNav groups={groups} />
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
      <ContentColumn>
        <header className="border-b border-border bg-surface print:hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-8">
            <span className="lg:hidden">
              <Brand />
            </span>
            <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
              <Breadcrumbs
                organizationName={frame.organizationName}
                groups={groups}
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
      </ContentColumn>
      <BottomNav groups={groups} />
      {/* La barra de carga (brief-23.2, D-3): useSearchParams pide su propio suspenso. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
    </div>
  );
}
