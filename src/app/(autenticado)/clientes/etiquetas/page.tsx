import type { Metadata } from "next";
import Link from "next/link";
import { listClientTags, SUGGESTED_TAGS } from "@/modules/crm";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import {
  activeBadgeClass,
  cardClass,
  dangerOutlineLinkClass,
  inactiveBadgeClass,
  linkClass,
  noticeClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { TagChip } from "@/app/_components/tag-chip";
import type { SearchParams } from "../filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_TAG_CATALOG_MESSAGE,
  tagNoticeMessage,
} from "../messages";
import {
  DeactivateTagConfirm,
  ReactivateTagForm,
  SuggestedTagsForm,
} from "./tag-actions";
import { TagForm } from "./tag-form";

export const metadata: Metadata = {
  title: "Etiquetas de clientes — AI WhatsApp Agent CRM",
};

const TITLE = "Etiquetas de clientes";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Pantalla 13 (brief-16.1, D-9): el catálogo de etiquetas de clientes de la organización. Un admin
// crea, edita nombre y color, desactiva con confirmación y reactiva; con el catálogo vacío, puede
// crear las sugeridas (D-3). Un viewer ve el catálogo sin formularios. La edición y la
// confirmación son pasos de la URL (?editar=<id>, ?confirmar=<id>), como en las demás pantallas.
export default async function TagCatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const result = await listClientTags(context);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const isAdmin = context.role === "admin";
  const tags = result.tags;
  const editing = isAdmin
    ? tags.find((tag) => tag.id === single(query.editar))
    : undefined;
  const confirming = isAdmin
    ? tags.find((tag) => tag.isActive && tag.id === single(query.confirmar))
    : undefined;
  const notice = tagNoticeMessage(query.aviso);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/clientes" label="Volver a clientes" />

      <div className="mt-4">
        <PageHeader
          title={TITLE}
          subtitle="Marcá a tus clientes para encontrarlos rápido en la lista."
        />
      </div>

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {isAdmin && tags.length === 0 ? (
        <SectionCard
          id="sugeridas-titulo"
          title="Empezá con las sugeridas"
          description="Cuatro etiquetas para el día a día. Después podés renombrarlas, cambiarles el color o desactivarlas."
          icon="tag"
          className="mt-6"
        >
          <ul aria-label="Etiquetas sugeridas" className="flex flex-wrap gap-2">
            {SUGGESTED_TAGS.map((tag) => (
              <li key={tag.name}>
                <TagChip name={tag.name} color={tag.color} />
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <SuggestedTagsForm />
          </div>
        </SectionCard>
      ) : null}

      {confirming ? (
        <div className="mt-6">
          <DeactivateTagConfirm tagId={confirming.id} name={confirming.name} />
        </div>
      ) : null}

      {isAdmin ? (
        editing ? (
          <SectionCard
            id="editar-etiqueta-titulo"
            title={`Editar «${editing.name}»`}
            icon="pencil"
            className="mt-6"
          >
            <TagForm
              mode="editar"
              tagId={editing.id}
              values={{ name: editing.name, color: editing.color }}
            />
          </SectionCard>
        ) : (
          <SectionCard
            id="nueva-etiqueta-titulo"
            title="Nueva etiqueta"
            icon="tag"
            className="mt-6"
          >
            <TagForm mode="crear" />
          </SectionCard>
        )
      ) : null}

      {tags.length === 0 ? (
        <div className={`mt-6 ${cardClass} p-6`}>
          <p>{NO_TAG_CATALOG_MESSAGE}</p>
        </div>
      ) : (
        <>
          <div className={`mt-6 hidden overflow-hidden md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Etiquetas de clientes</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Etiqueta
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Clientes activos
                  </th>
                  {isAdmin ? (
                    <th scope="col" className={tableHeadCellClass}>
                      Acciones
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag.id}>
                    <td className={tableCellClass}>
                      <TagChip name={tag.name} color={tag.color} />
                    </td>
                    <td className={tableCellClass}>
                      <StatusBadge isActive={tag.isActive} />
                    </td>
                    <td className={tableCellClass}>
                      <ClientsLink
                        tagId={tag.id}
                        count={tag.activeClients}
                        isActive={tag.isActive}
                      />
                    </td>
                    {isAdmin ? (
                      <td className={tableCellClass}>
                        <TagRowActions
                          tagId={tag.id}
                          name={tag.name}
                          isActive={tag.isActive}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Etiquetas de clientes"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {tags.map((tag) => (
              <li
                key={tag.id}
                className={`${cardClass} flex flex-col gap-3 p-4`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <TagChip name={tag.name} color={tag.color} />
                  <StatusBadge isActive={tag.isActive} />
                </div>
                <p className="text-sm">
                  <ClientsLink
                    tagId={tag.id}
                    count={tag.activeClients}
                    isActive={tag.isActive}
                  />
                </p>
                {isAdmin ? (
                  <TagRowActions
                    tagId={tag.id}
                    name={tag.name}
                    isActive={tag.isActive}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={isActive ? activeBadgeClass : inactiveBadgeClass}>
      {isActive ? "Activa" : "Inactiva"}
    </span>
  );
}

// La cantidad lleva a la lista filtrada por esa etiqueta, si está activa: una inactiva no filtra
// (D-8).
function ClientsLink({
  tagId,
  count,
  isActive,
}: {
  tagId: string;
  count: number;
  isActive: boolean;
}) {
  const text = count === 1 ? "1 cliente" : `${count} clientes`;
  if (!isActive || count === 0) return <span>{text}</span>;
  return (
    <Link href={`/clientes?etiqueta=${tagId}`} className={linkClass}>
      {text}
    </Link>
  );
}

function TagRowActions({
  tagId,
  name,
  isActive,
}: {
  tagId: string;
  name: string;
  isActive: boolean;
}) {
  if (!isActive) return <ReactivateTagForm tagId={tagId} name={name} />;
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/clientes/etiquetas?editar=${tagId}`}
        className={secondaryLinkClass}
      >
        <Icon name="pencil" className="size-4" />
        Editar<span className="sr-only"> {name}</span>
      </Link>
      <Link
        href={`/clientes/etiquetas?confirmar=${tagId}`}
        className={dangerOutlineLinkClass}
      >
        <Icon name="power" className="size-4" />
        Desactivar<span className="sr-only"> {name}</span>
      </Link>
    </div>
  );
}
