import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listRepairTypes } from "@/modules/service";
import { listChecklistItems, tradeInsAllowed } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  roleBadgeClass,
  secondaryLinkClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import type { SearchParams } from "../filters";
import {
  ADMIN_ONLY_MESSAGE,
  CHECKLIST_TITLE,
  FORBIDDEN_ACTION_MESSAGE,
  noticeMessage,
} from "../messages";
import { TradeInsSubNav } from "../sub-nav";
import {
  ChecklistItemActiveForm,
  ChecklistItemForm,
  ChecklistItemMoveForm,
  ChecklistItemRepairTypeForm,
} from "./forms";

export const metadata: Metadata = {
  title: "Checklist de un usado — AI WhatsApp Agent CRM",
};

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// El checklist de un usado (ADR 0024, puntos 8 y 13; brief-29.7, D-3 y D-7): los puntos que se revisan
// al recibir un equipo, en su orden, cada uno obligatorio o no. Solo admin: agrega, edita, ordena y
// desactiva. Un punto no se borra: las recepciones guardan la copia de su nombre. ?editar=<id> abre la
// edición de un punto. Sin la capacidad trade_ins, 404. Desde la 29.7.3 (brief-29.7.3, D-3), con repairs,
// la reparación que necesita el equipo si el punto no pasa, para la cotización.
export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await tradeInsAllowed(context))) notFound();
  if (context.role !== "admin") {
    return <PageNotice title={CHECKLIST_TITLE} message={ADMIN_ONLY_MESSAGE} />;
  }
  const query = await searchParams;
  const [result, types] = await Promise.all([
    listChecklistItems(context),
    listRepairTypes(context),
  ]);
  // Sin repairs no hay tipos: el campo no aparece.
  const repairTypes = types.ok
    ? types.types.map((type) => ({
        id: type.id,
        name: type.name,
        isActive: type.isActive,
      }))
    : null;
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <PageNotice title={CHECKLIST_TITLE} message={FORBIDDEN_ACTION_MESSAGE} />
    );
  }
  const editingId = single(query.editar);
  const notice = noticeMessage(query.aviso);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={CHECKLIST_TITLE}
        subtitle={
          repairTypes
            ? "Lo que se revisa al recibir un equipo usado. Si un punto obligatorio no pasa, el equipo no se recibe. Si un punto con reparación no pasa, la cotización descuenta su costo; un punto sin reparación no descuenta nada."
            : "Lo que se revisa al recibir un equipo usado. Si un punto obligatorio no pasa, el equipo no se recibe."
        }
      />
      <TradeInsSubNav current="checklist" isAdmin />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <section aria-labelledby="puntos-titulo" className="mt-6">
        <h2 id="puntos-titulo" className={sectionTitleClass}>
          Puntos
        </h2>
        {result.items.length === 0 ? (
          <EmptyState
            icon="list"
            title="Todavía no hay puntos en el checklist."
            description="Un punto es algo que se revisa, como «Cámara trasera» o «iCloud desvinculado»."
            className="mt-4"
          />
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {result.items.map((item, index) => (
              <li key={item.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{item.name}</span>
                  {item.isMandatory ? (
                    <span className={roleBadgeClass}>Obligatorio</span>
                  ) : null}
                  {item.isExample ? (
                    <span className={roleBadgeClass}>Del perfil</span>
                  ) : null}
                  <span
                    className={
                      item.isActive ? activeBadgeClass : inactiveBadgeClass
                    }
                  >
                    {item.isActive ? "Activo" : "Inactivo"}
                  </span>
                </p>
                {item.uses > 0 ? (
                  <p className="mt-1 text-sm text-muted">
                    En {item.uses}{" "}
                    {item.uses === 1 ? "recepción" : "recepciones"}.
                  </p>
                ) : null}
                {editingId === item.id ? (
                  <div className="mt-3">
                    <ChecklistItemForm
                      mode="editar"
                      itemId={item.id}
                      name={item.name}
                      isMandatory={item.isMandatory}
                    />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <Link
                      href={`/usados/checklist?editar=${item.id}`}
                      className={secondaryLinkClass}
                    >
                      <Icon name="pencil" className="size-4" />
                      Editar
                      <span className="sr-only"> el punto {item.name}</span>
                    </Link>
                    <ChecklistItemActiveForm
                      itemId={item.id}
                      name={item.name}
                      isActive={item.isActive}
                    />
                    <ChecklistItemMoveForm
                      itemId={item.id}
                      name={item.name}
                      first={index === 0}
                      last={index === result.items.length - 1}
                    />
                  </div>
                )}
                {repairTypes && editingId !== item.id ? (
                  <div className="mt-3">
                    <ChecklistItemRepairTypeForm
                      itemId={item.id}
                      name={item.name}
                      repairTypeId={item.repairTypeId}
                      repairTypes={repairTypes}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
          <h3 className="text-base font-semibold">Nuevo punto</h3>
          <div className="mt-3">
            <ChecklistItemForm mode="crear" />
          </div>
        </div>
      </section>
    </main>
  );
}
