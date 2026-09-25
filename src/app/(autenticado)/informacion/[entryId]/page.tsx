import type { Metadata } from "next";
import Link from "next/link";
import {
  getKnowledgeEntry,
  listKnowledgeAudit,
  listKnowledgeCategories,
} from "@/modules/knowledge";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import {
  cardClass,
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
import type { SearchParams } from "../filters";
import { KnowledgeForm } from "../knowledge-form";
import {
  ENTRY_NOT_FOUND_MESSAGE,
  FORBIDDEN_PAGE_MESSAGE,
  formatValidity,
  noticeMessage,
} from "../messages";
import { KnowledgeStatusBadge } from "../status-badge";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { DeactivateConfirm, ReactivateForm } from "./entry-actions";

export const metadata: Metadata = {
  title: "Entrada — AI WhatsApp Agent CRM",
};

const TITLE = "Información del negocio";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Pantalla 12 (brief-11.2, D-7): el contenido completo con sus saltos de línea y la vigencia. Solo
// para admin: edición, desactivación con confirmación, reactivación y la auditoría paginada
// (FR-INFO-01, FR-AUD-02). Un viewer lee, sin formularios ni auditoría.
export default async function KnowledgeEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { entryId } = await params;
  const query = await searchParams;

  const found = await getKnowledgeEntry(context, entryId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={ENTRY_NOT_FOUND_MESSAGE}
        back={{
          href: "/informacion",
          label: "Volver a información del negocio",
        }}
      />
    );
  }

  const entry = found.entry;
  const isAdmin = context.role === "admin";
  const editing = isAdmin && query.editar === "1";
  const confirming =
    isAdmin && query.confirmar === "desactivar" && entry.isActive;
  const notice = noticeMessage(query.aviso);

  const timeZone = await getOrganizationTimezone(context);
  // La auditoría solo se pide para un admin: el servidor no la entrega a un viewer.
  const audit = isAdmin
    ? await listKnowledgeAudit(context, entry.id, page(query.auditoria))
    : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const categories = editing ? await listKnowledgeCategories(context) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p>
        <Link href="/informacion" className={linkClass}>
          Volver a información del negocio
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={pageTitleClass}>{entry.title}</h1>
          <KnowledgeStatusBadge status={entry.status} />
        </div>
        {isAdmin && !editing ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/informacion/${entry.id}?editar=1`}
              className={secondaryLinkClass}
            >
              Editar
            </Link>
            {entry.isActive && !confirming ? (
              <Link
                href={`/informacion/${entry.id}?confirmar=desactivar`}
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
          <DeactivateConfirm entryId={entry.id} title={entry.title} />
        </div>
      ) : null}

      {isAdmin && !entry.isActive ? (
        <section
          aria-labelledby="estado-titulo"
          className={`mt-6 ${cardClass} p-6`}
        >
          <h2 id="estado-titulo" className={sectionTitleClass}>
            Estado
          </h2>
          <p className="mt-1 text-sm text-muted">
            Está desactivada: no se considera vigente aunque esté dentro de sus
            fechas.
          </p>
          <div className="mt-3">
            <ReactivateForm entryId={entry.id} />
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="datos-titulo"
        className={`mt-6 ${cardClass} p-6`}
      >
        <h2 id="datos-titulo" className={sectionTitleClass}>
          {editing ? "Editar entrada" : "Datos"}
        </h2>
        {editing ? (
          <div className="mt-4">
            <KnowledgeForm
              mode="editar"
              entryId={entry.id}
              values={{
                title: entry.title,
                category: entry.category,
                content: entry.content,
                validFrom: entry.validFrom ?? "",
                validUntil: entry.validUntil ?? "",
              }}
              categories={categories?.ok ? categories.categories : []}
            />
          </div>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-semibold">Categoría</dt>
              <dd>{entry.category}</dd>
              <dt className="font-semibold">Vigencia</dt>
              <dd>{formatValidity(entry.validFrom, entry.validUntil)}</dd>
              <dt className="font-semibold">Actualizada</dt>
              <dd>{formatShortDateTime(entry.updatedAt, timeZone)}</dd>
            </dl>
            <h3 className="mt-6 text-sm font-bold tracking-wider text-muted uppercase">
              Contenido
            </h3>
            <p className="mt-2 break-words whitespace-pre-wrap">
              {entry.content}
            </p>
          </>
        )}
      </section>

      {audit?.ok ? (
        <section
          aria-labelledby="auditoria-titulo"
          className={`mt-6 ${cardClass} p-6`}
        >
          <h2 id="auditoria-titulo" className={sectionTitleClass}>
            Historial de auditoría
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Auditoría de {entry.title}</caption>
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
                {audit.entries.map((log) => (
                  <tr key={log.id}>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(log.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>
                      {actorLabel?.(log.actor)}
                    </td>
                    <td className={tableCellClass}>{auditActionLabel(log)}</td>
                    <td className={`${tableCellClass} text-muted`}>
                      {describeAuditDiff(log)}
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
                  href={`/informacion/${entry.id}?auditoria=${audit.page - 1}`}
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
                  href={`/informacion/${entry.id}?auditoria=${audit.page + 1}`}
                  className={linkClass}
                >
                  Página siguiente
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      ) : null}

      <p className="mt-6 text-sm text-muted">
        La vigencia se calcula con el día de {timeZone}.
      </p>
    </main>
  );
}
