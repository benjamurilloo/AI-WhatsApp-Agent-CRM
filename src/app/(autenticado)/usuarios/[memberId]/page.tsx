import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  linkClass,
  noticeClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import type { SearchParams } from "../filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  MEMBER_NOT_FOUND_MESSAGE,
  noticeMessage,
} from "../messages";
import { DeactivateConfirm, ReactivateForm, RoleForm } from "./member-forms";

export const metadata: Metadata = {
  title: "Editar usuario — AI WhatsApp Agent CRM",
};

// Edición de un miembro (brief-3.7, D-6): rol, desactivar con confirmación en un segundo paso
// (?confirmar=desactivar) y reactivar.
export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { memberId } = await params;
  const query = await searchParams;

  const result = await getMember(context, memberId);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") {
      return (
        <PageNotice title="Usuarios y roles" message={FORBIDDEN_PAGE_MESSAGE} />
      );
    }
    return (
      <PageNotice
        title="Usuarios y roles"
        message={MEMBER_NOT_FOUND_MESSAGE}
        back={{ href: "/usuarios", label: "Volver a usuarios" }}
      />
    );
  }

  const member = result.member;
  const notice = noticeMessage(query.aviso);
  const confirming = query.confirmar === "desactivar" && member.isActive;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <p>
        <Link href="/usuarios" className={linkClass}>
          Volver a usuarios
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-semibold">
        Editar a {member.name}
        {member.isSelf ? " (vos)" : ""}
      </h1>

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium">Email</dt>
        <dd className="break-all">{member.email}</dd>
        <dt className="font-medium">Estado</dt>
        <dd>{member.isActive ? "Activo" : "Inactivo"}</dd>
      </dl>

      <section aria-labelledby="rol-titulo" className="mt-8">
        <h2 id="rol-titulo" className="text-lg font-semibold">
          Rol
        </h2>
        <RoleForm key={member.role} memberId={member.id} role={member.role} />
      </section>

      <section aria-labelledby="estado-titulo" className="mt-8">
        <h2 id="estado-titulo" className="text-lg font-semibold">
          Estado
        </h2>
        <div className="mt-3">
          {!member.isActive ? (
            <ReactivateForm memberId={member.id} />
          ) : confirming ? (
            <DeactivateConfirm
              memberId={member.id}
              name={member.name}
              isSelf={member.isSelf}
            />
          ) : (
            <Link
              href={`/usuarios/${member.id}?confirmar=desactivar`}
              className={secondaryLinkClass}
            >
              Desactivar
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
