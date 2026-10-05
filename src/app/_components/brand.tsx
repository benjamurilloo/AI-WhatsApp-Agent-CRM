// Marca del producto en el panel (brief-15.1, D-4): una «V» en SVG propio, de dos tonos, y el
// nombre. Decorativa: el nombre visible es el texto.
export function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        className="size-8 shrink-0"
      >
        <polygon points="1,3 7,3 12,13.5 12,22" className="fill-action" />
        <polygon points="23,3 17,3 12,13.5 12,22" className="fill-primary" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight text-foreground">
        Vixora
      </span>
    </span>
  );
}
