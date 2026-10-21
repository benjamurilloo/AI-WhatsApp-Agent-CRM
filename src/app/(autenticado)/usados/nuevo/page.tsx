import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientsByIds } from "@/modules/crm";
import { getTradeInForm, tradeInsAllowed } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { linkClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import type { SearchParams } from "../filters";
import {
  ADMIN_ONLY_MESSAGE,
  NEW_TRADE_IN_TITLE,
  NO_GRADES_MESSAGE,
  NO_USED_PRODUCTS_MESSAGE,
} from "../messages";
import { TradeInForm } from "./trade-in-form";

export const metadata: Metadata = {
  title: "Recibir un usado — AI WhatsApp Agent CRM",
};

// La recepción de un usado (brief-29.7, D-4 y D-7): el cliente, el producto usado al que entra el
// equipo, el IMEI, la batería, el grado, el checklist, el valor reconocido y el destino. Solo admin.
// Desde la ficha de un cliente llega con ?cliente=<id> y el cliente ya elegido, si está activo. Sin
// productos usados llevados por unidad, o sin grados activos, explica qué falta y no muestra el
// formulario. Sin la capacidad trade_ins, 404.
export default async function NewTradeInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await tradeInsAllowed(context))) notFound();
  if (context.role !== "admin") {
    return (
      <PageNotice title={NEW_TRADE_IN_TITLE} message={ADMIN_ONLY_MESSAGE} />
    );
  }
  const query = await searchParams;
  const raw = Array.isArray(query.cliente) ? query.cliente[0] : query.cliente;
  let initialClient: { id: string; name: string } | null = null;
  if (raw) {
    const found = await getClientsByIds(context, [raw]);
    const client = found.ok ? found.clients[0] : undefined;
    if (client?.isActive) {
      initialClient = { id: client.id, name: client.displayName };
    }
  }
  const form = await getTradeInForm(context);
  if (!form.ok) notFound();
  const missing =
    form.form.products.length === 0
      ? NO_USED_PRODUCTS_MESSAGE
      : form.form.grades.length === 0
        ? NO_GRADES_MESSAGE
        : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink
        href={initialClient ? `/clientes/${initialClient.id}` : "/usados"}
        label={initialClient ? "Volver al cliente" : "Volver a los usados"}
      />
      <DetailHeader
        title={NEW_TRADE_IN_TITLE}
        leading={<HeaderIcon name="smartphone" />}
        subtitle={
          <p>
            Se emite el comprobante y el equipo entra al stock como una unidad
            en revisión, con el valor reconocido como costo.
          </p>
        }
      />
      {missing ? (
        // Un párrafo y no PageNotice, que trae su propio <main> y su <h1>.
        <SectionCard
          id="falta-titulo"
          title="Falta algo para recibir un usado"
          icon="smartphone"
          className="mt-6"
        >
          <p className="text-sm text-muted">{missing}</p>
          <p className="mt-3 text-sm">
            <Link
              href={missing === NO_GRADES_MESSAGE ? "/grados" : "/productos"}
              className={linkClass}
            >
              {missing === NO_GRADES_MESSAGE ? "Ir a Grados" : "Ir a Productos"}
            </Link>
          </p>
        </SectionCard>
      ) : (
        <SectionCard
          id="usado-titulo"
          title="El equipo y el cliente"
          icon="smartphone"
          className="mt-6"
        >
          <TradeInForm initialClient={initialClient} form={form.form} />
        </SectionCard>
      )}
    </main>
  );
}
