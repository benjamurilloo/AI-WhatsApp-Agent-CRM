import { sql, type SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// Búsqueda por palabras sueltas, sin distinguir mayúsculas ni acentos (brief-11.1, D-4). La usan
// products y knowledge_entries; vive acá para que el escape del texto buscado exista una sola vez
// (brief-11.2, D-6). `immutable_unaccent` la define la migración 0015.
//
// El documento y la consulta pasan por **la misma normalización y el mismo parser** (`simple`):
// la columna generada de cada tabla usa `searchVector`, y la consulta, `searchQuery`, que parte el
// texto con esa misma función. Si se separaran, una palabra se partiría distinto en cada lado y la
// búsqueda dejaría de encontrar sin que falle nada. Por el mismo motivo la consulta no parte el
// texto en TypeScript: «1.5» es una sola palabra para el parser y serían dos para un `split`.

export const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export function searchVector(text: SQL): SQL {
  return sql`to_tsvector('simple', immutable_unaccent(lower(${text})))`;
}

// La consulta: cada palabra que el parser saca del texto buscado, como prefijo, unidas con Y. Las
// palabras se arman como `tsquery` desde el vector, nunca con el texto crudo, así que `&`, `|`,
// `!`, `:` o una comilla que escriba el usuario no son sintaxis. Sin palabras da NULL, y
// `search @@ NULL` no encuentra nada.
export function searchQuery(text: string): SQL {
  return sql`(select string_agg('''' || replace(replace(l.lexeme, '\\', '\\\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(${searchVector(sql`${text}`)}) l)`;
}
