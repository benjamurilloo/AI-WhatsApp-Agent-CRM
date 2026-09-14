import type { Metadata } from "next";
import { requirePendingPasswordChange } from "@/app/_auth/session";
import { AuthCard } from "@/app/_components/auth-card";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = {
  title: "Definí tu nueva contraseña — AI WhatsApp Agent CRM",
};

// Cambio obligatorio de contraseña (wireframe 01). Solo con must_change_password en true.
export default async function ChangePasswordPage() {
  await requirePendingPasswordChange();
  return (
    <AuthCard
      title="Definí tu nueva contraseña"
      description="Tu contraseña inicial es de un solo uso."
    >
      <ChangePasswordForm />
    </AuthCard>
  );
}
