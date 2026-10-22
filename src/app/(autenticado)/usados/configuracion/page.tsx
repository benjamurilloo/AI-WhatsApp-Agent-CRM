import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getQuoteSettingsForm,
  listTradeInMargins,
  tradeInsAllowed,
} from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  cardClass,
  inactiveBadgeClass,
  roleBadgeClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import type { SearchParams } from "../filters";
import {
  FORBIDDEN_ACTION_MESSAGE,
  QUOTE_ADMIN_ONLY_MESSAGE,
  SETTINGS_TITLE,
  noticeMessage,
} from "../messages";
import { TradeInsSubNav } from "../sub-nav";
import { MarginForm, QuoteSettingsForm } from "./forms";

export const metadata: Metadata = {
  title: "Configuración de la cotización — AI WhatsApp Agent CRM",
};

// Un decimal de la base («10.00», «7.50») como se escribe en un campo: «10», «7,5».
function decimalInput(value: string): string {
  return value.replace(/\.?0+$/, "").replace(".", ",");
}

// La configuración de la cotización de un usado (ADR 0024, puntos 9 y 13; brief-29.7.3, D-1, D-2 y
// D-5): los valores sueltos y el margen de cada modelo. Solo admin: los dos dejan ver lo que el negocio
// se guarda. Sin la capacidad trade_ins, 404.
export default async function QuoteSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await tradeInsAllowed(context))) notFound();
  if (context.role !== "admin") {
    return (
      <PageNotice title={SETTINGS_TITLE} message={QUOTE_ADMIN_ONLY_MESSAGE} />
    );
  }
  const query = await searchParams;
  const [form, margins] = await Promise.all([
    getQuoteSettingsForm(context),
    listTradeInMargins(context),
  ]);
  if (!form.ok || !margins.ok) {
    if (
      (!form.ok && form.code === "NOT_FOUND") ||
      (!margins.ok && margins.code === "NOT_FOUND")
    ) {
      notFound();
    }
    return (
      <PageNotice title={SETTINGS_TITLE} message={FORBIDDEN_ACTION_MESSAGE} />
    );
  }
  const { settings, repairTypes, currencies, mainCurrency } = form.form;
  const defaultCurrency =
    settings?.roundingCurrency ?? mainCurrency ?? currencies[0] ?? "USD";
  const notice = noticeMessage(query.aviso);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={SETTINGS_TITLE}
        subtitle="Lo que usa la cotización de un usado: el precio del producto, menos el costo de cada reparación que necesita y el margen del modelo."
      />
      <TradeInsSubNav current="configuracion" isAdmin />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <section aria-labelledby="valores-titulo" className="mt-6">
        <h2
          id="valores-titulo"
          className={`${sectionTitleClass} flex flex-wrap items-center gap-2`}
        >
          Valores
          {settings?.isExample ? (
            <span className={roleBadgeClass}>De ejemplo</span>
          ) : null}
        </h2>
        {settings === null ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no hay valores: sin ellos no hay cotización.
          </p>
        ) : null}
        <div className={`mt-4 ${cardClass} p-5 sm:p-6`}>
          <QuoteSettingsForm
            values={{
              batteryThreshold: settings
                ? String(settings.batteryThreshold)
                : "",
              rangePercent: settings ? decimalInput(settings.rangePercent) : "",
              roundingStep: settings ? decimalInput(settings.roundingStep) : "",
              roundingCurrency: defaultCurrency,
              batteryRepairTypeId: settings?.batteryRepairTypeId ?? "",
            }}
            repairTypes={repairTypes.length > 0 ? repairTypes : null}
            currencies={currencies}
          />
        </div>
      </section>

      <section aria-labelledby="margenes-titulo" id="margenes" className="mt-8">
        <h2 id="margenes-titulo" className={sectionTitleClass}>
          Márgenes por modelo
        </h2>
        <p className="mt-2 text-sm text-muted">
          Lo que el negocio se guarda al comprar un usado de cada modelo. Un
          modelo sin margen no se cotiza; cero también es un margen.
        </p>
        {margins.margins.length === 0 ? (
          <EmptyState
            icon="smartphone"
            title="Todavía no hay modelos."
            description="Los modelos se cargan en Productos → Modelos."
            className="mt-4"
          />
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {margins.margins.map((row) => (
              <li key={row.modelId} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.modelName}</span>
                  {row.isActive ? null : (
                    <span className={inactiveBadgeClass}>Inactivo</span>
                  )}
                  <span className="text-sm text-muted">
                    {row.margin
                      ? `Margen: ${formatMoney(row.margin.amount, row.margin.currency)}`
                      : "Sin margen: no se cotiza."}
                  </span>
                </p>
                <div className="mt-3">
                  <MarginForm
                    modelId={row.modelId}
                    modelName={row.modelName}
                    amount={row.margin ? decimalInput(row.margin.amount) : ""}
                    currency={row.margin?.currency ?? defaultCurrency}
                    currencies={currencies}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
