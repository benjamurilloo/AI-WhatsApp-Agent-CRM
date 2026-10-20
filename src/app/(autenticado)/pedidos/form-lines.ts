import { getCurrentPrices, searchProducts } from "@/modules/catalog";
import type { LinePriceConflict } from "@/modules/orders";
import type { AuthContext } from "@/modules/organizations";
import type { LineInput } from "@/shared/lines";
import type { OrderFormLine } from "./messages";

// Las líneas del formulario del alta del pedido y de la venta sin pedido, que tienen la misma forma
// (brief-20.3, D-6). Vivían repetidas en pedidos/actions.ts y ventas/actions.ts, porque un archivo
// "use server" solo exporta acciones; desde la 29.5.2, que les suma los IMEI (brief-29.5.2, D-5),
// viven acá, una sola vez, y las dos acciones las importan.

// Las líneas llegan como campos repetidos, en orden; una fila sin producto, sin texto, sin cantidad y
// sin IMEI es una fila vacía del formulario y no se envía.
export function readFormLines(formData: FormData): OrderFormLine[] {
  const all = (name: string, max = 200) =>
    formData.getAll(name).map((value) => String(value).slice(0, max));
  const productIds = all("productId");
  const productTexts = all("productText");
  const quantities = all("quantity");
  const expected = all("expectedPriceId");
  const amounts = all("priceAmount");
  const currencies = all("priceCurrency");
  // Hasta 100 IMEI de 32 caracteres, cada uno con su separador.
  const serials = all("serials", 3400);
  const expectedTotals = all("expectedLineTotal");
  const unitTracked = all("unitTracked");
  const lines: OrderFormLine[] = [];
  for (let index = 0; index < productTexts.length; index++) {
    const line: OrderFormLine = {
      productId: (productIds[index] ?? "").trim(),
      productText: (productTexts[index] ?? "").trim(),
      quantity: (quantities[index] ?? "").trim(),
      expectedPriceId: (expected[index] ?? "").trim(),
      price:
        amounts[index] && currencies[index]
          ? { amount: amounts[index]!, currency: currencies[index]! }
          : null,
      serials: (serials[index] ?? "").trim(),
      expectedLineTotal: (expectedTotals[index] ?? "").trim(),
      unitTracked: unitTracked[index] === "1",
    };
    if (line.productId || line.productText || line.quantity || line.serials) {
      lines.push(line);
    }
  }
  return lines;
}

// Sin JavaScript, el buscador es un campo de texto (brief-19.2, D-7): el producto se reconoce por su
// SKU exacto. Como quien carga no vio el precio, el esperado es el vigente de ahora.
export async function resolveTypedLine(
  context: AuthContext,
  line: OrderFormLine,
): Promise<OrderFormLine> {
  if (line.productId || !line.productText) return line;
  const found = await searchProducts(context, {
    text: line.productText,
    activity: "active",
  });
  const exact = found.ok
    ? found.products.filter(
        (product) =>
          product.sku.toLowerCase() === line.productText.toLowerCase(),
      )
    : [];
  if (exact.length !== 1) return line;
  const product = exact[0]!;
  const prices = await getCurrentPrices(context, [product.id]);
  const price = prices.ok ? prices.prices.get(product.id) : undefined;
  return {
    ...line,
    productId: product.id,
    productText: `${product.name} (${product.sku})`,
    expectedPriceId: price?.id ?? "",
    price: price ? { amount: price.amount, currency: price.currency } : null,
    unitTracked: product.tracking === "unit",
  };
}

export function toLineInput(line: OrderFormLine): LineInput {
  return {
    productId: line.productId,
    quantity: line.quantity,
    expectedPriceId: line.expectedPriceId,
    serials: line.serials,
    expectedLineTotal: line.expectedLineTotal,
  };
}

// Tras un CONFLICT, el precio nuevo pasa a ser el que se muestra y el esperado; el monto de una línea
// por unidad, el esperado nuevo.
export function applyPriceConflicts(
  lines: OrderFormLine[],
  prices: LinePriceConflict[],
): void {
  for (const changed of prices) {
    const line = lines[changed.position - 1];
    if (!line) continue;
    line.expectedPriceId = changed.price?.id ?? "";
    line.price = changed.price
      ? { amount: changed.price.amount, currency: changed.price.currency }
      : null;
    if (changed.lineTotal !== null) line.expectedLineTotal = changed.lineTotal;
  }
}
