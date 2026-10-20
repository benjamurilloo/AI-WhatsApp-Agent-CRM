import type { OrderLineUnit } from "@/modules/orders";
import { formatMoney } from "@/shared/money";
import { UNIT_UNAVAILABLE_MARK } from "./messages";

// Los IMEI de una línea de un pedido o una venta, debajo del producto, con el precio de cada unidad
// (brief-29.5.2, D-5): en el detalle del pedido, en el comprobante de la venta y en el de su
// anulación, que es lo que el cliente se lleva. markUnavailable, en un pedido pendiente: marca las
// unidades que ya no están disponibles, porque confirmar las va a rechazar.
export function LineUnitList({
  units,
  currency,
  markUnavailable = false,
}: {
  units: OrderLineUnit[];
  currency: string;
  markUnavailable?: boolean;
}) {
  if (units.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs" aria-label="IMEI">
      {units.map((unit) => (
        <li key={unit.unitId} className="flex flex-wrap gap-x-2">
          <span className="font-mono">IMEI {unit.serial}</span>
          <span className="text-muted tabular-nums">
            {formatMoney(unit.unitPrice, currency)}
          </span>
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
