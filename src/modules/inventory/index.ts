// Interfaz pública del módulo inventory (brief-4.2: saldos y estado de stock; brief-4.3.1: ajuste;
// brief-4.3.3: historial de movimientos).
export {
  adjustStock,
  getProductStock,
  listProductStock,
  listStockMovements,
  MOVEMENTS_PAGE_SIZE,
  PRODUCTS_PAGE_SIZE,
  type BalanceRule,
  type MovementHistoryField,
  type MovementHistoryFilters,
  type StockMovement,
  type StockMovementHistoryResult,
  type StockMovementPage,
  type ProductListFilters,
  type ProductStock,
  type ProductStockPage,
  type StockAdjustmentField,
  type StockAdjustmentInput,
  type StockAdjustmentResult,
  type StockMovementType,
  type StockStatusFilter,
} from "./service";
