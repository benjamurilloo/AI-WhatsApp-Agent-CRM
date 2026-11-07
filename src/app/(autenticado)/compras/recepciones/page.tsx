import type { Metadata } from "next";
import Link from "next/link";
import { getOrganizationTimezone } from "@/modules/organizations";
import {
  getSupplier,
  GOODS_RECEIPTS_PAGE_SIZE,
  listGoodsReceipts,
  listGoodsReceiptSupplierOptions,
  type GoodsReceiptSupplierOptions,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  primaryLinkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatDate } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import {
  byQuantity,
  FORBIDDEN_PAGE_MESSAGE,
  UNKNOWN_SUPPLIER_TEXT,
} from "../ordenes/messages";
import { PurchasingSubNav } from "../purchasing-sub-nav";
import {
  goodsReceiptFiltersHref,
  hasActiveGoodsReceiptFilters,
  orderParam,
  parseGoodsReceiptFilters,
  statusParam,
  type SearchParams,
} from "./filters";
import {
  CURRENT_BADGE_TEXT,
  NO_GOODS_RECEIPT_RESULTS_MESSAGE,
  NO_GOODS_RECEIPTS_MESSAGE,
  ORDER_FILTER_HINT,
  RECEIPTS_LIST_NOTE,
  VOIDED_BADGE_TEXT,
} from "./messages";

export const metadata: Metadata = {
  title: "Recepciones de compra — AI WhatsApp Agent CRM",
};

const TITLE = "Recepciones de compra";

// La vigencia del documento, con texto e ícono y no solo color (lámina 01, V-3; AC-2). «Anulada»
// queda en gris y no en el rojo de la lámina, por el mismo motivo que «Cancelada» en la orden: el
// rojo está reservado al control destructivo y a los errores. Vive acá y no en un archivo propio
// porque la lista cerrada del brief no tiene uno.
function GoodsReceiptStatusBadge({ voided }: { voided: boolean }) {
  return voided ? (
    <StatusBadge tone="neutral" icon="circleX">
      {VOIDED_BADGE_TEXT}
    </StatusBadge>
  ) : (
    <StatusBadge tone="success" icon="circleCheck">
      {CURRENT_BADGE_TEXT}
    </StatusBadge>
  );
}

// El filtro de proveedor de la lámina (D-4): el `<select>` con «Todos» cuando los proveedores con
// **recepciones** entran en el tope, y ningún control cuando lo pasan, que es la conducta de hoy
// —el proveedor llega por la URL desde la fila o desde su ficha—. Es el gemelo del de la lista de
// órdenes, con su misma decisión del 2026-11-06, pero sobre su propia lectura: un proveedor puede
// tener órdenes y no recepciones (H-6).
//
// El `<select>` lleva `w-full min-w-0` obligatorio: su ancho mínimo es el de su opción más larga
// —403 px medidos en la 24.7.2-b sobre el mismo control— y sin eso desborda a 320 px (H-6).
function SupplierFilter({
  options,
  value,
  supplierName,
}: {
  options: GoodsReceiptSupplierOptions;
  value: string;
  supplierName: string;
}) {
  if (options.kind === "text") {
    // Sin control, el id elegido tiene que sobrevivir a «Aplicar filtros».
    return value === "" ? null : (
      <input type="hidden" name="proveedor" value={value} />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:w-64">
      <label htmlFor="proveedor" className={labelClass}>
        Proveedor
      </label>
      <select
        id="proveedor"
        name="proveedor"
        defaultValue={value}
        className={`${selectClass} w-full min-w-0`}
      >
        <option value="">Todos</option>
        {options.suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
        {/* El proveedor que vino en la dirección y **no tiene recepciones**: sin esta opción el
            navegador deja «Todos» seleccionado y el control contradice a la lista, que está
            vacía. Es el defecto N-9 de la 24.7.2-b. */}
        {value !== "" &&
        !options.suppliers.some((supplier) => supplier.id === value) ? (
          <option value={value}>{supplierName}</option>
        ) : null}
      </select>
    </div>
  );
}

// La lista de recepciones (brief-22.4, D-11 y D-12): la más nueva primero, el filtro de proveedor y
// la búsqueda por número, en la URL. El proveedor de cada fila filtra la lista por él, y la ficha
// del proveedor llega ya filtrada. Tabla en escritorio y tarjetas en móvil, como las órdenes. Solo
// admin: a un viewer, purchasing le responde FORBIDDEN y la página lo dice. Desde la 22.5
// (brief-22.5, D-9): la marca «Anulada», el filtro por estado y la búsqueda por el número de la
// anulación.
//
// Desde la 24.8.1-b tiene la forma de la lámina 01 del lote V2-11: el título y la bajada (V-1), las
// columnas Número RC / Proveedor / Orden de compra / Fecha / Moneda y costo / Estado / Ver —sin
// «Líneas» y en ese orden (V-2)—, el estado como columna propia (V-3), el filtro de proveedor
// (D-4), el de «con orden o sin orden» (D-5), «+ Nueva recepción» en la fila de filtros (V-6) y el
// aviso del pie (V-8). La fecha va sin la hora, como la dibuja la lámina.
export default async function GoodsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseGoodsReceiptFilters(await searchParams);
  // Las opciones del filtro son la segunda lectura nueva de la subfase (D-4): una sentencia con
  // `limit 51`, en paralelo con la lista.
  const [result, chosen] = await Promise.all([
    listGoodsReceipts(context, {
      supplierId: filters.supplierId || null,
      number: filters.number,
      status: filters.status,
      withOrder: filters.withOrder,
      page: filters.page,
    }),
    listGoodsReceiptSupplierOptions(context),
  ]);
  if (!result.ok || !chosen.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const options = chosen.options;
  const timeZone = await getOrganizationTimezone(context);
  const filteredSupplier = filters.supplierId
    ? await getSupplier(context, filters.supplierId)
    : null;
  const supplierName = filteredSupplier?.ok
    ? filteredSupplier.supplier.name
    : UNKNOWN_SUPPLIER_TEXT;
  const filtered = hasActiveGoodsReceiptFilters(filters);
  const supplierHref = (supplierId: string) =>
    goodsReceiptFiltersHref({ ...filters, supplierId, page: 1 });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title={TITLE} subtitle="Entradas de mercadería y su costo." />
      <PurchasingSubNav current="recepciones" />

      <form
        key={goodsReceiptFiltersHref(filters)}
        method="get"
        action="/compras/recepciones"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="numero" className={labelClass}>
            Número RC
          </label>
          <div className="relative">
            <input
              id="numero"
              name="numero"
              type="search"
              defaultValue={filters.number}
              placeholder="RC-000123 o ARC-000001"
              autoComplete="off"
              className={`${inputClass} w-48 pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        <SupplierFilter
          options={options}
          value={filters.supplierId}
          supplierName={supplierName}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="estado" className={labelClass}>
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={statusParam(filters.status)}
            className={selectClass}
          >
            <option value="todas">Todas</option>
            <option value="vigente">Vigentes</option>
            <option value="anulada">Anuladas</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label
            htmlFor="orden"
            className={`${labelClass} inline-flex items-center gap-1.5`}
          >
            Con orden o sin orden
            {/* El ícono de ayuda de la lámina. Un ícono solo no dice nada: el texto va en `title`
                y también para el lector de pantalla. */}
            <span title={ORDER_FILTER_HINT} className="inline-flex">
              <Icon name="info" className="size-4 text-muted" />
              <span className="sr-only">. {ORDER_FILTER_HINT}</span>
            </span>
          </label>
          <select
            id="orden"
            name="orden"
            defaultValue={orderParam(filters.withOrder)}
            className={selectClass}
          >
            <option value="todas">Todos</option>
            <option value="con">Con orden</option>
            <option value="sin">Sin orden</option>
          </select>
        </div>
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/compras/recepciones" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
        {/* La lámina lo pone en la fila de filtros y no en la cabecera (V-6). Es un enlace, no un
            control del formulario: `type` no aplica y no lo envía. */}
        <Link
          href="/compras/recepciones/nueva"
          className={`${primaryLinkClass} sm:ml-auto`}
        >
          + Nueva recepción
        </Link>
      </form>

      {/* Con el `<select>` dibujado, el control ya dice de quién es la lista y cómo volver a
          todos. Esta línea queda solo cuando no hay control: ahí es la única salida. */}
      {filters.supplierId && options.kind === "text" ? (
        <p className="mt-4 text-sm">
          Recepciones de <span className="font-semibold">{supplierName}</span>.{" "}
          <Link
            href={goodsReceiptFiltersHref({
              ...filters,
              supplierId: "",
              page: 1,
            })}
            className={linkClass}
          >
            Ver las de todos los proveedores
          </Link>
        </p>
      ) : null}

      {result.total === 0 ? (
        <EmptyState
          icon="package"
          title={
            filtered
              ? NO_GOODS_RECEIPT_RESULTS_MESSAGE
              : NO_GOODS_RECEIPTS_MESSAGE
          }
          description={
            filtered
              ? "Probá con otras palabras o quitá algún filtro."
              : "Cada recepción suma stock y deja el costo recibido como vigente."
          }
          actions={
            filtered
              ? [
                  {
                    href: "/compras/recepciones",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : [
                  {
                    href: "/compras/recepciones/nueva",
                    label: "Registrar la primera",
                    variant: "primary",
                  },
                ]
          }
        />
      ) : (
        <>
          <div className={`mt-8 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Recepciones de la organización
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Número RC
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Proveedor
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Orden de compra
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Moneda y costo
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    <span className="sr-only">Ver la recepción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      <Link
                        href={`/compras/recepciones/${receipt.id}`}
                        className={linkClass}
                      >
                        {receipt.displayNumber}
                      </Link>
                    </td>
                    <td className={tableCellClass}>
                      <Link
                        href={supplierHref(receipt.supplierId)}
                        className={linkClass}
                      >
                        {receipt.supplierName}
                        <span className="sr-only">
                          : ver solo sus recepciones
                        </span>
                      </Link>
                    </td>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      {receipt.purchaseOrderId ? (
                        <Link
                          href={`/compras/ordenes/${receipt.purchaseOrderId}`}
                          className={linkClass}
                        >
                          {receipt.purchaseOrderDisplayNumber}
                        </Link>
                      ) : (
                        <span className="font-sans text-muted">Sin orden</span>
                      )}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatDate(receipt.createdAt, timeZone)}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(receipt.total, receipt.currency)}
                    </td>
                    <td className={tableCellClass}>
                      <GoodsReceiptStatusBadge
                        voided={receipt.voidDisplayNumber !== null}
                      />
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap`}
                    >
                      <Link
                        href={`/compras/recepciones/${receipt.id}`}
                        className={`${linkClass} inline-flex items-center gap-1`}
                      >
                        Ver
                        <span className="sr-only">
                          la recepción {receipt.displayNumber}
                        </span>
                        <Icon name="chevronRight" className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Recepciones de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.receipts.map((receipt) => (
              <li key={receipt.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/compras/recepciones/${receipt.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {receipt.displayNumber}
                  </Link>
                  <GoodsReceiptStatusBadge
                    voided={receipt.voidDisplayNumber !== null}
                  />
                </p>
                <p className="mt-1 font-semibold">
                  <Link
                    href={supplierHref(receipt.supplierId)}
                    className={linkClass}
                  >
                    {receipt.supplierName}
                    <span className="sr-only">: ver solo sus recepciones</span>
                  </Link>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {receipt.purchaseOrderDisplayNumber ?? "Sin orden"} ·{" "}
                  {formatDate(receipt.createdAt, timeZone)} ·{" "}
                  {formatQuantity(receipt.unitCount)}{" "}
                  {byQuantity(receipt.unitCount, "unidad", "unidades")} ·{" "}
                  <span className="tabular-nums">
                    {formatMoney(receipt.total, receipt.currency)}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: GOODS_RECEIPTS_PAGE_SIZE,
              shown: result.receipts.length,
              total: result.total,
              singular: "recepción",
              plural: "recepciones",
            })}
            hrefFor={(target) =>
              goodsReceiptFiltersHref({ ...filters, page: target })
            }
          />
        </>
      )}

      {/* El primero de los dos avisos del pie de la lámina. El segundo no se dibuja: describe una
          pantalla que acá no existe y no dice nada verificable (V-8). */}
      <p className="mt-6 flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        <span>{RECEIPTS_LIST_NOTE}</span>
      </p>

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
