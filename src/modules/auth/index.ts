// Interfaz pública del módulo auth (brief-3.3).
export {
  changePassword,
  login,
  logout,
  revokeUserSessions,
  validateSession,
  type AuthenticatedUser,
  type AuthFailure,
  type SessionIssued,
} from "./service";
export {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./password";
export {
  deleteSessionCookie,
  readSessionToken,
  requestClientIp,
  writeSessionCookie,
} from "./session-cookie";
