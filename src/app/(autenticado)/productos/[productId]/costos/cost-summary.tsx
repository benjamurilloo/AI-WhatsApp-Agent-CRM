import {
  formatMarginAmount,
  formatPercentTenths,
  type Margin,
  type ProductCost,
  type ProductPrice,
} from "@/modules/catalog";
import { DetailList } from "@/app/_components/detail-list";
import { priceText } from "../precios/messages";
import {
  costText,
  MARGIN_BASE_NOTE,
  MARGIN_NONE_MESSAGES,
  NEGATIVE_MARGIN_NOTICE,
} from "./messages";

// El costo vigente, el precio vigente, el margen y el recargo, con la base del cálculo siempre a la
// vista (brief-18.2, D-2, D-3 y D-6). Lo usan la tarjeta del resumen y la página de costos, y las
// dos lo muestran solo a un admin: los datos ya llegan de getProductCostSummary, que exige el rol.
export function CostSummary({
  cost,
  price,
  margin,
}: {
  cost: ProductCost | null;
  price: ProductPrice | null;
  margin: Margin;
}) {
  const negative = margin.ok && margin.amount < 0n;
  return (
    <>
      <DetailList
        items={[
          {
            label: "Costo",
            icon: "creditCard",
            value: (
              <span className={cost ? "tabular-nums" : "text-muted"}>
                {costText(cost)}
              </span>
            ),
          },
          {
            label: "Precio",
            icon: "tag",
            value: (
              <span className={price ? "tabular-nums" : "text-muted"}>
                {priceText(price)}
              </span>
            ),
          },
          ...(margin.ok
            ? [
                {
                  label: "Margen",
                  icon: "pieChart" as const,
                  value: (
                    <span className="tabular-nums">
                      {formatMarginAmount(margin.amount, margin.currency)} ·{" "}
                      {formatPercentTenths(margin.marginTenths)} del precio
                    </span>
                  ),
                },
                {
                  label: "Recargo",
                  icon: "trendingUp" as const,
                  value: (
                    <span className="tabular-nums">
                      {formatPercentTenths(margin.markupTenths)} sobre el costo
                    </span>
                  ),
                },
              ]
            : [
                {
                  label: "Margen",
                  icon: "pieChart" as const,
                  value: (
                    <span className="text-muted">
                      {MARGIN_NONE_MESSAGES[margin.reason]}
                    </span>
                  ),
                },
              ]),
        ]}
      />
      {negative ? (
        <p className="mt-3 text-sm font-semibold">{NEGATIVE_MARGIN_NOTICE}</p>
      ) : null}
      <p className="mt-3 text-sm text-muted">{MARGIN_BASE_NOTE}</p>
    </>
  );
}
