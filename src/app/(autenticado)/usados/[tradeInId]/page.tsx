import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getOrganizationTimezone } from "@/modules/organizations";
import {
  getTradeIn,
  listTradeInAudit,
  tradeInsAllowed,
} from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { ActionNotice } from "@/app/_components/action-notice";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  linkClass,
  secondaryLinkClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { UNIT_STATUS_LABEL } from "../../productos/[productId]/unidades/messages";
import type { SearchParams } from "../filters";
import {
  DESTINATION_LABEL,
  noticeMessage,
  TRADE_IN_NOT_FOUND_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
  VOID_REASON_LABEL,
} from "../messages";
import { TradeInStatusBadge } from "../sub-nav";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { VoidForm } from "./forms";

export const metadata: Metadata = {
  title: "Usado recibido — AI WhatsApp Agent CRM",
};

const TITLE = "Usado recibido";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// El detalle de una recepción (brief-29.7, D-7): el cliente, el equipo con su unidad, el checklist, el
// valor y el destino, la anulación si la tiene y, para un admin, «Anular» y la historia. Un viewer la ve
// sin el valor (D-8). El comprobante PU y el de su anulación se imprimen en su propia página. Sin la
// capacidad trade_ins, 404.
export default async function TradeInPage({
  params,
  searchParams,
}: {
  params: Promise<{ tradeInId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { tradeInId } = await params;
  const query = await searchParams;
  if (!(await tradeInsAllowed(context))) notFound();
  const found = await getTradeIn(context, tradeInId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={TRADE_IN_NOT_FOUND_MESSAGE}
        back={{ href: "/usados", label: "Volver a los usados" }}
      />
    );
  }
  const tradeIn = found.tradeIn;
  const href = `/usados/${tradeIn.id}`;
  const isAdmin = context.role === "admin";
  const [timeZone, audit] = await Promise.all([
    getOrganizationTimezone(context),
    isAdmin
      ? listTradeInAudit(context, tradeIn.id, page(query.historial))
      : Promise.resolve(null),
  ]);
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = noticeMessage(query.aviso);
  const voidable =
    tradeIn.void === null &&
    (tradeIn.unitStatus === "in_review" || tradeIn.unitStatus === "available");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <BackLink href="/usados" label="Volver a los usados" />
      <DetailHeader
        title={`Usado recibido ${tradeIn.displayNumber}`}
        leading={<HeaderIcon name="smartphone" />}
        badges={<TradeInStatusBadge voided={tradeIn.void !== null} />}
        subtitle={
          <p>
            {tradeIn.clientName ?? UNKNOWN_CLIENT_TEXT} ·{" "}
            {tradeIn.productName ?? UNKNOWN_PRODUCT_TEXT}
          </p>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${href}/comprobante`} className={secondaryLinkClass}>
              <Icon name="printer" className="size-4" />
              Comprobante
            </Link>
            {tradeIn.void ? (
              <Link href={`${href}/anulacion`} className={secondaryLinkClass}>
                <Icon name="printer" className="size-4" />
                Comprobante de la anulación
              </Link>
            ) : null}
          </div>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {tradeIn.void ? (
        <section
          aria-labelledby="anulacion-titulo"
          className={`mt-6 ${cardClass} p-5 sm:p-6`}
        >
          <h2 id="anulacion-titulo" className={sectionTitleClass}>
            Anulada por{" "}
            <span className="font-mono">{tradeIn.void.displayNumber}</span>
          </h2>
          <p className="mt-2 text-sm">
            {VOID_REASON_LABEL[tradeIn.void.reason]} ·{" "}
            {formatShortDateTime(tradeIn.void.createdAt, timeZone)}
            {tradeIn.void.createdByName
              ? ` · ${tradeIn.void.createdByName}`
              : ""}
          </p>
          <p className="mt-1 text-sm text-muted">
            La unidad quedó dada de baja.
          </p>
        </section>
      ) : null}

      {isAdmin && tradeIn.void === null ? (
        <section
          aria-labelledby="anular-titulo"
          className={`mt-6 ${cardClass} p-5 sm:p-6`}
        >
          <h2 id="anular-titulo" className={sectionTitleClass}>
            Anular la recepción
          </h2>
          {voidable ? (
            <>
              <p className="mt-2 mb-3 text-sm text-muted">
                No se deshace: emite el comprobante de anulación y da de baja la
                unidad. Se anula solo mientras la unidad está en revisión o
                disponible.
              </p>
              <VoidForm tradeInId={tradeIn.id} />
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              No se puede anular: la unidad está{" "}
              {tradeIn.unitStatus
                ? UNIT_STATUS_LABEL[tradeIn.unitStatus].toLowerCase()
                : "fuera del local"}
              . Se anula solo mientras está en revisión o disponible.
            </p>
          )}
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section
          aria-labelledby="equipo-titulo"
          className={`${cardClass} p-5 sm:p-6`}
        >
          <h2 id="equipo-titulo" className={sectionTitleClass}>
            El equipo
          </h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-muted">Cliente</dt>
              <dd className="font-semibold">
                <Link
                  href={`/clientes/${tradeIn.clientId}`}
                  className={linkClass}
                >
                  {tradeIn.clientName ?? UNKNOWN_CLIENT_TEXT}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Producto</dt>
              <dd>{tradeIn.productName ?? UNKNOWN_PRODUCT_TEXT}</dd>
            </div>
            <div>
              <dt className="text-muted">IMEI o número de serie</dt>
              <dd className="font-mono">
                <Link
                  href={`/productos/${tradeIn.productId}/unidades`}
                  className={linkClass}
                >
                  {tradeIn.serial}
                </Link>
              </dd>
              {tradeIn.unitStatus ? (
                <dd className="text-muted">
                  La unidad hoy: {UNIT_STATUS_LABEL[tradeIn.unitStatus]}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-muted">Salud de la batería</dt>
              <dd className="tabular-nums">{tradeIn.batteryHealth}%</dd>
            </div>
            <div>
              <dt className="text-muted">Grado propuesto</dt>
              <dd>{tradeIn.grade?.name ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="valor-titulo"
          className={`${cardClass} p-5 sm:p-6`}
        >
          <h2 id="valor-titulo" className={sectionTitleClass}>
            El valor
          </h2>
          <dl className="mt-3 grid gap-2 text-sm">
            {tradeIn.value ? (
              <div>
                <dt className="text-muted">Valor reconocido</dt>
                <dd className="font-semibold tabular-nums">
                  {formatMoney(tradeIn.value.amount, tradeIn.value.currency)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted">Destino</dt>
              <dd>{DESTINATION_LABEL[tradeIn.destination]}</dd>
            </div>
            <div>
              <dt className="text-muted">Recibido</dt>
              <dd className="tabular-nums">
                {formatShortDateTime(tradeIn.createdAt, timeZone)}
                {tradeIn.createdByName ? ` · ${tradeIn.createdByName}` : ""}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section
        aria-labelledby="checklist-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6`}
      >
        <h2 id="checklist-titulo" className={sectionTitleClass}>
          Checklist
        </h2>
        {tradeIn.checks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Se recibió sin checklist.</p>
        ) : (
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {tradeIn.checks.map((check) => (
              <li key={check.position} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={check.passed ? "text-success" : "text-danger"}
                >
                  {check.passed ? "✓" : "✕"}
                </span>
                <span>
                  {check.name}
                  {check.wasMandatory ? " (obligatorio)" : ""}:{" "}
                  <span className="font-semibold">
                    {check.passed ? "pasó" : "no pasó"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {audit?.ok ? (
        <AuditCard
          caption={`Historia del usado ${tradeIn.displayNumber}`}
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
            target > 1 ? `${href}?historial=${target}` : href
          }
        />
      ) : null}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
