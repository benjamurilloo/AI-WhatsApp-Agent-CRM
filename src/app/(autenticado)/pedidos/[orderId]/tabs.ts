// Las pestañas de la ficha del pedido (brief-24.6.1, D-4; láminas 03, 04, 06 y 07 de la v2). Son
// enlaces con `?pestana=`, como las de la ficha del cliente desde la 24.4.1: el servidor lee solo
// lo que muestra la elegida y sin JavaScript funciona igual.
//
// La lámina 05 dibuja la ficha **sin** pestañas y con un stepper arriba; las otras tres y la del
// teléfono las llevan. Gana el texto de la v2 —«La ficha reúne Resumen, Señas y Actividad»— y el
// stepper se conserva dentro de Actividad, que es donde la v2 pone la cronología (V-1).

export const ORDER_TABS = ["resumen", "senas", "actividad"] as const;

export type OrderTab = (typeof ORDER_TABS)[number];

export const ORDER_TAB_LABEL: Record<OrderTab, string> = {
  resumen: "Resumen",
  senas: "Señas",
  actividad: "Actividad",
};

export const TAB_PARAM = "pestana";

export function parseOrderTab(value: string | string[] | undefined): OrderTab {
  const key = Array.isArray(value) ? value[0] : value;
  return ORDER_TABS.find((tab) => tab === key) ?? "resumen";
}

export function orderTabHref(orderId: string, tab: OrderTab): string {
  return tab === "resumen"
    ? `/pedidos/${orderId}`
    : `/pedidos/${orderId}?${TAB_PARAM}=${tab}`;
}
