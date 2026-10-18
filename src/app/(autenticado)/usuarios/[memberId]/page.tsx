import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { Avatar } from "@/app/_components/avatar";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { DetailList } from "@/app/_components/detail-list";
import {
  activeBadgeClass,
  dangerOutlineLinkClass,
  inactiveBadgeClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
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
// (?confirmar=desactivar) y reactivar. Presentación de la 15.4: tres tarjetas (brief-15.4).
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
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href="/usuarios" label="Volver a usuarios" />
      <DetailHeader
        title={`Editar a ${member.name}${member.isSelf ? " (vos)" : ""}`}
        leading={
          <Avatar
            name={member.name}
            className="size-14 text-xl sm:size-16 sm:text-2xl"
          />
        }
        subtitle={
          member.isSelf
            ? "Modificá la configuración de tu cuenta."
            : "Modificá el rol y el estado de la cuenta."
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <SectionCard
        id="cuenta-titulo"
        title="Información de la cuenta"
        icon="user"
        className="mt-6"
      >
        <DetailList
          items={[
            {
              label: "Email",
              icon: "mail",
              value: <span className="break-all">{member.email}</span>,
            },
            {
              label: "Estado",
              icon: "circleCheck",
              value: (
                <span
                  className={
                    member.isActive ? activeBadgeClass : inactiveBadgeClass
                  }
                >
                  {member.isActive ? "Activo" : "Inactivo"}
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        id="rol-titulo"
        title="Rol"
        icon="shield"
        description="Define el nivel de acceso en el CRM."
        className="mt-6"
      >
        <RoleForm key={member.role} memberId={member.id} role={member.role} />
      </SectionCard>

      <SectionCard
        id="estado-titulo"
        title="Estado"
        icon="lock"
        description={
          member.isActive
            ? "Una cuenta desactivada no puede ingresar."
            : "La cuenta está desactivada: no puede ingresar."
        }
        className="mt-6"
      >
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
            className={dangerOutlineLinkClass}
          >
            <Icon name="power" className="size-4" />
            Desactivar
          </Link>
        )}
      </SectionCard>
    </main>
  );
}
