import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getOrder, listOrderAudit } from "@/modules/orders";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { PhoneText } from "@/app/(autenticado)/clientes/phone-text";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { DetailList } from "@/app/_components/detail-list";
import {
  linkClass,
  noticeClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import type { SearchParams } from "../filters";
import {
  CURRENT_PRODUCT_NAME_NOTE,
  FORBIDDEN_PAGE_MESSAGE,
  ORDER_NOT_FOUND_MESSAGE,
  orderNoticeMessage,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
} from "../messages";
import { OrderStatusBadge } from "../status-badge";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { CancelOrderForm } from "./cancel-form";

export const metadata: Metadata = {
  title: "Pedido — AI WhatsApp Agent CRM",
};

const TITLE = "Pedido";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Pantalla 16: el detalle de un pedido (brief-19.2; ADR 0020, puntos 3 y 8). Cabecera, cliente,
// líneas y total, para admin y viewer; el viewer ve el cliente sin teléfono ni contacto, que crm
// ya entrega resueltos para su rol. Cancelar un pendiente y la historia, solo admin (D-12).
// Ningún costo ni margen.
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { orderId } = await params;
  const query = await searchParams;
  const found = await getOrder(context, orderId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={ORDER_NOT_FOUND_MESSAGE}
        back={{ href: "/pedidos", label: "Volver a pedidos" }}
      />
    );
  }
  const order = found.order;
  const isAdmin = context.role === "admin";
  const timeZone = await getOrganizationTimezone(context);
  const audit = isAdmin
    ? await listOrderAudit(context, order.id, page(query.historial))
    : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = orderNoticeMessage(query.aviso);
  const client = order.client;

  const dates = [
    { label: "Creado", icon: "calendar" as const, value: order.createdAt },
    { label: "Confirmado", icon: "check" as const, value: order.confirmedAt },
    { label: "Entregado", icon: "truck" as const, value: order.deliveredAt },
    { label: "Cancelado", icon: "close" as const, value: order.cancelledAt },
  ].flatMap(({ label, icon, value }) =>
    value ? [{ label, icon, value: formatShortDateTime(value, timeZone) }] : [],
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/pedidos" label="Volver a pedidos" />
      <DetailHeader
        title={`Pedido ${order.displayNumber}`}
        leading={<HeaderIcon name="list" />}
        badges={<OrderStatusBadge status={order.status} />}
        subtitle={
          <p>
            Total:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatMoney(order.total, order.currency)}
            </span>
          </p>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <SectionCard
          id="lineas-titulo"
          title="Líneas"
          icon="list"
          className="lg:col-span-2"
        >
          <div
            className="-mx-5 overflow-x-auto sm:-mx-6"
            tabIndex={0}
            role="region"
            aria-label={`Líneas del pedido ${order.displayNumber}`}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Líneas del pedido {order.displayNumber}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Producto
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Cantidad
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Precio unitario
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.position}>
                    <td className={tableCellClass}>
                      {line.product ? (
                        <>
                          <Link
                            href={`/productos/${line.productId}`}
                            className={linkClass}
                          >
                            {line.product.name}
                          </Link>
                          <span className="block font-mono text-xs text-muted">
                            {line.product.sku}
                          </span>
                        </>
                      ) : (
                        UNKNOWN_PRODUCT_TEXT
                      )}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatQuantity(line.quantity)}
                      {line.product ? (
                        <span className="text-muted"> {line.product.unit}</span>
                      ) : null}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(line.unitPrice, line.currency)}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(line.lineTotal, line.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    colSpan={3}
                    className={`${tableCellClass} text-right font-semibold`}
                  >
                    Total del pedido
                  </th>
                  <td
                    className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                  >
                    {formatMoney(order.total, order.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted">{CURRENT_PRODUCT_NAME_NOTE}</p>
        </SectionCard>

        <div className="flex flex-col gap-6">
          <SectionCard id="cliente-titulo" title="Cliente" icon="user">
            <DetailList
              items={[
                {
                  label: "Nombre",
                  icon: "user",
                  value: client ? (
                    <Link href={`/clientes/${client.id}`} className={linkClass}>
                      {client.displayName}
                    </Link>
                  ) : (
                    UNKNOWN_CLIENT_TEXT
                  ),
                },
                ...(client
                  ? [
                      {
                        label: "Teléfono",
                        icon: "phone" as const,
                        value: (
                          <PhoneText
                            phone={client.phone}
                            emptyText="Sin teléfono"
                          />
                        ),
                      },
                    ]
                  : []),
                ...(client?.contact?.email
                  ? [
                      {
                        label: "Email",
                        icon: "mail" as const,
                        value: client.contact.email,
                      },
                    ]
                  : []),
              ]}
            />
          </SectionCard>

          <SectionCard id="estado-titulo" title="Estado" icon="clock">
            <DetailList items={dates} />
            {isAdmin && order.status === "pending" ? (
              <div className="mt-5">
                <CancelOrderForm
                  orderId={order.id}
                  displayNumber={order.displayNumber}
                />
              </div>
            ) : null}
          </SectionCard>
        </div>
      </div>

      {audit?.ok ? (
        <AuditCard
          caption={`Historia del pedido ${order.displayNumber}`}
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
            target > 1
              ? `/pedidos/${order.id}?historial=${target}`
              : `/pedidos/${order.id}`
          }
        />
      ) : null}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
