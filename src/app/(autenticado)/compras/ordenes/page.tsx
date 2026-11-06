import type { Metadata } from "next";
import Link from "next/link";
import { getOrganizationTimezone } from "@/modules/organizations";
import {
  getSupplier,
  listPurchaseOrders,
  listPurchaseOrderSupplierOptions,
  PURCHASE_ORDERS_PAGE_SIZE,
  type PurchaseOrderSupplierOptions,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  iconTileClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon, type IconName } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatDate } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { PurchasingSubNav } from "../purchasing-sub-nav";
import {
  hasActivePurchaseOrderFilters,
  parsePurchaseOrderFilters,
  purchaseOrderFiltersHref,
  statusParam,
  type SearchParams,
} from "./filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_PURCHASE_ORDER_RESULTS_MESSAGE,
  NO_PURCHASE_ORDERS_MESSAGE,
  UNKNOWN_SUPPLIER_TEXT,
} from "./messages";
import { PurchaseOrderStatusBadge } from "./status-badge";

export const metadata: Metadata = {
  title: "Órdenes de compra — AI WhatsApp Agent CRM",
};

const TITLE = "Órdenes de compra";

// La franja de etapas de la lámina 01 (brief-24.8.1, V-4): **texto fijo, sin un solo dato**. Dice
// de dónde sale cada efecto, que es la confusión que esta pantalla arrastra: la orden no mueve
// stock ni dinero. El ícono es de los del proyecto (V-17), no un activo nuevo.
const STAGES: { icon: IconName; title: string; detail: string }[] = [
  { icon: "fileText", title: "Orden", detail: "Compromiso" },
  { icon: "package", title: "Recepción", detail: "Stock y costo" },
  { icon: "creditCard", title: "Pago", detail: "Cuenta" },
];

function StageStrip() {
  return (
    <ol
      aria-label="Cómo sigue una compra"
      className={`mt-6 flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2 ${cardClass}`}
    >
      {STAGES.map((stage, index) => (
        <li key={stage.title} className="flex min-w-0 items-center gap-3">
          {index > 0 ? (
            <Icon
              name="chevronRight"
              className="hidden size-5 shrink-0 text-muted sm:block"
            />
          ) : null}
          <span className={iconTileClass}>
            <Icon name={stage.icon} className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{stage.title}</span>
            <span className="block text-sm text-muted">{stage.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// El filtro de proveedor de la lámina (D-5): el `<select>` con «Todos» cuando los proveedores con
// órdenes entran en el tope, y **ningún control** cuando lo pasan, que es la conducta de hoy —el
// proveedor llega por la URL desde la fila o desde su ficha—. El campo de texto del precedente de
// clientes no se copia porque acá no filtraría nada: `listPurchaseOrders` acepta un id, no un
// nombre, y hacerle entender nombres era un tercer cambio en `purchasing` que esta subfase no
// tiene. **Decidido por el usuario el 2026-11-06**, y declarado en el brief y en Screens.md.
//
// El `<select>` lleva `w-full min-w-0` obligatorio: su ancho mínimo es el de su opción más larga
// —403 px medidos en la 24.7.2-b sobre el mismo control con la misma clase de contenido— y sin eso
// desborda a 320 px (H-6).
function SupplierFilter({
  options,
  value,
  supplierName,
}: {
  options: PurchaseOrderSupplierOptions;
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
        {/* El proveedor que vino en la dirección y **no tiene órdenes**: sin esta opción el
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

// La lista de órdenes de compra (brief-22.3, D-10 y D-11): la más nueva primero, el filtro de
// estado, el de proveedor y la búsqueda por número, en la URL. El proveedor de cada fila filtra la
// lista por él, y la ficha del proveedor llega ya filtrada. Tabla en escritorio y tarjetas en móvil,
// como pedidos. Solo admin: a un viewer, purchasing le responde FORBIDDEN y la página lo dice.
//
// Desde la 24.8.1 tiene la forma de la lámina 01 del lote V2-11: la franja de etapas (V-4), el
// filtro de proveedor (D-5), las columnas Nº de orden / Proveedor / Fecha / Monto / Estado / Ver
// —sin «Líneas» y en ese orden (V-1)—, la insignia de **cuatro** estados (D-2) y la fecha con su
// año y sin la hora, como la dibuja la lámina (V-19).
export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parsePurchaseOrderFilters(await searchParams);
  // Las opciones del filtro son la segunda lectura nueva de la subfase (D-5), autorizada el
  // 2026-11-06: una sentencia con `limit 51`, en paralelo con la lista.
  const [result, chosen] = await Promise.all([
    listPurchaseOrders(context, {
      status: filters.status,
      supplierId: filters.supplierId || null,
      number: filters.number,
      page: filters.page,
    }),
    listPurchaseOrderSupplierOptions(context),
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
  const filtered = hasActivePurchaseOrderFilters(filters);
  const supplierHref = (supplierId: string) =>
    purchaseOrderFiltersHref({ ...filters, supplierId, page: 1 });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Planificá las compras. El stock ingresa al recibir."
        action={{
          href: "/compras/ordenes/nueva",
          label: "+ Nueva orden",
        }}
      />
      <PurchasingSubNav current="ordenes" />

      <StageStrip />

      <form
        key={purchaseOrderFiltersHref(filters)}
        method="get"
        action="/compras/ordenes"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="numero" className={labelClass}>
            Número
          </label>
          <div className="relative">
            <input
              id="numero"
              name="numero"
              type="search"
              defaultValue={filters.number}
              placeholder="OC-000123"
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
            <option value="abiertas">Abiertas</option>
            <option value="cerradas">Cerradas</option>
            <option value="canceladas">Canceladas</option>
          </select>
        </div>
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/compras/ordenes" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {/* Con el `<select>` dibujado, el control ya dice de quién es la lista y cómo volver a
          todos. Esta línea queda solo cuando no hay control: ahí es la única salida. */}
      {filters.supplierId && options.kind === "text" ? (
        <p className="mt-4 text-sm">
          Órdenes de <span className="font-semibold">{supplierName}</span>.{" "}
          <Link
            href={purchaseOrderFiltersHref({
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
          icon="fileText"
          title={
            filtered
              ? NO_PURCHASE_ORDER_RESULTS_MESSAGE
              : NO_PURCHASE_ORDERS_MESSAGE
          }
          description={
            filtered
              ? "Probá con otras palabras o quitá algún filtro."
              : "Una orden de compra es opcional: sirve para saber qué se pidió y qué falta recibir."
          }
          actions={
            filtered
              ? [
                  {
                    href: "/compras/ordenes",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : [
                  {
                    href: "/compras/ordenes/nueva",
                    label: "Crear la primera",
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
                Órdenes de compra de la organización
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Nº de orden
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Proveedor
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Monto
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    <span className="sr-only">Ver la orden</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.orders.map((order) => (
                  <tr key={order.id}>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      <Link
                        href={`/compras/ordenes/${order.id}`}
                        className={linkClass}
                      >
                        {order.displayNumber}
                      </Link>
                    </td>
                    <td className={tableCellClass}>
                      <Link
                        href={supplierHref(order.supplierId)}
                        className={linkClass}
                      >
                        {order.supplierName}
                        <span className="sr-only">: ver solo sus órdenes</span>
                      </Link>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatDate(order.createdAt, timeZone)}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(order.total, order.currency)}
                    </td>
                    <td className={tableCellClass}>
                      <PurchaseOrderStatusBadge
                        status={order.status}
                        hasPending={order.hasPending}
                      />
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap`}
                    >
                      <Link
                        href={`/compras/ordenes/${order.id}`}
                        className={`${linkClass} inline-flex items-center gap-1`}
                      >
                        Ver
                        <span className="sr-only">
                          la orden {order.displayNumber}
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
            aria-label="Órdenes de compra de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.orders.map((order) => (
              <li key={order.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/compras/ordenes/${order.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {order.displayNumber}
                  </Link>
                  <PurchaseOrderStatusBadge
                    status={order.status}
                    hasPending={order.hasPending}
                  />
                </p>
                <p className="mt-1 font-semibold">
                  <Link
                    href={supplierHref(order.supplierId)}
                    className={linkClass}
                  >
                    {order.supplierName}
                    <span className="sr-only">: ver solo sus órdenes</span>
                  </Link>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatDate(order.createdAt, timeZone)} ·{" "}
                  <span className="tabular-nums">
                    {formatMoney(order.total, order.currency)}
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
              pageSize: PURCHASE_ORDERS_PAGE_SIZE,
              shown: result.orders.length,
              total: result.total,
              singular: "orden",
              plural: "órdenes",
            })}
            hrefFor={(target) =>
              purchaseOrderFiltersHref({ ...filters, page: target })
            }
          />
        </>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
