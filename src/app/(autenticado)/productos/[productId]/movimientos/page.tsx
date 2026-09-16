import type { Metadata } from "next";
import Link from "next/link";
import { getProductStock, listStockMovements } from "@/modules/inventory";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  labelClass,
  linkClass,
  noticeClass,
  pageTitleClass,
  secondaryButtonClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatQuantity } from "@/shared/quantity";
import {
  FORBIDDEN_PAGE_MESSAGE,
  INACTIVE_PRODUCT_NOTICE,
  NO_MOVEMENT_RESULTS_MESSAGE,
  NO_MOVEMENTS_MESSAGE,
  noticeMessage,
  PRODUCT_NOT_FOUND_MESSAGE,
} from "../../messages";
import { AdjustForm } from "./adjust-form";
import {
  hasActiveMovementFilters,
  movementFiltersHref,
  parseMovementView,
  PERIOD_LABEL,
  toHistoryFilters,
  type SearchParams,
} from "./filters";

export const metadata: Metadata = {
  title: "Movimientos — AI WhatsApp Agent CRM",
};

const TITLE = "Movimientos";

const TYPE_LABEL: Record<string, string> = {
  adjustment_positive: "Ajuste positivo",
  adjustment_negative: "Ajuste negativo",
};

// Pantalla 5 (wireframe 05): ajuste para admin e historial para admin y viewer, con filtros
// y página en la URL. Las fechas se muestran en la zona de la organización (brief-4.4, D-3).
export default async function MovementsPage({
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
  const view = parseMovementView(query);
  const timeZone = await getOrganizationTimezone(context);
  const history = await listStockMovements(
    context,
    product.id,
    toHistoryFilters(view, timeZone),
  );
  if (!history.ok) {
    if (history.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    if (history.code === "NOT_FOUND") {
      return (
        <PageNotice
          title={TITLE}
          message={PRODUCT_NOT_FOUND_MESSAGE}
          back={{ href: "/productos", label: "Volver a productos" }}
        />
      );
    }
  }

  const notice = noticeMessage(query.aviso);
  const invalidFilters = !history.ok;
  const filtered = hasActiveMovementFilters(view);
  const isAdmin = context.role === "admin";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p>
        <Link href={`/productos/${product.id}`} className={linkClass}>
          Volver al producto
        </Link>
      </p>
      <h1 className={`mt-4 ${pageTitleClass}`}>{product.name}</h1>
      <p className="mt-1 text-muted">
        Inventario · Stock actual:{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {formatQuantity(product.quantityOnHand)} {product.unit}
        </span>
      </p>

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {isAdmin ? (
        product.isActive ? (
          <section
            aria-labelledby="ajuste-titulo"
            className={`mt-6 ${cardClass} p-6`}
          >
            <h2 id="ajuste-titulo" className="text-lg font-bold tracking-tight">
              Registrar ajuste
            </h2>
            <AdjustForm
              productId={product.id}
              quantityOnHand={product.quantityOnHand}
              unit={product.unit}
            />
          </section>
        ) : (
          <p className={`mt-6 ${cardClass} p-6`}>{INACTIVE_PRODUCT_NOTICE}</p>
        )
      ) : null}

      <h2 className="mt-8 text-lg font-bold tracking-tight">
        Historial de movimientos
      </h2>

      <form
        key={movementFiltersHref(product.id, view)}
        method="get"
        action={`/productos/${product.id}/movimientos`}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="tipo" className={labelClass}>
            Tipo
          </label>
          <select
            id="tipo"
            name="tipo"
            defaultValue={view.type}
            className={selectClass}
          >
            <option value="todos">Todos</option>
            <option value="positivo">Ajuste positivo</option>
            <option value="negativo">Ajuste negativo</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="periodo" className={labelClass}>
            Período
          </label>
          <select
            id="periodo"
            name="periodo"
            defaultValue={view.period}
            className={selectClass}
          >
            {(["todo", "7d", "30d", "90d"] as const).map((period) => (
              <option key={period} value={period}>
                {PERIOD_LABEL[period]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={secondaryButtonClass}>
          Aplicar filtros
        </button>
        {filtered ? (
          <Link
            href={`/productos/${product.id}/movimientos`}
            className={`${linkClass} py-2`}
          >
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {invalidFilters || !history.ok ? (
        <div className={`mt-6 ${cardClass} p-6`}>
          <p>{NO_MOVEMENT_RESULTS_MESSAGE}</p>
          <p className="mt-3">
            <Link
              href={`/productos/${product.id}/movimientos`}
              className={linkClass}
            >
              Limpiar filtros
            </Link>
          </p>
        </div>
      ) : history.total === 0 ? (
        <div className={`mt-6 ${cardClass} p-6`}>
          <p>
            {history.productHasMovements
              ? NO_MOVEMENT_RESULTS_MESSAGE
              : NO_MOVEMENTS_MESSAGE}
          </p>
          {history.productHasMovements ? (
            <p className="mt-3">
              <Link
                href={`/productos/${product.id}/movimientos`}
                className={linkClass}
              >
                Limpiar filtros
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className={`mt-6 hidden overflow-hidden md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">
                Movimientos de {product.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Tipo
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
                    Saldo resultante
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Motivo
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Autor
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(movement.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>
                      {TYPE_LABEL[movement.type]}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {movement.type === "adjustment_positive" ? "+" : "−"}{" "}
                      {formatQuantity(movement.quantity)}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {formatQuantity(movement.balanceAfter)}
                    </td>
                    <td className={tableCellClass}>{movement.reason}</td>
                    <td className={`${tableCellClass} text-muted`}>
                      {movement.author.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label={`Movimientos de ${product.name}`}
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {history.movements.map((movement) => (
              <li key={movement.id} className={`${cardClass} p-4`}>
                <p className="text-sm text-muted">
                  {formatShortDateTime(movement.createdAt, timeZone)} ·{" "}
                  {movement.author.name}
                </p>
                <p className="mt-1 font-semibold tabular-nums">
                  {TYPE_LABEL[movement.type]}{" "}
                  {movement.type === "adjustment_positive" ? "+" : "−"}{" "}
                  {formatQuantity(movement.quantity)}
                </p>
                <p className="mt-1 text-sm">
                  Saldo: {formatQuantity(movement.balanceAfter)} ·{" "}
                  {movement.reason}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {history.ok && history.pageCount > 1 ? (
        <nav
          aria-label="Paginación"
          className="mt-6 flex flex-wrap items-center justify-center gap-4"
        >
          {history.page > 1 ? (
            <Link
              href={movementFiltersHref(product.id, {
                ...view,
                page: history.page - 1,
              })}
              className={linkClass}
            >
              Página anterior
            </Link>
          ) : null}
          <p className="text-sm text-muted tabular-nums">
            Página {history.page} de {history.pageCount} · {history.total}{" "}
            {history.total === 1 ? "movimiento" : "movimientos"}
          </p>
          {history.page < history.pageCount ? (
            <Link
              href={movementFiltersHref(product.id, {
                ...view,
                page: history.page + 1,
              })}
              className={linkClass}
            >
              Página siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
