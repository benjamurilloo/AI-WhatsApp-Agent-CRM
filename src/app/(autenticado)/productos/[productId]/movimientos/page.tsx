import type { Metadata } from "next";
import Link from "next/link";
import {
  getProductStock,
  listStockMovements,
  MOVEMENTS_PAGE_SIZE,
} from "@/modules/inventory";
import {
  getOrganizationTimezone,
  hasCapability,
} from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  inlineButtonClass,
  labelClass,
  linkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatQuantity } from "@/shared/quantity";
import {
  CONDITION_LABEL,
  FORBIDDEN_PAGE_MESSAGE,
  INACTIVE_PRODUCT_NOTICE,
  NO_MOVEMENT_RESULTS_MESSAGE,
  NO_MOVEMENTS_MESSAGE,
  noticeMessage,
  PRODUCT_NOT_FOUND_MESSAGE,
  UNIT_TRACKED_ADJUSTMENT_MESSAGE,
} from "../../messages";
import { ProductSubNav } from "../product-sub-nav";
import { AdjustForm } from "./adjust-form";
import {
  hasActiveMovementFilters,
  movementFiltersHref,
  movementSign,
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
  // Desde la 19.3: la entrega de un pedido; el motivo lleva su número (ADR 0020, punto 4).
  order_delivery: "Entrega de pedido",
  // Desde la 20.3: la venta sin pedido; el motivo lleva su número (ADR 0021, punto 5).
  sale: "Venta",
  // Desde la 20.4: la reposición de la anulación de una venta sin pedido (ADR 0021, punto 6).
  sale_void: "Anulación de venta",
  // Desde la 22.4: la entrada de una recepción de mercadería; el motivo lleva su número y no nombra
  // al proveedor (ADR 0023, puntos 4 y 12; brief-22.4, D-14).
  goods_receipt: "Recepción",
  // Desde la 22.5: la salida de la anulación de una recepción; el motivo nombra la anulación y la
  // recepción, no el proveedor (ADR 0023, punto 6; brief-22.5, D-9).
  goods_receipt_void: "Anulación de recepción",
  // Desde la 29.6.2: una unidad que va a reparar y una que se libera a la venta; el motivo de la
  // primera lleva el número de su orden (brief-29.6.2, D-1).
  unit_to_repair: "A reparación",
  unit_released: "Liberada a la venta",
  // Desde la 29.7: la baja de la unidad disponible de un usado anulado; el motivo nombra la anulación y
  // la recepción (brief-29.7, D-2).
  unit_written_off: "Baja por anulación de un usado",
};

// El tipo del movimiento con su ícono, como la lámina 11 (brief-24.5.1, D-8). El tono dice si el
// movimiento suma o resta existencias; el nombre del tipo va siempre escrito, así que el color no
// es el único portador del significado (criterios v2, §Semántica por contexto).
function MovementType({ type }: { type: string }) {
  const incoming = movementSign(type) === "+";
  return (
    <StatusBadge
      tone={incoming ? "success" : "neutral"}
      icon={incoming ? "plus" : "circleMinus"}
    >
      {TYPE_LABEL[type]}
    </StatusBadge>
  );
}

// Pantalla 5 (wireframe 05): ajuste para admin e historial para admin y viewer, con filtros
// y página en la URL. Las fechas se muestran en la zona de la organización (brief-4.4, D-3).
// Presentación de la 15.4: tarjetas y la barra de subpantallas del producto (brief-15.4, D-3).
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
  // El filtro de la baja de un usado, solo con la capacidad trade_ins (brief-29.7; revisión B-1).
  const tradeIns = await hasCapability(context.organizationId, "trade_ins");
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
  const clearHref = `/productos/${product.id}/movimientos`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      {/* Desde la 24.5.1 (brief-24.5.1, D-1 (a) y D-8): con la barra de pestañas, el Resumen está
          a un clic, y la salida que muestra la lámina 11 es el catálogo. El contexto del catálogo
          no llega hasta acá: `?desde=` ya significa «fecha inicial» en esta pantalla desde la 4.4
          (`filters.ts`), y renombrar un parámetro público no es de esta subfase. La diferencia
          está declarada en el apartado «Comparación visual (AC-11)» del brief, punto 24. */}
      <BackLink href="/productos" label="Volver a productos" />
      <DetailHeader
        title={product.name}
        leading={<HeaderIcon name="package" />}
        subtitle={
          <p>
            {CONDITION_LABEL[product.condition]} · SKU{" "}
            <span className="font-mono">{product.sku}</span>
            {/* Lo reservado y lo disponible, desde la 19.3 (brief-19.3, D-7). La lámina 11 no los
                tiene; se conservan porque esta es la pantalla donde se ajusta el stock. */}
            <span className="block">
              Stock{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatQuantity(product.quantityOnHand)} {product.unit}
              </span>{" "}
              · Reservado{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatQuantity(product.quantityReserved)}
              </span>{" "}
              · Disponible{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatQuantity(product.quantityAvailable)}
              </span>
            </span>
          </p>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <ProductSubNav productId={product.id} current="movimientos" />

      {isAdmin && product.tracking === "unit" ? (
        // Desde la 29.5 (brief-29.5, D-6): en un producto por unidad no hay ajuste de cantidad.
        <p className={`mt-6 ${cardClass} p-6`}>
          {UNIT_TRACKED_ADJUSTMENT_MESSAGE}{" "}
          <Link
            href={`/productos/${product.id}/unidades`}
            className={linkClass}
          >
            Ver las unidades
          </Link>
        </p>
      ) : isAdmin ? (
        product.isActive ? (
          <SectionCard
            id="ajuste-titulo"
            title="Registrar ajuste"
            icon="layers"
            className="mt-6"
          >
            <AdjustForm
              productId={product.id}
              quantityOnHand={product.quantityOnHand}
              quantityReserved={product.quantityReserved}
              unit={product.unit}
            />
          </SectionCard>
        ) : (
          <p className={`mt-6 ${cardClass} p-6`}>{INACTIVE_PRODUCT_NOTICE}</p>
        )
      ) : null}

      <SectionCard
        id="historial-titulo"
        title="Historial de movimientos"
        icon="history"
        className="mt-6"
      >
        <form
          key={movementFiltersHref(product.id, view)}
          method="get"
          action={clearHref}
          className="flex flex-wrap items-end gap-3"
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
              <option value="entrega">Entrega de pedido</option>
              <option value="venta">Venta</option>
              <option value="anulacion">Anulación de venta</option>
              <option value="recepcion">Recepción</option>
              <option value="anulacion-recepcion">
                Anulación de recepción
              </option>
              <option value="a-reparacion">A reparación</option>
              <option value="liberacion">Liberada a la venta</option>
              {tradeIns ? (
                <option value="baja-usado">
                  Baja por anulación de un usado
                </option>
              ) : null}
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
          <button type="submit" className={inlineButtonClass}>
            <Icon name="filter" className="size-4" />
            Aplicar filtros
          </button>
          {filtered ? (
            <Link href={clearHref} className={`${linkClass} py-2`}>
              Limpiar filtros
            </Link>
          ) : null}
        </form>

        {invalidFilters || !history.ok ? (
          <div className="mt-6">
            <p>{NO_MOVEMENT_RESULTS_MESSAGE}</p>
            <p className="mt-3">
              <Link href={clearHref} className={linkClass}>
                Limpiar filtros
              </Link>
            </p>
          </div>
        ) : history.total === 0 ? (
          <div className="mt-6">
            <p>
              {history.productHasMovements
                ? NO_MOVEMENT_RESULTS_MESSAGE
                : NO_MOVEMENTS_MESSAGE}
            </p>
            {history.productHasMovements ? (
              <p className="mt-3">
                <Link href={clearHref} className={linkClass}>
                  Limpiar filtros
                </Link>
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="-mx-5 mt-6 hidden overflow-x-auto sm:-mx-6 md:block">
              <table className="w-full border-collapse text-left text-sm">
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
                      Responsable
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
                        <MovementType type={movement.type} />
                      </td>
                      <td
                        className={`${tableCellClass} text-right tabular-nums`}
                      >
                        {movementSign(movement.type)}{" "}
                        {formatQuantity(movement.quantity)}
                      </td>
                      <td
                        className={`${tableCellClass} text-right tabular-nums`}
                      >
                        {formatQuantity(movement.balanceAfter)}
                      </td>
                      <td className={tableCellClass}>
                        {movement.reason}
                        {movement.unitSerial ? (
                          <span className="block font-mono text-xs text-muted">
                            IMEI {movement.unitSerial}
                          </span>
                        ) : null}
                      </td>
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
                <li
                  key={movement.id}
                  className="rounded-xl border border-border bg-surface-muted p-4"
                >
                  <p className="text-sm text-muted">
                    {formatShortDateTime(movement.createdAt, timeZone)} ·{" "}
                    {movement.author.name}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 font-semibold tabular-nums">
                    <MovementType type={movement.type} />
                    <span>
                      {movementSign(movement.type)}{" "}
                      {formatQuantity(movement.quantity)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm">
                    Saldo: {formatQuantity(movement.balanceAfter)} ·{" "}
                    {movement.reason}
                  </p>
                  {movement.unitSerial ? (
                    <p className="mt-1 font-mono text-xs text-muted">
                      IMEI {movement.unitSerial}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            <Pagination
              className="mt-4"
              page={history.page}
              pageCount={history.pageCount}
              rangeText={shownRangeText({
                page: history.page,
                pageSize: MOVEMENTS_PAGE_SIZE,
                shown: history.movements.length,
                total: history.total,
                singular: "movimiento",
                plural: "movimientos",
              })}
              hrefFor={(target) =>
                movementFiltersHref(product.id, { ...view, page: target })
              }
            />
          </>
        )}
      </SectionCard>

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
