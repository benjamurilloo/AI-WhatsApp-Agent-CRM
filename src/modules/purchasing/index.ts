// Interfaz pública del módulo purchasing (ADR 0023; brief-22.2): los proveedores. La orden de
// compra, la recepción y su anulación llegan con la 22.3 a la 22.5. Ningún módulo depende de
// purchasing en esta subfase: la usan solo las pantallas. cash lo hará desde la 22.6 (punto 11).
export { formatCuit } from "./cuit";
export { SUPPLIER_FIELD_LIMITS } from "./schema";
export {
  createSupplier,
  deactivateSupplier,
  getSupplier,
  interpretSupplierSearch,
  listSupplierAudit,
  listSuppliers,
  reactivateSupplier,
  SUPPLIERS_PAGE_SIZE,
  updateSupplier,
  validateSupplierInput,
  type CreateSupplierResult,
  type GetSupplierResult,
  type Supplier,
  type SupplierActiveResult,
  type SupplierAuditEntry,
  type SupplierAuditResult,
  type SupplierField,
  type SupplierInput,
  type SupplierListQuery,
  type SupplierListResult,
  type SupplierRule,
  type SupplierStatusFilter,
  type UpdateSupplierResult,
} from "./service";
