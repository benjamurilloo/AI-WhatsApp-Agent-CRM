import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMainCurrency } from "@/modules/organizations";
import {
  getModelRepairPrices,
  getServiceWarrantySettings,
  listRepairModels,
  listRepairTypes,
  repairCurrencies,
} from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  inlineButtonClass,
  labelClass,
  roleBadgeClass,
  secondaryLinkClass,
  sectionTitleClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import { WarrantySettingsForm } from "../../_warranty/warranty-settings-form";
import { saveServiceWarrantySettingsAction } from "../actions";
import type { SearchParams } from "../filters";
import {
  FORBIDDEN_ACTION_MESSAGE,
  NO_MODELS_MESSAGE,
  NO_REPAIR_TYPES_MESSAGE,
  noticeMessage,
  REPAIR_LIST_TITLE,
} from "../messages";
import { RepairsSubNav } from "../sub-nav";
import {
  RepairPriceForm,
  RepairTypeActiveForm,
  RepairTypeForm,
  RepairTypeMoveForm,
} from "./forms";

export const metadata: Metadata = {
  title: "Lista de reparaciones — AI WhatsApp Agent CRM",
};

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// El monto guardado como se escribe en el campo: con coma decimal.
function amountInput(value: string): string {
  return value.endsWith(".00") ? value.slice(0, -3) : value.replace(".", ",");
}

// La lista de reparaciones (ADR 0024, punto 7; brief-29.6, D-2 y D-10): los tipos de reparación de la
// organización y, para el modelo elegido con ?modelo=<id>, el precio al cliente y el costo del técnico
// de cada tipo. Un admin la edita; un viewer la ve sin el costo. ?editar=<id> abre la edición de un
// tipo. Sin la capacidad repairs, 404. Desde la 29.9 (brief-29.9, D-1), un admin fija los días de
// garantía de una reparación entregada.
export default async function RepairListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const [types, models] = await Promise.all([
    listRepairTypes(context),
    listRepairModels(context),
  ]);
  if (!types.ok) {
    if (types.code === "NOT_FOUND") notFound();
    return (
      <PageNotice
        title={REPAIR_LIST_TITLE}
        message={FORBIDDEN_ACTION_MESSAGE}
      />
    );
  }
  const isAdmin = context.role === "admin";
  const modelList = models.ok ? models.models : [];
  const modelId = single(query.modelo);
  const selected = modelList.find((model) => model.id === modelId) ?? null;
  const [prices, mainCurrency, warranty] = await Promise.all([
    selected ? getModelRepairPrices(context, selected.id) : null,
    getMainCurrency(context.organizationId),
    isAdmin ? getServiceWarrantySettings(context) : null,
  ]);
  const warrantySettings = warranty?.ok ? warranty.settings : null;
  const currencies = repairCurrencies();
  const defaultCurrency = mainCurrency ?? "USD";
  const editingId = isAdmin ? single(query.editar) : "";
  const notice = noticeMessage(query.aviso);
  const keep = selected ? `?modelo=${selected.id}` : "";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={REPAIR_LIST_TITLE}
        subtitle="Los tipos de reparación y, por modelo, lo que paga el cliente y lo que cobra el técnico."
      />
      <RepairsSubNav current="lista" />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <section
        aria-labelledby="precios-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6`}
      >
        <h2 id="precios-titulo" className={sectionTitleClass}>
          Precios por modelo
        </h2>
        {modelList.length === 0 ? (
          <p className="mt-2 text-sm">{NO_MODELS_MESSAGE}</p>
        ) : (
          <form
            method="get"
            action="/reparaciones/lista"
            className="mt-3 flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="modelo" className={labelClass}>
                Modelo
              </label>
              <select
                id="modelo"
                name="modelo"
                defaultValue={selected?.id ?? ""}
                className={selectClass}
              >
                <option value="">Elegí un modelo</option>
                {modelList.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.priceCount}{" "}
                    {model.priceCount === 1 ? "precio" : "precios"})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={inlineButtonClass}>
              Ver sus precios
            </button>
          </form>
        )}

        {prices?.ok ? (
          prices.prices.rows.length === 0 ? (
            <p className="mt-4 text-sm">{NO_REPAIR_TYPES_MESSAGE}</p>
          ) : (
            <div
              className="mt-4 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={`Precios del ${prices.prices.model.name}`}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Precios de las reparaciones del {prices.prices.model.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Reparación
                    </th>
                    {isAdmin ? (
                      <th scope="col" className={tableHeadCellClass}>
                        Precio al cliente y costo del técnico
                      </th>
                    ) : (
                      <th
                        scope="col"
                        className={`${tableHeadCellClass} text-right`}
                      >
                        Precio al cliente
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {prices.prices.rows.map((row) => (
                    <tr key={row.type.id}>
                      <th
                        scope="row"
                        className={`${tableCellClass} font-semibold`}
                      >
                        {row.type.name}
                        {row.type.isActive ? null : (
                          <span className={`ml-2 ${inactiveBadgeClass}`}>
                            Inactivo
                          </span>
                        )}
                      </th>
                      {isAdmin ? (
                        <td className={tableCellClass}>
                          <RepairPriceForm
                            repairTypeId={row.type.id}
                            typeName={row.type.name}
                            modelId={prices.prices.model.id}
                            currencies={currencies}
                            values={{
                              price: row.price
                                ? amountInput(row.price.price)
                                : "",
                              priceCurrency:
                                row.price?.priceCurrency ?? defaultCurrency,
                              cost:
                                row.price?.cost !== null &&
                                row.price?.cost !== undefined
                                  ? amountInput(row.price.cost)
                                  : "",
                              costCurrency:
                                row.price?.costCurrency ?? defaultCurrency,
                            }}
                          />
                        </td>
                      ) : (
                        <td
                          className={`${tableCellClass} text-right tabular-nums`}
                        >
                          {row.price
                            ? formatMoney(
                                row.price.price,
                                row.price.priceCurrency,
                              )
                            : "Sin precio"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      <section aria-labelledby="tipos-titulo" className="mt-8">
        <h2 id="tipos-titulo" className={sectionTitleClass}>
          Tipos de reparación
        </h2>
        {types.types.length === 0 ? (
          <EmptyState
            icon="wrench"
            title={NO_REPAIR_TYPES_MESSAGE}
            description="Un tipo es una reparación que se ofrece, como «Cambio de batería»."
            className="mt-4"
          />
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {types.types.map((type, index) => (
              <li key={type.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{type.name}</span>
                  {type.isExample ? (
                    <span className={roleBadgeClass}>Del perfil</span>
                  ) : null}
                  <span
                    className={
                      type.isActive ? activeBadgeClass : inactiveBadgeClass
                    }
                  >
                    {type.isActive ? "Activo" : "Inactivo"}
                  </span>
                </p>
                {editingId === type.id ? (
                  <div className="mt-3">
                    <RepairTypeForm
                      mode="editar"
                      repairTypeId={type.id}
                      name={type.name}
                      modelId={selected?.id ?? ""}
                      cancelHref={`/reparaciones/lista${keep}`}
                    />
                  </div>
                ) : isAdmin ? (
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <Link
                      href={`/reparaciones/lista?${new URLSearchParams({
                        ...(selected ? { modelo: selected.id } : {}),
                        editar: type.id,
                      }).toString()}`}
                      className={secondaryLinkClass}
                    >
                      <Icon name="pencil" className="size-4" />
                      Renombrar
                      <span className="sr-only"> el tipo {type.name}</span>
                    </Link>
                    <RepairTypeActiveForm
                      repairTypeId={type.id}
                      name={type.name}
                      isActive={type.isActive}
                      modelId={selected?.id ?? ""}
                    />
                    <RepairTypeMoveForm
                      repairTypeId={type.id}
                      name={type.name}
                      first={index === 0}
                      last={index === types.types.length - 1}
                      modelId={selected?.id ?? ""}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {isAdmin ? (
          <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
            <h3 className="text-base font-semibold">
              Nuevo tipo de reparación
            </h3>
            <div className="mt-3">
              <RepairTypeForm
                mode="crear"
                modelId={selected?.id ?? ""}
                cancelHref={`/reparaciones/lista${keep}`}
              />
            </div>
          </div>
        ) : null}
      </section>

      {isAdmin ? (
        <section
          aria-labelledby="garantia-titulo"
          className={`mt-6 ${cardClass} p-5 sm:p-6`}
        >
          <h2 id="garantia-titulo" className={sectionTitleClass}>
            Garantía de las reparaciones
          </h2>
          <p className="mt-2 text-sm">
            {warrantySettings
              ? `Una reparación entregada tiene ${warrantySettings.warrantyDays} días de garantía${warrantySettings.isExample ? ", el valor de ejemplo del perfil" : ""}.`
              : "Todavía no hay días de garantía: las reparaciones entregadas dicen «Garantía sin configurar»."}
          </p>
          <div className="mt-3">
            <WarrantySettingsForm
              action={saveServiceWarrantySettingsAction}
              prefix="garantia-reparaciones"
              warrantyDays={
                warrantySettings ? String(warrantySettings.warrantyDays) : ""
              }
              hint="Desde el día de la entrega, incluido el último. Cero: sin garantía."
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}
