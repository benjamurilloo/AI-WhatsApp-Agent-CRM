import type { IconName } from "@/app/_components/icons";

// Ícono de una entrada según su categoría (brief-15.1, D-7). Las categorías son texto libre de
// cada organización: se buscan palabras clave sin distinguir mayúsculas ni acentos, y una
// categoría desconocida lleva el ícono de documento. Es solo presentación.

const KEYWORDS: readonly [string, IconName][] = [
  ["envio", "truck"],
  ["entrega", "truck"],
  ["retiro", "truck"],
  ["horario", "clock"],
  ["pago", "creditCard"],
  ["cuota", "creditCard"],
  ["ubicacion", "mapPin"],
  ["direccion", "mapPin"],
  ["local", "mapPin"],
  ["garantia", "shield"],
  ["devolucion", "undo"],
  ["cambio", "undo"],
];

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");

export function categoryIcon(category: string): IconName {
  const folded = fold(category);
  return KEYWORDS.find(([word]) => folded.includes(word))?.[1] ?? "fileText";
}
