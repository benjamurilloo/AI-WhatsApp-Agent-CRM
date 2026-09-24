import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { searchQuery, searchVector } from ".";

// Lo que se puede afirmar sin base: la forma del SQL. Que el escape funcione contra PostgreSQL lo
// prueban tests/integration/knowledge.test.ts y catalog.test.ts, con los caracteres de tsquery.
const dialect = new PgDialect();

describe("searchQuery (brief-11.2, D-6)", () => {
  it.each(["cafe molido", "a & b | !c", "o'higgins \\ :*", "1.5 L"])(
    "el texto buscado viaja como parámetro, nunca dentro del SQL: %s",
    (text) => {
      const query = dialect.sqlToQuery(searchQuery(text));
      expect(query.params).toEqual([text]);
      expect(query.sql).not.toContain(text);
    },
  );

  it("la consulta parte el texto con la misma normalización que el documento", () => {
    const vector = dialect.sqlToQuery(searchVector(sql`$x`)).sql;
    const query = dialect.sqlToQuery(searchQuery("x")).sql;
    expect(vector).toBe("to_tsvector('simple', immutable_unaccent(lower($x)))");
    expect(query).toContain(
      "unnest(to_tsvector('simple', immutable_unaccent(lower($1))))",
    );
  });

  it("cada palabra es un prefijo escapado, y las palabras se unen con Y", () => {
    const query = dialect.sqlToQuery(searchQuery("x")).sql;
    expect(query).toContain(
      "replace(replace(l.lexeme, '\\', '\\\\'), '''', '''''')",
    );
    expect(query).toContain("''':*', ' & ')::tsquery");
  });
});
