import type { Metadata } from "next";
import Link from "next/link";
import { getOpeningProposal } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass, linkClass } from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { acceptedCurrencies } from "@/shared/money";
import { ADMIN_ONLY_MESSAGE } from "../messages";
import { OpenForm } from "./open-form";

export const metadata: Metadata = {
  title: "Abrir caja — AI WhatsApp Agent CRM",
};

const TITLE = "Abrir caja";

// Pantalla 22 (brief-21.2, D-3 y D-10): la apertura, solo admin. Si la caja ya está abierta, lo
// dice y enlaza la sesión.
export default async function OpenCashPage() {
  const context = await requireSession();
  const proposal = await getOpeningProposal(context);
  if (!proposal.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={ADMIN_ONLY_MESSAGE}
        back={{ href: "/caja", label: "Volver a la caja" }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href="/caja" label="Volver a la caja" />
      <div className="mt-4">
        <PageHeader
          title={TITLE}
          subtitle={
            // Sin cierre anterior, la moneda principal llega sin monto (brief-29.4, D-9; revisión
            // independiente, R1-6): no hay nada contado que proponer.
            proposal.proposal.some((row) => row.amount !== "")
              ? "Se propone lo que se contó al cerrar la última sesión. Corregilo si cambió."
              : "Contá el efectivo que hay en la caja antes de empezar."
          }
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {proposal.open ? (
          <p>
            La caja ya está abierta, con la sesión{" "}
            <Link href="/caja" className={`${linkClass} font-mono`}>
              {proposal.open.displayNumber}
            </Link>
            .
          </p>
        ) : (
          <OpenForm
            proposal={proposal.proposal}
            currencies={acceptedCurrencies()}
          />
        )}
      </div>
    </main>
  );
}
