import Link from "next/link";
import { getClientStatement } from "@/modules/cash";
import type { AuthContext } from "@/modules/organizations";
import {
  cardClass,
  linkClass,
  primaryLinkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import { formatMoney } from "@/shared/money";
import { ReferenceTotal } from "@/app/(autenticado)/caja/reference-total";
import { StatementBody } from "./account-statement";
import { IMPUTATION_NOTE } from "./cuenta/messages";
import { clientTabHref } from "./tabs";

// La pestaña Cuenta corriente de la ficha (brief-24.4.1, D-4; mockup 05): con más de una moneda, un
// selector, porque ARS y USD no se suman; los indicadores de la moneda elegida; y el estado de cuenta
// de /cuenta, el mismo componente, sin saldo corrido ni saldo inicial del período (H-2). Para un
// admin, «Registrar cobro» lleva a /cobrar como antes, y «Devolver saldo a favor» aparece si hay; el
// panel lateral de 05 es de la 24.7.2 (H-4). Los dos roles la ven, como la página de hoy.

const tileClass = `${cardClass} flex items-start gap-3 p-4 sm:p-5`;

function Tile({
  icon,
  tone,
  label,
  value,
}: {
  icon: IconName;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className={tileClass}>
      <span
        aria-hidden="true"
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}
      >
        <Icon name={icon} />
      </span>
      <p className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </span>
      </p>
    </div>
  );
}

export async function AccountTab({
  context,
  clientId,
  timeZone,
  currencyParam,
}: {
  context: AuthContext;
  clientId: string;
  timeZone: string;
  currencyParam: string | undefined;
}) {
  const found = await getClientStatement(context, clientId);
  if (!found.ok) {
    // Un error no se muestra como saldo cero (mockup 08, panel 06).
    return (
      <section
        aria-labelledby="cuenta-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6`}
      >
        <h2 id="cuenta-titulo" className="text-xl font-bold tracking-tight">
          Cuenta corriente
        </h2>
        <p className="mt-3">No pudimos cargar la cuenta corriente.</p>
        <p className="text-sm text-muted">El saldo no está disponible.</p>
      </section>
    );
  }
  const { statement } = found;
  const currencies = statement.currencies.map((row) => row.currency);
  const currency =
    currencies.find((code) => code === currencyParam) ?? currencies[0] ?? null;
  const selected = statement.currencies.find(
    (row) => row.currency === currency,
  );
  const isAdmin = context.role === "admin";
  const hasFavor = statement.currencies.some((row) => row.inFavor !== "0.00");
  const tabHref = clientTabHref(clientId, "cuenta");

  return (
    <section
      aria-labelledby="cuenta-titulo"
      className={`mt-6 ${cardClass} p-5 sm:p-6`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cuenta-titulo" className="text-xl font-bold tracking-tight">
          Cuenta corriente
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {currencies.length > 1 ? (
            <nav aria-label="Moneda de la cuenta">
              <ul className="flex rounded-xl border border-border bg-surface-muted p-1">
                {currencies.map((code) => (
                  <li key={code}>
                    <Link
                      href={`${tabHref}&moneda=${code}`}
                      aria-current={code === currency ? "page" : undefined}
                      className={`inline-flex min-h-10 items-center rounded-lg px-4 font-mono text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                        code === currency
                          ? "bg-primary text-on-primary"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {code}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {isAdmin ? (
            <>
              {hasFavor ? (
                <Link
                  href={`/clientes/${clientId}/devolver`}
                  className={secondaryLinkClass}
                >
                  Devolver saldo a favor
                </Link>
              ) : null}
              <Link
                href={`/clientes/${clientId}/cobrar`}
                className={primaryLinkClass}
              >
                Registrar cobro
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* Con moneda principal, el total de referencia de las monedas juntas (brief-29.4, D-8). */}
      <ReferenceTotal
        reference={statement.references.owed}
        label="Debe en total"
        timeZone={timeZone}
        className="mt-4"
      />
      <ReferenceTotal
        reference={statement.references.inFavor}
        label="A favor en total"
        timeZone={timeZone}
        className="mt-2"
      />

      {selected ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Tile
            icon="creditCard"
            tone="bg-primary-soft text-primary"
            label={
              selected.balance.side === "favor" ? "A favor" : "Saldo pendiente"
            }
            value={formatMoney(
              selected.balance.side === "zero"
                ? "0.00"
                : selected.balance.amount,
              selected.currency,
            )}
          />
          <Tile
            icon="trendingUp"
            tone="bg-danger-soft text-on-danger-soft"
            label="Debe (ventas vigentes)"
            value={formatMoney(selected.debit, selected.currency)}
          />
          <Tile
            icon="banknote"
            tone="bg-success-soft text-on-success-soft"
            label="Haber (cobros menos devoluciones)"
            value={formatMoney(selected.credit, selected.currency)}
          />
        </div>
      ) : null}

      <StatementBody
        statement={statement}
        timeZone={timeZone}
        currency={currency}
      />

      <p className="mt-6 flex items-start gap-2 text-sm text-muted">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        <span>
          {currencies.length > 1
            ? "Los saldos de cada moneda se consultan por separado. "
            : ""}
          {IMPUTATION_NOTE}
        </span>
      </p>
      <p className="mt-2 text-sm">
        <Link href={`/clientes/${clientId}/cuenta`} className={linkClass}>
          Estado de cuenta para imprimir
        </Link>
      </p>
    </section>
  );
}
