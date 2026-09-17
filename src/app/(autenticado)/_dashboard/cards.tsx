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

// Una tarjeta por métrica (brief-7.1, D-1; brief-7.4, D-2): cada componente pide su métrica, y si
// falla muestra el error en su tarjeta sin tumbar las demás. La página ya validó el período, así
// que un rechazo del servicio acá es un error inesperado y se trata como tal.

export type CardContext = {
  context: AuthContext;
  input: MetricsPeriodInput;
  retryHref: string;
};

async function Card<T>({
  metric,
  load,
  render,
  cards,
}: {
  metric: MetricNumber;
  load: (
    context: AuthContext,
    input: MetricsPeriodInput,
  ) => Promise<MetricResult<T>>;
  render: (value: T) => ReactNode;
  cards: CardContext;
}) {
  let body: ReactNode;
  try {
    const result = await load(cards.context, cards.input);
    if (!result.ok) throw new Error(`métrica ${metric}: ${result.code}`);
    body = render(result.value);
  } catch (error) {
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
    body = <MetricError requestId={requestId} retryHref={cards.retryHref} />;
  }
  return <MetricCard metric={metric}>{body}</MetricCard>;
}

export function ConversationsStartedCard(cards: CardContext) {
  return (
    <Card
      metric={1}
      cards={cards}
      load={getConversationsStarted}
      render={(value) => <MetricValue value={formatCount(value)} />}
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
    />
  );
}

export function StatusDistributionCard(cards: CardContext) {
  return (
    <Card
      metric={11}
      cards={cards}
      load={getStatusDistribution}
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
    />
  );
}
