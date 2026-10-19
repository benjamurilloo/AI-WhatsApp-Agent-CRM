// Interfaz pública del módulo fx (ADR 0025, punto 13; brief-29.4, D-10): depende solo de
// organizations y audit, y entre los módulos solo cash lo usa (tests/guards/fx-dependencies.test.ts).
export {
  createExchangeSettings,
  decimalsOf,
  EXCHANGE_RATE_PAGE_SIZE,
  getExchangeRatePage,
  getExchangeSetup,
  isLargeChange,
  recordExchangeRate,
  referenceTotal,
  type CreateExchangeSettingsResult,
  type CurrentRate,
  type ExchangeRateHistoryRow,
  type ExchangeRatePage,
  type ExchangeRateSource,
  type ExchangeSetup,
  type RecordExchangeRateResult,
  type RateReading,
  type ReferenceTotal,
  type UpdateExchangeSettingsResult,
  updateExchangeSettings,
} from "./service";
export {
  adjustmentToDatabase,
  formatAdjustment,
  type Adjustment,
} from "./adjustment";
export { STALE_AFTER_HOURS } from "./staleness";
