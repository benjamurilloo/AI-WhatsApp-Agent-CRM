import type { OrderReceipts } from "@/modules/cash";
import type { OrderDetail } from "@/modules/orders";
import { Icon } from "@/app/_components/icons";
import { OrderStatTiles } from "./summary-tab";
import { OrderReceiptsSection } from "./senar/order-receipts-section";

// La pestaña Señas de la ficha (brief-24.6.1; lámina 04 de la v2): las mismas tres tarjetas que
// Resumen, la franja de qué pasa con lo señado, y la lista de recibos con su estado.
//
// Todo lo de dinero viene de `cash`, compuesto por la página: `orders` no depende de `cash`
// (brief-24.6.1, D-3). Si `cash` no pudo leer los recibos, la pestaña lo dice en vez de dibujar
// ceros, que se leerían como «este pedido no tiene señas».
export function DepositsTab({
  order,
  receipts,
  canDeposit,
  depositHref,
  depositOpen,
  timeZone,
}: {
  order: OrderDetail;
  receipts: OrderReceipts | null;
  canDeposit: boolean;
  // La dirección del panel de la seña y si ya está abierto, que los sabe la página: la tarjeta no
  // lee la URL. Sin esto su enlace quedaría activo con el panel abierto (brief-24.6.1, AC-7).
  depositHref: string;
  depositOpen: boolean;
  timeZone: string;
}) {
  if (receipts === null) {
    return (
      <p className="mt-6 text-sm text-muted">
        No pudimos leer las señas de este pedido.
      </p>
    );
  }
  return (
    <div className="mt-6 flex flex-col gap-6">
      <OrderStatTiles order={order} receipts={receipts} />

      {/* Qué compromete una seña, que es distinto de qué compromete el pedido: señar no reserva
          stock. Lo dice la lámina 04 y es la confusión que la pantalla tiene que evitar. */}
      <p className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted p-4 text-sm">
        <Icon name="info" className="mt-0.5 size-5 shrink-0" />
        <span>
          Una seña no confirma el pedido ni reserva stock. Se puede registrar
          mientras el pedido esté pendiente o confirmado y le falte algo del
          total.
        </span>
      </p>

      <OrderReceiptsSection
        orderId={order.id}
        displayNumber={order.displayNumber}
        receipts={receipts}
        canDeposit={canDeposit}
        depositHref={depositHref}
        depositOpen={depositOpen}
        timeZone={timeZone}
        showTotals={false}
        title="Señas registradas"
      />
    </div>
  );
}
