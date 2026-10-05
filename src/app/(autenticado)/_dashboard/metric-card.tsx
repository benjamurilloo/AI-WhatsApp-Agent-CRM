import type { ReactNode } from "react";
import Link from "next/link";
import {
  cardClass,
  iconTileClass,
  linkClass,
  mutedTextClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { METRIC_ICON, METRIC_INFO, type MetricNumber } from "./definitions";
import {
  METRIC_ERROR_MESSAGE,
  METRIC_ERROR_RETRY,
  metricStateText,
} from "./messages";

// Tarjeta de una métrica (brief-7.4, D-2 y D-3): el marco, los tres estados y el desplegable con la
// definición. Cada tarjeta se monta por separado, así una métrica lenta o fallada no afecta a las
// demás. Desde la brief-15.1 lleva el ícono de la métrica y el nombre sin su número.

const valueClass = "text-3xl font-extrabold tracking-tight tabular-nums";
const stateClass = "text-xl font-semibold text-muted";

export function MetricCard({
  metric,
  children,
}: {
  metric: MetricNumber;
  children: ReactNode;
}) {
  const info = METRIC_INFO[metric];
  return (
    <section
      className={`${cardClass} flex h-full flex-col gap-3 p-5`}
      aria-labelledby={`metrica-${metric}`}
    >
      <div className="flex items-center gap-3">
        <span className={iconTileClass}>
          <Icon name={METRIC_ICON[metric]} />
        </span>
        <h3
          id={`metrica-${metric}`}
          className="text-sm leading-snug font-bold text-foreground"
        >
          {info.name}
        </h3>
      </div>
      <div className="flex grow flex-col gap-1">{children}</div>
      <details className="text-sm">
        <summary
          className={`${linkClass} cursor-pointer list-none marker:content-none`}
        >
          Definición
        </summary>
        <p className="mt-2 text-muted">{info.definition}</p>
      </details>
    </section>
  );
}

// Valor principal, con su detalle opcional debajo.
export function MetricValue({
  value,
  detail,
}: {
  value: string;
  detail?: ReactNode;
}) {
  return (
    <>
      <p className={valueClass}>{value}</p>
      {detail === undefined ? null : <p className={mutedTextClass}>{detail}</p>}
    </>
  );
}

// Los dos estados sin valor de RatioMetric (brief-7.3, D-2): "sin datos" es un denominador en cero
// y "no disponible" es que nadie estaba registrando el dato. Ninguno se muestra como 0, y el texto
// sale de una función pura, para que la distinción quede probada sin renderizar.
export function MetricState({ status }: { status: "no_data" | "unavailable" }) {
  const { message, hint } = metricStateText(status);
  return (
    <>
      <p className={stateClass}>{message}</p>
      <p className={mutedTextClass}>{hint}</p>
    </>
  );
}

export function MetricSkeleton() {
  return (
    <p className={stateClass} aria-hidden="true">
      ░░░░
    </p>
  );
}

// Fallo de una métrica: la tarjeta lo muestra con el identificador con el que quedó en el log, y
// las demás tarjetas siguen visibles (wireframe 02, estados).
export function MetricError({
  requestId,
  retryHref,
}: {
  requestId: string;
  retryHref: string;
}) {
  return (
    <>
      <p className="text-base font-semibold text-danger">
        {METRIC_ERROR_MESSAGE}
      </p>
      <p className={mutedTextClass}>
        Código: <code className="font-mono">{requestId}</code>
      </p>
      <p className="mt-1">
        <Link href={retryHref} className={linkClass}>
          {METRIC_ERROR_RETRY}
        </Link>
      </p>
    </>
  );
}
