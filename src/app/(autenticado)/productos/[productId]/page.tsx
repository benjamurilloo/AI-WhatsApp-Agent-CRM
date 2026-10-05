import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import {
  getCurrentPrices,
  listProductAudit,
  listProductSuggestions,
} from "@/modules/catalog";
import { getProductStock, listStockMovements } from "@/modules/inventory";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
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
import { formatQuantity } from "@/shared/quantity";
import type { SearchParams } from "../filters";
import {
  CONDITION_LABEL,
  FORBIDDEN_PAGE_MESSAGE,
  noticeMessage,
  PRODUCT_NOT_FOUND_MESSAGE,
} from "../messages";
import { ProductForm } from "../product-form";
import { StockStatusBadge } from "../stock-status";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { DeactivateConfirm, ReactivateForm } from "./product-actions";
import { ProductSubNav } from "./product-sub-nav";

export const metadata: Metadata = {
  title: "Producto — AI WhatsApp Agent CRM",
};

const TITLE = "Productos";
const LAST_MOVEMENTS = 3;

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Pantalla 4 (wireframe 04): datos, precio, stock, últimos movimientos y, solo para admin,
// edición, desactivación con confirmación e historial de auditoría paginado (FR-AUD-02). El
// precio vigente enlaza a la pantalla de precios (brief-11.1, FR-PROD-12). Presentación de la
// 15.4: tarjetas por sección y la barra de subpantallas (brief-15.4, D-1 y D-3).
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { productId } = await params;
  const query = await searchParams;

  const found = await getProductStock(context, productId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={PRODUCT_NOT_FOUND_MESSAGE}
        back={{ href: "/productos", label: "Volver a productos" }}
      />
    );
  }

  const product = found.product;
  const isAdmin = context.role === "admin";
  const editing = isAdmin && query.editar === "1";
  const confirming =
    isAdmin && query.confirmar === "desactivar" && product.isActive;
  const notice = noticeMessage(query.aviso);

  const prices = await getCurrentPrices(context, [product.id]);
  const price = prices.ok ? prices.prices.get(product.id) : undefined;

  const timeZone = await getOrganizationTimezone(context);
  const history = await listStockMovements(context, product.id, {
    type: "all",
    from: "",
    to: "",
    page: 1,
  });
  const movements = history.ok
    ? history.movements.slice(0, LAST_MOVEMENTS)
    : [];
  // La auditoría solo se pide para un admin: el servidor no la entrega a un viewer.
  const audit = isAdmin
    ? await listProductAudit(context, product.id, page(query.auditoria))
    : null;
  const actorLabel = audit?.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  // Las sugerencias de marca y categoría solo hacen falta si se edita (brief-11.1, D-2).
  const suggestions = editing ? await listProductSuggestions(context) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/productos" label="Volver a productos" />

      <DetailHeader
        title={product.name}
        leading={<HeaderIcon name="package" />}
        badges={
          <>
            <StockStatusBadge status={product.stockStatus} />
            <span
              className={
                product.isActive ? activeBadgeClass : inactiveBadgeClass
              }
            >
              {product.isActive ? "Activo" : "Inactivo"}
            </span>
          </>
        }
        subtitle={<span className="font-mono text-sm">{product.sku}</span>}
        actions={
          isAdmin && !editing ? (
            <>
              <Link
                href={`/productos/${product.id}?editar=1`}
                className={secondaryLinkClass}
              >
                <Icon name="pencil" className="size-4" />
                Editar
              </Link>
              {product.isActive && !confirming ? (
                <Link
                  href={`/productos/${product.id}?confirmar=desactivar`}
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
          <DeactivateConfirm productId={product.id} name={product.name} />
        </div>
      ) : null}

      {isAdmin && !product.isActive ? (
        <SectionCard
          id="estado-titulo"
          title="Estado"
          icon="power"
          className="mt-6"
        >
          <ReactivateForm productId={product.id} />
        </SectionCard>
      ) : null}

      <ProductSubNav productId={product.id} current="resumen" />

      {editing ? (
        <div className="mt-6">
          <ProductForm
            mode="editar"
            productId={product.id}
            values={{
              sku: product.sku,
              name: product.name,
              description: product.description ?? "",
              unit: product.unit,
              reorderPoint: formatQuantity(product.reorderPoint),
              brand: product.brand ?? "",
              category: product.category ?? "",
              condition: product.condition,
            }}
            suggestions={suggestions?.ok ? suggestions : undefined}
          />
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
          <SectionCard
            id="datos-titulo"
            title="Información básica"
            icon="package"
            className="lg:col-span-2"
          >
            <DetailList
              items={[
                {
                  label: "SKU",
                  icon: "hash",
                  value: <span className="font-mono">{product.sku}</span>,
                },
                { label: "Nombre", icon: "package", value: product.name },
                { label: "Marca", icon: "tag", value: product.brand },
                { label: "Categoría", icon: "list", value: product.category },
                {
                  label: "Condición",
                  icon: "circleCheck",
                  value: CONDITION_LABEL[product.condition],
                },
                { label: "Unidad", icon: "layers", value: product.unit },
                {
                  label: "Descripción",
                  icon: "fileText",
                  value: product.description,
                  multiline: true,
                },
              ]}
            />
          </SectionCard>

          <div className="flex min-w-0 flex-col gap-6">
            <SectionCard id="precio-titulo" title="Precio" icon="tag">
              <p className="text-sm font-semibold text-muted">
                Precio de venta
              </p>
              <p
                className={
                  price
                    ? "mt-1 text-2xl font-extrabold tracking-tight tabular-nums"
                    : "mt-1 text-muted"
                }
              >
                {price
                  ? formatMoney(price.amount, price.currency)
                  : "Sin precio"}
              </p>
              <p className="mt-4">
                <Link
                  href={`/productos/${product.id}/precios`}
                  className={`${linkClass} inline-flex items-center gap-1.5 text-sm`}
                >
                  <Icon name="trendingUp" className="size-4" />
                  {isAdmin && product.isActive
                    ? "Ver historial y fijar precio"
                    : "Ver historial de precios"}
                </Link>
              </p>
            </SectionCard>

            <SectionCard id="stock-titulo" title="Stock" icon="layers">
              <DetailList
                items={[
                  {
                    label: "Stock actual",
                    value: (
                      <span className="tabular-nums">
                        {formatQuantity(product.quantityOnHand)} {product.unit}
                      </span>
                    ),
                  },
                  {
                    label: "Punto de reposición",
                    value: (
                      <span className="tabular-nums">
                        {formatQuantity(product.reorderPoint)}
                      </span>
                    ),
                  },
                ]}
              />
              <h3 className="mt-5 text-xs font-bold tracking-wider text-muted uppercase">
                Últimos movimientos
              </h3>
              {movements.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  Sin movimientos todavía.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2 text-sm">
                  {movements.map((movement) => (
                    <li key={movement.id} className="tabular-nums">
                      {formatShortDateTime(movement.createdAt, timeZone)} ·{" "}
                      {movement.type === "adjustment_positive" ? "+" : "−"}
                      {formatQuantity(movement.quantity)} · {movement.reason}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4">
                <Link
                  href={`/productos/${product.id}/movimientos`}
                  className={`${linkClass} inline-flex items-center gap-1.5 text-sm`}
                >
                  <Icon name="trendingUp" className="size-4" />
                  Ver historial y ajustar
                </Link>
              </p>
            </SectionCard>
          </div>
        </div>
      )}

      {audit?.ok ? (
        <AuditCard
          caption={`Auditoría de ${product.name}`}
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
          hrefFor={(target) => `/productos/${product.id}?auditoria=${target}`}
        />
      ) : null}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
