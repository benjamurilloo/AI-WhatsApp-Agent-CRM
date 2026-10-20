import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getOrganizationTimezone } from "@/modules/organizations";
import { listTechnicians } from "@/modules/purchasing";
import {
  getQuoteForm,
  getServiceOrder,
  listServiceOrderAudit,
  repairCurrencies,
  repairsAllowed,
} from "@/modules/service";
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
  inactiveBadgeClass,
  linkClass,
  secondaryLinkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import type { SearchParams } from "../filters";
import {
  CANCEL_REASON_LABEL,
  ERASED_TEXT,
  noticeMessage,
  SERVICE_ORDER_NOT_FOUND_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_MODEL_TEXT,
  UNKNOWN_TYPE_TEXT,
} from "../messages";
import { ServiceOrderStatusBadge } from "../sub-nav";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import {
  CancelForm,
  DeliverButton,
  QuoteForm,
  SendForm,
  StepButton,
} from "./forms";

export const metadata: Metadata = {
  title: "Orden de servicio — AI WhatsApp Agent CRM",
};

const TITLE = "Orden de servicio";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

const CANCELLABLE = new Set(["received", "sent", "quoted", "approved"]);

// El detalle de una orden de servicio (brief-29.6, D-4 y D-10): el equipo y el cliente, el técnico, el
// presupuesto, la venta de la entrega y, para un admin, la acción de cada estado y la historia. Un
// viewer la ve sin el técnico ni el costo (ADR 0024, punto 14). El comprobante de recepción se imprime
// en su propia página. Sin la capacidad repairs, 404.
export default async function ServiceOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceOrderId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { serviceOrderId } = await params;
  const query = await searchParams;
  if (!(await repairsAllowed(context))) notFound();
  const found = await getServiceOrder(context, serviceOrderId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={SERVICE_ORDER_NOT_FOUND_MESSAGE}
        back={{ href: "/reparaciones", label: "Volver a las órdenes" }}
      />
    );
  }
  const order = found.order;
  const href = `/reparaciones/${order.id}`;
  const isAdmin = context.role === "admin";
  const [timeZone, audit, technicians, quoteForm] = await Promise.all([
    getOrganizationTimezone(context),
    isAdmin
      ? listServiceOrderAudit(context, order.id, page(query.historial))
      : Promise.resolve(null),
    isAdmin && order.status === "received"
      ? listTechnicians(context)
      : Promise.resolve(null),
    isAdmin && order.status === "sent"
      ? getQuoteForm(context, order.id)
      : Promise.resolve(null),
  ]);
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = noticeMessage(query.aviso);
  const money = (amount: string | null, currency: string | null) =>
    amount !== null && currency !== null ? formatMoney(amount, currency) : "—";
  const dates: [string, Date | null][] = [
    ["Recibida", order.createdAt],
    ["Mandada al técnico", order.sentAt],
    ["Presupuestada", order.quotedAt],
    ["Aprobada", order.approvedAt],
    ["Rechazada", order.rejectedAt],
    ["Reparada", order.repairedAt],
    ["Entregada", order.deliveredAt],
    ["Cancelada", order.cancelledAt],
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <BackLink href="/reparaciones" label="Volver a las órdenes" />
      <DetailHeader
        title={`Orden de servicio ${order.displayNumber}`}
        leading={<HeaderIcon name="wrench" />}
        badges={<ServiceOrderStatusBadge status={order.status} />}
        subtitle={
          <p>
            {order.client?.displayName ?? UNKNOWN_CLIENT_TEXT} ·{" "}
            {order.model?.name ?? UNKNOWN_MODEL_TEXT}
          </p>
        }
        actions={
          <Link href={`${href}/recepcion`} className={secondaryLinkClass}>
            <Icon name="printer" className="size-4" />
            Comprobante de recepción
          </Link>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {isAdmin &&
      order.status !== "delivered" &&
      order.status !== "cancelled" ? (
        <section
          aria-labelledby="siguiente-titulo"
          className={`mt-6 ${cardClass} p-5 sm:p-6`}
        >
          <h2 id="siguiente-titulo" className={sectionTitleClass}>
            Siguiente paso
          </h2>
          <div className="mt-4">
            {order.status === "received" ? (
              technicians?.ok && technicians.technicians.length > 0 ? (
                <SendForm
                  serviceOrderId={order.id}
                  technicians={technicians.technicians}
                />
              ) : (
                <p className="text-sm">
                  No hay técnicos activos. Marcá a un proveedor como técnico
                  desde su ficha en{" "}
                  <Link href="/compras/proveedores" className={linkClass}>
                    Proveedores
                  </Link>
                  .
                </p>
              )
            ) : null}
            {order.status === "sent" && quoteForm?.ok ? (
              quoteForm.form.rows.length > 0 ? (
                <QuoteForm
                  serviceOrderId={order.id}
                  rows={quoteForm.form.rows}
                  currencies={repairCurrencies()}
                  customerCurrency={quoteForm.form.customerCurrency ?? ""}
                  technicianCurrency={quoteForm.form.technicianCurrency ?? ""}
                />
              ) : (
                <p className="text-sm">
                  No hay tipos de reparación activos: cargalos en la{" "}
                  <Link href="/reparaciones/lista" className={linkClass}>
                    lista de reparaciones
                  </Link>
                  .
                </p>
              )
            ) : null}
            {order.status === "quoted" ? (
              <div className="flex flex-wrap items-start gap-3">
                <StepButton
                  serviceOrderId={order.id}
                  step="aprobar"
                  label="El cliente aprobó"
                  pendingLabel="Aprobando…"
                />
                <StepButton
                  serviceOrderId={order.id}
                  step="rechazar"
                  label="El cliente rechazó"
                  pendingLabel="Rechazando…"
                  variant="secondary"
                />
              </div>
            ) : null}
            {order.status === "approved" ? (
              <StepButton
                serviceOrderId={order.id}
                step="reparada"
                label="El técnico la devolvió reparada"
                pendingLabel="Guardando…"
              />
            ) : null}
            {order.status === "repaired" ? (
              <>
                <p className="mb-3 text-sm">
                  Entregar emite la venta por{" "}
                  <span className="font-semibold tabular-nums">
                    {money(order.customerTotal, order.customerCurrency)}
                  </span>
                  , que se cobra desde su detalle.
                </p>
                <DeliverButton
                  serviceOrderId={order.id}
                  label="Entregar y emitir la venta"
                />
              </>
            ) : null}
            {order.status === "rejected" ? (
              <>
                <p className="mb-3 text-sm">
                  El equipo vuelve sin reparar y sin venta.
                </p>
                <DeliverButton
                  serviceOrderId={order.id}
                  label="Entregar sin reparar"
                />
              </>
            ) : null}
          </div>
          {CANCELLABLE.has(order.status) ? (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Cancelar la orden</h3>
              <p className="mb-3 text-sm text-muted">
                No se deshace: si hay que volver a recibir el equipo, se carga
                otra orden.
              </p>
              <CancelForm serviceOrderId={order.id} />
            </div>
          ) : null}
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
                {order.client ? (
                  <Link
                    href={`/clientes/${order.client.id}`}
                    className={linkClass}
                  >
                    {order.client.displayName}
                  </Link>
                ) : (
                  UNKNOWN_CLIENT_TEXT
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Modelo</dt>
              <dd>{order.model?.name ?? UNKNOWN_MODEL_TEXT}</dd>
            </div>
            <div>
              <dt className="text-muted">IMEI o número de serie</dt>
              <dd className="font-mono">{order.deviceSerial ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Lo que reporta el cliente</dt>
              <dd className="whitespace-pre-line">
                {order.reportedIssue ?? ERASED_TEXT}
              </dd>
            </div>
            {order.technician ? (
              <div>
                <dt className="text-muted">Técnico</dt>
                <dd>
                  <Link
                    href={`/compras/proveedores/${order.technician.id}`}
                    className={linkClass}
                  >
                    {order.technician.name ?? "Proveedor"}
                  </Link>
                </dd>
              </div>
            ) : null}
            {order.cancelReason ? (
              <div>
                <dt className="text-muted">Motivo de la cancelación</dt>
                <dd>{CANCEL_REASON_LABEL[order.cancelReason]}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section
          aria-labelledby="fechas-titulo"
          className={`${cardClass} p-5 sm:p-6`}
        >
          <h2 id="fechas-titulo" className={sectionTitleClass}>
            Fechas
          </h2>
          <dl className="mt-3 grid gap-2 text-sm">
            {dates
              .filter(([, value]) => value !== null)
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted">{label}</dt>
                  <dd className="tabular-nums">
                    {formatShortDateTime(value!, timeZone)}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      </div>

      <section
        aria-labelledby="presupuesto-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6`}
      >
        <h2 id="presupuesto-titulo" className={sectionTitleClass}>
          Presupuesto
        </h2>
        {order.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no tiene presupuesto: se carga cuando el técnico revisa el
            equipo.
          </p>
        ) : (
          <div
            className="mt-3 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={`Presupuesto de la orden ${order.displayNumber}`}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Reparaciones del presupuesto de la orden {order.displayNumber}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Reparación
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Precio al cliente
                  </th>
                  {isAdmin ? (
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Costo del técnico
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.position}>
                    <td className={tableCellClass}>
                      {line.repairTypeName ?? UNKNOWN_TYPE_TEXT}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {money(line.price, order.customerCurrency)}
                    </td>
                    {isAdmin ? (
                      <td
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                      >
                        {money(line.cost, order.technicianCurrency)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className={`${tableCellClass} text-right font-semibold`}
                  >
                    Total
                  </th>
                  <td
                    className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                  >
                    {money(order.customerTotal, order.customerCurrency)}
                  </td>
                  {isAdmin ? (
                    <td
                      className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                    >
                      {money(order.technicianTotal, order.technicianCurrency)}
                    </td>
                  ) : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {order.sale ? (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            Venta de la entrega:{" "}
            <Link
              href={`/ventas/${order.sale.id}`}
              className={`${linkClass} font-mono`}
            >
              {order.sale.displayNumber}
            </Link>
            {order.sale.voidDisplayNumber ? (
              <span className={inactiveBadgeClass}>
                Anulada por {order.sale.voidDisplayNumber}
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      {audit?.ok ? (
        <AuditCard
          caption={`Historia de la orden de servicio ${order.displayNumber}`}
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
