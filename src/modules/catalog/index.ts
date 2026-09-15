// Interfaz pública del módulo catalog (brief-4.2).
export {
  createProduct,
  deactivateProduct,
  deriveStockStatus,
  getProduct,
  lockProductForStockChange,
  reactivateProduct,
  searchProducts,
  updateProduct,
  type CreateProductResult,
  type Product,
  type ProductActiveResult,
  type ProductActivityFilter,
  type ProductField,
  type ProductInput,
  type StockStatus,
  type UpdateProductResult,
} from "./service";
