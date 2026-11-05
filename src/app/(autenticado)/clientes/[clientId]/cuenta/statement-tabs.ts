// Las dos pestañas del estado de cuenta (brief-24.7.2, lámina 02): «Resumen» y «Comprobantes».
// Cada una es un enlace con `?pestana=`, igual que las de la ficha del cliente (brief-24.4.1,
// D-1), así que **funcionan sin JavaScript** y se pueden guardar en un favorito.
//
// Al imprimir se ven **las dos**, esté cual esté elegida: la pantalla 37 es un comprobante y tiene
// que salir entero. La inactiva no se desmonta, se esconde con `hidden print:block`.

export const STATEMENT_TABS = ["resumen", "comprobantes"] as const;

export type StatementTab = (typeof STATEMENT_TABS)[number];

export const STATEMENT_TAB_LABEL: Record<StatementTab, string> = {
  resumen: "Resumen",
  comprobantes: "Comprobantes",
};

export const STATEMENT_TAB_PARAM = "pestana";

export function parseStatementTab(
  value: string | string[] | undefined,
): StatementTab {
  const first = Array.isArray(value) ? value[0] : value;
  return STATEMENT_TABS.find((tab) => tab === first) ?? "resumen";
}

// Sin el parámetro es «Resumen»: la URL más corta es la vista por omisión.
export function statementTabHref(base: string, tab: StatementTab): string {
  return tab === "resumen" ? base : `${base}?${STATEMENT_TAB_PARAM}=${tab}`;
}
