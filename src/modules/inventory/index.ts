// Interfaz pública del módulo inventory (brief-4.2: saldos y estado de stock; brief-4.3.1: ajuste).
export {
  adjustStock,
  getProductStock,
  listProductStock,
  PRODUCTS_PAGE_SIZE,
  type BalanceRule,
  type ProductListFilters,
  type ProductStock,
  type ProductStockPage,
  type StockAdjustmentField,
  type StockAdjustmentInput,
  type StockAdjustmentResult,
  type StockMovementType,
  type StockStatusFilter,
} from "./service";
