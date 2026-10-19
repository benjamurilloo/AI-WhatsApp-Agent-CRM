import type { ReferenceView } from "@/modules/cash";
import { referenceText, STALE_RATE_TEXT } from "./exchange";

// Un total de referencia en la moneda principal (ADR 0025, puntos 6 y 7; brief-29.4, D-7 y D-8): se
// muestra marcado como tal, con la cotización y su fecha, y nunca reemplaza a los montos por moneda,
// que siguen siendo lo que se cuenta y lo que se debe. Sin moneda principal o sin cotización, nada.
export function ReferenceTotal({
  reference,
  label,
  timeZone,
  className = "mt-3",
}: {
  reference: ReferenceView | null;
  label: string;
  timeZone: string;
  className?: string;
}) {
  if (!reference) return null;
  return (
    <ReferenceLine
      label={label}
      text={{ ...referenceText(reference, timeZone), stale: reference.stale }}
      className={className}
    />
  );
}

// Lo mismo, ya formateado: para un formulario del cliente, que no tiene la zona horaria.
export type ReferenceLineText = {
  total: string;
  detail: string;
  stale: boolean;
};

export function ReferenceLine({
  label,
  text,
  className = "mt-3",
}: {
  label: string;
  text: ReferenceLineText;
  className?: string;
}) {
  return (
    <div className={`${className} flex flex-col gap-1 text-sm`}>
      <p>
        <span className="font-medium">{label}:</span>{" "}
        <span className="font-semibold tabular-nums">{text.total}</span>{" "}
        <span className="text-muted">de referencia, {text.detail}.</span>
      </p>
      {text.stale ? (
        <p className="w-fit rounded-md bg-warning-soft px-2 py-1 text-on-warning-soft">
          {STALE_RATE_TEXT}
        </p>
      ) : null}
    </div>
  );
}
