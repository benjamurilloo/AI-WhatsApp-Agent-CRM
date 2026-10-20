import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listUnitGrades } from "@/modules/inventory";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  activeBadgeClass,
  inactiveBadgeClass,
  roleBadgeClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { GradeActiveForm, GradeForm, GradeMoveForm } from "./forms";
import {
  FORBIDDEN_ACTION_MESSAGE,
  GRADES_TITLE,
  NO_GRADES_MESSAGE,
  noticeMessage,
} from "./messages";

export const metadata: Metadata = {
  title: "Grados — AI WhatsApp Agent CRM",
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Los grados de las unidades (ADR 0024, punto 13; brief-29.5, D-5): los copió el perfil de rubro y un
// admin los ajusta. Un grado no se borra: se desactiva, y las unidades que lo tienen lo conservan.
// ?editar=<id> abre la edición de un grado. Un viewer ve la lista sin formularios. Sin la capacidad
// serialized_units, 404.
export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const result = await listUnitGrades(context);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <PageNotice title={GRADES_TITLE} message={FORBIDDEN_ACTION_MESSAGE} />
    );
  }
  const isAdmin = context.role === "admin";
  const editingId = isAdmin ? single(query.editar) : undefined;
  const notice = noticeMessage(query.aviso);
  const grades = result.grades;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <PageHeader
        title={GRADES_TITLE}
        subtitle="El estado estético de cada unidad usada o reacondicionada. Se elige al cargar una unidad."
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {grades.length === 0 ? (
        <EmptyState
          icon="tag"
          title={NO_GRADES_MESSAGE}
          description="Un grado es una calificación, como «A: como nuevo»."
          className="mt-6"
        />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {grades.map((grade, index) => {
            const editing = editingId === grade.id;
            return (
              <SectionCard
                key={grade.id}
                id={`grado-${grade.id}-titulo`}
                title={grade.name}
                icon="tag"
              >
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  {grade.description ? <span>{grade.description}</span> : null}
                  {grade.isExample ? (
                    <span className={roleBadgeClass}>Del perfil</span>
                  ) : null}
                  <span
                    className={
                      grade.isActive ? activeBadgeClass : inactiveBadgeClass
                    }
                  >
                    {grade.isActive ? "Activo" : "Inactivo"}
                  </span>
                </p>
                {editing ? (
                  <div className="mt-4">
                    <GradeForm
                      mode="editar"
                      gradeId={grade.id}
                      values={{
                        name: grade.name,
                        description: grade.description ?? "",
                      }}
                    />
                  </div>
                ) : isAdmin ? (
                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    <Link
                      href={`/grados?editar=${grade.id}`}
                      className={secondaryLinkClass}
                    >
                      <Icon name="pencil" className="size-4" />
                      Editar
                      <span className="sr-only"> el grado {grade.name}</span>
                    </Link>
                    <GradeActiveForm
                      gradeId={grade.id}
                      name={grade.name}
                      isActive={grade.isActive}
                    />
                    <GradeMoveForm
                      gradeId={grade.id}
                      name={grade.name}
                      first={index === 0}
                      last={index === grades.length - 1}
                    />
                  </div>
                ) : null}
              </SectionCard>
            );
          })}
        </div>
      )}

      {isAdmin ? (
        <SectionCard
          id="nuevo-grado-titulo"
          title="Nuevo grado"
          icon="tag"
          className="mt-6"
        >
          <GradeForm mode="crear" />
        </SectionCard>
      ) : null}
    </main>
  );
}
