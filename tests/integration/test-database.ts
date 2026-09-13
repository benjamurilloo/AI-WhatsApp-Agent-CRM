// La base de test se deriva de DATABASE_URL: mismo servidor, nombre con sufijo _test (brief-3.1, D-1).

const safeName = /^[a-z0-9_]+$/;

function databaseName(url: URL): string {
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!safeName.test(name)) {
    throw new Error(
      "El nombre de la base en DATABASE_URL solo admite a-z, 0-9 y _.",
    );
  }
  return name;
}

export function testDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const name = databaseName(url);
  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return url.toString();
}

export function testDatabaseName(connectionString: string): string {
  return databaseName(new URL(testDatabaseUrl(connectionString)));
}

// Base de mantenimiento del mismo servidor, para crear y borrar la de test.
export function maintenanceUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}
