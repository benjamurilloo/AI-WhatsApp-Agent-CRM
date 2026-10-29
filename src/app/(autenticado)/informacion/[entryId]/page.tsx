import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import {
  getKnowledgeEntry,
  listKnowledgeAudit,
  listKnowledgeCategories,
} from "@/modules/knowledge";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { ActionNotice } from "@/app/_components/action-notice";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { DetailList } from "@/app/_components/detail-list";
import {
  primaryLinkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import {
  moreActionDangerClass,
  moreActionItemClass,
} from "@/app/_components/more-action-styles";
import { MoreActions } from "@/app/_components/more-actions";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { categoryIcon } from "../category-icon";
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
// (FR-INFO-01, FR-AUD-02). Un viewer lee, sin formularios ni auditoría. Presentación de la 15.4:
// tarjetas y el ícono de la categoría, sin pestañas (brief-15.4, D-3). Desde la 24.1, la ficha de
// referencia del patrón de la v2 (brief-24.1, D-8): la acción primaria es la siguiente transición
// válida («Editar», o «Reactivar» si está inactiva) y «Desactivar» vive en «Más acciones».
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
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/informacion" label="Volver a información del negocio" />

      <DetailHeader
        title={entry.title}
        leading={<HeaderIcon name={categoryIcon(entry.category)} />}
        badges={<KnowledgeStatusBadge status={entry.status} />}
        subtitle={entry.category}
        primary={
          isAdmin && !editing ? (
            entry.isActive ? (
              <Link
                href={`/informacion/${entry.id}?editar=1`}
                className={primaryLinkClass}
              >
                <Icon name="pencil" className="size-4" />
                Editar
              </Link>
            ) : (
              <ReactivateForm entryId={entry.id} />
            )
          ) : null
        }
        actions={
          isAdmin && !editing && !entry.isActive ? (
            <Link
              href={`/informacion/${entry.id}?editar=1`}
              className={secondaryLinkClass}
            >
              <Icon name="pencil" className="size-4" />
              Editar
            </Link>
          ) : null
        }
        more={
          isAdmin && !editing && entry.isActive && !confirming ? (
            <MoreActions
              id="mas-acciones-entrada"
              label="Más acciones de la entrada"
            >
              <li>
                <Link
                  href={`/informacion/${entry.id}?confirmar=desactivar`}
                  className={`${moreActionItemClass} ${moreActionDangerClass}`}
                >
                  <Icon name="power" className="size-4" />
                  Desactivar
                </Link>
              </li>
            </MoreActions>
          ) : null
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {confirming ? (
        <div className="mt-6">
          <DeactivateConfirm entryId={entry.id} title={entry.title} />
        </div>
      ) : null}

      {/* Reactivar es la acción primaria del encabezado; acá queda el porqué. */}
      {isAdmin && !entry.isActive ? (
        <SectionCard
          id="estado-titulo"
          title="Estado"
          icon="power"
          className="mt-6"
        >
          <p>
            Está desactivada: no se considera vigente aunque esté dentro de sus
            fechas. Reactivala desde el encabezado.
          </p>
        </SectionCard>
      ) : null}

      {editing ? (
        <div className="mt-6">
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
        <SectionCard
          id="datos-titulo"
          title="Información general"
          icon={categoryIcon(entry.category)}
          className="mt-6"
        >
          <DetailList
            items={[
              { label: "Categoría", icon: "list", value: entry.category },
              {
                label: "Vigencia",
                icon: "calendar",
                value: formatValidity(entry.validFrom, entry.validUntil),
              },
              {
                label: "Actualizada",
                icon: "clock",
                value: formatShortDateTime(entry.updatedAt, timeZone),
              },
            ]}
          />
          <h3 className="mt-6 text-xs font-bold tracking-wider text-muted uppercase">
            Contenido
          </h3>
          <p className="mt-2 break-words whitespace-pre-wrap">
            {entry.content}
          </p>
        </SectionCard>
      )}

      {audit?.ok ? (
        <AuditCard
          caption={`Auditoría de ${entry.title}`}
          rows={audit.entries.map((log) => ({
            id: log.id,
            when: formatShortDateTime(log.createdAt, timeZone),
            actor: actorLabel?.(log.actor),
            action: auditActionLabel(log),
            change: describeAuditDiff(log),
          }))}
          page={audit.page}
          pageCount={audit.pageCount}
          pageSize={AUDIT_PAGE_SIZE}
          total={audit.total}
          hrefFor={(target) => `/informacion/${entry.id}?auditoria=${target}`}
        />
      ) : null}

      <p className="mt-6 text-sm text-muted">
        La vigencia se calcula con el día de {timeZone}.
      </p>
    </main>
  );
}
