import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  createUserWithInitialPassword,
  getUserSummaries,
  prepareInitialPassword,
  setUserActive,
  validateNewUser,
  validateSession,
  type NewUserField,
  type UserSummary,
} from "@/modules/auth";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";

export type MemberRole = "admin" | "viewer";

// Contexto autenticado de un request (brief-3.4, D-2). organizationId sale siempre
// de la membresía, nunca del request.
export type AuthContext = Readonly<{
  userId: string;
  organizationId: string;
  role: MemberRole;
  mustChangePassword: boolean;
  sessionExpiresAt: Date;
}>;

export type Member = {
  id: string;
  userId: string;
  role: MemberRole;
  createdAt: Date;
};

// Miembro con los datos de su usuario, compuestos sin JOIN (brief-3.7, D-3).
export type MemberSummary = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  isActive: boolean;
  isSelf: boolean;
};

// Una consulta por módulo: auth valida sesión y usuario, organizations resuelve la membresía (ADR 0012, nota de la 3.3).
export async function getAuthContext(
  token: string | null | undefined,
): Promise<{ ok: true; context: AuthContext } | Failure<"UNAUTHENTICATED">> {
  const user = await validateSession(token);
  if (!user) return failure("UNAUTHENTICATED");

  const membership = await repository.findMembershipByUserId(user.userId);
  if (!membership) return failure("UNAUTHENTICATED");

  return {
    ok: true,
    context: Object.freeze({
      userId: user.userId,
      organizationId: membership.organizationId,
      role: membership.role,
      mustChangePassword: user.mustChangePassword,
      sessionExpiresAt: user.expiresAt,
    }),
  };
}

// Primera llamada de todo caso de uso protegido (brief-3.4, D-4): la contraseña pendiente
// se verifica siempre, antes que el rol y antes de buscar el recurso.
export function authorize(
  context: AuthContext,
  requirement: { role?: MemberRole } = {},
): { ok: true } | Failure<"FORBIDDEN"> {
  if (context.mustChangePassword) return failure("FORBIDDEN");
  if (requirement.role === "admin" && context.role !== "admin") {
    return failure("FORBIDDEN");
  }
  return { ok: true };
}

const memberIdSchema = z.uuid();
const roleSchema = z.enum(["admin", "viewer"]);

function summarize(
  member: repository.MemberRow,
  user: UserSummary,
  selfUserId: string,
): MemberSummary {
  return {
    id: member.id,
    userId: member.userId,
    name: user.name,
    email: user.email,
    role: member.role,
    isActive: user.isActive,
    isSelf: member.userId === selfUserId,
  };
}

// Un miembro de la propia organización, solo para admin. Uno de otra organización
// da NOT_FOUND, indistinguible de uno inexistente (brief-3.4, D-3). Nombre, email y
// estado vienen de auth (brief-3.7).
export async function getMember(
  context: AuthContext,
  memberId: string,
): Promise<
  | { ok: true; member: Member & MemberSummary }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;

  if (!memberIdSchema.safeParse(memberId).success) {
    return failure("VALIDATION_ERROR");
  }

  const member = await repository.findMember(context.organizationId, memberId);
  if (!member) return failure("NOT_FOUND");
  const [user] = await getUserSummaries([member.userId]);
  if (!user) return failure("NOT_FOUND");
  return {
    ok: true,
    member: {
      ...summarize(member, user, context.userId),
      createdAt: member.createdAt,
    },
  };
}

// Lista de la pantalla 10 (brief-3.7, D-3).

export const MEMBERS_PAGE_SIZE = 25;

export type MemberRoleFilter = "all" | MemberRole;
export type MemberStatusFilter = "active" | "inactive" | "all";

export type MemberListFilters = {
  role: MemberRoleFilter;
  status: MemberStatusFilter;
  page: number;
};

export type MemberPage = {
  members: MemberSummary[];
  total: number;
  page: number;
  pageCount: number;
};

const collator = new Intl.Collator("es", { sensitivity: "base" });

// Compone, filtra, ordena por nombre y pagina. Una página fuera de rango se lleva a la última.
export function composeMemberPage(
  members: repository.MemberRow[],
  users: UserSummary[],
  filters: MemberListFilters,
  selfUserId: string,
): MemberPage {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const matching = members
    .flatMap((member) => {
      const user = usersById.get(member.userId);
      return user ? [summarize(member, user, selfUserId)] : [];
    })
    .filter(
      (member) =>
        (filters.role === "all" || member.role === filters.role) &&
        (filters.status === "all" ||
          member.isActive === (filters.status === "active")),
    )
    .sort(
      (a, b) =>
        collator.compare(a.name, b.name) ||
        collator.compare(a.email, b.email) ||
        a.id.localeCompare(b.id),
    );

  const pageCount = Math.max(1, Math.ceil(matching.length / MEMBERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const start = (page - 1) * MEMBERS_PAGE_SIZE;
  return {
    members: matching.slice(start, start + MEMBERS_PAGE_SIZE),
    total: matching.length,
    page,
    pageCount,
  };
}

export async function listMembers(
  context: AuthContext,
  filters: MemberListFilters,
): Promise<({ ok: true } & MemberPage) | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;

  // El filtro por organización queda en SQL; el resto, en memoria.
  const members = await repository.findMembers(context.organizationId);
  const users = await getUserSummaries(members.map((member) => member.userId));
  return {
    ok: true,
    ...composeMemberPage(members, users, filters, context.userId),
  };
}

// Marco común de las páginas autenticadas (brief-3.7, D-7). Solo muestra datos.
export type AppFrame = {
  organizationName: string;
  userName: string;
  role: MemberRole;
};

export async function getAppFrame(context: AuthContext): Promise<AppFrame> {
  const [organizationName, users] = await Promise.all([
    repository.findOrganizationName(context.organizationId),
    getUserSummaries([context.userId]),
  ]);
  return {
    organizationName: organizationName ?? "",
    userName: users[0]?.name ?? "",
    role: context.role,
  };
}

// Punto de entrada único de los resúmenes de usuario para los módulos de negocio
// (9.0.1, D-2; H-1 de la 8.4). Antes cada módulo llamaba a auth.getUserSummaries, que lee
// users por id sin filtro de organización, y la garantía de aislamiento vivía en siete
// llamadores distintos. Acá la organización se interseca en SQL contra organization_members
// antes de leer los usuarios, así que un id de otra organización no devuelve nada.
//
// Lo que esto NO hace: la consulta de auth sigue sin filtro propio. La garantía pasó de
// siete lugares a uno, que es mejor, pero no es estructural. Lo estructural sería RLS, que
// exige un rol sin BYPASSRLS y tiene su propio ADR pendiente.
export async function getMemberSummaries(
  organizationId: string,
  userIds: string[],
  tx?: DbTransaction,
): Promise<UserSummary[]> {
  const memberUserIds = await repository.findMemberUserIds(
    organizationId,
    userIds,
    tx,
  );
  return getUserSummaries(memberUserIds, tx);
}

// Zona IANA de la organización, para períodos y fechas (brief-4.3.3, D-4). La columna es
// not null con default, así que una organización existente siempre la tiene.
export async function getOrganizationTimezone(
  context: AuthContext,
): Promise<string> {
  const timezone = await repository.findOrganizationTimezone(
    context.organizationId,
  );
  if (!timezone) throw new Error("organización sin zona horaria");
  return timezone;
}

// La misma zona para la API de lectura (brief-11.3, D-3): la organización sale de la credencial
// que ya autenticó la API, no de una persona.
export async function getOrganizationTimezoneForService(
  organizationId: string,
): Promise<string> {
  const timezone = await repository.findOrganizationTimezone(organizationId);
  if (!timezone) throw new Error("organización sin zona horaria");
  return timezone;
}

// Escrituras sobre miembros (brief-3.7). Cada una abre la transacción con la organización
// bloqueada (D-2 y D-4), escribe y audita dentro de ella (D-8).

type MemberState = { role: MemberRole; isActive: boolean };

// "admin activo" es rol admin con users.is_active en true. Solo quitarle el rol o desactivarlo
// puede violar la regla; reactivar o ascender, nunca.
export function removesLastActiveAdmin(
  activeAdminCount: number,
  before: MemberState,
  after: MemberState,
): boolean {
  const wasActiveAdmin = before.role === "admin" && before.isActive;
  const staysActiveAdmin = after.role === "admin" && after.isActive;
  return wasActiveAdmin && !staysActiveAdmin && activeAdminCount <= 1;
}

// Estado leído después de tomar el bloqueo: miembros, estado de los admins y del objetivo.
// El actor se vuelve a verificar, porque su rol pudo cambiar desde que se resolvió la sesión.
async function lockedState(
  tx: DbTransaction,
  context: AuthContext,
  extraUserIds: string[] = [],
) {
  const members = await repository.findMembers(context.organizationId, tx);
  const adminUserIds = members
    .filter((member) => member.role === "admin")
    .map((member) => member.userId);
  const users = await getUserSummaries(
    [...new Set([...adminUserIds, ...extraUserIds])],
    tx,
  );
  const activeByUserId = new Map(users.map((user) => [user.id, user.isActive]));
  const actor = members.find((member) => member.userId === context.userId);
  return {
    members,
    activeByUserId,
    actorIsActiveAdmin:
      actor?.role === "admin" && activeByUserId.get(actor.userId) === true,
    activeAdminCount: adminUserIds.filter(
      (userId) => activeByUserId.get(userId) === true,
    ).length,
  };
}

export type CreateMemberField = NewUserField | "role";

export type CreateMemberResult =
  | {
      ok: true;
      memberId: string;
      userId: string;
      name: string;
      // Única vez que existe en claro fuera de auth (D-5): no se loguea ni se audita.
      initialPassword: string;
    }
  | Failure<"FORBIDDEN" | "CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: CreateMemberField[] }>;

export async function createMember(
  context: AuthContext,
  input: { name: string; email: string; role: string },
): Promise<CreateMemberResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;

  const user = validateNewUser(input);
  const role = roleSchema.safeParse(input.role);
  if (!user.ok || !role.success) {
    const fields: CreateMemberField[] = user.ok ? [] : [...user.fields];
    if (!role.success) fields.push("role");
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }

  const { initialPassword, passwordHash } = await prepareInitialPassword();

  return repository.withOrganizationLock(
    context.organizationId,
    async (tx): Promise<CreateMemberResult> => {
      const state = await lockedState(tx, context);
      if (!state.actorIsActiveAdmin) return failure("FORBIDDEN");

      const created = await createUserWithInitialPassword(tx, {
        ...user.user,
        passwordHash,
      });
      if (!created.ok) return created;

      const memberId = await repository.insertMember(tx, {
        organizationId: context.organizationId,
        userId: created.userId,
        role: role.data,
      });
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "organization_member",
        entityId: memberId,
        action: "create",
        diff: {
          before: null,
          after: { userId: created.userId, role: role.data, isActive: true },
        },
      });
      return {
        ok: true,
        memberId,
        userId: created.userId,
        name: user.user.name,
        initialPassword,
      };
    },
  );
}

export const ORGANIZATION_NAME_MAX_LENGTH = 200;
export const DEFAULT_ORGANIZATION_TIMEZONE = "America/Argentina/Buenos_Aires";

export type CreateOrganizationField =
  "organizationName" | "timezone" | "adminName" | "adminEmail";

export type CreateOrganizationResult =
  | {
      ok: true;
      organizationId: string;
      userId: string;
      memberId: string;
      // Única vez que existe en claro (como en createMember): no se loguea ni se audita.
      initialPassword: string;
    }
  | Failure<"CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: CreateOrganizationField[] }>;

const organizationNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(ORGANIZATION_NAME_MAX_LENGTH);

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Alta de una organización con su primer admin (brief-13.1, D-9). No hay contexto de sesión:
// la llama solo el script de operador `scripts/crear-organizacion.ts`, porque un entorno nuevo
// no tiene ningún admin que pueda usar createMember. Todo ocurre en una transacción: un correo
// ya tomado revierte también la organización, así que nunca queda una organización sin admin.
// La auditoría del alta del miembro lleva como actor al propio admin creado: es el único usuario
// que existe en la organización, y audit_logs exige exactamente un actor.
export async function createOrganizationWithAdmin(input: {
  organizationName: string;
  timezone?: string;
  adminName: string;
  adminEmail: string;
}): Promise<CreateOrganizationResult> {
  const fields: CreateOrganizationField[] = [];
  const name = organizationNameSchema.safeParse(input.organizationName);
  if (!name.success) fields.push("organizationName");
  const timezone = input.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  if (!isValidTimezone(timezone)) fields.push("timezone");
  const user = validateNewUser({
    name: input.adminName,
    email: input.adminEmail,
  });
  if (!user.ok) {
    for (const field of user.fields) {
      fields.push(field === "name" ? "adminName" : "adminEmail");
    }
  }
  if (!name.success || !user.ok || fields.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }

  const { initialPassword, passwordHash } = await prepareInitialPassword();

  try {
    return await repository.inTransaction(async (tx) => {
      const organizationId = await repository.insertOrganization(tx, {
        name: name.data,
        timezone,
      });
      const created = await createUserWithInitialPassword(tx, {
        ...user.user,
        passwordHash,
      });
      // Lanzar revierte la organización ya insertada; el catch de abajo lo traduce.
      if (!created.ok) throw new EmailTakenError();

      const memberId = await repository.insertMember(tx, {
        organizationId,
        userId: created.userId,
        role: "admin",
      });
      await recordAudit(tx, {
        organizationId,
        actorUserId: created.userId,
        entityType: "organization_member",
        entityId: memberId,
        action: "create",
        diff: {
          before: null,
          after: { userId: created.userId, role: "admin", isActive: true },
        },
      });
      return {
        ok: true as const,
        organizationId,
        userId: created.userId,
        memberId,
        initialPassword,
      };
    });
  } catch (error) {
    if (error instanceof EmailTakenError) return failure("CONFLICT");
    throw error;
  }
}

class EmailTakenError extends Error {}

// changed en false: el miembro ya estaba así; no se escribe ni se audita.
export type MemberChangeResult =
  | { ok: true; changed: boolean }
  | Failure<
      "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR" | "BUSINESS_RULE_VIOLATION"
    >;

async function changeMember(
  context: AuthContext,
  memberId: string,
  change: Partial<MemberState>,
): Promise<MemberChangeResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!memberIdSchema.safeParse(memberId).success) {
    return failure("VALIDATION_ERROR");
  }

  return repository.withOrganizationLock(
    context.organizationId,
    async (tx): Promise<MemberChangeResult> => {
      const target = await repository.findMember(
        context.organizationId,
        memberId,
        tx,
      );
      if (!target) return failure("NOT_FOUND");

      const state = await lockedState(tx, context, [target.userId]);
      if (!state.actorIsActiveAdmin) return failure("FORBIDDEN");
      const targetActive = state.activeByUserId.get(target.userId);
      if (targetActive === undefined) return failure("NOT_FOUND");

      const before: MemberState = { role: target.role, isActive: targetActive };
      const after: MemberState = {
        role: change.role ?? before.role,
        isActive: change.isActive ?? before.isActive,
      };
      if (before.role === after.role && before.isActive === after.isActive) {
        return { ok: true, changed: false };
      }
      if (removesLastActiveAdmin(state.activeAdminCount, before, after)) {
        return failure("BUSINESS_RULE_VIOLATION");
      }

      const audit = {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "organization_member" as const,
        entityId: target.id,
      };
      if (after.role !== before.role) {
        await repository.updateMemberRole(
          tx,
          context.organizationId,
          target.id,
          after.role,
        );
        await recordAudit(tx, {
          ...audit,
          action: "role_change",
          diff: { before: { role: before.role }, after: { role: after.role } },
        });
      }
      if (after.isActive !== before.isActive) {
        await setUserActive(tx, target.userId, after.isActive);
        await recordAudit(tx, {
          ...audit,
          action: after.isActive ? "reactivate" : "deactivate",
          diff: {
            before: { isActive: before.isActive },
            after: { isActive: after.isActive },
          },
        });
      }
      return { ok: true, changed: true };
    },
  );
}

export async function changeMemberRole(
  context: AuthContext,
  memberId: string,
  role: string,
): Promise<MemberChangeResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return failure("VALIDATION_ERROR");
  return changeMember(context, memberId, { role: parsed.data });
}

export function deactivateMember(
  context: AuthContext,
  memberId: string,
): Promise<MemberChangeResult> {
  return changeMember(context, memberId, { isActive: false });
}

export function reactivateMember(
  context: AuthContext,
  memberId: string,
): Promise<MemberChangeResult> {
  return changeMember(context, memberId, { isActive: true });
}
