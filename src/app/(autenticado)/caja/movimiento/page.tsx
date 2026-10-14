import type { Metadata } from "next";
import Link from "next/link";
import { CASH_MOVEMENT_REASONS, getCashState } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { acceptedCurrencies } from "@/shared/money";
import {
  ADMIN_ONLY_MESSAGE,
  FORBIDDEN_PAGE_MESSAGE,
  KIND_BY_PARAM,
} from "../messages";
import { MovementForm } from "./movement-form";

export const metadata: Metadata = {
  title: "Aporte o retiro de caja — AI WhatsApp Agent CRM",
};

type SearchParams = Record<string, string | string[] | undefined>;

// Pantalla 23 (brief-21.2, D-5 y D-10): un aporte (?tipo=aporte) o un retiro (?tipo=retiro) en la
// sesión abierta, solo admin. Un gasto no es un movimiento de caja: la lista de motivos no lo tiene.
export default async function CashMovementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const param = Array.isArray(query.tipo) ? query.tipo[0] : query.tipo;
  // Solo claves propias: «constructor» o «__proto__» no son un tipo (revisión independiente, R-8).
  const kind =
    param && Object.hasOwn(KIND_BY_PARAM, param)
      ? KIND_BY_PARAM[param]!
      : "contribution";
  const title = kind === "withdrawal" ? "Registrar retiro" : "Registrar aporte";
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={title}
        message={ADMIN_ONLY_MESSAGE}
        back={{ href: "/caja", label: "Volver a la caja" }}
      />
    );
  }
  const state = await getCashState(context);
  if (!state.ok) {
    return <PageNotice title={title} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const open = state.open;
  // Con una sola moneda en la sesión, se propone esa.
  const defaultCurrency =
    open && open.currencies.length === 1 ? open.currencies[0]!.currency : "";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href="/caja" label="Volver a la caja" />
      <div className="mt-4">
        <PageHeader
          title={title}
          subtitle={
            kind === "withdrawal"
              ? "Efectivo que sale de la caja: no puede dejar lo esperado por debajo de cero."
              : "Efectivo que entra a la caja, fuera de un cobro."
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {open ? (
          <>
            <p className="mb-4 text-sm text-muted">
              En la sesión{" "}
              <span className="font-mono">{open.displayNumber}</span>.
            </p>
            <MovementForm
              sessionId={open.id}
              kind={kind}
              reasons={CASH_MOVEMENT_REASONS[kind]}
              currencies={acceptedCurrencies()}
              defaultCurrency={defaultCurrency}
            />
          </>
        ) : (
          <p>
            La caja está cerrada.{" "}
            <Link href="/caja/abrir" className={linkClass}>
              Abrila
            </Link>{" "}
            para registrar aportes y retiros.
          </p>
        )}
      </div>
    </main>
  );
}
