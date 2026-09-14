// Interfaz pública del módulo auth (brief-3.3; completeRequiredPasswordChange, brief-3.5;
// gestión de usuarios, brief-3.7).
export {
  changePassword,
  completeRequiredPasswordChange,
  createUserWithInitialPassword,
  getUserSummaries,
  login,
  logout,
  prepareInitialPassword,
  revokeUserSessions,
  setUserActive,
  validateNewUser,
  validateSession,
  USER_NAME_MAX_LENGTH,
  type AuthenticatedUser,
  type AuthFailure,
  type NewUser,
  type NewUserField,
  type SessionIssued,
  type UserSummary,
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
