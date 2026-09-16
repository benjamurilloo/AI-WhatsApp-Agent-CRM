import type { Metadata } from "next";
import Link from "next/link";
import { getClient, listClientAudit } from "@/modules/crm";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  linkClass,
  noticeClass,
  pageTitleClass,
  secondaryLinkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatShortDateTime } from "@/app/_format/date-time";
import { ClientForm } from "../client-form";
import type { SearchParams } from "../filters";
import {
  CLIENT_NOT_FOUND_MESSAGE,
  FORBIDDEN_PAGE_MESSAGE,
  noticeMessage,
} from "../messages";
import { PhoneText } from "../phone-text";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { DeactivateConfirm, ReactivateForm } from "./client-actions";

export const metadata: Metadata = {
  title: "Cliente — AI WhatsApp Agent CRM",
};

const TITLE = "Clientes";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Pantalla 7 (wireframe 07): datos y, solo para admin, edición, desactivación con confirmación e
// historial de auditoría paginado (FR-AUD-02). Sin última interacción ni conversaciones hasta la
// Fase 6 (brief-5.3, D-3).
export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { clientId } = await params;
  const query = await searchParams;

  const found = await getClient(context, clientId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={CLIENT_NOT_FOUND_MESSAGE}
        back={{ href: "/clientes", label: "Volver a clientes" }}
      />
    );
  }

  const client = found.client;
  const isAdmin = context.role === "admin";
  const editing = isAdmin && query.editar === "1";
  const confirming =
    isAdmin && query.confirmar === "desactivar" && client.isActive;
  const notice = noticeMessage(query.aviso);

  // La auditoría solo se pide para un admin: el servidor no la entrega a un viewer.
  const audit = isAdmin
    ? await listClientAudit(context, client.id, page(query.auditoria))
    : null;
  const timeZone = audit?.ok ? await getOrganizationTimezone(context) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p>
        <Link href="/clientes" className={linkClass}>
          Volver a clientes
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={pageTitleClass}>{client.displayName}</h1>
          <span
            className={client.isActive ? activeBadgeClass : inactiveBadgeClass}
          >
            {client.isActive ? "Activo" : "Inactivo"}
          </span>
        </div>
        {isAdmin && !editing ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/clientes/${client.id}?editar=1`}
              className={secondaryLinkClass}
            >
              Editar
            </Link>
            {client.isActive && !confirming ? (
              <Link
                href={`/clientes/${client.id}?confirmar=desactivar`}
                className={secondaryLinkClass}
              >
                Desactivar
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {confirming ? (
        <div className="mt-6">
          <DeactivateConfirm clientId={client.id} name={client.displayName} />
        </div>
      ) : null}

      {isAdmin && !client.isActive ? (
        <section
          aria-labelledby="estado-titulo"
          className={`mt-6 ${cardClass} p-6`}
        >
          <h2 id="estado-titulo" className={sectionTitleClass}>
            Estado
          </h2>
          <div className="mt-3">
            <ReactivateForm clientId={client.id} />
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="datos-titulo"
        className={`mt-6 ${cardClass} p-6`}
      >
        <h2 id="datos-titulo" className={sectionTitleClass}>
          Datos
        </h2>
        {editing && client.phone?.kind !== "masked" ? (
          <div className="mt-4">
            <ClientForm
              mode="editar"
              clientId={client.id}
              values={{
                displayName: client.displayName,
                phone: client.phone?.e164 ?? "",
                notes: client.notes ?? "",
              }}
            />
          </div>
        ) : (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold">Teléfono</dt>
            <dd>
              <PhoneText phone={client.phone} emptyText="Sin teléfono" />
            </dd>
            <dt className="font-semibold">Notas</dt>
            <dd className="whitespace-pre-line text-muted">
              {client.notes ?? "Sin notas"}
            </dd>
          </dl>
        )}
      </section>

      {audit?.ok && timeZone ? (
        <section
          aria-labelledby="auditoria-titulo"
          className={`mt-6 ${cardClass} p-6`}
        >
          <h2 id="auditoria-titulo" className={sectionTitleClass}>
            Historial de auditoría
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">
                Auditoría de {client.displayName}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Autor
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Acción
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Cambio
                  </th>
                </tr>
              </thead>
              <tbody>
                {audit.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(entry.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>{entry.actor.name}</td>
                    <td className={tableCellClass}>
                      {auditActionLabel(entry)}
                    </td>
                    <td className={`${tableCellClass} text-muted`}>
                      {describeAuditDiff(entry)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {audit.pageCount > 1 ? (
            <nav
              aria-label="Paginación de auditoría"
              className="mt-4 flex flex-wrap items-center justify-center gap-4"
            >
              {audit.page > 1 ? (
                <Link
                  href={`/clientes/${client.id}?auditoria=${audit.page - 1}`}
                  className={linkClass}
                >
                  Página anterior
                </Link>
              ) : null}
              <p className="text-sm text-muted tabular-nums">
                Página {audit.page} de {audit.pageCount}
              </p>
              {audit.page < audit.pageCount ? (
                <Link
                  href={`/clientes/${client.id}?auditoria=${audit.page + 1}`}
                  className={linkClass}
                >
                  Página siguiente
                </Link>
              ) : null}
            </nav>
          ) : null}
          <p className="mt-4 text-sm text-muted">Fechas en {timeZone}.</p>
        </section>
      ) : null}
    </main>
  );
}
