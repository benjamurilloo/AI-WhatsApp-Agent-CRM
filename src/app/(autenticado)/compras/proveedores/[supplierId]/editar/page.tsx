import type { Metadata } from "next";
import { formatCuit, getSupplier } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import {
  FORBIDDEN_PAGE_MESSAGE,
  SUPPLIER_NOT_FOUND_MESSAGE,
} from "../../messages";
import { SupplierForm } from "../../supplier-form";

export const metadata: Metadata = {
  title: "Editar proveedor — AI WhatsApp Agent CRM",
};

const TITLE = "Editar proveedor";

// Edición del proveedor (brief-22.2, D-9): el mismo formulario del alta, con los valores actuales.
// Solo admin; purchasing lo exige también al leer.
export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const context = await requireSession();
  const { supplierId } = await params;
  const found = await getSupplier(context, supplierId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={SUPPLIER_NOT_FOUND_MESSAGE}
        back={{ href: "/compras/proveedores", label: "Volver a proveedores" }}
      />
    );
  }
  const supplier = found.supplier;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink
        href={`/compras/proveedores/${supplier.id}`}
        label={`Volver a ${supplier.name}`}
      />
      <DetailHeader title={TITLE} subtitle={supplier.name} />
      <div className="mt-6">
        <SupplierForm
          mode="editar"
          supplierId={supplier.id}
          values={{
            name: supplier.name,
            phone: supplier.phone ?? "",
            email: supplier.email ?? "",
            cuit: supplier.cuit ? formatCuit(supplier.cuit) : "",
          }}
        />
      </div>
    </main>
  );
}
