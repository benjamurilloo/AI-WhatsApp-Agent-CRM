import type { Metadata } from "next";
import { getCurrentPrices } from "@/modules/catalog";
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
import { SectionCard } from "@/app/_components/section-card";
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
    const prices = await getCurrentPrices(
      context,
      lines.map((line) => line.productId),
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
        pending: line.pending,
        unit: line.product?.unit ?? "",
      })),
    };
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink
        href={order ? `/compras/ordenes/${order.id}` : "/compras/recepciones"}
        label={order ? "Volver a la orden" : "Volver a recepciones"}
      />
      <DetailHeader
        title={TITLE}
        leading={<HeaderIcon name="package" />}
        subtitle={
          <p>
            La recepción suma el stock de cada producto y deja como costo
            vigente el costo recibido. Se numera al registrarla y no se edita.
          </p>
        }
      />
      <SectionCard
        id="recepcion-titulo"
        title={
          order
            ? `Lo que llegó de la orden ${order.displayNumber}`
            : "Proveedor, moneda y líneas"
        }
        icon="list"
        className="mt-6"
      >
        {order ? (
          <p className="mb-4 text-sm text-muted">
            Las cantidades y los costos arrancan en lo que falta recibir y en el
            costo esperado de la orden: corregilos con lo que llegó y lo que
            cobró el proveedor.
          </p>
        ) : null}
        <GoodsReceiptForm
          order={order}
          currencies={currencyOptions()}
          maxLines={MAX_GOODS_RECEIPT_LINES}
        />
      </SectionCard>
    </main>
  );
}
