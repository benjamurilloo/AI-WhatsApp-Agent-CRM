import { z } from "zod";
import { validateSession } from "@/modules/auth";
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

// Un miembro de la propia organización, solo para admin. Uno de otra organización
// da NOT_FOUND, indistinguible de uno inexistente (brief-3.4, D-3).
export async function getMember(
  context: AuthContext,
  memberId: string,
): Promise<
  | { ok: true; member: Member }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;

  if (!memberIdSchema.safeParse(memberId).success) {
    return failure("VALIDATION_ERROR");
  }

  const member = await repository.findMember(context.organizationId, memberId);
  if (!member) return failure("NOT_FOUND");
  return { ok: true, member };
}
