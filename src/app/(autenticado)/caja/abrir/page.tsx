import type { Metadata } from "next";
import Link from "next/link";
import { getOpeningProposal } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { linkClass } from "@/app/_components/form-styles";
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
//
// **Desde la 24.7.1 los campos arrancan vacíos** (brief-24.7.1, D-6), y lo contado en el último
// cierre se muestra **al lado, como dato**, con «Usar estos valores».
//
// **Era una contradicción entre dos documentos aprobados**, y la resolvió el usuario: `Screens.md`
// —del brief-21.2, D-3— decía que el formulario propone lo contado al cerrar, y el README del lote
// V2-10 dice que el inicial «no se copia silenciosamente del cierre anterior». Por la jerarquía de
// fuentes de verdad ganaba el brief, pero la objeción de la v2 no era caprichosa: un campo
// prellenado con el conteo de ayer **invita a confirmar sin contar**, que es justo lo que un arqueo
// no debe permitir. Se cumplen las dos: no se copia solo, y el dato sigue a un clic.
//
// **«Usar estos valores» es un enlace y no un botón** (`?proponer=1`): rellenar campos con
// JavaScript dejaría la función rota sin él, y acá el servidor arma el formulario ya lleno.
export default async function OpenCashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const proponer =
    (Array.isArray(query.proponer) ? query.proponer[0] : query.proponer) ===
    "1";
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
          subtitle="Contá el efectivo que hay en la caja antes de empezar."
        />
      </div>
      <div className="mt-6">
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
            // Los campos arrancan vacíos salvo que se pidan los del último cierre (D-6). La moneda
            // se conserva siempre: es la lista de lo que hubo, no un importe que se dé por contado.
            proposal={
              proponer
                ? proposal.proposal
                : proposal.proposal.map((row) => ({ ...row, amount: "" }))
            }
            lastCount={proponer ? [] : proposal.proposal}
            currencies={acceptedCurrencies()}
          />
        )}
      </div>
    </main>
  );
}
