import type { Metadata } from "next";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getCashSession, listCashSessionAudit } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getSupplierNames } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { ActionNotice } from "@/app/_components/action-notice";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { cardClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatFullDateTime } from "@/app/_format/date-time";
import {
  ARQUEO_SAVED_NOTE,
  CASH_NOTICE,
  FORBIDDEN_PAGE_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  noticeMessage,
  SESSION_NOT_FOUND_MESSAGE,
  UNKNOWN_MEMBER_TEXT,
} from "../../messages";
import { PrintButton } from "../../print-button";
import {
  CurrencyTotalsTable,
  MovementsTable,
  LateSupplierPaymentVoidsTable,
  LateTradeInPaymentVoidsTable,
  LateVoidsTable,
  SessionReceiptsTable,
  SessionRefundsTable,
  SessionSupplierPaymentsTable,
  SessionTradeInPaymentsTable,
} from "../../session-tables";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { ReferenceTotal } from "../../reference-total";

export const metadata: Metadata = {
  title: "Sesión de caja — AI WhatsApp Agent CRM",
};

const TITLE = "Sesión de caja";

type SearchParams = Record<string, string | string[] | undefined>;

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Pantalla 26 (brief-21.2, D-10): el detalle de una sesión, que cerrada es su arqueo imprimible: la
// organización, el número, la apertura y el cierre con su autor, por moneda el inicial, los aportes,
// los retiros, lo esperado, lo contado y la diferencia, los movimientos y la leyenda. Al imprimir
// queda solo el arqueo. La historia, para los dos roles (AC-6), sin imprimirse. Desde la 21.3, los
// cobros en efectivo por moneda y en su lista, también impresos (brief-21.3, D-5). Desde la 22.6, los
// pagos a proveedores en efectivo: su total para los dos roles, y su lista y sus anulaciones posteriores
// al cierre solo para un admin (brief-22.6, D-9).
//
// **Desde la 24.7.1, dos cosas de la lámina 05** (brief-24.7.1): el estado es una insignia con
// nombre e ícono, y una sesión cerrada dice **siempre** que su arqueo es una foto, no un vivo.
//
// **Lo que la lámina dibuja y acá no está**: su arqueo vive en un panel lateral con pestañas
// —Resumen, Movimientos, Actividad— y una tabla compacta de cuatro columnas. Acá la pantalla 26 es
// una **página imprimible**: lo impreso tiene que llevar todo el arqueo, así que no se parte en
// pestañas, y la tabla por moneda es la completa, la misma de la pantalla 21.
export default async function CashSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { sessionId } = await params;
  const query = await searchParams;
  const found = await getCashSession(context, sessionId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={SESSION_NOT_FOUND_MESSAGE}
        back={{ href: "/caja/sesiones", label: "Volver a las sesiones" }}
      />
    );
  }
  const session = found.session;
  const [timeZone, frame, audit] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    listCashSessionAudit(context, session.id, page(query.historial)),
  ]);
  const actorLabel = audit.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = noticeMessage(CASH_NOTICE, query.aviso);
  const closed = session.closedAt !== null;
  const supplierNames = session.supplierPayments
    ? await getSupplierNames(
        context,
        session.supplierPayments.items.map((row) => row.supplierId),
      )
    : null;
  const lateCount =
    session.lateVoids.length +
    (session.supplierPayments?.lateVoids.length ?? 0) +
    (session.tradeInPayments?.lateVoids.length ?? 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href="/caja/sesiones" label="Volver a las sesiones" />
        <DetailHeader
          title={`Sesión ${session.displayNumber}`}
          leading={<HeaderIcon name="banknote" />}
          subtitle={
            closed ? (
              <StatusBadge tone="neutral" icon="lock">
                Cerrada
              </StatusBadge>
            ) : (
              <StatusBadge tone="success" icon="circleCheck">
                Abierta
              </StatusBadge>
            )
          }
          actions={closed ? <PrintButton /> : null}
        />
        <div role="status" className="mt-4 empty:hidden">
          {notice ? <ActionNotice>{notice}</ActionNotice> : null}
        </div>
      </div>

      <article
        data-comprobante
        aria-labelledby="arqueo-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <h2 id="arqueo-titulo" className="text-lg font-semibold">
            {closed ? "Arqueo de caja" : "Caja abierta"}{" "}
            <span className="font-mono">{session.displayNumber}</span>
          </h2>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Apertura</dt>
            <dd>
              {formatFullDateTime(session.openedAt, timeZone)} ·{" "}
              {session.openedByName ?? UNKNOWN_MEMBER_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Cierre</dt>
            <dd>
              {session.closedAt
                ? `${formatFullDateTime(session.closedAt, timeZone)} · ${
                    session.closedByName ?? UNKNOWN_MEMBER_TEXT
                  }`
                : "Sin cerrar"}
            </dd>
          </div>
        </dl>

        <h3 className="mt-6 font-semibold">Por moneda</h3>
        <div className="mt-2">
          <CurrencyTotalsTable session={session} />
          <ReferenceTotal
            reference={session.reference}
            label="Lo esperado, en total"
            timeZone={timeZone}
          />
          {closed ? (
            <p className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-tag-blue-soft px-3 py-2 text-sm text-on-tag-blue-soft print:border-border print:bg-transparent print:text-foreground">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              <span>{ARQUEO_SAVED_NOTE}</span>
            </p>
          ) : null}
        </div>

        <h3 className="mt-6 font-semibold">Cobros en efectivo</h3>
        <div className="mt-2">
          <SessionReceiptsTable session={session} timeZone={timeZone} />
        </div>

        <h3 className="mt-6 font-semibold">Devoluciones en efectivo</h3>
        <div className="mt-2">
          <SessionRefundsTable session={session} timeZone={timeZone} />
        </div>

        {session.supplierPayments ? (
          <>
            <h3 className="mt-6 font-semibold">
              Pagos a proveedores en efectivo
            </h3>
            <div className="mt-2">
              <SessionSupplierPaymentsTable
                session={session}
                timeZone={timeZone}
                supplierNames={
                  supplierNames?.ok ? supplierNames.names : new Map()
                }
              />
            </div>
          </>
        ) : null}

        {session.tradeInPayments && session.tradeInPayments.items.length > 0 ? (
          <>
            <h3 className="mt-6 font-semibold">Pagos de usados en efectivo</h3>
            <div className="mt-2">
              <SessionTradeInPaymentsTable
                session={session}
                timeZone={timeZone}
              />
            </div>
          </>
        ) : null}

        <h3 className="mt-6 font-semibold">Aportes y retiros</h3>
        <div className="mt-2">
          <MovementsTable session={session} timeZone={timeZone} />
        </div>

        {lateCount > 0 ? (
          <>
            <h3 className="mt-6 font-semibold">
              Anulaciones posteriores al cierre
            </h3>
            <p className="mt-1 text-sm text-muted">
              Se registraron después de cerrar: el arqueo de arriba no cambia, y
              estas anulaciones explican su diferencia.
            </p>
            <div className="mt-2">
              <LateVoidsTable session={session} timeZone={timeZone} />
            </div>
            <div className="mt-2">
              <LateSupplierPaymentVoidsTable
                session={session}
                timeZone={timeZone}
              />
            </div>
            <div className="mt-2">
              <LateTradeInPaymentVoidsTable
                session={session}
                timeZone={timeZone}
              />
            </div>
          </>
        ) : null}

        <p className="mt-6 text-center text-sm font-semibold uppercase">
          {NOT_AN_INVOICE_LEGEND}
        </p>
      </article>

      {audit.ok ? (
        <div className="print:hidden">
          <AuditCard
            caption={`Historia de la sesión ${session.displayNumber}`}
            rows={audit.entries.map((entry) => ({
              id: entry.id,
              when: formatFullDateTime(entry.createdAt, timeZone),
              actor: actorLabel?.(entry.actor),
              action: auditActionLabel(entry),
              change: describeAuditDiff(entry),
            }))}
            page={audit.page}
            pageCount={audit.pageCount}
            pageSize={AUDIT_PAGE_SIZE}
            total={audit.total}
            hrefFor={(target) =>
              target > 1
                ? `/caja/sesiones/${session.id}?historial=${target}`
                : `/caja/sesiones/${session.id}`
            }
          />
        </div>
      ) : null}

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
