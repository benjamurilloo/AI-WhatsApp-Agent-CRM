import type { Metadata } from "next";
import { ClientStatementView } from "@/app/(autenticado)/clientes/[clientId]/cuenta/statement-view";

export const metadata: Metadata = {
  title: "Estado de cuenta — AI WhatsApp Agent CRM",
};

// La entrada por Finanzas (brief-24.7.2, D-3), la de la miga «Finanzas › Cuentas de clientes ›
// {cliente}» de la lámina 02. **Es la misma vista** que `/clientes/[id]/cuenta`: no hay una
// segunda implementación del estado de cuenta, que es justo lo que el README del lote pide evitar
// («no se crean cuentas duplicadas»). Lo único distinto es a dónde vuelve.
export default async function AccountStatementPage({
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
      back={{ href: "/cuentas", label: "Volver a cuentas de clientes" }}
      cobrarHref={`/clientes/${clientId}/cobrar?desde=finanzas`}
    />
  );
}
