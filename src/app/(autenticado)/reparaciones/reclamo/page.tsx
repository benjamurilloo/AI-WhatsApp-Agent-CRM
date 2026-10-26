import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWarrantyClaimForm, repairsAllowed } from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import { warrantyText } from "@/app/(autenticado)/_warranty/warranty-text";
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
  claimFormMessage,
  NEW_WARRANTY_CLAIM_TITLE,
} from "../messages";
import { WarrantyClaimForm } from "./claim-form";

export const metadata: Metadata = {
  title: "Nuevo reclamo de garantía — AI WhatsApp Agent CRM",
};

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// El alta de un reclamo de garantía (brief-29.9.2, D-1 y D-5). Llega desde «Equipos comprados» de la
// ficha del cliente, con ?unidad=<id>&cliente=<id>, o desde una reparación entregada, con ?orden=<id>.
// Muestra el equipo, el cliente y la garantía, y pide lo que reporta el cliente. Solo admin; sin la
// capacidad repairs, 404. Si el equipo no se puede reclamar, lo dice en lugar del formulario.
export default async function NewWarrantyClaimPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await repairsAllowed(context))) notFound();
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={NEW_WARRANTY_CLAIM_TITLE}
        message={ADMIN_ONLY_MESSAGE}
      />
    );
  }
  const query = await searchParams;
  const unitId = single(query.unidad);
  const target:
    { unitId: string; clientId: string } | { serviceOrderId: string } =
    unitId !== ""
      ? { unitId, clientId: single(query.cliente) }
      : { serviceOrderId: single(query.orden) };
  const back =
    "unitId" in target
      ? `/clientes/${encodeURIComponent(target.clientId)}`
      : `/reparaciones/${encodeURIComponent(target.serviceOrderId)}`;
  const found = await getWarrantyClaimForm(context, target);
  if (!found.ok) {
    return (
      <PageNotice
        title={NEW_WARRANTY_CLAIM_TITLE}
        message={claimFormMessage(found)}
        back={{ href: back, label: "Volver" }}
      />
    );
  }
  const { form } = found;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink
        href={back}
        label={"unitId" in target ? "Volver al cliente" : "Volver a la orden"}
      />
      <DetailHeader
        title={NEW_WARRANTY_CLAIM_TITLE}
        leading={<HeaderIcon name="wrench" />}
        subtitle={
          <p>
            El reclamo queda recibido. Se manda al técnico, se repara y se
            entrega sin cobrarle al cliente.
          </p>
        }
      />
      <SectionCard
        id="reclamo-equipo-titulo"
        title="El equipo"
        icon="wrench"
        className="mt-6"
      >
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-muted">Equipo</dt>
            <dd className="font-semibold">{form.description}</dd>
          </div>
          <div>
            <dt className="text-muted">Cliente</dt>
            <dd>{form.clientName}</dd>
          </div>
          {form.warranty ? (
            <div>
              <dt className="text-muted">Garantía</dt>
              <dd>{warrantyText(form.warranty)}</dd>
            </div>
          ) : null}
        </dl>
      </SectionCard>
      <SectionCard
        id="reclamo-titulo"
        title="El reclamo"
        icon="wrench"
        className="mt-6"
      >
        {form.warranty?.status === "in_warranty" ? (
          <WarrantyClaimForm target={target} back={back} />
        ) : (
          <p className="text-sm">
            {claimFormMessage({
              ok: false,
              code: "BUSINESS_RULE_VIOLATION",
              rule: "not_in_warranty",
            })}
          </p>
        )}
      </SectionCard>
    </main>
  );
}
