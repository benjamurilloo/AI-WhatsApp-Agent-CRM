"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteSessionCookie, readSessionToken } from "@/modules/auth";
import {
  authorize,
  changeMemberRole,
  createMember,
  deactivateMember,
  getAuthContext,
  reactivateMember,
  type AuthContext,
  type MemberChangeResult,
} from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  EMAIL_TAKEN_MESSAGE,
  FORBIDDEN_ACTION_MESSAGE,
  memberChangeMessage,
  newMemberFieldError,
  unexpectedMemberErrorMessage,
  type MemberChangeState,
  type NewMemberState,
} from "./messages";

// Server Actions de la pantalla 10 (brief-3.7). Next.js compara Origin con Host; la sesión, el rol
// y la organización se verifican en organizations. El log lleva el actor, nunca nombre, email ni
// la contraseña inicial.

export async function createMemberAction(
  _previous: NewMemberState,
  formData: FormData,
): Promise<NewMemberState> {
  const requestId = newRequestId();
  const route = "usuarios.crear";
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();

  try {
    const result = await createMember(context, values);
    if (result.ok) {
      logEvent({
        level: "info",
        requestId,
        route,
        code: "OK",
        userId: context.userId,
      });
      revalidatePath("/usuarios");
      return {
        status: "created",
        requestId,
        name: result.name,
        initialPassword: result.initialPassword,
      };
    }

    logEvent({
      level: "warn",
      requestId,
      route,
      code: result.code,
      userId: context.userId,
    });
    if (result.code === "VALIDATION_ERROR") {
      return {
        status: "error",
        requestId,
        values,
        ...newMemberFieldError(result.fields),
      };
    }
    if (result.code === "CONFLICT") {
      return {
        status: "error",
        requestId,
        values,
        field: "email",
        message: EMAIL_TAKEN_MESSAGE,
      };
    }
    return {
      status: "error",
      requestId,
      values,
      field: null,
      message: FORBIDDEN_ACTION_MESSAGE,
    };
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route,
      code: "INTERNAL",
      userId: context.userId,
      error,
    });
    return {
      status: "error",
      requestId,
      values,
      field: null,
      message: unexpectedMemberErrorMessage(requestId),
    };
  }
}

// Cambio sobre un miembro existente. Con éxito redirige: a la misma ficha con un aviso, a /
// si el actor dejó de ser admin, o a /login si se desactivó a sí mismo (D-11).
async function runMemberChange(
  route: string,
  formData: FormData,
  notice: string,
  operation: (
    context: AuthContext,
    memberId: string,
  ) => Promise<MemberChangeResult>,
): Promise<MemberChangeState> {
  const requestId = newRequestId();
  const memberId = String(formData.get("memberId") ?? "");
  const context = await requireSession();

  let destination: string;
  try {
    const result = await operation(context, memberId);
    if (!result.ok) {
      logEvent({
        level: "warn",
        requestId,
        route,
        code: result.code,
        userId: context.userId,
      });
      return {
        status: "error",
        requestId,
        message: memberChangeMessage(result.code, requestId),
      };
    }
    logEvent({
      level: "info",
      requestId,
      route,
      code: "OK",
      userId: context.userId,
    });
    revalidatePath("/", "layout");

    // La sesión se vuelve a resolver sin la memoria del request: el cambio pudo afectar al actor.
    const after = await getAuthContext(await readSessionToken());
    if (!after.ok) {
      await deleteSessionCookie();
      destination = "/login";
    } else if (!authorize(after.context, { role: "admin" }).ok) {
      destination = "/";
    } else {
      // Con éxito el id ya pasó la validación de formato de organizations.
      destination = result.changed
        ? `/usuarios/${memberId}?aviso=${notice}`
        : `/usuarios/${memberId}`;
    }
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route,
      code: "INTERNAL",
      userId: context.userId,
      error,
    });
    return {
      status: "error",
      requestId,
      message: unexpectedMemberErrorMessage(requestId),
    };
  }

  redirect(destination);
}

export async function changeRoleAction(
  _previous: MemberChangeState,
  formData: FormData,
): Promise<MemberChangeState> {
  return runMemberChange("usuarios.rol", formData, "rol", (context, memberId) =>
    changeMemberRole(context, memberId, String(formData.get("role") ?? "")),
  );
}

export async function deactivateMemberAction(
  _previous: MemberChangeState,
  formData: FormData,
): Promise<MemberChangeState> {
  return runMemberChange(
    "usuarios.desactivar",
    formData,
    "desactivado",
    deactivateMember,
  );
}

export async function reactivateMemberAction(
  _previous: MemberChangeState,
  formData: FormData,
): Promise<MemberChangeState> {
  return runMemberChange(
    "usuarios.reactivar",
    formData,
    "reactivado",
    reactivateMember,
  );
}
