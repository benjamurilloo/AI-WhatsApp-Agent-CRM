import type { Metadata } from "next";
import { getCurrentPrices, getProductsByIds } from "@/modules/catalog";
import {
  getPurchaseOrder,
  MAX_GOODS_RECEIPT_LINES,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { acceptedCurrencies } from "@/shared/money";
import { FORBIDDEN_PAGE_MESSAGE } from "../../ordenes/messages";
import type { SearchParams } from "../filters";
import { ORDER_NOT_RECEIVABLE_MESSAGE } from "../messages";
import { GoodsReceiptForm, type ReceivableOrder } from "./goods-receipt-form";

export const metadata: Metadata = {
  title: "Nueva recepción — AI WhatsApp Agent CRM",
};

const TITLE = "Nueva recepción";

// Monedas que se pueden elegir, con su nombre en español, como en la orden de compra.
function currencyOptions(): { code: string; label: string }[] {
  const names = new Intl.DisplayNames("es", { type: "currency" });
  return acceptedCurrencies().map((code) => ({
    code,
    label: `${code} — ${names.of(code) ?? code}`,
  }));
}

// El costo esperado como se escribe en el formulario: «1500,50».
function costInput(amount: string): string {
  return amount.replace(".", ",");
}

// La cantidad como se escribe: «1,5», sin los ceros de más.
function quantityInput(quantity: string): string {
  return quantity.replace(/\.?0+$/, "").replace(".", ",");
}

// El alta de una recepción, solo para admin (brief-22.4, D-11; ADR 0023, punto 12). Desde el detalle
// de una orden abierta llega con ?orden=<id>: el proveedor y la moneda son los de la orden, y las
// filas, sus líneas con faltante (D-7). Una orden que no existe o no está abierta no se recibe. Sin
// ?orden, la recepción sin orden.
export default async function NewGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (context.role !== "admin") {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const query = await searchParams;
  const raw = Array.isArray(query.orden) ? query.orden[0] : query.orden;

  let order: ReceivableOrder | null = null;
  if (raw) {
    const found = await getPurchaseOrder(context, raw);
    const receivable =
      found.ok && found.order.status === "open" ? found.order : null;
    const lines =
      receivable?.lines.filter((line) => line.pending !== "0.000") ?? [];
    if (!receivable || lines.length === 0) {
      return (
        <PageNotice
          title={TITLE}
          message={ORDER_NOT_RECEIVABLE_MESSAGE}
          back={{
            href: found.ok
              ? `/compras/ordenes/${found.order.id}`
              : "/compras/ordenes",
            label: found.ok
              ? "Volver a la orden"
              : "Volver a órdenes de compra",
          }}
        />
      );
    }
    const ids = lines.map((line) => line.productId);
    const [prices, products] = await Promise.all([
      getCurrentPrices(context, ids),
      getProductsByIds(context, ids),
    ]);
    // Desde la 29.5: los productos por unidad piden un IMEI por unidad (brief-29.5, D-6).
    const trackings = new Map(
      products.ok
        ? products.products.map((product) => [product.id, product.tracking])
        : [],
    );
    order = {
      id: receivable.id,
      displayNumber: receivable.displayNumber,
      supplierName: receivable.supplier?.name ?? "",
      currency: receivable.currency,
      lines: lines.map((line) => ({
        orderLineId: line.id,
        productId: line.productId,
        productText: line.product
          ? `${line.product.name} (${line.product.sku})`
          : line.productId,
        quantity: quantityInput(line.pending),
        unitCost: costInput(line.unitCost),
        priceCurrency: prices.ok
          ? (prices.prices.get(line.productId)?.currency ?? "")
          : "",
        serials: "",
        tracking: trackings.get(line.productId) ?? "",
        pending: line.pending,
        unit: line.product?.unit ?? "",
      })),
    };
  }

  // El título y la bajada de las láminas 02 y 03 (brief-24.8.1-b, V-12 y V-18). La miga
  // «Abastecimiento › Recepciones» de la lámina 03 no se dibuja: el patrón de este CRM para volver
  // es `BackLink`, y una miga nueva sería un componente compartido, fuera de la lista cerrada.
  // La prosa que estaba acá —lo que la recepción le hace al stock y al costo— se dice ahora en el
  // recuadro del resumen, que es donde la lámina la pone (V-21).
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink
        href={order ? `/compras/ordenes/${order.id}` : "/compras/recepciones"}
        label={order ? "Volver a la orden" : "Volver a recepciones"}
      />
      <DetailHeader
        title={order ? "Recibir mercadería" : "Nueva recepción · Sin orden"}
        leading={<HeaderIcon name="package" />}
        subtitle={
          order ? (
            <p>
              <span className="font-mono">{order.displayNumber}</span>
              {order.supplierName ? ` · ${order.supplierName}` : null} ·{" "}
              {order.currency}
            </p>
          ) : null
        }
      />
      <div className="mt-6">
        <GoodsReceiptForm
          order={order}
          currencies={currencyOptions()}
          maxLines={MAX_GOODS_RECEIPT_LINES}
        />
      </div>
    </main>
  );
}
