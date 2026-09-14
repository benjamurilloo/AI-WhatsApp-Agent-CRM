import type { Metadata } from "next";
import { redirectIfAuthenticated } from "@/app/_auth/session";
import { AuthCard } from "@/app/_components/auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión — AI WhatsApp Agent CRM",
};

// Pantalla 1 (Screens.md §1). Un usuario autenticado no la ve.
export default async function LoginPage() {
  await redirectIfAuthenticated();
  return (
    <AuthCard title="Iniciar sesión">
      <LoginForm />
    </AuthCard>
  );
}
