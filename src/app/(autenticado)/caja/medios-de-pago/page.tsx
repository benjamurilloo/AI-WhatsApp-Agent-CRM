import type { Metadata } from "next";
import Link from "next/link";
import {
  INITIAL_PAYMENT_METHODS,
  listPaymentMethods,
  MAX_ACTIVE_PAYMENT_METHODS,
} from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  dangerOutlineLinkClass,
  inactiveBadgeClass,
  noticeClass,
  roleBadgeClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { CashSubNav } from "../cash-sub-nav";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_PAYMENT_METHODS_MESSAGE,
  noticeMessage,
  PAYMENT_METHOD_NOTICE,
} from "../messages";
import {
  DeactivatePaymentMethodConfirm,
  InitialPaymentMethodsForm,
  ReactivatePaymentMethodForm,
} from "./payment-method-actions";
import { PaymentMethodForm } from "./payment-method-form";

export const metadata: Metadata = {
  title: "Medios de pago — AI WhatsApp Agent CRM",
};

const TITLE = "Medios de pago";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Pantalla 27 (brief-21.2, D-6 y D-10): la lista de con qué se registra un cobro. Un admin crea,
// renombra, desactiva con confirmación y reactiva; con la lista vacía, crea la inicial. Un viewer la
// ve sin acciones. No es lo que lee el agente: eso sigue en la información del negocio (punto 10).
export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const result = await listPaymentMethods(context);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const isAdmin = context.role === "admin";
  const methods = result.paymentMethods;
  const editing = isAdmin
    ? methods.find((method) => method.id === single(query.editar))
    : undefined;
  const confirming = isAdmin
    ? methods.find(
        (method) => method.isActive && method.id === single(query.confirmar),
      )
    : undefined;
  const notice = noticeMessage(PAYMENT_METHOD_NOTICE, query.aviso);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Caja"
        subtitle="Con qué se registra cada cobro. Lo que el agente dice que aceptás sigue en la información del negocio."
      />
      <CashSubNav current="medios" />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {isAdmin && methods.length === 0 ? (
        <SectionCard
          id="lista-inicial-titulo"
          title="Empezá con la lista inicial"
          description="Cuatro medios para el día a día. Después podés renombrarlos, desactivarlos o sumar otros."
          icon="creditCard"
          className="mt-6"
        >
          <ul aria-label="Lista inicial" className="flex flex-wrap gap-2">
            {INITIAL_PAYMENT_METHODS.map((method) => (
              <li key={method.name} className={roleBadgeClass}>
                {method.name}
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <InitialPaymentMethodsForm />
          </div>
        </SectionCard>
      ) : null}

      {confirming ? (
        <div className="mt-6">
          <DeactivatePaymentMethodConfirm
            paymentMethodId={confirming.id}
            name={confirming.name}
          />
        </div>
      ) : null}

      {isAdmin ? (
        editing ? (
          <SectionCard
            id="editar-medio-titulo"
            title={`Renombrar «${editing.name}»`}
            icon="pencil"
            className="mt-6"
          >
            <PaymentMethodForm
              mode="editar"
              paymentMethodId={editing.id}
              values={{ name: editing.name, isCash: editing.isCash }}
            />
          </SectionCard>
        ) : (
          <SectionCard
            id="nuevo-medio-titulo"
            title="Nuevo medio de pago"
            description={`Hasta ${MAX_ACTIVE_PAYMENT_METHODS} activos.`}
            icon="creditCard"
            className="mt-6"
          >
            <PaymentMethodForm mode="crear" />
          </SectionCard>
        )
      ) : null}

      {methods.length === 0 ? (
        <div className={`mt-6 ${cardClass} p-6`}>
          <p>{NO_PAYMENT_METHODS_MESSAGE}</p>
        </div>
      ) : (
        <div
          className={`mt-6 overflow-x-auto ${cardClass}`}
          tabIndex={0}
          role="region"
          aria-label={TITLE}
        >
          <table className="w-full border-collapse text-left text-[0.9375rem]">
            <caption className="sr-only">{TITLE}</caption>
            <thead>
              <tr>
                <th scope="col" className={tableHeadCellClass}>
                  Medio
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Caja
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Estado
                </th>
                {isAdmin ? (
                  <th scope="col" className={tableHeadCellClass}>
                    Acciones
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {methods.map((method) => (
                <tr key={method.id}>
                  <td className={`${tableCellClass} font-semibold`}>
                    {method.name}
                  </td>
                  <td className={tableCellClass}>
                    {method.isCash
                      ? "Efectivo: entra a la caja"
                      : "No pasa por la caja"}
                  </td>
                  <td className={tableCellClass}>
                    <span
                      className={
                        method.isActive ? activeBadgeClass : inactiveBadgeClass
                      }
                    >
                      {method.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  {isAdmin ? (
                    <td className={tableCellClass}>
                      {method.isActive ? (
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/caja/medios-de-pago?editar=${method.id}`}
                            className={secondaryLinkClass}
                          >
                            <Icon name="pencil" className="size-4" />
                            Renombrar
                            <span className="sr-only"> {method.name}</span>
                          </Link>
                          <Link
                            href={`/caja/medios-de-pago?confirmar=${method.id}`}
                            className={dangerOutlineLinkClass}
                          >
                            <Icon name="power" className="size-4" />
                            Desactivar
                            <span className="sr-only"> {method.name}</span>
                          </Link>
                        </div>
                      ) : (
                        <ReactivatePaymentMethodForm
                          paymentMethodId={method.id}
                          name={method.name}
                        />
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
