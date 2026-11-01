import { formatMarginAmount, formatPercentTenths } from "@/modules/catalog";
import type { Margin } from "@/modules/catalog";
import type { UnitCostBase, UnitCostTotals } from "@/modules/inventory";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatMoney, moneyToDatabase } from "@/shared/money";
import {
  UNIT_STATUS_ICON,
  UNIT_STATUS_LABEL,
  UNIT_STATUS_TONE,
} from "../unidades/messages";
import type { UnitCostRow } from "./cost-data";
import {
  NEGATIVE_MARGIN_NOTICE,
  OTHER_STOCK_EMPTY,
  OTHER_STOCK_NOTE,
  OTHER_STOCK_TITLE,
  UNIT_COST_BASE_NONE,
  UNIT_COSTS_ESTIMATE_NOTE,
  UNIT_COSTS_TILES,
  UNIT_COSTS_TITLE,
  UNIT_PRICE_FROM_PRODUCT,
  UNIT_PRICE_OWN,
  unitCostsCapMessage,
} from "./messages";

// El costo por unidad y su margen estimado (brief-24.5.2-b, lámina 13).
//
// Estos componentes **no calculan nada**: reciben la base ya agregada por `inventory` y las filas
// con su margen ya resuelto por la página. El motivo es la frontera —el costo sale de `inventory`
// y el precio del producto de `catalog`, y componerlos es trabajo de la página (Overview,
// §Reglas de dependencia)— y, de paso, deja todo esto probable sin base.
//
// Lo que NO está acá y la lámina muestra, con su motivo en el brief: el selector de moneda (D-2),
// el selector de base de cálculo (D-3) y el historial unificado por unidad (D-4).

function money(amount: bigint, currency: string): string {
  return formatMoney(moneyToDatabase(amount), currency);
}

function Tile({
  label,
  icon,
  children,
}: {
  label: string;
  icon: "tag" | "creditCard" | "trendingUp" | "pieChart";
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-muted p-4">
      <p className="flex items-center gap-2 text-sm text-muted">
        <Icon name={icon} className="size-4 shrink-0" />
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums break-words">
        {children}
      </p>
    </div>
  );
}

// Los cuatro números de la cabecera, con la tira de la fórmula debajo.
//
// Los cuatro se dibujan **solo** cuando hay base en una sola moneda. Sin base, o con dos monedas,
// va el motivo en su lugar: un «—» o un cero ahí afirmarían algo falso (I-2, I-4 y D-13).
export function UnitCostsSummary({
  base,
  baseMargin,
  price,
}: {
  base: UnitCostBase;
  // El margen entre el precio del producto y el costo promedio. `null` cuando no hay base.
  baseMargin: Margin | null;
  price: { amount: string; currency: string } | null;
}) {
  if (!base.ok) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
        <span>{UNIT_COST_BASE_NONE[base.reason]}</span>
      </p>
    );
  }
  const negative = baseMargin?.ok === true && baseMargin.amount < 0n;
  return (
    <>
      <p className="text-sm text-muted">
        Base del cálculo: {base.units}{" "}
        {base.units === 1 ? "unidad disponible" : "unidades disponibles"}.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={UNIT_COSTS_TILES.price} icon="tag">
          {price ? (
            formatMoney(price.amount, price.currency)
          ) : (
            <span className="text-base font-normal text-muted">Sin precio</span>
          )}
        </Tile>
        <Tile label={UNIT_COSTS_TILES.average} icon="creditCard">
          {money(base.average, base.currency)}
        </Tile>
        <Tile label={UNIT_COSTS_TILES.gain} icon="trendingUp">
          {baseMargin?.ok ? (
            formatMarginAmount(baseMargin.amount, baseMargin.currency)
          ) : (
            <span className="text-base font-normal text-muted">
              No se puede calcular
            </span>
          )}
        </Tile>
        <Tile label={UNIT_COSTS_TILES.margin} icon="pieChart">
          {baseMargin?.ok ? (
            formatPercentTenths(baseMargin.marginTenths)
          ) : (
            <span className="text-base font-normal text-muted">
              No se puede calcular
            </span>
          )}
        </Tile>
      </div>

      {/* La tira de la fórmula de la lámina. Muestra la aritmética con los números de arriba, que
          es lo que vuelve auditable el porcentaje sin tener que creerle a la pantalla. */}
      {baseMargin?.ok && price ? (
        <div className="mt-3 flex items-start gap-3 rounded-xl bg-surface-muted p-4">
          {/* La lámina dibuja una calculadora; `icons.tsx` no tiene ese ícono y agregarlo sería
              salirse de la lista cerrada por un adorno. Queda declarado como diferencia. */}
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="tabular-nums break-words">
              ({formatMoney(price.amount, price.currency)} −{" "}
              {money(base.average, base.currency)}) ÷{" "}
              {formatMoney(price.amount, price.currency)} × 100 ={" "}
              {formatPercentTenths(baseMargin.marginTenths)}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {UNIT_COSTS_ESTIMATE_NOTE}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{UNIT_COSTS_ESTIMATE_NOTE}</p>
      )}

      {/* I-5: el margen negativo se dice con importe, texto e icono. El color no es el mensaje. */}
      {negative ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <Icon name="alert" className="size-4 shrink-0" />
          {NEGATIVE_MARGIN_NOTICE}
        </p>
      ) : null}
    </>
  );
}

// I-5 en la fila: importe, texto e icono. El ícono de `icons.tsx` sale con `aria-hidden`, así que
// para un lector de pantalla no dice nada y el único portador del dato era el signo menos — lo
// encontró la revisión independiente (su B-4). El texto va en un `sr-only`, y el `relative` no es
// decorativo: un `sr-only` sin ancestro posicionado resuelve contra el documento y lo estira
// (H-15 de la 24.5.2).
function MarginCell({ margin }: { margin: Margin }) {
  if (!margin.ok) return <span className="text-muted">—</span>;
  return (
    <span className="relative inline-flex items-center gap-1 tabular-nums">
      {margin.amount < 0n ? (
        <>
          <Icon name="alert" className="size-4 shrink-0" />
          <span className="sr-only">{NEGATIVE_MARGIN_NOTICE}</span>
        </>
      ) : null}
      {formatPercentTenths(margin.marginTenths)}
    </span>
  );
}

// Las líneas de subtotal, una por moneda. Las comparten la tabla y las tarjetas: con una sola
// moneda es una línea, con dos son dos, y entonces arriba no hay promedio ni margen (D-13).
// No hay rama para la lista vacía **a propósito**: esto solo se dibuja con `rows.length > 0`, y una
// fila disponible implica al menos un grupo, porque `GROUP BY` no produce grupos vacíos. Una rama
// para el caso imposible sería código que ninguna prueba puede alcanzar, que es el defecto que la
// 24.5.1 y la 24.5.2 dejaron como lección (NB-1 de la revisión independiente).
function Subtotals({ totals }: { totals: UnitCostTotals[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {totals.map((totalOf) => (
        <li key={totalOf.currency}>
          Base: {totalOf.units}{" "}
          {totalOf.units === 1 ? "disponible" : "disponibles"} · Costo total{" "}
          {money(totalOf.total, totalOf.currency)}
        </li>
      ))}
    </ul>
  );
}

function UnitPrice({
  price,
  priceIsOwn,
}: {
  price: UnitCostRow["price"];
  priceIsOwn: boolean;
}) {
  if (!price) return <span className="text-muted">Sin precio</span>;
  return (
    <>
      {formatMoney(price.amount, price.currency)}{" "}
      <span className="text-muted">
        · {priceIsOwn ? UNIT_PRICE_OWN : UNIT_PRICE_FROM_PRODUCT}
      </span>
    </>
  );
}

// El costo de una unidad: la columna es NOT NULL con CHECK (cost > 0), así que acá no hay estado
// «pendiente» (D-12). El «—» queda por el tipo, que admite null para un viewer.
function UnitCost({ unit }: { unit: UnitCostRow["unit"] }) {
  return unit.cost ? (
    <>{formatMoney(unit.cost.amount, unit.cost.currency)}</>
  ) : (
    <>—</>
  );
}

// La tabla por unidad, con su fila de subtotal.
//
// El subtotal **no** se calcula sobre estas filas: llega agregado desde SQL sobre todas las
// disponibles (I-7). Si se calculara acá, el tope de filas lo volvería mentira.
//
// Dos presentaciones del mismo dato, como el historial de costos de esta misma pantalla: la tabla
// desde `md` y tarjetas abajo. No es estética. Seis columnas no entran en 320 px, y una tabla que
// desplaza en horizontal sin ser alcanzable con el teclado es la violación
// `scrollable-region-focusable` de axe —medida, no supuesta, en la corrida del 2026-11-01— además
// del desplazamiento horizontal que el recorrido de la 24.5.2 pidió evitar.
export function UnitCostsTable({
  rows,
  totals,
  total,
}: {
  rows: UnitCostRow[];
  // Los totales por moneda, que con una sola moneda es uno y con dos son dos (D-13).
  totals: UnitCostTotals[];
  total: number;
}) {
  const cap = unitCostsCapMessage(rows.length, total);
  return (
    <SectionCard
      id="costo-por-unidad-titulo"
      title={UNIT_COSTS_TITLE}
      icon="smartphone"
      className="mt-6"
    >
      {rows.length === 0 ? (
        <p>{UNIT_COST_BASE_NONE.no_units}</p>
      ) : (
        <>
          {/* `relative` no es decorativo: sin un ancestro posicionado, un `sr-only` de adentro
              resuelve contra el documento y estira su `scrollWidth`, escapando de este
              `overflow-x-auto` (H-15 de la 24.5.2). */}
          <div className="relative -mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Costo de cada unidad disponible
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Unidad
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right whitespace-nowrap`}
                  >
                    Costo registrado
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right whitespace-nowrap`}
                  >
                    Precio de referencia
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right whitespace-nowrap`}
                  >
                    Ganancia estimada
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Margen
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ unit, price, priceIsOwn, margin }) => (
                  <tr key={unit.id}>
                    <td className={`${tableCellClass} font-mono`}>
                      {unit.serial}
                    </td>
                    <td className={tableCellClass}>
                      <StatusBadge
                        tone={UNIT_STATUS_TONE[unit.status]}
                        icon={UNIT_STATUS_ICON[unit.status]}
                      >
                        {UNIT_STATUS_LABEL[unit.status]}
                      </StatusBadge>
                    </td>
                    <td
                      className={`${tableCellClass} text-right tabular-nums whitespace-nowrap`}
                    >
                      <UnitCost unit={unit} />
                    </td>
                    <td
                      className={`${tableCellClass} text-right tabular-nums whitespace-nowrap`}
                    >
                      <UnitPrice price={price} priceIsOwn={priceIsOwn} />
                    </td>
                    <td
                      className={`${tableCellClass} text-right tabular-nums whitespace-nowrap`}
                    >
                      {margin.ok ? (
                        formatMarginAmount(margin.amount, margin.currency)
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={`${tableCellClass} text-right`}>
                      <MarginCell margin={margin} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-strong font-semibold">
                  <td className={tableCellClass} colSpan={2}>
                    Subtotal
                  </td>
                  <td className={`${tableCellClass} tabular-nums`} colSpan={4}>
                    <Subtotals totals={totals} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <ul
            aria-label="Costo de cada unidad disponible"
            className="flex flex-col gap-3 md:hidden"
          >
            {rows.map(({ unit, price, priceIsOwn, margin }) => (
              <li
                key={unit.id}
                className="rounded-xl border border-border bg-surface-muted p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono break-all">{unit.serial}</span>
                  <StatusBadge
                    tone={UNIT_STATUS_TONE[unit.status]}
                    icon={UNIT_STATUS_ICON[unit.status]}
                  >
                    {UNIT_STATUS_LABEL[unit.status]}
                  </StatusBadge>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">Costo registrado</dt>
                  <dd className="text-right tabular-nums">
                    <UnitCost unit={unit} />
                  </dd>
                  <dt className="text-muted">Precio de referencia</dt>
                  <dd className="text-right tabular-nums">
                    <UnitPrice price={price} priceIsOwn={priceIsOwn} />
                  </dd>
                  <dt className="text-muted">Ganancia estimada</dt>
                  <dd className="text-right tabular-nums">
                    {margin.ok ? (
                      formatMarginAmount(margin.amount, margin.currency)
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </dd>
                  <dt className="text-muted">Margen</dt>
                  <dd className="text-right">
                    <MarginCell margin={margin} />
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
          {/* Un <div>, no un <p>: `Subtotals` devuelve una lista, y un <ul> dentro de un <p> es
              HTML inválido —el navegador cierra el <p> y el <ul> queda afuera, sin `md:hidden`,
              duplicando el subtotal en escritorio. Lo encontró la revisión independiente (B-2). */}
          <div className="mt-3 font-semibold tabular-nums md:hidden">
            <Subtotals totals={totals} />
          </div>

          {/* R-3: si el tope recortó filas, se dice. Nunca se recorta en silencio. */}
          <p className="mt-3 text-sm text-muted empty:hidden">{cap}</p>
        </>
      )}
    </SectionCard>
  );
}

// Las reservadas y en revisión: existen, tienen costo y **no** entran en el cálculo. La lámina las
// pone en una tarjeta aparte justamente para que no se confundan con la base.
export function OtherStock({
  units,
  totals,
  total,
}: {
  units: UnitCostRow["unit"][];
  totals: UnitCostTotals[];
  total: number;
}) {
  const cap = unitCostsCapMessage(units.length, total);
  return (
    <SectionCard
      id="otras-existencias-titulo"
      title={OTHER_STOCK_TITLE}
      icon="package"
      className="mt-6"
      description={OTHER_STOCK_NOTE}
    >
      {units.length === 0 ? (
        <p>{OTHER_STOCK_EMPTY}</p>
      ) : (
        <>
          <div className="relative -mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Unidades reservadas y en revisión, con su costo registrado
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Unidad
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right whitespace-nowrap`}
                  >
                    Costo registrado
                  </th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id}>
                    <td className={`${tableCellClass} font-mono`}>
                      {unit.serial}
                    </td>
                    <td className={tableCellClass}>
                      <StatusBadge
                        tone={UNIT_STATUS_TONE[unit.status]}
                        icon={UNIT_STATUS_ICON[unit.status]}
                      >
                        {UNIT_STATUS_LABEL[unit.status]}
                      </StatusBadge>
                    </td>
                    <td
                      className={`${tableCellClass} text-right tabular-nums whitespace-nowrap`}
                    >
                      <UnitCost unit={unit} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Unidades reservadas y en revisión, con su costo registrado"
            className="flex flex-col gap-3 md:hidden"
          >
            {units.map((unit) => (
              <li
                key={unit.id}
                className="rounded-xl border border-border bg-surface-muted p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono break-all">{unit.serial}</span>
                  <StatusBadge
                    tone={UNIT_STATUS_TONE[unit.status]}
                    icon={UNIT_STATUS_ICON[unit.status]}
                  >
                    {UNIT_STATUS_LABEL[unit.status]}
                  </StatusBadge>
                </div>
                <p className="mt-2 flex justify-between gap-3 text-sm">
                  <span className="text-muted">Costo registrado</span>
                  <span className="tabular-nums">
                    <UnitCost unit={unit} />
                  </span>
                </p>
              </li>
            ))}
          </ul>

          <ul className="mt-3 flex flex-col gap-1 text-sm text-muted">
            {totals.map((totalOf) => (
              <li key={`${totalOf.status}-${totalOf.currency}`}>
                {UNIT_STATUS_LABEL[totalOf.status]}: {totalOf.units} ·{" "}
                {money(totalOf.total, totalOf.currency)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted empty:hidden">{cap}</p>
        </>
      )}
    </SectionCard>
  );
}
