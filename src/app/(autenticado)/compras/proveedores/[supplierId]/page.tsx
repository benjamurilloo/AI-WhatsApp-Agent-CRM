import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import {
  getOrganizationTimezone,
  hasCapability,
} from "@/modules/organizations";
import {
  formatCuit,
  getSupplier,
  listRecentSupplierGoodsReceipts,
  listRecentSupplierPurchaseOrders,
  listSupplierAudit,
} from "@/modules/purchasing";
import { listTechnicianWork } from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  activeBadgeClass,
  iconTileClass,
  inactiveBadgeClass,
  linkClass,
  primaryLinkClass,
  roleBadgeClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import {
  moreActionDangerClass,
  moreActionItemClass,
} from "@/app/_components/more-action-styles";
import { MoreActions } from "@/app/_components/more-actions";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { Icon, type IconName } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { SupplierAccount } from "./supplier-account";
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
  NO_TECHNICIAN_WORK_MESSAGE,
  noticeMessage,
  SUPPLIER_INACTIVE_LINES,
  SUPPLIER_NOT_FOUND_MESSAGE,
  TECHNICIAN_WORK_NOTE,
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

// El ícono de cada acción en la línea de tiempo (V-24).
const AUDIT_ICON: Record<string, IconName> = {
  create: "plus",
  update: "pencil",
  deactivate: "power",
  reactivate: "undo",
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// La ficha del proveedor (brief-22.2, D-9): sus datos, «Editar», «Desactivar» con confirmación o
// «Reactivar», y su historia paginada. Solo admin: purchasing rechaza a un viewer también al leer.
// Desde la 22.3, sus últimas cinco órdenes de compra, el enlace a la lista filtrada por él y, si
// está activo, «Nueva orden de compra» con el proveedor ya elegido (brief-22.3, D-10). Desde la 22.6,
// «Pago a cuenta» y sus pagos (brief-22.6, D-13), y desde la 22.7, la tarjeta de su cuenta con el
// estado de cuenta (brief-22.7, D-5).
//
// *Desde la 24.8.2-b* (brief-24.8.2-b, D-4, D-5 y D-8), toma la forma de la lámina 14: la tira de
// contacto, «Registrar pago a cuenta» como acción primaria, el resto de las acciones en «Más»
// —con MoreActions, el de las otras fichas, y no un `<details>` propio: decisión del usuario del
// 2026-11-17 sobre la letra de D-8—, la tarjeta «Trabajo reparado» de un técnico, que sale de una
// lectura de `service` que no toca la cuenta, y la auditoría contada como una línea de tiempo.
// La tarjeta «Técnico» con su botón se fue: la marca se edita en el formulario (D-2), y dos
// caminos de escritura para el mismo campo es lo que la D-2 descartó.
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
  // La marca de técnico, solo con la capacidad repairs (brief-29.6, D-3).
  const repairs = await hasCapability(context.organizationId, "repairs");
  // Los trabajos que reparó, solo si es técnico (brief-24.8.2-b, D-4). No toca la cuenta: lo que
  // se le debe sigue saliendo de cash, en la tarjeta «Cuenta».
  const work =
    repairs && supplier.isTechnician
      ? await listTechnicianWork(context, supplier.id)
      : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/compras/proveedores" label="Volver a proveedores" />

      <DetailHeader
        leading={<HeaderIcon name="building" />}
        title={supplier.name}
        badges={
          <>
            <span
              className={
                supplier.isActive ? activeBadgeClass : inactiveBadgeClass
              }
            >
              {supplier.isActive ? "Activo" : "Inactivo"}
            </span>
            {repairs && supplier.isTechnician ? (
              <span className={roleBadgeClass}>Técnico</span>
            ) : null}
          </>
        }
        subtitle={
          repairs && supplier.isTechnician
            ? "Proveedor de insumos y servicio técnico."
            : "Proveedor de insumos."
        }
        actions={
          <>
            {/* La acción primaria de la lámina 14 (V-20): el pago a cuenta, que también admite un
                proveedor desactivado (ADR 0023, punto 2). */}
            <Link href={`${href}/pagar`} className={primaryLinkClass}>
              <Icon name="banknote" className="size-4" />
              Registrar pago a cuenta
            </Link>
            <Link href={`${href}/editar`} className={secondaryLinkClass}>
              <Icon name="pencil" className="size-4" />
              Editar
            </Link>
            {/* El resto, en «Más» (V-21, D-8). Si no le queda ninguna acción no se dibuja, que es
                lo que pide D-8. */}
            <MoreActions
              id="mas-acciones-proveedor"
              label="Más acciones del proveedor"
              iconOnly
            >
              <li>
                <Link
                  href={`/compras/pagos?proveedor=${supplier.id}`}
                  className={moreActionItemClass}
                >
                  <Icon name="receipt" className="size-4" />
                  Ver los pagos de este proveedor
                </Link>
              </li>
              {supplier.isActive && !confirming ? (
                <li>
                  <Link
                    href={`${href}?confirmar=desactivar`}
                    className={`${moreActionItemClass} ${moreActionDangerClass}`}
                  >
                    <Icon name="power" className="size-4" />
                    Desactivar
                  </Link>
                </li>
              ) : null}
            </MoreActions>
          </>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {confirming ? (
        <div className="mt-6">
          <DeactivateSupplierConfirm
            supplierId={supplier.id}
            name={supplier.name}
          />
        </div>
      ) : null}

      {/* La tarjeta 5 de la lámina 17 (V-35): las tres frases y «Reactivar proveedor». Antes decía
          «Estado» y no explicaba qué se puede y qué no con un proveedor inactivo. */}
      {!supplier.isActive ? (
        <SectionCard
          id="estado-titulo"
          title="Estado"
          icon="power"
          className="mt-6"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 gap-3 rounded-xl bg-surface-muted p-4">
              <Icon name="info" className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 text-sm">
                {SUPPLIER_INACTIVE_LINES.map((line, index) => (
                  <p key={line} className={index === 0 ? "font-semibold" : ""}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <ReactivateSupplierForm supplierId={supplier.id} />
          </div>
        </SectionCard>
      ) : null}

      {/* La tira de contacto de la lámina 14 (V-18): Teléfono · Email · CUIT en una tarjeta ancha,
          y a su derecha «Ver reparaciones» si es técnico (V-22), que lleva a /reparaciones filtrado
          por él (D-5). El nombre ya está en el título, así que no se repite como fila. */}
      <SectionCard
        id="datos-titulo"
        title="Datos de contacto"
        icon="truck"
        className="mt-6"
        action={
          repairs && supplier.isTechnician ? (
            <Link
              href={`/reparaciones?tecnico=${supplier.id}&estado=todas`}
              className={secondaryLinkClass}
            >
              <Icon name="wrench" className="size-4" />
              Ver reparaciones
            </Link>
          ) : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Teléfono",
              icon: "phone" as const,
              value: supplier.phone,
              empty: "Sin teléfono",
            },
            {
              label: "Email",
              icon: "mail" as const,
              value: supplier.email,
              empty: "Sin email",
            },
            {
              label: "CUIT",
              icon: "hash" as const,
              value: supplier.cuit ? formatCuit(supplier.cuit) : null,
              empty: "Sin CUIT",
            },
          ].map((item) => (
            <div key={item.label} className="flex min-w-0 items-start gap-3">
              <span className={iconTileClass}>
                <Icon name={item.icon} className="size-4" />
              </span>
              <dl className="min-w-0">
                <dt className="text-sm text-muted">{item.label}</dt>
                <dd className="font-semibold break-words">
                  {item.value ?? (
                    <span className="font-normal text-muted">{item.empty}</span>
                  )}
                </dd>
              </dl>
            </div>
          ))}
        </div>
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
                  {/* `hasPending` viene en la misma lectura que ya trae estas órdenes, así que la
                      ficha del proveedor nombra el estado igual que la lista. *Agregado el
                      2026-11-06* por la 24.8.1, con la ampliación de su lista cerrada autorizada
                      por el usuario: sin esto, la misma orden diría «Cerrada · Con faltante» en
                      /compras/ordenes y «Cerrada» acá. */}
                  <PurchaseOrderStatusBadge
                    status={order.status}
                    hasPending={order.hasPending}
                  />
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

      {/* La tarjeta «Trabajo reparado» de la lámina 14 (V-23, D-4): las últimas órdenes que este
          técnico reparó, con su modelo y sus tipos de reparación. La lectura es de service y **no
          toca la cuenta** (H-5): lo que se le debe por ellas está en «Cuenta», que lo lee de cash.
          Por eso la lámina dibuja un «Pendiente» acá y esta tarjeta no: sería la misma cifra
          calculada por un camino que no es el de la imputación. */}
      {work?.ok ? (
        <SectionCard
          id="trabajo-titulo"
          title="Trabajo reparado"
          icon="wrench"
          className="mt-6"
        >
          {work.items.length === 0 ? (
            <p className="text-sm text-muted">{NO_TECHNICIAN_WORK_MESSAGE}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {work.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/reparaciones/${item.id}`}
                      className={`${linkClass} font-mono`}
                    >
                      {item.displayNumber}
                    </Link>
                    <span className="min-w-0 break-words text-muted">
                      {[item.modelName, ...item.repairTypes]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="text-muted">
                    {formatShortDateTime(item.repairedAt, timeZone)}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(item.total, item.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-muted">{TECHNICIAN_WORK_NOTE}</p>
          {work.total > 0 ? (
            <p className="mt-2 text-sm">
              <Link
                href={`/reparaciones?tecnico=${supplier.id}&estado=todas`}
                className={linkClass}
              >
                Ver las órdenes de este técnico
              </Link>
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      {/* Desde la 22.6 (brief-22.6, D-13): el pago a cuenta, también a un proveedor desactivado (ADR
          0023, punto 2), y sus pagos en la lista. Desde la 22.7 (brief-22.7, D-5), la cuenta: lo que se
          le debe o lo que está a favor del negocio, y el estado de cuenta. */}
      <SectionCard
        id="cuenta-titulo"
        title="Cuenta"
        icon="banknote"
        className="mt-6"
        action={
          <Link href={`${href}/cuenta`} className={secondaryLinkClass}>
            <Icon name="fileText" className="size-4" />
            Ver estado de cuenta
          </Link>
        }
      >
        <SupplierAccount context={context} supplierId={supplier.id} />
      </SectionCard>

      {/* «Actividad» con la forma de línea de tiempo de la lámina 14 (V-24), sobre la **misma**
          auditoría paginada de siempre: no se inventa ningún evento que la auditoría no registre,
          y la paginación sigue siendo la de `?historia=`. Por eso no usa AuditCard, que dibuja
          una tabla de cuatro columnas. */}
      {audit.ok && timeZone ? (
        <>
          <SectionCard
            id="actividad-titulo"
            title="Actividad"
            icon="history"
            className="mt-6"
          >
            {audit.total === 0 ? (
              <p className="text-sm text-muted">
                Sin cambios registrados todavía.
              </p>
            ) : (
              <ol
                aria-label={`Actividad de ${supplier.name}`}
                className="flex flex-col gap-4"
              >
                {audit.entries.map((entry) => {
                  const change = describeAuditDiff(entry);
                  return (
                    <li key={entry.id} className="flex min-w-0 gap-3">
                      <span className={iconTileClass}>
                        <Icon
                          name={AUDIT_ICON[entry.action] ?? "history"}
                          className="size-4"
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {auditActionLabel(entry)}
                        </p>
                        {change === "" ? null : (
                          <p className="text-sm break-words text-muted">
                            {change}
                          </p>
                        )}
                        <p className="text-sm text-muted">
                          {formatShortDateTime(entry.createdAt, timeZone)}
                          {actorLabel ? (
                            <> · {actorLabel(entry.actor)}</>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {audit.total > 0 ? (
              <Pagination
                label="Paginación de la actividad"
                className="mt-4"
                page={audit.page}
                pageCount={audit.pageCount}
                rangeText={shownRangeText({
                  page: audit.page,
                  pageSize: AUDIT_PAGE_SIZE,
                  shown: audit.entries.length,
                  total: audit.total,
                  singular: "cambio",
                  plural: "cambios",
                })}
                hrefFor={(target) => `${href}?historia=${target}`}
              />
            ) : null}
          </SectionCard>
          <p className="mt-4 text-sm text-muted">Fechas en {timeZone}.</p>
        </>
      ) : null}
    </main>
  );
}
