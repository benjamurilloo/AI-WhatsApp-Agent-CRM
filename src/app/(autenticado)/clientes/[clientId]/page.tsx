import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import {
  getClientActivity,
  type ClientActivityResult,
} from "@/modules/conversations";
import {
  getClient,
  listActiveClientTags,
  listClientAudit,
  listClientFilterOptions,
  PROVINCES,
} from "@/modules/crm";
import {
  getOrganizationTimezone,
  hasCapability,
} from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { ActionNotice } from "@/app/_components/action-notice";
import { AuditCard } from "@/app/_components/audit-card";
import { Avatar } from "@/app/_components/avatar";
import { DetailHeader } from "@/app/_components/detail-header";
import {
  inactiveBadgeClass,
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
import { SubNav } from "@/app/_components/sub-nav";
import { TagChip } from "@/app/_components/tag-chip";
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
import { AccountTab } from "./account-tab";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { DeactivateConfirm, ReactivateForm } from "./client-actions";
import { ClientAppointments } from "./client-appointments";
import { ClientConversations, ClientStats } from "./client-conversations";
import { ClientOrders } from "./client-orders";
import { ClientServiceOrders } from "./client-service-orders";
import { ClientTags } from "./client-tags";
import { ClientTradeIns } from "./client-trade-ins";
import { ClientUnits } from "./client-units";
import { SummaryTab } from "./summary-tab";
import {
  CLIENT_TAB_LABEL,
  CLIENT_TABS,
  clientTabHref,
  parseClientTab,
  type ClientTab,
} from "./tabs";

export const metadata: Metadata = {
  title: "Cliente — AI WhatsApp Agent CRM",
};

const TITLE = "Clientes";

// Pantalla 7 (wireframe 07): datos y, solo para admin, edición, desactivación con confirmación e
// historial de auditoría paginado (FR-AUD-02). Presentación de la 15.4 y campos ampliados de la 17.1:
// a un viewer, crm no le entrega el email, la calle ni el código postal, y la ficha lo dice
// (brief-17.1, D-8 y D-11). Desde la 24.4.1 (brief-24.4.1; mockups 03, 04, 05 y 07 de la v2), en
// cuatro pestañas que son enlaces (D-1): cada una lee solo lo que muestra. El encabezado lleva
// «Abrir conversación» como acción principal, «Editar» y «Más acciones» (D-2).

// La conversación más reciente: desde la 24.3.1, su hilo une todas las del cliente. Sin ninguna, no
// aparece (AC-2).
async function OpenConversationLink({
  activity,
}: {
  activity: Promise<ClientActivityResult>;
}) {
  const result = await activity;
  const latest = result.ok ? result.conversations[0] : undefined;
  if (!latest) return null;
  return (
    <Link
      href={`/conversaciones/${latest.id}`}
      className={`${primaryLinkClass} min-h-11 max-sm:w-full`}
    >
      <Icon name="messageCircle" className="size-4" />
      Abrir conversación
    </Link>
  );
}

// «29 oct 2026», como la v2: es-AR intercala «de» y a veces un punto en el mes.
function sinceText(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month").replace(/\./g, "")} ${part("year")}`;
}

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
  const tab: ClientTab = parseClientTab(query.pestana);
  const confirming =
    isAdmin && query.confirmar === "desactivar" && client.isActive;
  const notice = noticeMessage(query.aviso);
  const sections = parseClientSectionsView(query);
  // Sin await: la esperan las partes que la muestran, sin Suspense, para que lleguen en el HTML y
  // funcionen sin JavaScript (brief-24.4.1, AC-1): con un Suspense, sin JavaScript quedaba el
  // esqueleto. Todas las conversaciones, para «Abrir conversación», el Resumen y las estadísticas;
  // la edición no muestra ninguna de las tres.
  const allActivity = editing
    ? null
    : getClientActivity(context, client.id, {
        status: STATUS_PARAM.todos,
        page: 1,
      });
  // Actividad con un filtro de estado o en otra página lo pide aparte; las estadísticas cuentan
  // todas.
  const activity =
    tab === "actividad" &&
    (sections.conversationStatus !== "todos" || sections.conversationPage > 1)
      ? getClientActivity(context, client.id, {
          status: STATUS_PARAM[sections.conversationStatus],
          page: sections.conversationPage,
        })
      : allActivity;

  const timeZone = await getOrganizationTimezone(context);
  const showTabs = !editing;
  // Cada lectura, solo en la pestaña que la muestra (D-1).
  const tradeIns =
    editing && (await hasCapability(context.organizationId, "trade_ins"));
  const activeTags =
    showTabs && tab === "resumen" && isAdmin
      ? await listActiveClientTags(context)
      : null;
  // La auditoría solo se pide para un admin: el servidor no la entrega a un viewer.
  const audit =
    showTabs && tab === "actividad" && isAdmin
      ? await listClientAudit(context, client.id, sections.auditPage)
      : null;
  // Los segmentos ya cargados, para sugerir en la edición (brief-17.1, D-5).
  const segments = editing ? await listClientFilterOptions(context) : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;

  const tags = (
    <section aria-labelledby="etiquetas-titulo">
      <h3 id="etiquetas-titulo" className="text-lg font-bold tracking-tight">
        Etiquetas
      </h3>
      <div className="mt-3">
        <ClientTags
          clientId={client.id}
          tags={client.tags}
          activeTags={activeTags?.ok ? activeTags.tags : []}
          canEdit={isAdmin}
        />
      </div>
    </section>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <p>
        <Link
          href="/clientes"
          className="inline-flex items-center gap-2 rounded-lg font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Icon name="arrowLeft" className="size-5" />
          <span className="sr-only">Volver a </span>
          Clientes
        </Link>
      </p>

      <DetailHeader
        title={client.displayName}
        leading={
          <Avatar
            name={client.displayName}
            tone="brand"
            className="size-16 text-xl sm:size-20 sm:text-2xl"
          />
        }
        badges={
          <>
            {client.tags.length > 0 ? (
              <ul aria-label="Etiquetas" className="flex flex-wrap gap-2">
                {client.tags.map((tag) => (
                  <li key={tag.id}>
                    <TagChip
                      name={tag.name}
                      color={tag.color}
                      isActive={tag.isActive}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            {client.isActive ? null : (
              <span className={inactiveBadgeClass}>Inactivo</span>
            )}
          </>
        }
        subtitle={`Cliente desde ${sinceText(client.createdAt, timeZone)}`}
        primary={
          allActivity === null ? null : (
            <OpenConversationLink activity={allActivity} />
          )
        }
        actions={
          isAdmin && !editing ? (
            <Link
              href={`/clientes/${client.id}?editar=1`}
              className={`${secondaryLinkClass} min-h-11 max-sm:w-full`}
            >
              <Icon name="pencil" className="size-4" />
              Editar
              <span className="sm:hidden">cliente</span>
            </Link>
          ) : null
        }
        more={
          // «Desactivar» o «Reactivar», según el estado (D-2).
          isAdmin && !editing && !confirming ? (
            <MoreActions
              id="mas-acciones-cliente"
              label="Más acciones del cliente"
              iconOnly
            >
              <li>
                {client.isActive ? (
                  <Link
                    href={`/clientes/${client.id}?confirmar=desactivar`}
                    className={`${moreActionItemClass} ${moreActionDangerClass}`}
                  >
                    <Icon name="power" className="size-4" />
                    Desactivar
                  </Link>
                ) : (
                  <ReactivateForm clientId={client.id} />
                )}
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
          <DeactivateConfirm clientId={client.id} name={client.displayName} />
        </div>
      ) : null}

      {editing && client.phone?.kind !== "masked" && client.contact !== null ? (
        <div className="mt-6">
          <ClientForm
            mode="editar"
            clientId={client.id}
            values={{
              displayName: client.displayName,
              phone: client.phone?.e164 ?? "",
              notes: client.notes ?? "",
              email: client.contact?.email ?? "",
              kind: client.kind ?? "",
              companyName: client.companyName ?? "",
              jobTitle: client.jobTitle ?? "",
              addressLine: client.contact?.addressLine ?? "",
              city: client.city ?? "",
              province: client.province ?? "",
              postalCode: client.contact?.postalCode ?? "",
              segment: client.segment ?? "",
              documentNumber: client.contact?.documentNumber ?? "",
              instagram: client.contact?.instagram ?? "",
            }}
            options={{
              provinces: Object.entries(PROVINCES),
              segments: segments?.ok ? segments.segments : [],
              tradeIns,
            }}
          />
        </div>
      ) : allActivity === null || activity === null ? null : (
        <>
          <SubNav
            label={`Secciones de ${client.displayName}`}
            scroll
            items={CLIENT_TABS.map((item) => ({
              href: clientTabHref(client.id, item),
              label: CLIENT_TAB_LABEL[item],
              current: item === tab,
            }))}
          />

          {tab === "resumen" ? (
            <SummaryTab
              context={context}
              client={client}
              timeZone={timeZone}
              activity={allActivity}
              tags={tags}
            />
          ) : null}

          {tab === "operaciones" ? (
            <div className="mt-6 flex flex-col gap-6">
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <SectionCard id="pedidos-titulo" title="Pedidos" icon="list">
                  <ClientOrders
                    context={context}
                    clientId={client.id}
                    clientActive={client.isActive}
                    timeZone={timeZone}
                  />
                </SectionCard>

                {/* Sus órdenes de servicio, con la capacidad repairs (brief-29.6, D-10). */}
                <ClientServiceOrders
                  context={context}
                  clientId={client.id}
                  clientActive={client.isActive}
                  timeZone={timeZone}
                />

                {/* Sus turnos, con la capacidad appointments (brief-29.10, D-5). */}
                <ClientAppointments
                  context={context}
                  clientId={client.id}
                  clientActive={client.isActive}
                />

                {/* Los usados que entregó, con la capacidad trade_ins (brief-29.7, D-7). */}
                <ClientTradeIns
                  context={context}
                  clientId={client.id}
                  clientActive={client.isActive}
                  timeZone={timeZone}
                />

                {/* Los equipos que compró, con la capacidad serialized_units (brief-29.9, D-3). */}
                <ClientUnits context={context} clientId={client.id} />
              </div>
              <p className="flex items-start gap-2 rounded-xl border border-border bg-primary-soft/40 px-4 py-3 text-sm">
                <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                <span>
                  Los importes corresponden a cada operación. Consultá pagos y
                  saldos en{" "}
                  <Link
                    href={clientTabHref(client.id, "cuenta")}
                    className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Cuenta corriente
                  </Link>
                  .
                </span>
              </p>
            </div>
          ) : null}

          {tab === "cuenta" ? (
            <AccountTab
              context={context}
              clientId={client.id}
              timeZone={timeZone}
              currencyParam={
                typeof query.moneda === "string" ? query.moneda : undefined
              }
            />
          ) : null}

          {tab === "actividad" ? (
            <>
              <SectionCard
                id="conversaciones-titulo"
                title="Conversaciones"
                icon="messageCircle"
                className="mt-6"
              >
                <ClientStats activity={allActivity} />
                <div className="mt-6">
                  <ClientConversations
                    clientId={client.id}
                    clientName={client.displayName}
                    activity={activity}
                    view={sections}
                  />
                </div>
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
                      clientSectionsHref(client.id, {
                        ...sections,
                        auditPage: target,
                      })
                    }
                  />
                  <p className="mt-4 text-sm text-muted">
                    Fechas en {timeZone}.
                  </p>
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
