import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listModels } from "@/modules/catalog";
import { sumStockByModel } from "@/modules/inventory";
import { formatQuantity } from "@/shared/quantity";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  cardClass,
  inputClass,
  labelClass,
  linkClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryLinkClass,
  secondaryButtonClass,
  secondaryLinkClass,
  sectionTitleClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { StatusBadge } from "@/app/_components/status-badge";
import { normalizeForSuggest } from "@/app/_components/suggest-filter";
import { ModelForm, MoveForm } from "./forms";
import {
  FORBIDDEN_ACTION_MESSAGE,
  MODELS_SUBTITLE,
  MODEL_ACTIVITY_LABEL,
  NO_MODELS_FOUND_MESSAGE,
  NO_MODELS_MESSAGE,
  noticeMessage,
  REORDER_FILTERED_MESSAGE,
  readModelActivity,
  type ModelActivity,
} from "./messages";

export const metadata: Metadata = {
  title: "Modelos — AI WhatsApp Agent CRM",
};

const TITLE = "Modelos";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Los modelos de la capacidad variants (ADR 0024, punto 5; brief-29.2, D-3 y D-4): cada modelo
// agrupa las combinaciones de un mismo equipo, y su ficha las muestra juntas. Sin la capacidad, la
// sección no existe: 404. Un admin crea modelos; un viewer los ve.
//
// Rediseñada por la 24.5.3 con la forma de la lámina 03: buscador, filtro de estado, la tabla
// Modelo · Variantes · Disponibles · Estado y el alta en un panel lateral. Sin la imagen (V-1) ni
// la descripción interna (V-2) del modelo, y sin las casillas «Atributos de variante» (V-3), que
// son datos que el modelo de hoy no tiene o que el ADR 0024 puso en otro lado. Con el
// reordenamiento, que la lámina no dibuja y que se conserva (V-9).
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
  // Lo disponible de cada modelo (brief-24.5.3, D-1 a D-4). Se pide después de `listModels`, que es
  // quien exige la capacidad: sin ella la pantalla ya respondió 404 y esta lectura no corre.
  const stock = await sumStockByModel(context);
  if (!stock.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_ACTION_MESSAGE} />;
  }
  const isAdmin = context.role === "admin";
  const notice = noticeMessage(query.aviso);
  const models = result.models;
  const search = (single(query.buscar) ?? "").trim();
  const activity = readModelActivity(query.estado);
  const creating = isAdmin && single(query.nuevo) === "1";

  // El filtro se resuelve acá y no en el servicio: `listModels` ya trae los modelos de la
  // organización, que son pocos —uno por familia de equipos—, y filtrarlos en SQL sería una
  // consulta nueva para recorrer una lista que ya está en memoria.
  const needle = normalizeForSuggest(search);
  const matches = (name: string, brand: string | null) =>
    needle === "" ||
    normalizeForSuggest(`${name} ${brand ?? ""}`).includes(needle);
  const shown = models.filter(
    (model) =>
      matches(model.name, model.brand) &&
      (activity === "todos" || model.isActive === (activity === "activos")),
  );
  // Primero y último son los de la lista **completa**, no los de la filtrada: la posición es
  // global, y con un filtro puesto el vecino de una fila puede ser un modelo que no se ve. Tomar
  // el índice de `shown` deshabilitaría flechas que sí mueven, y al revés.
  const first = models[0]?.id;
  const last = models[models.length - 1]?.id;
  // Con un filtro puesto, mover cambia la posición contra un vecino que puede no estar dibujado:
  // el clic no cambiaría nada visible (revisión independiente, F-7). Se deshabilita y se dice.
  const filtered = needle !== "" || activity !== "todos";

  const availableOf = (modelId: string) =>
    formatQuantity(stock.totals.get(modelId)?.quantityAvailable ?? "0.000");
  const variantsText = (count: number) =>
    count === 1 ? "1 variante" : `${count} variantes`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      {/* El encabezado va escrito acá y no con `PageHeader`: la lámina 03 pone dos acciones a la
          derecha del título y el componente compartido admite una sola, y cambiarlo alcanzaría a
          las demás pantallas, que esta subfase no toca. Las clases son las mismas. */}
      <div
        inert={creating ? true : undefined}
        className={creating ? "opacity-60" : undefined}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className={pageTitleClass}>{TITLE}</h1>
            <p className={pageSubtitleClass}>{MODELS_SUBTITLE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/modelos/atributos" className={secondaryLinkClass}>
              <Icon name="tag" className="size-4" />
              Administrar atributos
            </Link>
            {isAdmin ? (
              <Link href="/modelos?nuevo=1" className={primaryLinkClass}>
                + Nuevo modelo
              </Link>
            ) : null}
          </div>
        </div>

        <div role="status" className="mt-4 empty:hidden">
          {notice ? <ActionNotice>{notice}</ActionNotice> : null}
        </div>

        <form
          method="get"
          action="/modelos"
          className="mt-6 flex flex-wrap items-end gap-3"
        >
          <div className="flex w-full min-w-0 flex-col gap-1 sm:max-w-96">
            <label htmlFor="buscar-modelo" className="sr-only">
              Buscar modelo
            </label>
            <div className="relative">
              <SearchIcon />
              <input
                id="buscar-modelo"
                type="search"
                name="buscar"
                defaultValue={search}
                placeholder="Buscar modelo…"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="estado-modelo" className={labelClass}>
              Estado
            </label>
            <select
              id="estado-modelo"
              name="estado"
              defaultValue={activity}
              className={selectClass}
            >
              {(Object.keys(MODEL_ACTIVITY_LABEL) as ModelActivity[]).map(
                (option) => (
                  <option key={option} value={option}>
                    {MODEL_ACTIVITY_LABEL[option]}
                  </option>
                ),
              )}
            </select>
          </div>
          <button type="submit" className={secondaryButtonClass}>
            Filtrar
          </button>
        </form>

        {filtered && models.length > 0 && isAdmin ? (
          <p className="mt-3 text-sm text-muted">{REORDER_FILTERED_MESSAGE}</p>
        ) : null}

        {models.length === 0 ? (
          <EmptyState
            icon="layers"
            title={NO_MODELS_MESSAGE}
            description="Un modelo, como «iPhone 13», reúne sus variantes en una sola ficha."
            className="mt-6"
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="search"
            title={NO_MODELS_FOUND_MESSAGE}
            description="Probá con otro texto o cambiá el filtro de estado."
            className="mt-6"
          />
        ) : (
          <>
            <div
              className={`mt-6 hidden overflow-hidden md:block ${cardClass}`}
            >
              <table className="w-full border-collapse text-left text-[0.9375rem]">
                <caption className="sr-only">
                  Modelos de la organización
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Modelo
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Variantes
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Disponibles
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
                  {shown.map((model) => (
                    <tr key={model.id}>
                      {/* La marca va bajo el nombre, como en la lámina: es del modelo, no una
                          columna propia. */}
                      <td className={`${tableCellClass} font-semibold`}>
                        <Link
                          href={`/modelos/${model.id}`}
                          className={linkClass}
                        >
                          {model.name}
                        </Link>
                        <span className="block text-sm font-normal text-muted">
                          {model.brand ?? "—"}
                        </span>
                      </td>
                      <td className={`${tableCellClass} tabular-nums`}>
                        {model.productCount > 0 ? (
                          <Link
                            href={`/productos?modelo=${model.id}&actividad=todos`}
                            className={linkClass}
                          >
                            {variantsText(model.productCount)}
                          </Link>
                        ) : (
                          variantsText(0)
                        )}
                      </td>
                      <td className={`${tableCellClass} tabular-nums`}>
                        {availableOf(model.id)} disponibles
                      </td>
                      <td className={tableCellClass}>
                        <StatusBadge
                          tone={model.isActive ? "success" : "neutral"}
                          icon={model.isActive ? "circleCheck" : "circleMinus"}
                        >
                          {model.isActive ? "Activo" : "Inactivo"}
                        </StatusBadge>
                      </td>
                      {isAdmin ? (
                        <td className={tableCellClass}>
                          <MoveForm
                            kind="model"
                            id={model.id}
                            name={model.name}
                            first={model.id === first}
                            last={model.id === last}
                            disabled={filtered}
                            disabledReason={REORDER_FILTERED_MESSAGE}
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
              {shown.map((model) => (
                <li
                  key={model.id}
                  className={`${cardClass} flex flex-col gap-2 p-4`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link
                      href={`/modelos/${model.id}`}
                      className={`${linkClass} font-semibold`}
                    >
                      {model.name}
                    </Link>
                    <StatusBadge
                      tone={model.isActive ? "success" : "neutral"}
                      icon={model.isActive ? "circleCheck" : "circleMinus"}
                    >
                      {model.isActive ? "Activo" : "Inactivo"}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted">
                    {[
                      model.brand,
                      variantsText(model.productCount),
                      `${availableOf(model.id)} disponibles`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {isAdmin ? (
                    <MoveForm
                      kind="model"
                      id={model.id}
                      name={model.name}
                      first={model.id === first}
                      last={model.id === last}
                      disabled={filtered}
                      disabledReason={REORDER_FILTERED_MESSAGE}
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
      </div>

      {/* El panel de la lámina 03. Lo abre y lo cierra la URL (`?nuevo=1`), así que anda sin
          JavaScript, y el **cuerpo de la pantalla** queda `inert` mientras está abierto: no recibe
          foco ni clics.
          Lo que `inert` **no** cubre es el marco de la aplicación —la navegación lateral, la barra
          superior y, en el teléfono, la inferior—, que lo pinta el layout fuera de esta página y
          que esta subfase no edita: con el panel abierto, Tab todavía llega ahí. Por eso el panel
          **no** declara `aria-modal`, que le diría a un lector de pantalla que ese marco no existe
          (revisión independiente de la 24.5.3, F-10). Escape tampoco lo cierra, porque eso
          necesitaría JavaScript; «Cerrar» y «Cancelar» están siempre visibles. */}
      {creating ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-overlay" />
          <aside
            role="dialog"
            aria-labelledby="nuevo-modelo-titulo"
            className="relative z-10 flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-surface p-6 shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="nuevo-modelo-titulo" className={sectionTitleClass}>
                Nuevo modelo
              </h2>
              <Link
                href="/modelos"
                aria-label="Cerrar el panel"
                className={secondaryLinkClass}
              >
                <Icon name="close" className="size-4" />
              </Link>
            </div>
            <ModelForm
              mode="crear"
              cancelHref="/modelos"
              autoFocus
              className="flex-1"
            />
          </aside>
        </div>
      ) : null}
    </main>
  );
}
