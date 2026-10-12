import { z } from "zod";
import type { ServiceProductBalance } from "@/modules/inventory";
import { contractQuantity, productSchema } from "../v1/contract";

// Contrato de lectura v2 de productos (docs/contracts/read-v2.md; brief-19.4, D-12). Las tres rutas
// de productos de la v1, con una regla distinta: el estado de stock sale de lo disponible (el saldo
// físico menos lo reservado), y la ruta del stock entrega los tres números. El producto tiene la
// misma forma que en v1. El transporte, los errores y el log son los de v1; las demás rutas siguen
// solo en v1. Como en v1, los esquemas son estrictos y los tests validan contra ellos.

export const READ_CONTRACT_VERSION_V2 = "2";

export const productListResponseSchemaV2 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V2),
  items: z.array(productSchema),
});

export const productResponseSchemaV2 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V2),
  product: productSchema,
});

// Las tres cantidades, en texto canónico como quantity_available de v1. Lo disponible es el
// físico menos lo reservado, y el estado sale de lo disponible: nunca contradice ese número.
const canonicalQuantity = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$/);

export const productStockResponseSchemaV2 = z.strictObject({
  contract_version: z.literal(READ_CONTRACT_VERSION_V2),
  product_id: z.uuid(),
  quantity_on_hand: canonicalQuantity,
  quantity_reserved: canonicalQuantity,
  quantity_available: canonicalQuantity,
  unit: z.string().min(1),
  stock_status: z.enum(["disponible", "bajo_stock", "sin_stock"]),
});

export type ContractProductStockV2 = z.infer<
  typeof productStockResponseSchemaV2
>;

export function toContractProductStockV2(
  stock: ServiceProductBalance,
): ContractProductStockV2 {
  return {
    contract_version: READ_CONTRACT_VERSION_V2,
    product_id: stock.productId,
    quantity_on_hand: contractQuantity(stock.quantityOnHand),
    quantity_reserved: contractQuantity(stock.quantityReserved),
    quantity_available: contractQuantity(stock.quantityAvailable),
    unit: stock.unit,
    stock_status: stock.stockStatus,
  };
}
