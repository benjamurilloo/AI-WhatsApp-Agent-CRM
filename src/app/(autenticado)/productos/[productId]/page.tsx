import type { Metadata } from "next";
import Link from "next/link";
import { listProductAudit, listProductSuggestions } from "@/modules/catalog";
import { getProductStock, listStockMovements } from "@/modules/inventory";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  linkClass,
  noticeClass,
  pageTitleClass,
  secondaryLinkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatShortDateTime } from "@/app/_format/date-time";
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

export const metadata: Metadata = {
  title: "Producto — AI WhatsApp Agent CRM",
};

const TITLE = "Productos";
const LAST_MOVEMENTS = 3;

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Pantalla 4 (wireframe 04): datos, stock, últimos movimientos y, solo para admin, edición,
// desactivación con confirmación e historial de auditoría paginado (FR-AUD-02).
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
  // Las sugerencias de marca y categoría solo hacen falta si se edita (brief-11.1, D-2).
  const suggestions = editing ? await listProductSuggestions(context) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p>
        <Link href="/productos" className={linkClass}>
          Volver a productos
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={pageTitleClass}>{product.name}</h1>
          <StockStatusBadge status={product.stockStatus} />
          <span
            className={product.isActive ? activeBadgeClass : inactiveBadgeClass}
          >
            {product.isActive ? "Activo" : "Inactivo"}
          </span>
        </div>
        {isAdmin && !editing ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/productos/${product.id}?editar=1`}
              className={secondaryLinkClass}
            >
              Editar
            </Link>
            {product.isActive && !confirming ? (
              <Link
                href={`/productos/${product.id}?confirmar=desactivar`}
                className={secondaryLinkClass}
              >
                Desactivar
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {confirming ? (
        <div className="mt-6">
          <DeactivateConfirm productId={product.id} name={product.name} />
        </div>
      ) : null}

      {isAdmin && !product.isActive ? (
        <section
          aria-labelledby="estado-titulo"
          className={`mt-6 ${cardClass} p-6`}
        >
          <h2 id="estado-titulo" className={sectionTitleClass}>
            Estado
          </h2>
          <div className="mt-3">
            <ReactivateForm productId={product.id} />
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="datos-titulo" className={`${cardClass} p-6`}>
          <h2 id="datos-titulo" className={sectionTitleClass}>
            Datos
          </h2>
          {editing ? (
            <div className="mt-4">
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
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-semibold">SKU</dt>
              <dd className="font-mono">{product.sku}</dd>
              <dt className="font-semibold">Nombre</dt>
              <dd>{product.name}</dd>
              <dt className="font-semibold">Marca</dt>
              <dd className={product.brand ? undefined : "text-muted"}>
                {product.brand ?? "—"}
              </dd>
              <dt className="font-semibold">Categoría</dt>
              <dd className={product.category ? undefined : "text-muted"}>
                {product.category ?? "—"}
              </dd>
              <dt className="font-semibold">Condición</dt>
              <dd>{CONDITION_LABEL[product.condition]}</dd>
              <dt className="font-semibold">Descripción</dt>
              <dd className="text-muted">{product.description ?? "—"}</dd>
              <dt className="font-semibold">Unidad</dt>
              <dd>{product.unit}</dd>
            </dl>
          )}
        </section>

        <section aria-labelledby="stock-titulo" className={`${cardClass} p-6`}>
          <h2 id="stock-titulo" className={sectionTitleClass}>
            Stock
          </h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold">Disponible</dt>
            <dd className="tabular-nums">
              {formatQuantity(product.quantityOnHand)} {product.unit}
            </dd>
            <dt className="font-semibold">Punto de reposición</dt>
            <dd className="tabular-nums">
              {formatQuantity(product.reorderPoint)}
            </dd>
          </dl>

          <h3 className="mt-6 text-sm font-bold tracking-wider text-muted uppercase">
            Últimos movimientos
          </h3>
          {movements.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Sin movimientos todavía.</p>
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
              className={linkClass}
            >
              Ver historial y ajustar
            </Link>
          </p>
        </section>
      </div>

      {audit?.ok ? (
        <section
          aria-labelledby="auditoria-titulo"
          className={`mt-6 ${cardClass} p-6`}
        >
          <h2 id="auditoria-titulo" className={sectionTitleClass}>
            Historial de auditoría
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Auditoría de {product.name}</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Autor
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Acción
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Cambio
                  </th>
                </tr>
              </thead>
              <tbody>
                {audit.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(entry.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>{entry.actor.name}</td>
                    <td className={tableCellClass}>
                      {auditActionLabel(entry)}
                    </td>
                    <td className={`${tableCellClass} text-muted`}>
                      {describeAuditDiff(entry)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {audit.pageCount > 1 ? (
            <nav
              aria-label="Paginación de auditoría"
              className="mt-4 flex flex-wrap items-center justify-center gap-4"
            >
              {audit.page > 1 ? (
                <Link
                  href={`/productos/${product.id}?auditoria=${audit.page - 1}`}
                  className={linkClass}
                >
                  Página anterior
                </Link>
              ) : null}
              <p className="text-sm text-muted tabular-nums">
                Página {audit.page} de {audit.pageCount}
              </p>
              {audit.page < audit.pageCount ? (
                <Link
                  href={`/productos/${product.id}?auditoria=${audit.page + 1}`}
                  className={linkClass}
                >
                  Página siguiente
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      ) : null}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
