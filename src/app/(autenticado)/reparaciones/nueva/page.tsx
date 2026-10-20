import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listModels } from "@/modules/catalog";
import { getClientsByIds } from "@/modules/crm";
import { repairsAllowed } from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import type { SearchParams } from "../filters";
import {
  ADMIN_ONLY_MESSAGE,
  NEW_SERVICE_ORDER_TITLE,
  NO_MODELS_MESSAGE,
} from "../messages";
import { ServiceOrderForm } from "./order-form";

export const metadata: Metadata = {
  title: "Nueva orden de servicio — AI WhatsApp Agent CRM",
};

// El alta de una orden de servicio (brief-29.6, D-4 y D-10): el cliente, el modelo del equipo, su IMEI
// si se tiene y lo que reporta el cliente. Solo admin. Desde la ficha de un cliente llega con
// ?cliente=<id> y el cliente ya elegido, si está activo, como el alta del pedido. Sin la capacidad
// repairs, 404.
export default async function NewServiceOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await repairsAllowed(context))) notFound();
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={NEW_SERVICE_ORDER_TITLE}
        message={ADMIN_ONLY_MESSAGE}
      />
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
  const models = await listModels(context);
  const activeModels = models.ok
    ? models.models
        .filter((model) => model.isActive)
        .map((model) => ({ id: model.id, name: model.name }))
    : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink
        href={initialClient ? `/clientes/${initialClient.id}` : "/reparaciones"}
        label={initialClient ? "Volver al cliente" : "Volver a las órdenes"}
      />
      <DetailHeader
        title={NEW_SERVICE_ORDER_TITLE}
        leading={<HeaderIcon name="wrench" />}
        subtitle={
          <p>
            La orden queda recibida. Se numera al crearla, y su comprobante de
            recepción se imprime desde el detalle.
          </p>
        }
      />
      {activeModels.length === 0 ? (
        // Un párrafo y no PageNotice, que trae su propio <main> y su <h1>.
        <SectionCard
          id="sin-modelos-titulo"
          title="Sin modelos"
          icon="wrench"
          className="mt-6"
        >
          <p className="text-sm text-muted">{NO_MODELS_MESSAGE}</p>
        </SectionCard>
      ) : (
        <SectionCard
          id="orden-titulo"
          title="El equipo y el cliente"
          icon="wrench"
          className="mt-6"
        >
          <ServiceOrderForm
            initialClient={initialClient}
            models={activeModels}
          />
        </SectionCard>
      )}
    </main>
  );
}
