// Interfaz pública del módulo ingestion (brief-6.5.1).
export {
  canonicalJson,
  INGESTION_CONTRACT_VERSION,
  INGESTION_EVENT_TYPES,
  INGESTION_FIELDS,
  ingestionPayloadHash,
  MAX_CLOCK_SKEW_MS,
  MAX_EXTERNAL_REF_LENGTH,
  MAX_INGESTION_BODY_BYTES,
  MAX_MESSAGE_BODY_LENGTH,
  parseIngestionEventV1,
  type IngestionEventV1,
  type IngestionField,
  type ParseIngestionEventResult,
} from "./contract";
