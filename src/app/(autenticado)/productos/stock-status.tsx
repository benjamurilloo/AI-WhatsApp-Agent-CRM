import type { StockStatus } from "@/modules/catalog";
import { STOCK_STATUS_LABEL } from "./filters";

// El estado de stock nunca depende solo del color: lleva ícono y texto (Screens.md §3,
// FR-PROD-05). El ícono es decorativo; el texto es el que leen los lectores de pantalla.

const ICON: Record<StockStatus, string> = {
  disponible: "✓",
  bajo_stock: "▲",
  sin_stock: "✕",
};

// "Bajo stock" usa el token de advertencia que agregó la 11.1 (O-17, brief-11.1, D-8); hasta
// entonces usaba el de énfasis. Lo que distingue los tres estados sigue siendo el texto y el
// ícono, no el color.
const TONE: Record<StockStatus, string> = {
  disponible: "bg-success-soft text-on-success-soft",
  bajo_stock: "bg-warning-soft text-on-warning-soft",
  sin_stock: "bg-danger-soft text-on-danger-soft",
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      <span aria-hidden="true">{ICON[status]}</span>
      {STOCK_STATUS_LABEL[status]}
    </span>
  );
}
