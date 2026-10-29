// Las pestañas de la ficha del cliente (brief-24.4.1, D-1): cada una es un enlace con `?pestana=`, y
// sin el parámetro es Resumen. El servidor lee solo lo que muestra la elegida, y sin JavaScript
// funciona igual.

export const CLIENT_TABS = [
  "resumen",
  "operaciones",
  "cuenta",
  "actividad",
] as const;

export type ClientTab = (typeof CLIENT_TABS)[number];

export const CLIENT_TAB_LABEL: Record<ClientTab, string> = {
  resumen: "Resumen",
  operaciones: "Operaciones",
  cuenta: "Cuenta corriente",
  actividad: "Actividad",
};

export const TAB_PARAM = "pestana";

export function parseClientTab(
  value: string | string[] | undefined,
): ClientTab {
  return CLIENT_TABS.find((tab) => tab === value) ?? "resumen";
}

export function clientTabHref(clientId: string, tab: ClientTab): string {
  return tab === "resumen"
    ? `/clientes/${clientId}`
    : `/clientes/${clientId}?${TAB_PARAM}=${tab}`;
}
