import type { Metadata } from "next";
import { getClientsByIds } from "@/modules/crm";
import { MAX_ORDER_LINES } from "@/modules/orders";
import { hasCapability } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import type { SearchParams } from "../filters";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";
import { OrderForm } from "./order-form";

export const metadata: Metadata = {
  title: "Nuevo pedido — AI WhatsApp Agent CRM",
};

const TITLE = "Nuevo pedido";

// Pantalla 15: el alta de un pedido pendiente, solo para admin (brief-19.2; ADR 0020, punto 8).
// Desde la ficha de un cliente llega con ?cliente=<id> y el cliente ya elegido (D-8), si está
// activo; si no, el formulario arranca vacío y el alta lo rechazaría igual.
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (context.role !== "admin") {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink
        href={initialClient ? `/clientes/${initialClient.id}` : "/pedidos"}
        label={initialClient ? "Volver al cliente" : "Volver a pedidos"}
      />
      <DetailHeader
        title={TITLE}
        leading={<HeaderIcon name="list" />}
        subtitle={
          <p>
            El pedido queda pendiente y no toca el stock. Se numera al crearlo.
          </p>
        }
      />
      <SectionCard
        id="pedido-titulo"
        title="Cliente y líneas"
        icon="list"
        className="mt-6"
      >
        <OrderForm
          initialClient={initialClient}
          maxLines={MAX_ORDER_LINES}
          unitsEnabled={await hasCapability(
            context.organizationId,
            "serialized_units",
          )}
        />
      </SectionCard>
    </main>
  );
}
