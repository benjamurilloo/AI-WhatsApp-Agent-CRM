// Interfaz pública del módulo sales: la venta de un pedido entregado (brief-20.2; ADR 0021).
// Ningún módulo depende de sales: la usan solo las pantallas.
export {
  formatSaleNumber,
  getSale,
  getSaleForOrder,
  issueSaleFromOrder,
  listSaleAudit,
  listSales,
  parseSaleNumberSearch,
  SALES_PAGE_SIZE,
  type IssueSaleResult,
  type SaleAuditEntry,
  type SaleAuditResult,
  type SaleDetail,
  type SaleLine,
  type SaleListField,
  type SaleListFilters,
  type SalePage,
  type SaleSummary,
} from "./service";
