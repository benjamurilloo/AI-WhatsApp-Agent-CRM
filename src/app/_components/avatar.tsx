// Avatar con iniciales (brief-15.1). Decorativo: el nombre siempre está escrito al lado.

// Primera letra de las dos primeras palabras, en mayúscula. Sin letras, un signo neutro.
export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((word) => Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ""))[0])
    .filter((letter): letter is string => letter !== undefined)
    .slice(0, 2)
    .join("");
  return letters === "" ? "·" : letters.toLocaleUpperCase("es");
}

// Los pares suaves de los tokens, que ya cumplen el contraste en las insignias.
const SOFT_TONES = [
  "bg-primary-soft text-on-primary-soft",
  "bg-tag-blue-soft text-on-tag-blue-soft",
  "bg-danger-soft text-on-danger-soft",
  "bg-success-soft text-on-success-soft",
  "bg-warning-soft text-on-warning-soft",
];

// El mismo nombre da siempre el mismo par.
export function softToneOf(name: string): string {
  let hash = 0;
  for (const char of name)
    hash = (Math.imul(hash, 31) + char.codePointAt(0)!) | 0;
  return SOFT_TONES[Math.abs(hash) % SOFT_TONES.length]!;
}

// tone "soft": un color claro por nombre, como las conversaciones de la v2 (brief-24.3.1).
// tone "brand": el violeta claro del encabezado de la ficha del cliente (brief-24.4.1).
const TONE_CLASS = {
  solid: "bg-action text-on-action",
  brand: SOFT_TONES[0]!,
};

export function Avatar({
  name,
  className = "size-9 text-sm",
  tone = "solid",
}: {
  name: string;
  className?: string;
  tone?: "solid" | "soft" | "brand";
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-bold ${tone === "soft" ? softToneOf(name) : TONE_CLASS[tone]} ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
