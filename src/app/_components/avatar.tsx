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

export function Avatar({
  name,
  className = "size-9 text-sm",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-action font-bold text-on-action ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
