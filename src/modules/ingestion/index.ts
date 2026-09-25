// Interfaz pública del módulo ingestion (brief-6.5.1, 6.5.2 y 6.5.3; alcance de la credencial,
// brief-11.3).
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
export {
  isCredentialAllowed,
  readIngestionConfig,
  type IngestionConfig,
} from "./config";
export {
  authenticateIngestionRequest,
  authenticateServiceRequest,
  createIngestionCredential,
  getCredentialSources,
  INGESTION_TOKEN_PREFIX,
  isCredentialScope,
  revokeIngestionCredential,
  TOKEN_PREFIXES,
  type AuthenticateIngestionResult,
  type CreateIngestionCredentialResult,
  type CredentialScope,
  type IngestionCredential,
} from "./credentials";
export {
  consumeIngestionRate,
  INGESTION_RATE_LIMIT,
  INGESTION_RATE_WINDOW_MS,
  type ConsumeIngestionRateResult,
} from "./rate-limit";
