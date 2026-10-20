import type { Metadata } from "next";
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
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";
import { SaleForm } from "./sale-form";

export const metadata: Metadata = {
  title: "Nueva venta — AI WhatsApp Agent CRM",
};

const TITLE = "Nueva venta";

// Pantalla 19: la venta sin pedido, la de mostrador, solo para admin (brief-20.3, D-6; ADR 0021,
// punto 4). El límite de líneas es el del pedido.
export default async function NewSalePage() {
  const context = await requireSession();
  if (context.role !== "admin") {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/ventas" label="Volver a ventas" />
      <DetailHeader
        title={TITLE}
        leading={<HeaderIcon name="receipt" />}
        subtitle={
          <p>
            La venta se numera al emitirla y descuenta el stock disponible. No
            se puede modificar.
          </p>
        }
      />
      <SectionCard
        id="venta-titulo"
        title="Cliente y líneas"
        icon="receipt"
        className="mt-6"
      >
        <SaleForm
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
