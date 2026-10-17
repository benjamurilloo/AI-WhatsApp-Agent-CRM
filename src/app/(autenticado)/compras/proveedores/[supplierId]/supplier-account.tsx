import Link from "next/link";
import { getSupplierAccountSummary } from "@/modules/cash";
import type { AuthContext } from "@/modules/organizations";
import { linkClass, primaryLinkClass } from "@/app/_components/form-styles";
import { formatMoney } from "@/shared/money";
import { ACCOUNT_UNAVAILABLE_TEXT, NOTHING_OWED_TEXT } from "./cuenta/messages";

// La cuenta en la ficha del proveedor (brief-22.7, D-5): por moneda, lo que se le debe o lo que está
// a favor del negocio, de la misma cuenta que limita el pago; el estado de cuenta, el pago a cuenta y
// sus pagos. Sin movimientos: son del estado de cuenta. La compone la página con cash: purchasing no
// depende de cash (ADR 0023, punto 11).
export async function SupplierAccount({
  context,
  supplierId,
}: {
  context: AuthContext;
  supplierId: string;
}) {
  const result = await getSupplierAccountSummary(context, supplierId);
  const currencies = result.ok ? result.currencies : [];
  const href = `/compras/proveedores/${supplierId}`;
  return (
    <div className="flex flex-col gap-4">
      {/* Si la lectura falla, se dice eso y no «No se le debe nada»: sería una afirmación de dinero
          falsa (revisión independiente de la 22.7, R11). */}
      {!result.ok ? (
        <p className="text-sm text-muted">{ACCOUNT_UNAVAILABLE_TEXT}</p>
      ) : currencies.length === 0 ? (
        <p className="text-sm text-muted">{NOTHING_OWED_TEXT}</p>
      ) : (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {currencies.map((row) => (
            <div key={row.currency} className="contents">
              <dt className="text-muted">
                {row.owed !== "0.00" ? "Se le debe" : "A favor del negocio"}{" "}
                <span className="font-mono">{row.currency}</span>
              </dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatMoney(
                  row.owed !== "0.00" ? row.owed : row.inFavor,
                  row.currency,
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href={`${href}/cuenta`} className={linkClass}>
          Estado de cuenta
        </Link>
        <Link
          href={`/compras/pagos?proveedor=${supplierId}`}
          className={linkClass}
        >
          Ver los pagos de este proveedor
        </Link>
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={`${href}/pagar`} className={primaryLinkClass}>
          Pago a cuenta
        </Link>
      </div>
    </div>
  );
}
