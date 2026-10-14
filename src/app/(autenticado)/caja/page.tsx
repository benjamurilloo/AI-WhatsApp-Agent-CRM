import type { Metadata } from "next";
import Link from "next/link";
import { getCashState } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  dangerOutlineLinkClass,
  linkClass,
  noticeClass,
  primaryLinkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { CashSubNav } from "./cash-sub-nav";
import {
  CASH_NOTICE,
  FORBIDDEN_PAGE_MESSAGE,
  noticeMessage,
  UNKNOWN_MEMBER_TEXT,
} from "./messages";
import {
  CurrencyTotalsTable,
  MovementsTable,
  SessionReceiptsTable,
} from "./session-tables";

export const metadata: Metadata = {
  title: "Caja — AI WhatsApp Agent CRM",
};

const TITLE = "Caja";

type SearchParams = Record<string, string | string[] | undefined>;

// Pantalla 21 (brief-21.2, D-10): el estado de la caja del efectivo. Abierta, su sesión con lo
// esperado por moneda y sus movimientos; admin registra aportes y retiros y la cierra. Cerrada, el
// enlace a la última sesión y, para admin, «Abrir caja». Un viewer ve lo mismo sin acciones. Desde
// la 21.3, los cobros en efectivo de la sesión, que suman a lo esperado (brief-21.3, D-5).
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const state = await getCashState(context);
  if (!state.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const isAdmin = context.role === "admin";
  const timeZone = await getOrganizationTimezone(context);
  const notice = noticeMessage(CASH_NOTICE, query.aviso);
  const open = state.open;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title={TITLE}
        subtitle="El efectivo del negocio, por sesiones: se abre con lo que hay, se registran aportes y retiros, y se cierra contando."
      />
      <CashSubNav current="caja" />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {open ? (
        <>
          <SectionCard
            id="sesion-abierta-titulo"
            title={`Caja abierta · ${open.displayNumber}`}
            description={`Abierta por ${open.openedByName ?? UNKNOWN_MEMBER_TEXT} el ${formatShortDateTime(open.openedAt, timeZone)}.`}
            icon="banknote"
            className="mt-6"
          >
            <CurrencyTotalsTable session={open} />
            {isAdmin ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/caja/movimiento?tipo=aporte"
                  className={secondaryLinkClass}
                >
                  <Icon name="plus" className="size-4" />
                  Registrar aporte
                </Link>
                <Link
                  href="/caja/movimiento?tipo=retiro"
                  className={secondaryLinkClass}
                >
                  <Icon name="undo" className="size-4" />
                  Registrar retiro
                </Link>
                <Link href="/caja/cerrar" className={dangerOutlineLinkClass}>
                  <Icon name="lock" className="size-4" />
                  Cerrar caja
                </Link>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            id="cobros-titulo"
            title="Cobros en efectivo"
            icon="receipt"
            className="mt-6"
          >
            <SessionReceiptsTable session={open} timeZone={timeZone} />
          </SectionCard>

          <SectionCard
            id="movimientos-titulo"
            title="Aportes y retiros"
            icon="list"
            className="mt-6"
          >
            <MovementsTable session={open} timeZone={timeZone} />
          </SectionCard>
        </>
      ) : (
        <div className={`mt-6 ${cardClass} flex flex-col gap-4 p-6`}>
          <p className="font-semibold">La caja está cerrada.</p>
          {state.last ? (
            <p className="text-sm">
              La última sesión fue{" "}
              <Link
                href={`/caja/sesiones/${state.last.id}`}
                className={`${linkClass} font-mono`}
              >
                {state.last.displayNumber}
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-muted">Todavía no se abrió nunca.</p>
          )}
          {isAdmin ? (
            <div>
              <Link href="/caja/abrir" className={primaryLinkClass}>
                <Icon name="banknote" className="size-4" />
                Abrir caja
              </Link>
            </div>
          ) : null}
        </div>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
