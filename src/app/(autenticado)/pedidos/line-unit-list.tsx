import type { OrderLineUnit } from "@/modules/orders";
import { UNIT_STATUS_LABEL } from "@/app/(autenticado)/productos/[productId]/unidades/messages";
import { formatMoney } from "@/shared/money";
import { UNIT_UNAVAILABLE_MARK } from "./messages";

// Los IMEI de una línea de un pedido o una venta, con el precio de cada unidad (brief-29.5.2,
// D-5): en el detalle del pedido, en el comprobante de la venta y en el de su anulación, que es lo
// que el cliente se lleva. markUnavailable, en un pedido pendiente: marca las unidades que ya no
// están disponibles, porque confirmar las va a rechazar.
//
// Desde la 24.6.1 (brief-24.6.1, D-6; láminas 03, 05 y 07) puede mostrar también el **grado y la
// batería** de cada unidad. No se muestran siempre: en el comprobante de una venta no vienen al
// caso y alargarían lo que el cliente se lleva, así que es la pantalla la que pide los chips.
export function LineUnitList({
  units,
  currency,
  markUnavailable = false,
  showChips = false,
}: {
  units: OrderLineUnit[];
  currency: string;
  markUnavailable?: boolean;
  showChips?: boolean;
}) {
  if (units.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-xs" aria-label="IMEI">
      {units.map((unit) => (
        <li key={unit.unitId} className="flex flex-wrap items-center gap-x-2">
          <span className="font-mono">IMEI {unit.serial}</span>
          <span className="text-muted tabular-nums">
            {formatMoney(unit.unitPrice, currency)}
          </span>
          {showChips ? <UnitChips unit={unit} /> : null}
          {markUnavailable && unit.status !== "available" ? (
            <span className="font-semibold text-danger">
              {UNIT_UNAVAILABLE_MARK}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// El grado y la salud de la batería de una unidad (brief-24.6.1, D-6). Los dos son opcionales: un
// rubro sin grados no los tiene, y una unidad puede no haber declarado su batería. Lo que no hay
// no se dibuja; no se inventa un «—» que parecería un dato.
function UnitChips({ unit }: { unit: OrderLineUnit }) {
  const chips = [
    unit.gradeName === null ? null : `Grado ${unit.gradeName}`,
    unit.batteryHealth === null ? null : `Batería ${unit.batteryHealth} %`,
  ].flatMap((text) => (text === null ? [] : [text]));
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((text) => (
        <span
          key={text}
          className="rounded-full border border-border px-2 py-0.5 text-muted"
        >
          {text}
        </span>
      ))}
    </>
  );
}

// La columna «Estado de stock» de la lámina 05, que la 03 dibuja como un chip bajo el IMEI
// (brief-24.6.1, V-2). Es el estado de **la unidad**, no el del pedido: un pedido confirmado tiene
// su unidad «Reservada» y uno entregado, «Vendida». Rotularlos como lo mismo sería el error que la
// v2 advierte: «La implementación debe rotular esas dimensiones explícitamente».
export function UnitStockState({ units }: { units: OrderLineUnit[] }) {
  if (units.length === 0) return null;
  const labels = [
    ...new Set(
      units.flatMap((unit) =>
        unit.status === null ? [] : [UNIT_STATUS_LABEL[unit.status]],
      ),
    ),
  ];
  if (labels.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1 text-xs">
      {labels.map((label) => (
        <li
          key={label}
          className="rounded-full bg-surface-muted px-2 py-0.5 font-medium"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

// El precio unitario de una línea: en una línea por unidad cuyas unidades valen distinto, el de cada
// unidad está en su IMEI, y la línea dice «Por unidad» (brief-29.5.2, D-2).
export function lineUnitPriceText(line: {
  unitPrice: string;
  currency: string;
  units: OrderLineUnit[];
}): string {
  const varies = line.units.some((unit) => unit.unitPrice !== line.unitPrice);
  return varies ? "Por unidad" : formatMoney(line.unitPrice, line.currency);
}
