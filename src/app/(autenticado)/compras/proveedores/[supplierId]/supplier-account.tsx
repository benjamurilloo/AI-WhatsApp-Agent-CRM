import Link from "next/link";
import { getSupplierAccountSummary } from "@/modules/cash";
import {
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { secondaryLinkClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { logEvent, newRequestId } from "@/shared/log";
import { formatMoney } from "@/shared/money";
import {
  ACCOUNT_RETRY_TEXT,
  ACCOUNT_UNAVAILABLE_TEXT,
  NOTHING_OWED_TEXT,
} from "./cuenta/messages";
import { ReferenceTotal } from "@/app/(autenticado)/caja/reference-total";

// La cuenta en la ficha del proveedor (brief-22.7, D-5): por moneda, lo que se le debe o lo que está
// a favor del negocio, de la misma cuenta que limita el pago; el estado de cuenta, el pago a cuenta y
// sus pagos. Sin movimientos: son del estado de cuenta. La compone la página con cash: purchasing no
// depende de cash (ADR 0023, punto 11).
// La lectura de la cuenta, con su falla contemplada (brief-24.8.2-b, V-36): si la base rechaza la
// consulta o se cae en el medio, la ficha dibuja la tarjeta 6 y el resto de la ficha sigue en pie.
// Hasta la 24.8.2-b una excepción rompía la página entera, así que la tarjeta que la lámina 17
// pide no era alcanzable: solo se veía con un rechazo de permisos, que en la ficha no puede pasar
// porque un viewer no llega hasta acá. No se devuelve un cero ni «No se le debe nada»: sería una
// afirmación de dinero falsa.
async function readAccount(
  context: AuthContext,
  supplierId: string,
): Promise<
  Awaited<ReturnType<typeof getSupplierAccountSummary>> | { ok: false }
> {
  const requestId = newRequestId();
  try {
    return await getSupplierAccountSummary(context, supplierId);
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route: "compras.proveedores.ficha.cuenta",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      error,
    });
    return { ok: false };
  }
}

export async function SupplierAccount({
  context,
  supplierId,
}: {
  context: AuthContext;
  supplierId: string;
}) {
  const [result, timeZone] = await Promise.all([
    readAccount(context, supplierId),
    getOrganizationTimezone(context),
  ]);
  const currencies = result.ok ? result.currencies : [];
  const href = `/compras/proveedores/${supplierId}`;
  return (
    <div className="flex flex-col gap-4">
      {/* Si la lectura falla, se dice eso y no «No se le debe nada»: sería una afirmación de dinero
          falsa (revisión independiente de la 22.7, R11). Desde la 24.8.2-b toma la forma de la
          tarjeta 6 de la lámina 17 (V-36), **sin** «Los datos anteriores se conservan» (H-9), y
          con «Reintentar», que es volver a pedir la misma página: anda sin JavaScript. */}
      {!result.ok ? (
        <div className="flex min-w-0 gap-3">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="font-semibold">{ACCOUNT_UNAVAILABLE_TEXT}</p>
            <p className="text-sm text-muted">{ACCOUNT_RETRY_TEXT}</p>
            <Link href={href} className={`${secondaryLinkClass} mt-3`}>
              <Icon name="undo" className="size-4" />
              Reintentar
            </Link>
          </div>
        </div>
      ) : currencies.length === 0 ? (
        <p className="text-sm text-muted">{NOTHING_OWED_TEXT}</p>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2">
          {currencies.map((row) => (
            <div key={row.currency} className="flex min-w-0 flex-col-reverse">
              <dt className="text-sm text-muted">
                {row.owed !== "0.00" ? "Se le debe" : "A favor del negocio"}{" "}
                <span className="font-mono">{row.currency}</span>
              </dt>
              <dd className="text-2xl font-bold tabular-nums">
                {formatMoney(
                  row.owed !== "0.00" ? row.owed : row.inFavor,
                  row.currency,
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {/* El total de referencia en la moneda principal (brief-29.4.3, D-6), como en la ficha del
          cliente. */}
      <ReferenceTotal
        reference={result.ok ? result.references.owed : null}
        label="Se le debe en total"
        timeZone={timeZone}
        className=""
      />
      <ReferenceTotal
        reference={result.ok ? result.references.inFavor : null}
        label="A favor del negocio en total"
        timeZone={timeZone}
        className=""
      />
      {/* «Ver estado de cuenta» es ahora la acción de la tarjeta, «Registrar pago a cuenta» la
          acción primaria del encabezado y «Ver los pagos de este proveedor» vive en «Más»
          (brief-24.8.2-b, lámina 14): los tres siguen estando, una sola vez cada uno. */}{" "}
    </div>
  );
}
