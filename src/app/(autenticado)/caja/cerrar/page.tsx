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
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href="/caja" label="Volver a la caja" />
      <div className="mt-4">
        <PageHeader
          title={open ? `${TITLE} ${open.displayNumber}` : TITLE}
          subtitle="Contá el efectivo de cada moneda. Antes de cerrar vas a ver la diferencia con lo esperado."
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
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
          <p>
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
