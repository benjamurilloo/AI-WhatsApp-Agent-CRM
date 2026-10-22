import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationTimezone } from "@/modules/organizations";
import {
  getTradeInQuoteForm,
  quoteTradeIn,
  tradeInsAllowed,
  type QuoteTradeInResult,
} from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { formatDate } from "@/app/_format/date-time";
import {
  cardClass,
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  roleBadgeClass,
  sectionTitleClass,
  selectClass,
} from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { formatMoney } from "@/shared/money";
import type { SearchParams } from "../filters";
import {
  EXAMPLE_VALUES_TEXT,
  FORBIDDEN_ACTION_MESSAGE,
  NO_USED_PRODUCTS_MESSAGE,
  QUOTE_ADMIN_ONLY_MESSAGE,
  QUOTE_FIELD_MESSAGE,
  QUOTE_LEGEND,
  QUOTE_TITLE,
  quoteUnavailableMessage,
} from "../messages";
import { TradeInsSubNav } from "../sub-nav";

export const metadata: Metadata = {
  title: "Cotizar un usado — AI WhatsApp Agent CRM",
};

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function list(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

// Los motivos que se arreglan en Usados → Configuración: los valores sueltos y el margen. El precio se
// arregla en la ficha del producto y el costo, en la lista de reparaciones.
const SETTINGS_REASONS: ReadonlySet<string> = new Set([
  "no_settings",
  "no_margin",
  "no_battery_repair_type",
  "currency_mismatch",
  "not_positive",
]);

// La cotización de un usado (ADR 0024, punto 9; brief-29.7.3, D-4 y D-5): un formulario GET con el
// producto, la batería y el checklist, y el resultado debajo. No escribe nada ni se audita, y funciona
// sin JavaScript. Los puntos llegan como ?pasa=<id>, uno por punto que pasó; ?cotizar=1 dice que se
// envió, para distinguir «ninguno pasó» de «todavía no se envió». Solo admin: el desglose deja ver
// costos y márgenes. Sin la capacidad trade_ins, 404.
export default async function QuoteTradeInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await tradeInsAllowed(context))) notFound();
  if (context.role !== "admin") {
    return (
      <PageNotice title={QUOTE_TITLE} message={QUOTE_ADMIN_ONLY_MESSAGE} />
    );
  }
  const query = await searchParams;
  const form = await getTradeInQuoteForm(context);
  if (!form.ok) {
    if (form.code === "NOT_FOUND") notFound();
    return (
      <PageNotice title={QUOTE_TITLE} message={FORBIDDEN_ACTION_MESSAGE} />
    );
  }
  const { products, checklist } = form.form;
  const submitted = single(query.cotizar) === "1";
  const productId = single(query.producto);
  const battery = single(query.bateria);
  const passed = new Set(list(query.pasa));
  const result: QuoteTradeInResult | null = submitted
    ? await quoteTradeIn(context, {
        productId,
        batteryHealth: battery,
        passed: [...passed],
      })
    : null;
  const timezone = result?.ok ? await getOrganizationTimezone(context) : null;
  const fieldError =
    result &&
    !result.ok &&
    result.code === "VALIDATION_ERROR" &&
    "fields" in result
      ? result.fields
      : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={QUOTE_TITLE}
        subtitle="Un valor orientativo para un equipo usado, a partir de su producto, su batería y su checklist. No se guarda."
      />
      <TradeInsSubNav current="cotizar" isAdmin />

      {products.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{NO_USED_PRODUCTS_MESSAGE}</p>
      ) : (
        <form
          method="get"
          action="/usados/cotizar"
          className={`mt-6 ${cardClass} flex flex-col gap-4 p-5 sm:p-6`}
        >
          <input type="hidden" name="cotizar" value="1" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="cotizar-producto" className={labelClass}>
                Producto *
              </label>
              <select
                id="cotizar-producto"
                name="producto"
                required
                defaultValue={productId}
                className={selectClass}
                aria-invalid={fieldError.includes("product") ? true : undefined}
                aria-describedby={
                  fieldError.includes("product")
                    ? "cotizar-producto-error"
                    : undefined
                }
              >
                <option value="">Elegí un producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
              {fieldError.includes("product") ? (
                <p id="cotizar-producto-error" className={fieldErrorClass}>
                  {QUOTE_FIELD_MESSAGE.product}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cotizar-bateria" className={labelClass}>
                Salud de la batería (%) *
              </label>
              <input
                id="cotizar-bateria"
                name="bateria"
                inputMode="numeric"
                required
                defaultValue={battery}
                className={`${inputClass} max-w-32`}
                aria-invalid={
                  fieldError.includes("batteryHealth") ? true : undefined
                }
                aria-describedby={
                  fieldError.includes("batteryHealth")
                    ? "cotizar-bateria-error"
                    : undefined
                }
              />
              {fieldError.includes("batteryHealth") ? (
                <p id="cotizar-bateria-error" className={fieldErrorClass}>
                  {QUOTE_FIELD_MESSAGE.batteryHealth}
                </p>
              ) : null}
            </div>
          </div>
          {checklist.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className={labelClass}>
                Checklist: marcá lo que pasa
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {checklist.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="pasa"
                      value={item.id}
                      // Antes de enviar, todo pasa: se desmarca lo que falla.
                      defaultChecked={submitted ? passed.has(item.id) : true}
                      className="mt-0.5 size-4"
                    />
                    <span>
                      {item.name}
                      {item.isMandatory ? (
                        <span className="text-muted"> (obligatorio)</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div>
            <button type="submit" className={inlineButtonClass}>
              Cotizar
            </button>
          </div>
        </form>
      )}

      {result && !(!result.ok && result.code === "VALIDATION_ERROR") ? (
        <section aria-labelledby="resultado-titulo" className="mt-8">
          <h2 id="resultado-titulo" className={sectionTitleClass}>
            Resultado
          </h2>
          {result.ok ? (
            <div className={`mt-4 ${cardClass} p-5 sm:p-6`}>
              <p className="text-sm text-muted">{result.quote.product.name}</p>
              <p className="mt-1 text-2xl font-bold">
                {result.quote.low === "0.00"
                  ? `Hasta ${formatMoney(result.quote.high, result.quote.currency)}`
                  : `${formatMoney(result.quote.low, result.quote.currency)} a ${formatMoney(result.quote.high, result.quote.currency)}`}
              </p>
              <p className="mt-2 text-sm">{QUOTE_LEGEND}</p>
              {result.quote.usesExample ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className={roleBadgeClass}>De ejemplo</span>
                  {EXAMPLE_VALUES_TEXT}
                </p>
              ) : null}
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                {/* Cada par en su div: el dl no mezcla pares sueltos con grupos (revisión, O-4). */}
                <div className="contents">
                  <dt className="font-semibold">Precio de referencia</dt>
                  <dd>
                    {formatMoney(
                      result.quote.reference.amount,
                      result.quote.currency,
                    )}{" "}
                    <span className="text-muted">
                      (precio del producto desde el{" "}
                      {formatDate(result.quote.reference.since, timezone!)})
                    </span>
                  </dd>
                </div>
                {result.quote.repairs.map((repair) => (
                  <div key={repair.name} className="contents">
                    <dt className="font-semibold">− {repair.name}</dt>
                    <dd>
                      {formatMoney(repair.cost, result.quote.currency)}{" "}
                      <span className="text-muted">
                        (
                        {[
                          ...repair.because.map((item) => `no pasó «${item}»`),
                          ...(repair.battery ? ["batería bajo el umbral"] : []),
                        ].join("; ")}
                        )
                      </span>
                    </dd>
                  </div>
                ))}
                <div className="contents">
                  <dt className="font-semibold">− Margen del modelo</dt>
                  <dd>
                    {formatMoney(result.quote.margin, result.quote.currency)}
                  </dd>
                </div>
                <div className="contents">
                  <dt className="font-semibold">Valor</dt>
                  <dd>
                    {formatMoney(result.quote.value, result.quote.currency)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-muted">
                El rango va del valor al valor menos el{" "}
                {result.quote.rangePercent
                  .replace(/\.?0+$/, "")
                  .replace(".", ",")}{" "}
                %, los dos redondeados hacia abajo a múltiplos de{" "}
                {formatMoney(result.quote.roundingStep, result.quote.currency)}.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <p className={formMessageClass}>
                {result.code === "BUSINESS_RULE_VIOLATION"
                  ? result.rule === "mandatory_failed"
                    ? `El equipo no se recibe: no pasó ${result.items.map((item) => `«${item}»`).join(", ")}, que es obligatorio.`
                    : quoteUnavailableMessage(result.rule, result.repairs)
                  : result.code === "NOT_FOUND"
                    ? "Ese producto no existe."
                    : FORBIDDEN_ACTION_MESSAGE}
              </p>
              {/* Solo cuando se arregla en la configuración (revisión, O-5). */}
              {result.code === "BUSINESS_RULE_VIOLATION" &&
              SETTINGS_REASONS.has(result.rule) ? (
                <p className="mt-3 text-sm">
                  <Link href="/usados/configuracion" className={linkClass}>
                    Ir a la configuración
                  </Link>
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
