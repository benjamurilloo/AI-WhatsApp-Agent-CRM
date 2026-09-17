// Interfaz pública del módulo ingestion (brief-6.5.1 y 6.5.2).
export {
  canonicalJson,
  INGESTION_CONTRACT_VERSION,
  INGESTION_EVENT_TYPES,
  INGESTION_FIELDS,
  ingestionPayloadHash,
  isOpaqueReference,
  MAX_CLOCK_SKEW_MS,
  MAX_EXTERNAL_REF_LENGTH,
  MAX_INGESTION_BODY_BYTES,
  MAX_MESSAGE_BODY_LENGTH,
  parseIngestionEventV1,
  type IngestionEventV1,
  type IngestionField,
  type ParseIngestionEventResult,
} from "./contract";
export {
  recordIngestionEvent,
  type IngestionAccepted,
  type IngestionContext,
  type RecordIngestionEventResult,
} from "./service";
