import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

// Insignia de estado compartida (brief-24.1, D-6): un estado nunca depende solo del color, lleva
// nombre e ícono (criterios v2, §Semántica por contexto). El ícono es decorativo; el texto es el
// que leen los lectores de pantalla. Los tonos usan los tokens *-soft de hoy, que cumplen AA como
// texto (brief-23.1, H-1); cada módulo conserva el tono que ya tenía su estado.

export type StatusTone =
  "success" | "primary" | "warning" | "info" | "neutral" | "danger";

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-success-soft text-on-success-soft",
  primary: "bg-primary-soft text-on-primary-soft",
  warning: "bg-warning-soft text-on-warning-soft",
  info: "bg-tag-blue-soft text-on-tag-blue-soft",
  neutral: "bg-surface-muted text-muted",
  danger: "bg-danger-soft text-on-danger-soft",
};

export function StatusBadge({
  tone,
  icon,
  title,
  className = "",
  children,
}: {
  tone: StatusTone;
  icon: IconName;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap ${STATUS_TONE_CLASS[tone]} ${className}`}
    >
      <Icon name={icon} className="size-3.5" />
      {children}
    </span>
  );
}
