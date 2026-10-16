import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getOrganizationTimezone } from "@/modules/organizations";
import {
  formatCuit,
  getSupplier,
  listRecentSupplierGoodsReceipts,
  listRecentSupplierPurchaseOrders,
  listSupplierAudit,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { AuditCard } from "@/app/_components/audit-card";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { DetailList } from "@/app/_components/detail-list";
import {
  activeBadgeClass,
  dangerOutlineLinkClass,
  inactiveBadgeClass,
  linkClass,
  noticeClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import {
  DEFAULT_PURCHASE_ORDER_FILTERS,
  purchaseOrderFiltersHref,
} from "../../ordenes/filters";
import { NO_SUPPLIER_PURCHASE_ORDERS_MESSAGE } from "../../ordenes/messages";
import { PurchaseOrderStatusBadge } from "../../ordenes/status-badge";
import {
  DEFAULT_GOODS_RECEIPT_FILTERS,
  goodsReceiptFiltersHref,
} from "../../recepciones/filters";
import {
  NO_SUPPLIER_GOODS_RECEIPTS_MESSAGE,
  VOIDED_BADGE_TEXT,
} from "../../recepciones/messages";
import {
  FORBIDDEN_PAGE_MESSAGE,
  noticeMessage,
  SUPPLIER_NOT_FOUND_MESSAGE,
} from "../messages";
import type { SearchParams } from "../filters";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import {
  DeactivateSupplierConfirm,
  ReactivateSupplierForm,
} from "./supplier-actions";

export const metadata: Metadata = {
  title: "Proveedor — AI WhatsApp Agent CRM",
};

const TITLE = "Proveedores";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// La ficha del proveedor (brief-22.2, D-9): sus datos, «Editar», «Desactivar» con confirmación o
// «Reactivar», y su historia paginada. Solo admin: purchasing rechaza a un viewer también al leer.
// Desde la 22.3, sus últimas cinco órdenes de compra, el enlace a la lista filtrada por él y, si
// está activo, «Nueva orden de compra» con el proveedor ya elegido (brief-22.3, D-10).
export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { supplierId } = await params;
  const query = await searchParams;

  const found = await getSupplier(context, supplierId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={SUPPLIER_NOT_FOUND_MESSAGE}
        back={{ href: "/compras/proveedores", label: "Volver a proveedores" }}
      />
    );
  }

  const supplier = found.supplier;
  const href = `/compras/proveedores/${supplier.id}`;
  const confirming =
    single(query.confirmar) === "desactivar" && supplier.isActive;
  const notice = noticeMessage(query.aviso);
  const auditPage = Number(single(query.historia));
  const audit = await listSupplierAudit(
    context,
    supplier.id,
    Number.isSafeInteger(auditPage) && auditPage > 0 ? auditPage : 1,
  );
  const timeZone = await getOrganizationTimezone(context);
  // Sus últimas órdenes de compra (brief-22.3, D-10).
  const orders = await listRecentSupplierPurchaseOrders(context, supplier.id);
  // Y sus últimas recepciones (brief-22.4, D-11).
  const receipts = await listRecentSupplierGoodsReceipts(context, supplier.id);
  const actorLabel = audit.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/compras/proveedores" label="Volver a proveedores" />

      <DetailHeader
        title={supplier.name}
        badges={
          <span
            className={
              supplier.isActive ? activeBadgeClass : inactiveBadgeClass
            }
          >
            {supplier.isActive ? "Activo" : "Inactivo"}
          </span>
        }
        subtitle={
          supplier.isActive
            ? "Proveedor"
            : "Proveedor desactivado: no aparece en la lista por defecto."
        }
        actions={
          <>
            <Link href={`${href}/editar`} className={secondaryLinkClass}>
              <Icon name="pencil" className="size-4" />
              Editar
            </Link>
            {supplier.isActive && !confirming ? (
              <Link
                href={`${href}?confirmar=desactivar`}
                className={dangerOutlineLinkClass}
              >
                <Icon name="power" className="size-4" />
                Desactivar
              </Link>
            ) : null}
          </>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {confirming ? (
        <div className="mt-6">
          <DeactivateSupplierConfirm
            supplierId={supplier.id}
            name={supplier.name}
          />
        </div>
      ) : null}

      {!supplier.isActive ? (
        <SectionCard
          id="estado-titulo"
          title="Estado"
          icon="power"
          className="mt-6"
        >
          <ReactivateSupplierForm supplierId={supplier.id} />
        </SectionCard>
      ) : null}

      <SectionCard
        id="datos-titulo"
        title="Datos"
        icon="truck"
        className="mt-6"
      >
        <DetailList
          items={[
            { label: "Nombre", icon: "user", value: supplier.name },
            {
              label: "Teléfono",
              icon: "phone",
              value: supplier.phone ?? (
                <span className="text-muted">Sin teléfono</span>
              ),
            },
            {
              label: "Email",
              icon: "mail",
              value: supplier.email ?? (
                <span className="text-muted">Sin email</span>
              ),
            },
            {
              label: "CUIT",
              icon: "hash",
              value: supplier.cuit ? (
                formatCuit(supplier.cuit)
              ) : (
                <span className="text-muted">Sin CUIT</span>
              ),
            },
          ]}
        />
      </SectionCard>

      {orders.ok ? (
        <SectionCard
          id="ordenes-titulo"
          title="Órdenes de compra"
          icon="fileText"
          className="mt-6"
        >
          {orders.orders.length === 0 ? (
            <p className="text-sm text-muted">
              {NO_SUPPLIER_PURCHASE_ORDERS_MESSAGE}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {orders.orders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <Link
                    href={`/compras/ordenes/${order.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {order.displayNumber}
                  </Link>
                  <span className="text-muted">
                    {formatShortDateTime(order.createdAt, timeZone)}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(order.total, order.currency)}
                  </span>
                  <PurchaseOrderStatusBadge status={order.status} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {orders.total > 0 ? (
              <Link
                href={purchaseOrderFiltersHref({
                  ...DEFAULT_PURCHASE_ORDER_FILTERS,
                  supplierId: supplier.id,
                })}
                className={linkClass}
              >
                Ver las {orders.total}{" "}
                {orders.total === 1 ? "orden" : "órdenes"} de este proveedor
              </Link>
            ) : null}
            {supplier.isActive ? (
              <Link
                href={`/compras/ordenes/nueva?proveedor=${supplier.id}`}
                className={linkClass}
              >
                Nueva orden de compra
              </Link>
            ) : null}
          </p>
        </SectionCard>
      ) : null}

      {receipts.ok ? (
        <SectionCard
          id="recepciones-titulo"
          title="Recepciones"
          icon="package"
          className="mt-6"
        >
          {receipts.receipts.length === 0 ? (
            <p className="text-sm text-muted">
              {NO_SUPPLIER_GOODS_RECEIPTS_MESSAGE}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {receipts.receipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Link
                      href={`/compras/recepciones/${receipt.id}`}
                      className={`${linkClass} font-mono`}
                    >
                      {receipt.displayNumber}
                    </Link>
                    {receipt.voidDisplayNumber ? (
                      <span
                        className={inactiveBadgeClass}
                        title={`Anulada por ${receipt.voidDisplayNumber}`}
                      >
                        {VOIDED_BADGE_TEXT}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted">
                    {formatShortDateTime(receipt.createdAt, timeZone)}
                  </span>
                  <span className="text-muted">
                    {receipt.purchaseOrderDisplayNumber ?? "Sin orden"}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(receipt.total, receipt.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {receipts.total > 0 ? (
              <Link
                href={goodsReceiptFiltersHref({
                  ...DEFAULT_GOODS_RECEIPT_FILTERS,
                  supplierId: supplier.id,
                })}
                className={linkClass}
              >
                Ver las {receipts.total}{" "}
                {receipts.total === 1 ? "recepción" : "recepciones"} de este
                proveedor
              </Link>
            ) : null}
          </p>
        </SectionCard>
      ) : null}

      {audit.ok && timeZone ? (
        <>
          <AuditCard
            caption={`Auditoría de ${supplier.name}`}
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
            hrefFor={(target) => `${href}?historia=${target}`}
          />
          <p className="mt-4 text-sm text-muted">Fechas en {timeZone}.</p>
        </>
      ) : null}
    </main>
  );
}
