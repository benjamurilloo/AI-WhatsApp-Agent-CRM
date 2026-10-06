// Marca del producto en el panel (brief-15.5, D-2 y D-3): el símbolo de Vixora como imagen, sin
// fondo, y el nombre como texto en el color del tema, porque el nombre del logo es blanco y no se
// leería en el tema claro. El lema va solo en el panel de escritorio. La imagen es decorativa: el
// nombre visible es el texto. Un <img> común y no next/image, que escribe un atributo style que la
// CSP prohíbe (style-src-attr 'none').
export function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- ver el comentario de arriba */}
      <img
        src="/marca/vixora-simbolo-32.png"
        srcSet="/marca/vixora-simbolo-64.png 2x, /marca/vixora-simbolo-96.png 3x"
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0"
      />
      <span className="flex flex-col">
        <span className="text-xl leading-tight font-extrabold tracking-tight text-foreground">
          Vixora
        </span>
        <span className="hidden text-[10px] leading-tight font-semibold tracking-[0.3em] text-primary lg:block">
          AI SOLUTIONS
        </span>
      </span>
    </span>
  );
}
