// Interfaz pública del módulo audit (brief-3.6; lectura del historial, brief-4.4).
export {
  AUDIT_PAGE_SIZE,
  auditUserIds,
  countRecentUserChanges,
  InvalidAuditEntryError,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type AuditAction,
  type AuditActor,
  type NamedAuditActor,
  type NamedAuditLogEntry,
  type AuditDiff,
  type AuditEntityType,
  type AuditEntry,
  type AuditLogEntry,
  type AuditLogPage,
} from "./service";
