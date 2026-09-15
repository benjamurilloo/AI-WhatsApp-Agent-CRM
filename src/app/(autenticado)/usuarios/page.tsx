import type { Metadata } from "next";
import Link from "next/link";
import { listMembers } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  labelClass,
  linkClass,
  pageTitleClass,
  primaryLinkClass,
  roleBadgeClass,
  secondaryButtonClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import {
  hasActiveFilters,
  memberFiltersHref,
  parseMemberFilters,
  type SearchParams,
} from "./filters";
import { FORBIDDEN_PAGE_MESSAGE, NO_RESULTS_MESSAGE } from "./messages";

export const metadata: Metadata = {
  title: "Usuarios y roles — AI WhatsApp Agent CRM",
};

const TITLE = "Usuarios y roles";

// Pantalla 10: lista con filtros y página en la URL (brief-3.7). Tabla en escritorio y
// tarjetas en móvil; la versión oculta no entra al árbol de accesibilidad.
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseMemberFilters(await searchParams);
  const result = await listMembers(context, filters);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const filtered = hasActiveFilters(filters);
  const self = (isSelf: boolean) => (isSelf ? " (vos)" : "");
  const status = (isActive: boolean) => (isActive ? "Activo" : "Inactivo");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={pageTitleClass}>{TITLE}</h1>
        <Link href="/usuarios/nuevo" className={primaryLinkClass}>
          + Nuevo usuario
        </Link>
      </div>

      <form
        key={memberFiltersHref(filters)}
        method="get"
        action="/usuarios"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="rol" className={labelClass}>
            Rol
          </label>
          <select
            id="rol"
            name="rol"
            defaultValue={filters.role === "all" ? "todos" : filters.role}
            className={selectClass}
          >
            <option value="todos">Todos</option>
            <option value="admin">admin</option>
            <option value="viewer">viewer</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="estado" className={labelClass}>
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={
              { active: "activos", inactive: "inactivos", all: "todos" }[
                filters.status
              ]
            }
            className={selectClass}
          >
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <button type="submit" className={secondaryButtonClass}>
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/usuarios" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <div className={`mt-8 ${cardClass} p-6`}>
          <p>{NO_RESULTS_MESSAGE}</p>
          <p className="mt-3">
            <Link href="/usuarios" className={linkClass}>
              Limpiar filtros
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div className={`mt-8 hidden overflow-hidden md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Usuarios de la organización</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Nombre
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Email
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Rol
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Activo
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.members.map((member) => (
                  <tr key={member.id}>
                    <td className={`${tableCellClass} font-semibold`}>
                      {member.name}
                      {self(member.isSelf)}
                    </td>
                    <td className={`${tableCellClass} break-all text-muted`}>
                      {member.email}
                    </td>
                    <td className={tableCellClass}>
                      <span className={roleBadgeClass}>{member.role}</span>
                    </td>
                    <td className={tableCellClass}>
                      <span
                        className={
                          member.isActive
                            ? activeBadgeClass
                            : inactiveBadgeClass
                        }
                      >
                        {member.isActive ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className={`${tableCellClass} text-right`}>
                      <Link
                        href={`/usuarios/${member.id}`}
                        className={linkClass}
                      >
                        Editar<span className="sr-only"> a {member.name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Usuarios de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.members.map((member) => (
              <li key={member.id} className={`${cardClass} p-4`}>
                <p className="font-semibold">
                  {member.name}
                  {self(member.isSelf)}
                </p>
                <p className="text-sm break-all text-muted">{member.email}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm">
                    {member.role} · {status(member.isActive)}
                  </p>
                  <Link href={`/usuarios/${member.id}`} className={linkClass}>
                    Editar<span className="sr-only"> a {member.name}</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.pageCount > 1 ? (
        <nav
          aria-label="Paginación"
          className="mt-6 flex flex-wrap items-center justify-center gap-4"
        >
          {result.page > 1 ? (
            <Link
              href={memberFiltersHref({ ...filters, page: result.page - 1 })}
              className={linkClass}
            >
              Página anterior
            </Link>
          ) : null}
          <p className="text-sm text-muted tabular-nums">
            Página {result.page} de {result.pageCount}
          </p>
          {result.page < result.pageCount ? (
            <Link
              href={memberFiltersHref({ ...filters, page: result.page + 1 })}
              className={linkClass}
            >
              Página siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
