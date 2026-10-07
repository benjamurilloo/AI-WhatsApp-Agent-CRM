import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getClientActivity } from "@/modules/conversations";
import {
  getClient,
  listActiveClientTags,
  listClientAudit,
} from "@/modules/crm";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { AuditCard } from "@/app/_components/audit-card";
import { Avatar } from "@/app/_components/avatar";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { DetailList } from "@/app/_components/detail-list";
import {
  activeBadgeClass,
  dangerOutlineLinkClass,
  inactiveBadgeClass,
  noticeClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import {
  clientSectionsHref,
  parseClientSectionsView,
  STATUS_PARAM,
} from "@/app/(autenticado)/conversaciones/filters";
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
import { ClientTags } from "./client-tags";
import {
  ClientConversations,
  ClientConversationsSkeleton,
  ClientStats,
  ClientStatsSkeleton,
  LastInteraction,
} from "./client-conversations";

export const metadata: Metadata = {
  title: "Cliente — AI WhatsApp Agent CRM",
};

const TITLE = "Clientes";

// Pantalla 7 (wireframe 07): datos y, solo para admin, edición, desactivación con confirmación e
// historial de auditoría paginado (FR-AUD-02). La última interacción y las conversaciones cargan
// por separado, con sus propios parámetros de URL (brief-6.4, D-4). Presentación de la 15.4:
// tarjetas, avatar y estadísticas con lo que la página ya carga (brief-15.4, D-6).
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
  const sections = parseClientSectionsView(query);
  // Sin await: la esperan las partes que la muestran, cada una en su Suspense.
  const activity = getClientActivity(context, client.id, {
    status: STATUS_PARAM[sections.conversationStatus],
    page: sections.conversationPage,
  });
  // Las estadísticas cuentan todas las conversaciones: con un filtro de estado, se piden aparte.
  const allActivity =
    sections.conversationStatus === "todos"
      ? activity
      : getClientActivity(context, client.id, {
          status: STATUS_PARAM.todos,
          page: 1,
        });

  // Las activas para el selector de agregar, solo para un admin (brief-16.1, D-5).
  const activeTags = isAdmin ? await listActiveClientTags(context) : null;
  // La auditoría solo se pide para un admin: el servidor no la entrega a un viewer.
  const audit = isAdmin
    ? await listClientAudit(context, client.id, sections.auditPage)
    : null;
  const timeZone = audit?.ok ? await getOrganizationTimezone(context) : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/clientes" label="Volver a clientes" />

      <DetailHeader
        title={client.displayName}
        leading={
          <Avatar
            name={client.displayName}
            className="size-14 text-xl sm:size-16 sm:text-2xl"
          />
        }
        badges={
          <span
            className={client.isActive ? activeBadgeClass : inactiveBadgeClass}
          >
            {client.isActive ? "Activo" : "Inactivo"}
          </span>
        }
        subtitle={
          <Suspense fallback="Cargando…">
            <span className="text-sm">
              Última interacción: <LastInteraction activity={activity} />
            </span>
          </Suspense>
        }
        actions={
          isAdmin && !editing ? (
            <>
              <Link
                href={`/clientes/${client.id}?editar=1`}
                className={secondaryLinkClass}
              >
                <Icon name="pencil" className="size-4" />
                Editar
              </Link>
              {client.isActive && !confirming ? (
                <Link
                  href={`/clientes/${client.id}?confirmar=desactivar`}
                  className={dangerOutlineLinkClass}
                >
                  <Icon name="power" className="size-4" />
                  Desactivar
                </Link>
              ) : null}
            </>
          ) : null
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {confirming ? (
        <div className="mt-6">
          <DeactivateConfirm clientId={client.id} name={client.displayName} />
        </div>
      ) : null}

      {isAdmin && !client.isActive ? (
        <SectionCard
          id="estado-titulo"
          title="Estado"
          icon="power"
          className="mt-6"
        >
          <ReactivateForm clientId={client.id} />
        </SectionCard>
      ) : null}

      {editing && client.phone?.kind !== "masked" ? (
        <div className="mt-6">
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
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
          <SectionCard
            id="datos-titulo"
            title="Información principal"
            icon="user"
            className="lg:col-span-2"
          >
            <DetailList
              items={[
                { label: "Nombre", icon: "user", value: client.displayName },
                {
                  label: "Teléfono",
                  icon: "phone",
                  value: (
                    <PhoneText phone={client.phone} emptyText="Sin teléfono" />
                  ),
                },
                {
                  label: "Última interacción",
                  icon: "clock",
                  value: (
                    <Suspense fallback="Cargando…">
                      <LastInteraction activity={activity} />
                    </Suspense>
                  ),
                },
                {
                  label: "Notas",
                  icon: "fileText",
                  value: (
                    <span className="text-muted">
                      {client.notes ?? "Sin notas"}
                    </span>
                  ),
                  multiline: true,
                },
              ]}
            />
          </SectionCard>

          <div className="flex flex-col gap-6">
            <SectionCard
              id="estadisticas-titulo"
              title="Estadísticas"
              icon="chartColumn"
            >
              <Suspense fallback={<ClientStatsSkeleton />}>
                <ClientStats activity={allActivity} />
              </Suspense>
            </SectionCard>

            <SectionCard id="etiquetas-titulo" title="Etiquetas" icon="tag">
              <ClientTags
                clientId={client.id}
                tags={client.tags}
                activeTags={activeTags?.ok ? activeTags.tags : []}
                canEdit={isAdmin}
              />
            </SectionCard>
          </div>
        </div>
      )}

      <SectionCard
        id="conversaciones-titulo"
        title="Conversaciones"
        icon="messageCircle"
        className="mt-6"
      >
        <Suspense fallback={<ClientConversationsSkeleton />}>
          <ClientConversations
            clientId={client.id}
            clientName={client.displayName}
            activity={activity}
            view={sections}
          />
        </Suspense>
      </SectionCard>

      {audit?.ok && timeZone ? (
        <>
          <AuditCard
            caption={`Auditoría de ${client.displayName}`}
            rows={audit.entries.map((entry) => ({
              id: entry.id,
              when: formatShortDateTime(entry.createdAt, timeZone),
              actor: actorLabel?.(entry.actor),
              action: auditActionLabel(entry),
              change: describeAuditDiff(entry),
            }))}
            page={audit.page}
            pageCount={audit.pageCount}
            pageSize={AUDIT_PAGE_SIZE}
            total={audit.total}
            hrefFor={(target) =>
              clientSectionsHref(client.id, { ...sections, auditPage: target })
            }
          />
          <p className="mt-4 text-sm text-muted">Fechas en {timeZone}.</p>
        </>
      ) : null}
    </main>
  );
}
