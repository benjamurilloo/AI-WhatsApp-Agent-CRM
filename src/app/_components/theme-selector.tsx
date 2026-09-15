import { setThemeAction } from "@/app/_theme/actions";
import { THEME_LABELS, THEMES, type Theme } from "@/app/_theme/theme";

// Selector de tema del marco común (brief-4.0, D-4). Cada opción envía el formulario, así que
// funciona sin JavaScript; aria-pressed marca la preferencia vigente.
export function ThemeSelector({ current }: { current: Theme }) {
  return (
    <form action={setThemeAction}>
      <div
        role="group"
        aria-label="Tema"
        className="inline-flex overflow-hidden rounded-md border border-border-strong bg-surface"
      >
        {THEMES.map((theme, index) => {
          const pressed = theme === current;
          return (
            <button
              key={theme}
              type="submit"
              name="theme"
              value={theme}
              aria-pressed={pressed}
              className={`px-2.5 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                index > 0 ? "border-l border-border" : ""
              } ${
                pressed
                  ? "bg-primary-soft text-on-primary-soft"
                  : "text-foreground hover:bg-surface-muted"
              }`}
            >
              {THEME_LABELS[theme]}
            </button>
          );
        })}
      </div>
    </form>
  );
}
