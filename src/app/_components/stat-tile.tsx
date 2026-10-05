import { Icon, type IconName } from "./icons";

// Un número con su etiqueta, como «5 conversaciones» en el detalle de un cliente (brief-15.4).
export function StatTile({
  icon,
  value,
  label,
}: {
  icon: IconName;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Icon name={icon} />
      </span>
      <p className="min-w-0">
        <span className="block text-lg font-extrabold tracking-tight tabular-nums">
          {value}
        </span>
        <span className="block text-sm text-muted">{label}</span>
      </p>
    </div>
  );
}
