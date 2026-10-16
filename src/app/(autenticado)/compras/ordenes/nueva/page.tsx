import type { Metadata } from "next";
import { getSupplier, MAX_PURCHASE_ORDER_LINES } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { acceptedCurrencies } from "@/shared/money";
import type { SearchParams } from "../filters";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";
import { PurchaseOrderForm } from "./purchase-order-form";

export const metadata: Metadata = {
  title: "Nueva orden de compra — AI WhatsApp Agent CRM",
};

const TITLE = "Nueva orden de compra";

// Monedas que se pueden elegir, con su nombre en español, como en la pantalla de costos.
function currencyOptions(): { code: string; label: string }[] {
  const names = new Intl.DisplayNames("es", { type: "currency" });
  return acceptedCurrencies().map((code) => ({
    code,
    label: `${code} — ${names.of(code) ?? code}`,
  }));
}

// El alta de una orden de compra, solo para admin (brief-22.3, D-10; ADR 0023, punto 12). Desde la
// ficha de un proveedor llega con ?proveedor=<id> y el proveedor ya elegido, si está activo; si no,
// el formulario arranca vacío y el alta lo rechazaría igual.
export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (context.role !== "admin") {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const query = await searchParams;
  const raw = Array.isArray(query.proveedor)
    ? query.proveedor[0]
    : query.proveedor;
  let initialSupplier: { id: string; name: string } | null = null;
  if (raw) {
    const found = await getSupplier(context, raw);
    if (found.ok && found.supplier.isActive) {
      initialSupplier = { id: found.supplier.id, name: found.supplier.name };
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink
        href={
          initialSupplier
            ? `/compras/proveedores/${initialSupplier.id}`
            : "/compras/ordenes"
        }
        label={
          initialSupplier ? "Volver al proveedor" : "Volver a órdenes de compra"
        }
      />
      <DetailHeader
        title={TITLE}
        leading={<HeaderIcon name="fileText" />}
        subtitle={
          <p>
            La orden queda abierta y no toca el stock ni el costo: eso lo hace
            la recepción. Se numera al crearla.
          </p>
        }
      />
      <SectionCard
        id="orden-titulo"
        title="Proveedor, moneda y líneas"
        icon="list"
        className="mt-6"
      >
        <PurchaseOrderForm
          initialSupplier={initialSupplier}
          currencies={currencyOptions()}
          maxLines={MAX_PURCHASE_ORDER_LINES}
        />
      </SectionCard>
    </main>
  );
}
