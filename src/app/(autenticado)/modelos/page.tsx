import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listModels } from "@/modules/catalog";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  linkClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { ModelForm, MoveForm } from "./forms";
import {
  FORBIDDEN_ACTION_MESSAGE,
  NO_MODELS_MESSAGE,
  noticeMessage,
} from "./messages";

export const metadata: Metadata = {
  title: "Modelos — AI WhatsApp Agent CRM",
};

const TITLE = "Modelos";

// Los modelos de la capacidad variants (ADR 0024, punto 5; brief-29.2, D-3 y D-4): cada modelo agrupa
// las combinaciones de un mismo equipo, y su ficha las muestra juntas. Sin la capacidad, la sección
// no existe: 404. Un admin crea modelos; un viewer los ve.
export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const result = await listModels(context);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return <PageNotice title={TITLE} message={FORBIDDEN_ACTION_MESSAGE} />;
  }
  const isAdmin = context.role === "admin";
  const notice = noticeMessage(query.aviso);
  const models = result.models;
  const countText = (count: number) =>
    count === 1 ? "1 producto" : `${count} productos`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title={TITLE}
        subtitle="Cada modelo agrupa sus variantes: capacidad, color y condición."
      />
      <p className="mt-2">
        <Link href="/modelos/atributos" className={linkClass}>
          Ver los atributos de los productos
        </Link>
      </p>

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {isAdmin ? (
        <SectionCard
          id="nuevo-modelo-titulo"
          title="Nuevo modelo"
          icon="layers"
          className="mt-6"
        >
          <ModelForm mode="crear" />
        </SectionCard>
      ) : null}

      {models.length === 0 ? (
        <EmptyState
          icon="layers"
          title={NO_MODELS_MESSAGE}
          description="Un modelo, como «iPhone 13», reúne sus variantes en una sola ficha."
          className="mt-6"
        />
      ) : (
        <>
          <div className={`mt-6 hidden overflow-hidden md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Modelos de la organización</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Modelo
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Marca
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Productos
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  {isAdmin ? (
                    <th scope="col" className={tableHeadCellClass}>
                      Orden
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {models.map((model, index) => (
                  <tr key={model.id}>
                    <td className={`${tableCellClass} font-semibold`}>
                      <Link href={`/modelos/${model.id}`} className={linkClass}>
                        {model.name}
                      </Link>
                    </td>
                    <td className={tableCellClass}>{model.brand ?? "—"}</td>
                    <td className={`${tableCellClass} tabular-nums`}>
                      {model.productCount > 0 ? (
                        <Link
                          href={`/productos?modelo=${model.id}&actividad=todos`}
                          className={linkClass}
                        >
                          {countText(model.productCount)}
                        </Link>
                      ) : (
                        countText(0)
                      )}
                    </td>
                    <td className={tableCellClass}>
                      <span
                        className={
                          model.isActive ? activeBadgeClass : inactiveBadgeClass
                        }
                      >
                        {model.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {isAdmin ? (
                      <td className={tableCellClass}>
                        <MoveForm
                          kind="model"
                          id={model.id}
                          name={model.name}
                          first={index === 0}
                          last={index === models.length - 1}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Modelos de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {models.map((model, index) => (
              <li
                key={model.id}
                className={`${cardClass} flex flex-col gap-1 p-4`}
              >
                <Link
                  href={`/modelos/${model.id}`}
                  className={`${linkClass} font-semibold`}
                >
                  {model.name}
                </Link>
                <p className="text-sm text-muted">
                  {[model.brand, countText(model.productCount)]
                    .filter(Boolean)
                    .join(" · ")}
                  {model.isActive ? "" : " · Inactivo"}
                </p>
                {isAdmin ? (
                  <MoveForm
                    kind="model"
                    id={model.id}
                    name={model.name}
                    first={index === 0}
                    last={index === models.length - 1}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {isAdmin ? (
        <p className="mt-6">
          <Link href="/productos/nuevo" className={secondaryLinkClass}>
            <Icon name="package" className="size-4" />
            Nuevo producto
          </Link>
        </p>
      ) : null}
    </main>
  );
}
