import Link from "next/link";
import { getClientAccountSummary } from "@/modules/cash";
import type { AuthContext } from "@/modules/organizations";
import {
  linkClass,
  primaryLinkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { formatMoney } from "@/shared/money";

// La cuenta corriente en la ficha del cliente (brief-21.6, D-7): por moneda, lo que debe o lo que
// tiene a favor, y las señas retenidas; el estado de cuenta y, para admin, cobrar a cuenta y devolver
// el saldo a favor. Sin movimientos: son del estado de cuenta. La compone la página con cash: crm no
// depende de cash (ADR 0022, punto 13).
export async function ClientAccount({
  context,
  clientId,
}: {
  context: AuthContext;
  clientId: string;
}) {
  const result = await getClientAccountSummary(context, clientId);
  const currencies = result.ok ? result.currencies : [];
  const isAdmin = context.role === "admin";
  const hasFavor = currencies.some((row) => row.inFavor !== "0.00");
  return (
    <div className="flex flex-col gap-4">
      {currencies.length === 0 ? (
        <p className="text-sm text-muted">
          No debe nada ni tiene saldo a favor.
        </p>
      ) : (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {currencies.map((row) => {
            const money = (value: string) => formatMoney(value, row.currency);
            return (
              <div key={row.currency} className="contents">
                <dt className="text-muted">
                  {row.owed !== "0.00"
                    ? "Debe"
                    : row.inFavor !== "0.00"
                      ? "A favor"
                      : "Al día"}{" "}
                  <span className="font-mono">{row.currency}</span>
                  {row.retained !== "0.00"
                    ? ` (señas retenidas: ${money(row.retained)})`
                    : ""}
                </dt>
                <dd className="text-right font-semibold tabular-nums">
                  {row.owed !== "0.00"
                    ? money(row.owed)
                    : row.inFavor !== "0.00"
                      ? money(row.inFavor)
                      : money("0.00")}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href={`/clientes/${clientId}/cuenta`} className={linkClass}>
          Estado de cuenta
        </Link>
      </div>
      {isAdmin ? (
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/clientes/${clientId}/cobrar`}
            className={primaryLinkClass}
          >
            Cobrar a cuenta
          </Link>
          {hasFavor ? (
            <Link
              href={`/clientes/${clientId}/devolver`}
              className={secondaryLinkClass}
            >
              Devolver saldo a favor
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
