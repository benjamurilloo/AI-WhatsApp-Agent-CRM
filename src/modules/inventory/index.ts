// Interfaz pública del módulo inventory (brief-4.2: lecturas de saldo y estado de stock).
export {
  getProductStock,
  listProductStock,
  PRODUCTS_PAGE_SIZE,
  type ProductListFilters,
  type ProductStock,
  type ProductStockPage,
  type StockStatusFilter,
} from "./service";
