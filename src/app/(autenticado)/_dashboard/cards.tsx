import type { ReactNode } from "react";
import {
  getActiveConversations,
  getConversationsStarted,
  getFirstResponseTime,
  getIngestionErrors,
  getMessageCounts,
  getMessagesPerConversation,
  getRespondedConversations,
  getResponseCoverage,
  getStatusDistribution,
  getUniqueClients,
  type MetricResult,
  type MetricsPeriodInput,
} from "@/modules/analytics";
import type { AuthContext } from "@/modules/organizations";
import { logEvent, newRequestId } from "@/shared/log";
import { mutedTextClass } from "@/app/_components/form-styles";
import type { MetricNumber } from "./definitions";
import {
  formatCount,
  formatDecimal,
  formatMinutes,
  formatPercentage,
} from "./format";
import {
  MetricCard,
  MetricError,
  MetricState,
  MetricValue,
} from "./metric-card";
import {
  metricStateText,
  PREVIOUS_ERROR,
  STATUS_NOT_COMPARED,
} from "./messages";
import { formatCalendarDay } from "./period";
import {
  TODAY_INCOMPLETE,
  variationOf,
  type Comparable,
  type Variation,
} from "./variation";

// Una tarjeta por métrica (brief-7.1, D-1; brief-7.4, D-2): cada componente pide su métrica, y si
// falla muestra el error en su tarjeta sin tumbar las demás. La página ya validó el período, así
// que un rechazo del servicio acá es un error inesperado y se trata como tal.

export type CardContext = {
  context: AuthContext;
  input: MetricsPeriodInput;
  // El período anterior (brief-15.3, D-2), o null cuando el elegido incluye hoy: no se compara.
  previous: MetricsPeriodInput | null;
  retryHref: string;
};

function logCardError(cards: CardContext, error: unknown): string {
  const requestId = newRequestId();
  logEvent({
    level: "error",
    requestId,
    route: "/",
    code: "INTERNAL",
    userId: cards.context.userId,
    organizationId: cards.context.organizationId,
    error,
  });
  return requestId;
}

// Cómo se compara una métrica (brief-15.3, D-2): qué valor y con qué texto se nombra en «Ver
// detalles». Sin él, la tarjeta no se compara (la 11) o explica por qué con noComparison.
type Comparison<T> = {
  comparable: (value: T) => Comparable;
  summary: (value: T) => string;
};

async function Card<T>({
  metric,
  load,
  render,
  cards,
  compare,
  noComparison,
}: {
  metric: MetricNumber;
  load: (
    context: AuthContext,
    input: MetricsPeriodInput,
  ) => Promise<MetricResult<T>>;
  render: (value: T) => ReactNode;
  cards: CardContext;
  compare?: Comparison<T>;
  noComparison?: string;
}) {
  // Los dos períodos se piden juntos. El anterior es secundario: si falla, la tarjeta muestra su
  // valor y dice que no pudo comparar, en vez de mostrar el error de la métrica.
  const [current, previous] = await Promise.allSettled([
    load(cards.context, cards.input),
    compare && cards.previous
      ? load(cards.context, cards.previous)
      : Promise.resolve(null),
  ]);
  let body: ReactNode;
  let variation: Variation | undefined;
  let details: ReactNode = noComparison ? <p>{noComparison}</p> : undefined;
  try {
    if (current.status === "rejected") throw current.reason;
    const result = current.value;
    if (!result.ok) throw new Error(`métrica ${metric}: ${result.code}`);
    body = render(result.value);
    if (compare) {
      if (cards.previous === null) {
        details = <p>{TODAY_INCOMPLETE}</p>;
      } else {
        const range = `Período anterior, del ${formatCalendarDay(cards.previous.from)} al ${formatCalendarDay(cards.previous.to)}`;
        try {
          if (previous.status === "rejected") throw previous.reason;
          const before = previous.value;
          if (before === null || !before.ok) {
            throw new Error(`métrica ${metric}, período anterior`);
          }
          variation = variationOf(
            compare.comparable(result.value),
            compare.comparable(before.value),
          );
          details = (
            <p>
              {range}: {compare.summary(before.value)}
            </p>
          );
        } catch (error) {
          const requestId = logCardError(cards, error);
          variation = { status: "none", reason: PREVIOUS_ERROR };
          details = (
            <p>
              {range}: {PREVIOUS_ERROR} Código:{" "}
              <code className="font-mono">{requestId}</code>
            </p>
          );
        }
      }
    }
  } catch (error) {
    const requestId = logCardError(cards, error);
    body = <MetricError requestId={requestId} retryHref={cards.retryHref} />;
    variation = undefined;
  }
  return (
    <MetricCard metric={metric} variation={variation} details={details}>
      {body}
    </MetricCard>
  );
}

const countOf = (value: number): Comparable => ({ kind: "count", value });
const rateOf = (
  value: { status: "value"; percentage: number } | { status: string },
): Comparable =>
  "percentage" in value ? { kind: "rate", value: value.percentage } : null;
const stateText = (status: "no_data" | "unavailable") =>
  metricStateText(status).message;

// Cantidades simples (1, 2 y 7): el mismo número en la tarjeta y en «Ver detalles».
const COUNT: Comparison<number> = {
  comparable: countOf,
  summary: formatCount,
};

export function ConversationsStartedCard(cards: CardContext) {
  return (
    <Card
      metric={1}
      cards={cards}
      load={getConversationsStarted}
      render={(value) => <MetricValue value={formatCount(value)} />}
      compare={COUNT}
    />
  );
}

export function ActiveConversationsCard(cards: CardContext) {
  return (
    <Card
      metric={2}
      cards={cards}
      load={getActiveConversations}
      render={(value) => <MetricValue value={formatCount(value)} />}
      compare={COUNT}
    />
  );
}

export function UniqueClientsCard(cards: CardContext) {
  return (
    <Card
      metric={3}
      cards={cards}
      load={getUniqueClients}
      render={(value) => (
        <MetricValue
          value={formatCount(value.clients)}
          detail={`${formatCount(value.withoutClient)} sin cliente`}
        />
      )}
      compare={{
        comparable: (value) => countOf(value.clients),
        summary: (value) =>
          `${formatCount(value.clients)} (${formatCount(value.withoutClient)} sin cliente)`,
      }}
    />
  );
}

export function InboundMessagesCard(cards: CardContext) {
  return (
    <Card
      metric={4}
      cards={cards}
      load={getMessageCounts}
      render={(value) => <MetricValue value={formatCount(value.inbound)} />}
      compare={{
        comparable: (value) => countOf(value.inbound),
        summary: (value) => formatCount(value.inbound),
      }}
    />
  );
}

export function OutboundMessagesCard(cards: CardContext) {
  return (
    <Card
      metric={5}
      cards={cards}
      load={getMessageCounts}
      render={(value) => <MetricValue value={formatCount(value.outbound)} />}
      compare={{
        comparable: (value) => countOf(value.outbound),
        summary: (value) => formatCount(value.outbound),
      }}
    />
  );
}

export function MessagesPerConversationCard(cards: CardContext) {
  return (
    <Card
      metric={6}
      cards={cards}
      load={getMessagesPerConversation}
      render={(value) =>
        value.status !== "value" ? (
          <MetricState status={value.status} />
        ) : (
          <MetricValue
            value={`Prom. ${formatDecimal(value.average)}`}
            detail={`Mediana ${formatDecimal(value.median)} · ${formatCount(value.messages)} mensajes en ${formatCount(value.conversations)} conversaciones`}
          />
        )
      }
      compare={{
        comparable: (value) =>
          value.status === "value"
            ? { kind: "amount", value: value.average }
            : null,
        summary: (value) =>
          value.status === "value"
            ? `Prom. ${formatDecimal(value.average)}`
            : stateText(value.status),
      }}
    />
  );
}

export function RespondedConversationsCard(cards: CardContext) {
  return (
    <Card
      metric={7}
      cards={cards}
      load={getRespondedConversations}
      render={(value) => <MetricValue value={formatCount(value)} />}
      compare={COUNT}
    />
  );
}

export function ResponseCoverageCard(cards: CardContext) {
  return (
    <Card
      metric={8}
      cards={cards}
      load={getResponseCoverage}
      render={(value) =>
        value.status !== "value" ? (
          <MetricState status={value.status} />
        ) : (
          <MetricValue
            value={formatPercentage(value.percentage)}
            detail={`${formatCount(value.responded)} de ${formatCount(value.withInbound)} con mensajes entrantes`}
          />
        )
      }
      compare={{
        comparable: rateOf,
        summary: (value) =>
          value.status === "value"
            ? formatPercentage(value.percentage)
            : stateText(value.status),
      }}
    />
  );
}

export function FirstResponseTimeCard(cards: CardContext) {
  return (
    <Card
      metric={9}
      cards={cards}
      load={getFirstResponseTime}
      render={(value) => {
        // El conteo sin primera respuesta viaja siempre, también cuando no hay mediana
        // (brief-7.2, D-3).
        const detail = `${formatCount(value.withoutResponse)} sin primera respuesta, de ${formatCount(value.population)}`;
        return value.median.status !== "value" ? (
          <>
            <MetricState status={value.median.status} />
            <p className={mutedTextClass}>{detail}</p>
          </>
        ) : (
          <MetricValue
            value={formatMinutes(value.median.minutes)}
            detail={detail}
          />
        );
      }}
      compare={{
        comparable: (value) =>
          value.median.status === "value"
            ? { kind: "amount", value: value.median.minutes, unit: "min" }
            : null,
        summary: (value) =>
          value.median.status === "value"
            ? formatMinutes(value.median.minutes)
            : stateText(value.median.status),
      }}
    />
  );
}

export function StatusDistributionCard(cards: CardContext) {
  return (
    <Card
      metric={11}
      cards={cards}
      load={getStatusDistribution}
      noComparison={STATUS_NOT_COMPARED}
      render={(value) => (
        // Los tres estados, siempre, con 0 explícito y nombrados con texto (brief-7.2, D-4).
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base">
          {(
            [
              ["Abiertas", value.open],
              ["Pendientes", value.pending],
              ["Cerradas", value.closed],
            ] as const
          ).map(([label, count]) => (
            <div key={label} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">
                {formatCount(count)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    />
  );
}

export function IngestionErrorsCard(cards: CardContext) {
  return (
    <Card
      metric={12}
      cards={cards}
      load={getIngestionErrors}
      render={(value) => {
        if (value.status !== "value") {
          return <MetricState status={value.status} />;
        }
        return (
          <>
            <MetricValue
              value={formatPercentage(value.percentage)}
              detail={`${formatCount(value.failed)} fallidos de ${formatCount(value.total)} eventos`}
            />
            <ul className="mt-1 space-y-0.5 text-sm text-muted">
              {value.groups.map((group) => (
                <li key={`${group.source}-${group.errorCode}`}>
                  {group.source} · {group.errorCode}:{" "}
                  <span className="font-semibold tabular-nums">
                    {formatCount(group.count)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        );
      }}
      compare={{
        comparable: rateOf,
        summary: (value) =>
          value.status === "value"
            ? `${formatPercentage(value.percentage)}, ${formatCount(value.failed)} fallidos de ${formatCount(value.total)} eventos`
            : stateText(value.status),
      }}
    />
  );
}
