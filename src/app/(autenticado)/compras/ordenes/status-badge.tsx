import type { PurchaseOrderStatus } from "@/modules/purchasing";
import type { IconName } from "@/app/_components/icons";
import { StatusBadge, type StatusTone } from "@/app/_components/status-badge";
import {
  DISPLAY_STATUS_LABEL,
  purchaseOrderDisplayStatus,
  type PurchaseOrderDisplayStatus,
} from "./messages";

// El estado de una orden nunca depende solo del color: lleva ícono y texto, como el del pedido
// (Screens.md §3), con la insignia compartida (brief-24.1, D-6).
//
// Desde la 24.8.1 (brief-24.8.1, D-2) son **cuatro** y no tres: una orden cerrada se muestra
// «Cerrada · Completa» o «Cerrada · Con faltante» según le falte recibir algo. No es un estado de
// la base (H-2), así que la insignia necesita el dato aparte.
//
// **Los colores salen del README del lote, no del render.** El propio README avisa que «algunos
// renders varían el color de estas etiquetas» y fija la asignación que prevalece: abierta en ámbar,
// cerrada completa en verde, cancelada en gris y el cierre con faltante «con texto e icono ámbar».
// Por eso «Cancelada» queda en gris aunque la lámina la dibuje en rojo: el rojo está reservado al
// control destructivo y a los errores.

const ICON: Record<PurchaseOrderDisplayStatus, IconName> = {
  open: "clock",
  closedComplete: "circleCheck",
  closedShort: "alert",
  cancelled: "circleX",
};

const TONE: Record<PurchaseOrderDisplayStatus, StatusTone> = {
  open: "warning",
  closedComplete: "success",
  closedShort: "warning",
  cancelled: "neutral",
};

export function PurchaseOrderStatusBadge({
  status,
  hasPending,
}: {
  status: PurchaseOrderStatus;
  hasPending: boolean;
}) {
  const display = purchaseOrderDisplayStatus(status, hasPending);
  return (
    <StatusBadge tone={TONE[display]} icon={ICON[display]}>
      {DISPLAY_STATUS_LABEL[display]}
    </StatusBadge>
  );
}
