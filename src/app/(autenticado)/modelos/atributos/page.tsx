import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listAttributes } from "@/modules/catalog";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { BackLink } from "@/app/_components/detail-header";
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
import {
  ActiveToggleForm,
  AttributeCreateForm,
  AttributeEditForm,
  MoveForm,
  OptionAddForm,
  OptionEditForm,
} from "../forms";
import {
  ATTRIBUTE_TYPE_LABEL,
  FORBIDDEN_ACTION_MESSAGE,
  NO_ATTRIBUTES_MESSAGE,
  noticeMessage,
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
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

      {result.definitions.length === 0 ? (
        <EmptyState
          icon="tag"
          title={NO_ATTRIBUTES_MESSAGE}
          description="Un atributo es un dato del producto, como el color o si trae caja."
          className="mt-6"
        />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {result.definitions.map((definition, index) => {
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
                  <span
                    className={
                      definition.isActive
                        ? activeBadgeClass
                        : inactiveBadgeClass
                    }
                  >
                    {definition.isActive ? "Activo" : "Inactivo"}
                  </span>
                </p>

                {definition.type === "option" && !editing ? (
                  <ul
                    aria-label={`Opciones de ${definition.name}`}
                    className="mt-3 flex flex-wrap gap-2 text-sm"
                  >
                    {definition.options.map((option) => (
                      <li
                        key={option.id}
                        className={
                          option.isActive ? "" : "text-muted line-through"
                        }
                      >
                        {option.label}
                        {option.isActive ? null : (
                          <span className="sr-only"> (inactiva)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {isAdmin && !editing ? (
                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    <Link
                      href={`/modelos/atributos?editar=${definition.id}`}
                      className={secondaryLinkClass}
                    >
                      <Icon name="pencil" className="size-4" />
                      Editar<span className="sr-only"> {definition.name}</span>
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
                      last={index === result.definitions.length - 1}
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
                          Opciones
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
