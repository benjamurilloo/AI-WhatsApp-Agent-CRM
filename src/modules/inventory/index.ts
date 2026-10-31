// Interfaz pública del módulo inventory (brief-4.2: saldos y estado de stock; brief-4.3.1: ajuste;
// brief-4.3.3: historial de movimientos; brief-11.3: lecturas de servicio; brief-16.6: la cantidad
// de un producto para la API de lectura; brief-19.3: el stock de un pedido y lo disponible;
// brief-20.3: la salida de una venta sin pedido; brief-20.4: la reposición de su anulación;
// brief-22.4: la entrada de una recepción de mercadería; brief-22.5: la salida de su anulación).
export {
  adjustStock,
  deliverStock,
  getAvailableStock,
  getCatalogProductAvailableForService,
  getCatalogProductForService,
  getProductStock,
  getProductBalanceForService,
  getProductStockForService,
  listProductStock,
  listStockMovements,
  MOVEMENTS_PAGE_SIZE,
  // Las sumas por modelo del catálogo agrupado (brief-24.5.1, D-2).
  NO_MODEL_GROUP,
  PRODUCT_SORTS,
  PRODUCTS_PAGE_SIZE,
  receiveStock,
  releaseStock,
  removeReceivedStock,
  reserveStock,
  restoreSaleStock,
  searchCatalogAvailableForService,
  searchCatalogForService,
  sellStock,
  sumByModel,
  type BalanceRule,
  type ModelTotals,
  type MovementHistoryField,
  type MovementHistoryFilters,
  type StockMovement,
  type StockMovementHistoryResult,
  type StockMovementPage,
  type ProductListFilters,
  type ProductSort,
  type ProductStock,
  type ProductStockPage,
  type ServiceCatalogProduct,
  type ServiceProductBalance,
  type ServiceProductStock,
  type StockAdjustmentField,
  type StockAdjustmentInput,
  type StockAdjustmentResult,
  type StockAdjustmentType,
  type StockLine,
  type StockMovementType,
  type StockShortage,
  type StockStatusFilter,
  // Las unidades en la recepción y su anulación (brief-29.5, D-4), y el signo de cada movimiento (D-8).
  isSerialTakenError,
  MOVEMENT_DIRECTION,
  type ReceiptStockLine,
  type ReceivedUnit,
  type ReceiveStockResult,
  type RemovalStockLine,
  type RemoveReceivedStockResult,
  type UnavailableUnit,
  // Las unidades en pedidos y ventas (brief-29.5.2, D-1 y D-3).
  resolveLineUnits,
  type LineUnitIssue,
  type LineUnitRequest,
  type ResolvedUnit,
  type TakeStockResult,
} from "./service";
// Las unidades con IMEI (ADR 0024, punto 6; brief-29.5): el seguimiento, el alta, la baja, la
// corrección y las lecturas.
export {
  changeProductTracking,
  correctUnit,
  // El recuento por estado para el Resumen de la ficha (brief-24.5.1, D-6).
  countUnitsByStatus,
  getUnit,
  getUnitSerials,
  listProductUnits,
  parseUnitSerial,
  registerUnit,
  splitUnitSerials,
  validateUnitInput,
  WRITE_OFF_REASON_MAX_LENGTH,
  writeOffUnit,
  type ChangeTrackingResult,
  type CorrectUnitResult,
  type ProductUnit,
  type ProductUnitsResult,
  type RegisterUnitResult,
  type UnitStatusCounts,
  type UnitStatusCountsResult,
  type UnitField,
  type UnitInput,
  type UnitStatus,
  type WriteOffUnitResult,
  // Desde la 29.5.2 (brief-29.5.2, D-2 y D-5).
  getUnitSummaries,
  listAvailableUnits,
  type AvailableUnit,
  type UnitDetailsInput,
  type UnitPrice,
  type UnitSummary,
  // La API de lectura v3 y el pedido del agente con unidades (brief-29.8, D-3 y D-7).
  listAvailableUnitsForService,
  resolveAgentLineUnits,
  type AgentLineUnits,
  type AgentUnit,
  type ServiceAvailableUnit,
} from "./units";
// La reparación de una unidad propia (brief-29.6.2, D-2): service manda a reparar, marca reparada y
// cancela con su transacción; liberar a la venta es una acción de un admin.
export {
  cancelUnitRepair,
  getUnitForRepair,
  RELEASE_REASON,
  releaseUnit,
  returnUnitFromRepair,
  sendUnitToRepair,
  type ReleaseUnitResult,
  type ReturnUnitFromRepairResult,
  type SendUnitToRepairResult,
  type UnitForRepair,
} from "./unit-repairs";
// La unidad de un usado (brief-29.7, D-2): tradeins la crea al emitir el comprobante PU y la da de
// baja al anularlo, con su transacción.
export {
  registerTradeInUnit,
  writeOffTradeInUnit,
  type RegisterTradeInUnitResult,
  type WriteOffTradeInUnitResult,
} from "./trade-in-units";
// Los grados de las unidades (brief-29.5, D-5).
export {
  applyGradeTemplate,
  createUnitGrade,
  listUnitGrades,
  moveUnitGrade,
  setUnitGradeActive,
  UNIT_GRADE_DESCRIPTION_MAX_LENGTH,
  UNIT_GRADE_NAME_MAX_LENGTH,
  updateUnitGrade,
  type GradeField,
  type GradeInput,
  type GradeTemplate,
  type GradeWriteResult,
  type MoveDirection,
  type UnitGrade,
} from "./grades";
// La garantía de una unidad vendida (brief-29.9, D-1 a D-3): los días de la organización y los de una
// unidad, la garantía derivada y la búsqueda por IMEI. La regla, pura, la usa también service.
export {
  applyUnitSettingsTemplate,
  findUnitsBySerial,
  getUnitWarranties,
  getUnitWarrantySettings,
  MAX_WARRANTY_DAYS,
  saveUnitWarrantySettings,
  setUnitWarrantyDays,
  type UnitWarrantyDaysResult,
  type WarrantySettings,
  type WarrantySettingsResult,
  type WarrantyUnit,
  type WarrantyUnitsResult,
} from "./warranties";
export {
  deriveWarranty,
  localDate,
  type Warranty,
  type WarrantySource,
} from "./warranty";
