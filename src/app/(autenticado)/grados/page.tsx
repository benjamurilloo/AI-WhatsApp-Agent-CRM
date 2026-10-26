import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUnitWarrantySettings, listUnitGrades } from "@/modules/inventory";
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
import { WarrantySettingsForm } from "../_warranty/warranty-settings-form";
import { saveUnitWarrantySettingsAction } from "./actions";
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
// serialized_units, 404. Desde la 29.9 (brief-29.9, D-1), un admin fija acá los días de garantía de una
// unidad vendida, que vale para las unidades sin días propios.
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
  const warranty = isAdmin ? await getUnitWarrantySettings(context) : null;
  const warrantySettings = warranty?.ok ? warranty.settings : null;

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
          id="garantia-titulo"
          title="Garantía de las unidades vendidas"
          icon="tag"
          className="mt-6"
        >
          <p className="text-sm">
            {warrantySettings
              ? `Una unidad vendida tiene ${warrantySettings.warrantyDays} días de garantía, salvo que tenga los suyos${warrantySettings.isExample ? ". Es el valor de ejemplo del perfil" : ""}.`
              : "Todavía no hay días de garantía: las unidades vendidas sin días propios dicen «Garantía sin configurar»."}
          </p>
          <div className="mt-3">
            <WarrantySettingsForm
              action={saveUnitWarrantySettingsAction}
              prefix="garantia-unidades"
              warrantyDays={
                warrantySettings ? String(warrantySettings.warrantyDays) : ""
              }
              hint="Desde la venta o la entrega del pedido, incluido el último día. Cero: sin garantía."
            />
          </div>
        </SectionCard>
      ) : null}

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
