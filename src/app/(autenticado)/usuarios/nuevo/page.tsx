import type { Metadata } from "next";
import { authorize } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { cardClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";
import { NewMemberForm } from "./new-member-form";

export const metadata: Metadata = {
  title: "Nuevo usuario — AI WhatsApp Agent CRM",
};

// Alta de la pantalla 10 (brief-3.7, D-6). La contraseña inicial se muestra en esta misma
// página tras crear, solo en el estado de la acción: una recarga vuelve al formulario vacío.
export default async function NewMemberPage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return (
      <PageNotice title="Nuevo usuario" message={FORBIDDEN_PAGE_MESSAGE} />
    );
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <div className={`${cardClass} p-6 sm:p-8`}>
        <NewMemberForm />
      </div>
    </main>
  );
}
