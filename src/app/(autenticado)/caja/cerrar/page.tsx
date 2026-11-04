import type { Metadata } from "next";
import Link from "next/link";
import { getCashState } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { acceptedCurrencies, formatMoney } from "@/shared/money";
import { ADMIN_ONLY_MESSAGE, FORBIDDEN_PAGE_MESSAGE } from "../messages";
import { CloseForm } from "./close-form";

export const metadata: Metadata = {
  title: "Cerrar caja — AI WhatsApp Agent CRM",
};

const TITLE = "Cerrar caja";

// Pantalla 24 (brief-21.2, D-4 y D-10): el cierre de la sesión abierta, solo admin.
//
// **Desde la 24.7.1, la jerarquía de la lámina 04** (brief-24.7.1). La página pone el encabezado y
// el regreso; la forma de cada paso la pone el formulario, porque solo él sabe en cuál está.
//
// **Lo que la lámina pide y no está, dicho acá**: su subtítulo nombra quién abrió la sesión y
// cuándo. Ese dato exige la zona horaria de la organización, que esta pantalla no lee hoy, y la
// condición de detención 1 del brief dice que una lectura nueva se pregunta, no se agrega. Está a
// un clic, en la pantalla 21, que ya lo muestra.
export default async function CloseCashPage() {
  const context = await requireSession();
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={ADMIN_ONLY_MESSAGE}
        back={{ href: "/caja", label: "Volver a la caja" }}
      />
    );
  }
  const state = await getCashState(context);
  if (!state.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const open = state.open;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <BackLink href="/caja" label="Volver a la caja" />
      <div className="mt-4">
        <PageHeader
          title={open ? `${TITLE} ${open.displayNumber}` : TITLE}
          subtitle="Contá el efectivo de cada moneda. Antes de cerrar vas a ver la diferencia con lo esperado."
        />
      </div>
      <div className="mt-6">
        {open ? (
          <CloseForm
            sessionId={open.id}
            displayNumber={open.displayNumber}
            required={open.currencies.map((row) => ({
              currency: row.currency,
              expected: formatMoney(row.expected, row.currency),
            }))}
            currencies={acceptedCurrencies()}
          />
        ) : (
          <p className={`${cardClass} p-5 sm:p-6`}>
            La caja ya está cerrada.{" "}
            <Link href="/caja" className={linkClass}>
              Volver a la caja
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
