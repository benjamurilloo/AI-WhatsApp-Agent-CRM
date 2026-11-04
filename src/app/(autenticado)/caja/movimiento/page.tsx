import type { Metadata } from "next";
import Link from "next/link";
import { CASH_MOVEMENT_REASONS, getCashState } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import {
  cardClass,
  linkClass,
  pageSubtitleClass,
  pageTitleClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { StatusBadge } from "@/app/_components/status-badge";
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
//
// **Desde la 24.7.1 es la lámina 03** (brief-24.7.1, D-2): se entra por un solo «Registrar
// movimiento» desde la caja, el tipo se elige acá con el conmutador, y la **revisión** va al
// costado. Sin `?tipo` se propone el aporte, que es lo que la pantalla hacía desde la 21.2.
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
  const title = "Registrar movimiento";
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
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/caja" label="Volver a la caja" />
      {/* El encabezado de la lámina 03: la sesión, no el formulario, porque es donde cae el
          movimiento y es el dato que hay que mirar antes de registrarlo.
          **Sin la hora de inicio que la lámina muestra**: formatearla exige la zona horaria de la
          organización, que esta pantalla no leía, y la condición de detención 1 del brief dice que
          una lectura nueva se pregunta antes de agregarla. La primera versión de esta subfase la
          agregó sin verlo; lo encontró la revisión independiente, comparando contra `HEAD` lo que
          yo había dado por evidente. La fecha está a un clic, en la pantalla 21. */}
      <div className="mt-4">
        <h1 className={pageTitleClass}>
          {open ? `Caja ${open.displayNumber}` : title}
        </h1>
        {open ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <StatusBadge tone="success" icon="circleCheck">
              Abierta
            </StatusBadge>
          </p>
        ) : (
          <p className={pageSubtitleClass}>
            Efectivo que entra o sale de la caja, fuera de una operación.
          </p>
        )}
      </div>
      <div className={`mt-6 ${open ? "" : `${cardClass} p-5 sm:p-6`}`}>
        {open ? (
          <MovementForm
            sessionId={open.id}
            kind={kind}
            reasons={CASH_MOVEMENT_REASONS[kind]}
            currencies={acceptedCurrencies()}
            defaultCurrency={defaultCurrency}
            expected={open.currencies.map((row) => ({
              currency: row.currency,
              expected: row.expected,
            }))}
          />
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
