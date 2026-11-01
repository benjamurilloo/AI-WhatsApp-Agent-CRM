import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listAttributes } from "@/modules/catalog";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { BackLink } from "@/app/_components/detail-header";
import { EmptyState } from "@/app/_components/empty-state";
import {
  roleBadgeClass,
  secondaryLinkClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  ActiveToggleForm,
  AttributeCreateForm,
  AttributeEditForm,
  MoveForm,
  OptionActiveForm,
  OptionAddForm,
  OptionEditForm,
} from "../forms";
import {
  ATTRIBUTE_TYPE_LABEL,
  ATTRIBUTE_VALUES_TITLE,
  FORBIDDEN_ACTION_MESSAGE,
  NO_ATTRIBUTES_MESSAGE,
  OPTION_IN_USE_MESSAGE,
  noticeMessage,
  usageText,
} from "../messages";

export const metadata: Metadata = {
  title: "Atributos — AI WhatsApp Agent CRM",
};

const TITLE = "Atributos de los productos";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Los atributos definidos por la organización (ADR 0024, punto 4; brief-29.2, D-5): los copió el perfil
// de rubro y un admin los ajusta. El tipo y la clave no cambian; las opciones se agregan, se
// renombran y se desactivan, nunca se borran. ?editar=<id> abre la edición de un atributo y sus
// opciones. Un viewer ve la lista sin formularios. Sin la capacidad, 404.
//
// Rediseñada por la 24.5.3 con la forma de la lámina 05 y el alcance de D-5: una tarjeta por
// atributo en dos columnas, el chip del tipo, la lista de valores con su casilla y el recuento
// «N variantes lo usan» (D-6), el alta en línea y el aviso de los valores en uso. Lo que **no**
// toma de la lámina es su alcance: los atributos y sus valores son de la organización y no de un
// modelo (V-3, ADR 0024 punto 4), así que esta pantalla no elige «qué valores usa este modelo».
// Tampoco lleva la barra de «cambios sin guardar» de la lámina: cada valor se guarda solo, con su
// propio registro de auditoría (decisión del usuario del 2026-11-01, V-11).
export default async function AttributesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const result = await listAttributes(context);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return <PageNotice title={TITLE} message={FORBIDDEN_ACTION_MESSAGE} />;
  }
  const isAdmin = context.role === "admin";
  const editingId = isAdmin ? single(query.editar) : undefined;
  const notice = noticeMessage(query.aviso);
  const definitions = result.definitions;
  const someInUse = definitions.some((definition) =>
    definition.options.some((option) => option.usageCount > 0),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <BackLink href="/modelos" label="Volver a modelos" />
      <div className="mt-4">
        <PageHeader
          title={TITLE}
          subtitle="Los datos de cada producto: los de variante distinguen las combinaciones de un modelo."
        />
      </div>

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {definitions.length === 0 ? (
        <EmptyState
          icon="tag"
          title={NO_ATTRIBUTES_MESSAGE}
          description="Un atributo es un dato del producto, como el color o si trae caja."
          className="mt-6"
        />
      ) : (
        <>
          <h2 className={`mt-8 ${sectionTitleClass}`}>
            {ATTRIBUTE_VALUES_TITLE}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Un valor sin marcar no se ofrece al cargar un producto. Los que ya
            lo usan lo conservan.
          </p>

          {/* Las tarjetas van una debajo de otra y **los valores** son los que se reparten en
              columnas adentro de cada una. La lámina pone dos tarjetas al lado con dos valores
              cada una; el catálogo real tiene 21 colores contra 5 capacidades, y dos tarjetas al
              lado dejaban un hueco del alto de la más larga —el mismo defecto de espacio vacío que
              la 24.5.1-b arregló en el Resumen del producto—. Repartiendo los valores no queda
              hueco en ninguna de las dos direcciones. */}
          <div className="@container mt-4">
            <div className="flex flex-col gap-4">
              {definitions.map((definition, index) => {
                const editing = editingId === definition.id;
                return (
                  <SectionCard
                    key={definition.id}
                    id={`atributo-${definition.id}-titulo`}
                    title={definition.name}
                    icon="tag"
                  >
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={roleBadgeClass}>
                        {ATTRIBUTE_TYPE_LABEL[definition.type]}
                      </span>
                      {definition.isVariant ? (
                        <span className={roleBadgeClass}>De variante</span>
                      ) : null}
                      {definition.isRequired ? (
                        <span className={roleBadgeClass}>
                          Obligatorio con modelo
                        </span>
                      ) : null}
                      <StatusBadge
                        tone={definition.isActive ? "success" : "neutral"}
                        icon={
                          definition.isActive ? "circleCheck" : "circleMinus"
                        }
                      >
                        {definition.isActive ? "Activo" : "Inactivo"}
                      </StatusBadge>
                    </p>

                    {definition.type === "option" && !editing ? (
                      <>
                        <ul
                          aria-label={`Valores de ${definition.name}`}
                          className="mt-3 gap-x-8 border-t border-border pt-3 text-sm sm:@md:columns-2 [&>li]:mt-2 [&>li]:break-inside-avoid"
                        >
                          {definition.options.map((option) => (
                            <li key={option.id}>
                              {isAdmin ? (
                                <OptionActiveForm
                                  optionId={option.id}
                                  label={option.label}
                                  isActive={option.isActive}
                                  usageCount={option.usageCount}
                                  isVariant={definition.isVariant}
                                />
                              ) : (
                                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span
                                    className={
                                      option.isActive
                                        ? ""
                                        : "text-muted line-through"
                                    }
                                  >
                                    {option.label}
                                    {option.isActive ? null : (
                                      <span className="sr-only">
                                        {" "}
                                        (inactiva)
                                      </span>
                                    )}
                                  </span>
                                  <span className="ml-auto text-muted tabular-nums">
                                    {usageText(
                                      option.usageCount,
                                      definition.isVariant,
                                    )}
                                  </span>
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                        {isAdmin ? (
                          <div className="mt-3 border-t border-border pt-3">
                            <OptionAddForm
                              definitionId={definition.id}
                              definitionName={definition.name}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {isAdmin && !editing ? (
                      <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-border pt-3">
                        <Link
                          href={`/modelos/atributos?editar=${definition.id}`}
                          className={secondaryLinkClass}
                        >
                          <Icon name="pencil" className="size-4" />
                          Editar
                          <span className="sr-only"> {definition.name}</span>
                        </Link>
                        <ActiveToggleForm
                          kind="attribute"
                          id={definition.id}
                          name={definition.name}
                          isActive={definition.isActive}
                        />
                        <MoveForm
                          kind="attribute"
                          id={definition.id}
                          name={definition.name}
                          first={index === 0}
                          last={index === definitions.length - 1}
                        />
                      </div>
                    ) : null}

                    {editing ? (
                      <div className="mt-4 flex flex-col gap-6">
                        <AttributeEditForm
                          definitionId={definition.id}
                          name={definition.name}
                          isRequired={definition.isRequired}
                          isVariant={definition.isVariant}
                        />
                        {definition.type === "option" ? (
                          <div className="flex flex-col gap-4 border-t border-border pt-4">
                            <h3 className="font-semibold text-foreground">
                              Valores
                            </h3>
                            <ul className="flex flex-col gap-3">
                              {definition.options.map((option, position) => (
                                <li
                                  key={option.id}
                                  className="flex flex-wrap items-start gap-3"
                                >
                                  <OptionEditForm
                                    optionId={option.id}
                                    label={option.label}
                                    isActive={option.isActive}
                                  />
                                  <MoveForm
                                    kind="option"
                                    id={option.id}
                                    name={option.label}
                                    first={position === 0}
                                    last={
                                      position === definition.options.length - 1
                                    }
                                  />
                                  <p className="self-center text-sm text-muted tabular-nums">
                                    {usageText(
                                      option.usageCount,
                                      definition.isVariant,
                                    )}
                                  </p>
                                </li>
                              ))}
                            </ul>
                            <OptionAddForm
                              definitionId={definition.id}
                              definitionName={definition.name}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </SectionCard>
                );
              })}
            </div>
          </div>

          {/* El aviso de la lámina, con el texto que corresponde a este CRM: acá un valor no se
              quita nunca —no hay borrado—, así que lo que explica es qué pasa al desactivarlo. */}
          {someInUse ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-border-strong bg-warning-soft px-4 py-3 text-sm text-on-warning-soft">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              {OPTION_IN_USE_MESSAGE}
            </p>
          ) : null}
        </>
      )}

      {isAdmin ? (
        <SectionCard
          id="nuevo-atributo-titulo"
          title="Nuevo atributo"
          icon="tag"
          className="mt-6"
        >
          <AttributeCreateForm />
        </SectionCard>
      ) : null}
    </main>
  );
}
