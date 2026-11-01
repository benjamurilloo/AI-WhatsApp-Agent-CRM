import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUnitWarrantySettings, listUnitGrades } from "@/modules/inventory";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  cardClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryLinkClass,
  roleBadgeClass,
  secondaryLinkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import { WarrantySettingsForm } from "../_warranty/warranty-settings-form";
import { saveUnitWarrantySettingsAction } from "./actions";
import { GradeActiveForm, GradeForm, GradeMoveForm } from "./forms";
import {
  FORBIDDEN_ACTION_MESSAGE,
  GRADES_SUBTITLE,
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
// Un viewer ve la lista sin formularios. Sin la capacidad serialized_units, 404. Desde la 29.9
// (brief-29.9, D-1), un admin fija acá los días de garantía de una unidad vendida, que vale para
// las unidades sin días propios.
//
// Rediseñada por la 24.5.3 con la forma de la lámina 06: la tabla Grado · Criterio estético ·
// Estado, con el alta y la edición en panel lateral. De los seis campos de la lámina quedan tres:
// sin código (V-4) ni color identificador (V-5), que el modelo no tiene, y sin la «Garantía de
// referencia» por grado (V-6), que contradice una garantía que se deriva y no se guarda. La
// tarjeta de los días de garantía de la organización, que la lámina no dibuja, se conserva (V-10).
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
  const notice = noticeMessage(query.aviso);
  const grades = result.grades;
  const warranty = isAdmin ? await getUnitWarrantySettings(context) : null;
  const warrantySettings = warranty?.ok ? warranty.settings : null;

  const creating = isAdmin && single(query.nuevo) === "1";
  const editingId = isAdmin ? single(query.editar) : undefined;
  const editing = grades.find((grade) => grade.id === editingId);
  const panel = creating || editing !== undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      {/* El encabezado va escrito acá y no con `PageHeader` por la misma razón que en `/modelos`:
          el componente compartido no sabe quedarse quieto detrás de un panel `inert`. */}
      <div
        inert={panel ? true : undefined}
        className={panel ? "opacity-60" : undefined}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className={pageTitleClass}>{GRADES_TITLE}</h1>
            <p className={pageSubtitleClass}>{GRADES_SUBTITLE}</p>
          </div>
          {isAdmin ? (
            <Link href="/grados?nuevo=1" className={primaryLinkClass}>
              + Nuevo grado
            </Link>
          ) : null}
        </div>

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
          <>
            <div
              className={`mt-6 hidden overflow-hidden md:block ${cardClass}`}
            >
              <table className="w-full border-collapse text-left text-[0.9375rem]">
                <caption className="sr-only">
                  Grados estéticos de la organización
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Grado
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Criterio estético
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Estado
                    </th>
                    {isAdmin ? (
                      <th scope="col" className={tableHeadCellClass}>
                        Acciones
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {grades.map((grade, index) => (
                    <tr key={grade.id}>
                      <td className={`${tableCellClass} font-semibold`}>
                        {grade.name}
                        {grade.isExample ? (
                          <span className={`${roleBadgeClass} ml-2`}>
                            Del perfil
                          </span>
                        ) : null}
                      </td>
                      <td className={tableCellClass}>
                        {grade.description ?? "—"}
                      </td>
                      <td className={tableCellClass}>
                        <StatusBadge
                          tone={grade.isActive ? "success" : "neutral"}
                          icon={grade.isActive ? "circleCheck" : "circleMinus"}
                        >
                          {grade.isActive ? "Activo" : "Inactivo"}
                        </StatusBadge>
                      </td>
                      {isAdmin ? (
                        <td className={tableCellClass}>
                          <div className="flex flex-wrap items-start gap-2">
                            <Link
                              href={`/grados?editar=${grade.id}`}
                              className={secondaryLinkClass}
                            >
                              <Icon name="pencil" className="size-4" />
                              Editar
                              <span className="sr-only">
                                {" "}
                                el grado {grade.name}
                              </span>
                            </Link>
                            <GradeMoveForm
                              gradeId={grade.id}
                              name={grade.name}
                              first={index === 0}
                              last={index === grades.length - 1}
                            />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul
              aria-label="Grados estéticos de la organización"
              className="mt-6 flex flex-col gap-3 md:hidden"
            >
              {grades.map((grade, index) => (
                <li
                  key={grade.id}
                  className={`${cardClass} flex flex-col gap-2 p-4`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-semibold">{grade.name}</span>
                    <StatusBadge
                      tone={grade.isActive ? "success" : "neutral"}
                      icon={grade.isActive ? "circleCheck" : "circleMinus"}
                    >
                      {grade.isActive ? "Activo" : "Inactivo"}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted">
                    {grade.description ?? "—"}
                    {grade.isExample ? " · Del perfil" : ""}
                  </p>
                  {isAdmin ? (
                    <div className="flex flex-wrap items-start gap-2">
                      <Link
                        href={`/grados?editar=${grade.id}`}
                        className={secondaryLinkClass}
                      >
                        <Icon name="pencil" className="size-4" />
                        Editar
                        <span className="sr-only"> el grado {grade.name}</span>
                      </Link>
                      <GradeMoveForm
                        gradeId={grade.id}
                        name={grade.name}
                        first={index === 0}
                        last={index === grades.length - 1}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
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
      </div>

      {/* El panel de la lámina 06, con las mismas reglas que el de `/modelos`: lo abre y lo cierra
          la URL, anda sin JavaScript y deja el **cuerpo de la pantalla** `inert` mientras está
          abierto. No el marco de la aplicación, que sigue alcanzable por teclado: por eso no
          declara `aria-modal` (revisión independiente de la 24.5.3, F-10). */}
      {panel ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-overlay" />
          <aside
            role="dialog"
            aria-labelledby="panel-grado-titulo"
            className="relative z-10 flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-surface p-6 shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="panel-grado-titulo" className={sectionTitleClass}>
                {editing ? `Editar ${editing.name}` : "Nuevo grado"}
              </h2>
              <Link
                href="/grados"
                aria-label="Cerrar el panel"
                className={secondaryLinkClass}
              >
                <Icon name="close" className="size-4" />
              </Link>
            </div>
            {editing ? (
              <>
                <GradeForm
                  mode="editar"
                  gradeId={editing.id}
                  values={{
                    name: editing.name,
                    description: editing.description ?? "",
                  }}
                  autoFocus
                />
                {/* El «Grado activo» de la lámina, acá como el botón que ya existía: es una
                    escritura propia, con su propio registro de auditoría, y no un campo más del
                    formulario de arriba. */}
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <p className="text-sm text-muted">
                    {editing.isActive
                      ? "Un grado desactivado no se ofrece al cargar una unidad. Las que lo tienen lo conservan."
                      : "Este grado no se ofrece al cargar una unidad."}
                  </p>
                  <GradeActiveForm
                    gradeId={editing.id}
                    name={editing.name}
                    isActive={editing.isActive}
                  />
                </div>
              </>
            ) : (
              <GradeForm
                mode="crear"
                cancelHref="/grados"
                autoFocus
                className="flex-1"
              />
            )}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
