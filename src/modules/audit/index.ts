// Interfaz pública del módulo audit (brief-3.6; lectura del historial, brief-4.4).
export {
  AUDIT_PAGE_SIZE,
  InvalidAuditEntryError,
  listEntityAuditLogs,
  recordAudit,
  type AuditAction,
  type AuditDiff,
  type AuditEntityType,
  type AuditEntry,
  type AuditLogEntry,
  type AuditLogPage,
} from "./service";
