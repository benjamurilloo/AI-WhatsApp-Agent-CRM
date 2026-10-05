import { setThemeAction } from "@/app/_theme/actions";
import { THEME_LABELS, THEMES, type Theme } from "@/app/_theme/theme";
import { Icon, type IconName } from "./icons";

const THEME_ICONS: Record<Theme, IconName> = {
  system: "monitor",
  light: "sun",
  dark: "moon",
};

// Selector de tema del marco común (brief-4.0, D-4), con íconos (brief-15.1, D-6). Cada opción
// envía el formulario, así que funciona sin JavaScript; el nombre accesible sigue siendo la
// etiqueta de siempre y aria-pressed marca la preferencia vigente.
export function ThemeSelector({ current }: { current: Theme }) {
  return (
    <form action={setThemeAction}>
      <div
        role="group"
        aria-label="Tema"
        className="inline-flex gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5"
      >
        {THEMES.map((theme) => {
          const pressed = theme === current;
          return (
            <button
              key={theme}
              type="submit"
              name="theme"
              value={theme}
              aria-pressed={pressed}
              aria-label={THEME_LABELS[theme]}
              title={THEME_LABELS[theme]}
              className={`grid size-8 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                pressed
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon name={THEME_ICONS[theme]} className="size-4" />
            </button>
          );
        })}
      </div>
    </form>
  );
}
