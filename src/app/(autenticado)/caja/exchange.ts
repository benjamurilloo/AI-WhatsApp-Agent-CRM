import type { ExchangeOffer, ReferenceView } from "@/modules/cash";
import {
  exchangeRateFromDatabase,
  formatExchangeRate,
  formatMoney,
} from "@/shared/money";
import { formatShortDateTime } from "@/app/_format/date-time";

// Recibir en la otra moneda de la organización (ADR 0025, punto 5; brief-29.4, D-6), del lado del
// servidor: cada página de un cobro arma con esto lo que necesita el formulario, ya formateado. La
// moneda que entra se elige con un enlace (?moneda=ARS), para que el formulario siga funcionando sin
// JavaScript: el servidor lo vuelve a armar con el monto propuesto en esa moneda.

export const STALE_RATE_TEXT =
  "Esta cotización tiene más de 24 horas hábiles. Revisala o escribí una acordada.";
export const NO_RATE_TEXT =
  "No hay una cotización cargada: sin ella no se cobra en la otra moneda. Cargala en Caja → Cotización.";
export const NO_RATE_OUTGOING_TEXT =
  "No hay una cotización cargada: sin ella no sale plata en la otra moneda. Cargala en Caja → Cotización.";

// La fuente de una cotización, abreviada para las pantallas que la usan. La completa, con la
// atribución, está en Caja → Cotización.
export function rateSourceText(automatic: boolean): string {
  return automatic ? "DolarAPI + ajuste" : "carga manual";
}

export type ExchangeRateLabel = {
  id: string;
  // Con la escala de la base, para convertir en el navegador.
  value: string;
  // «1 USD = ARS 1.565,00»
  label: string;
  // «18/10/2026 15:30, carga manual» o «…, DolarAPI + ajuste»: su fecha y su fuente (ADR 0025,
  // punto 4).
  recordedLabel: string;
  stale: boolean;
};

// El movimiento: un cobro, donde la plata entra, o una devolución o un pago a un proveedor, donde sale
// (brief-29.4.3, D-7). Cambian solo los textos.
export type ExchangeMovement = "receipt" | "refund" | "payment";

const MOVEMENT_TEXT: Record<
  ExchangeMovement,
  { outgoing: boolean; forThis: string }
> = {
  receipt: { outgoing: false, forThis: "este cobro" },
  refund: { outgoing: true, forThis: "esta devolución" },
  payment: { outgoing: true, forThis: "este pago" },
};

export type ReceiptExchangeProps = {
  // La moneda que entra o sale: la del destino o la otra.
  tendered: string;
  // «Moneda que entra» o «Moneda que sale», y «para este cobro» o «para esta devolución».
  outgoing: boolean;
  forThis: string;
  mainCurrency: string;
  choices: { currency: string; href: string; selected: boolean }[];
  rate: ExchangeRateLabel | null;
  // Lo que falta en la moneda que entra, como se escribe en el campo.
  proposed: string;
  // «Faltan USD 100,00 = ARS 156.500,00», solo con la otra moneda y una vigente.
  equivalence: string | null;
};

export function rateLabel(
  rate: NonNullable<ExchangeOffer["rate"]>,
  mainCurrency: string,
  quoteCurrency: string,
  timezone: string,
): ExchangeRateLabel {
  return {
    id: rate.id,
    value: rate.value,
    label: `1 ${mainCurrency} = ${quoteCurrency} ${formatExchangeRate(
      exchangeRateFromDatabase(rate.value),
    )}`,
    recordedLabel: `${formatShortDateTime(rate.recordedAt, timezone)}, ${rateSourceText(rate.automatic)}`,
    stale: rate.stale,
  };
}

export function receiptExchange(input: {
  offer: ExchangeOffer | null;
  targetCurrency: string;
  // Lo que falta en la moneda del destino: con la escala de la base y como se escribe.
  outstanding: string;
  outstandingInput: string;
  // ?moneda= de la página.
  chosen: string | undefined;
  basePath: string;
  timezone: string;
  // Un cobro, si no se dice otra cosa, y cómo se nombra lo que falta: «Faltan», «A favor».
  movement?: ExchangeMovement;
  outstandingLabel?: string;
}): ReceiptExchangeProps | null {
  const { offer, targetCurrency } = input;
  if (!offer) return null;
  const other = offer.currency;
  const tendered = input.chosen === other ? other : targetCurrency;
  const quoteCurrency =
    offer.mainCurrency === targetCurrency ? other : targetCurrency;
  return {
    tendered,
    ...MOVEMENT_TEXT[input.movement ?? "receipt"],
    mainCurrency: offer.mainCurrency,
    choices: [targetCurrency, other].map((currency) => ({
      currency,
      href:
        currency === targetCurrency
          ? input.basePath
          : `${input.basePath}?moneda=${currency}`,
      selected: currency === tendered,
    })),
    rate: offer.rate
      ? rateLabel(offer.rate, offer.mainCurrency, quoteCurrency, input.timezone)
      : null,
    proposed:
      tendered === targetCurrency
        ? input.outstandingInput
        : (offer.outstandingInput ?? ""),
    equivalence:
      tendered !== targetCurrency && offer.outstanding !== null
        ? `${input.outstandingLabel ?? "Faltan"} ${formatMoney(input.outstanding, targetCurrency)} = ${formatMoney(
            offer.outstanding,
            other,
          )}`
        : null,
  };
}

// Un total de referencia, para mostrar: «USD 1.234,50 de referencia, a 1 USD = ARS 1.565,00 del
// 18/10/2026 15:30». Las monedas sin convertir se nombran aparte.
export function referenceText(
  reference: ReferenceView,
  timezone: string,
): { total: string; detail: string } {
  const rate = formatExchangeRate(exchangeRateFromDatabase(reference.rate));
  const parts = [
    `a 1 ${reference.currency} = ${reference.quoteCurrency} ${rate}`,
    `cotización del ${formatShortDateTime(reference.rateRecordedAt, timezone)}, ${rateSourceText(reference.rateAutomatic)}`,
  ];
  if (reference.unconverted.length > 0) {
    parts.push(`sin convertir: ${reference.unconverted.join(", ")}`);
  }
  return {
    total: formatMoney(reference.total, reference.currency),
    detail: parts.join(", "),
  };
}

// Lo que entró por un cobro en otra moneda, para mostrar junto a lo aplicado (brief-29.4, D-6):
// «Entraron ARS 156.500,00 a 1.565,00», con «acordada» si la cotización fue solo para ese cobro.
// Desde la 29.4.3, «Salieron …» en una devolución o un pago (brief-29.4.3, D-7).
export function tenderNote(
  tender: {
    currency: string;
    amount: string;
    exchangeRate: string;
    negotiated: boolean;
  },
  outgoing = false,
): string {
  const rate = formatExchangeRate(
    exchangeRateFromDatabase(tender.exchangeRate),
  );
  return `${outgoing ? "Salieron" : "Entraron"} ${formatMoney(tender.amount, tender.currency)} a ${rate}${
    tender.negotiated ? " (acordada)" : ""
  }`;
}
