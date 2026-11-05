import type { Metadata } from "next";
import { ClientStatementView } from "./statement-view";
import { parseStatementTab } from "./statement-tabs";

export const metadata: Metadata = {
  title: "Estado de cuenta — AI WhatsApp Agent CRM",
};

// La entrada por la ficha del cliente. El cuerpo es `ClientStatementView`, compartido con
// `/cuentas/[clientId]`, la entrada por Finanzas (brief-24.7.2, D-3): las dos dibujan lo mismo y
// solo cambia a dónde vuelve.
export default async function ClientStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const query = await searchParams;
  return (
    <ClientStatementView
      clientId={clientId}
      receiptParam={typeof query.cobro === "string" ? query.cobro : ""}
      back={{ href: `/clientes/${clientId}`, label: "Volver al cliente" }}
      cobrarHref={`/clientes/${clientId}/cobrar`}
      baseHref={`/clientes/${clientId}/cuenta`}
      tab={parseStatementTab(query.pestana)}
    />
  );
}
