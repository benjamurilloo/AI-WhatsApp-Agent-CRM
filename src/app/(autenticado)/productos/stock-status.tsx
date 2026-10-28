import type { StockStatus } from "@/modules/catalog";
import type { IconName } from "@/app/_components/icons";
import { StatusBadge, type StatusTone } from "@/app/_components/status-badge";
import { STOCK_STATUS_LABEL } from "./filters";

// El estado de stock nunca depende solo del color: lleva ícono y texto (Screens.md §3,
// FR-PROD-05), con la insignia compartida (brief-24.1, D-6).

const ICON: Record<StockStatus, IconName> = {
  disponible: "circleCheck",
  bajo_stock: "alert",
  sin_stock: "circleX",
};

// "Bajo stock" usa el token de advertencia que agregó la 11.1 (O-17, brief-11.1, D-8); hasta
// entonces usaba el de énfasis. Lo que distingue los tres estados sigue siendo el texto y el
// ícono, no el color.
const TONE: Record<StockStatus, StatusTone> = {
  disponible: "success",
  bajo_stock: "warning",
  sin_stock: "danger",
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <StatusBadge tone={TONE[status]} icon={ICON[status]}>
      {STOCK_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
