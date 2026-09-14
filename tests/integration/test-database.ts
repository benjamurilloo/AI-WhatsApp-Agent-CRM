// Las bases de test se derivan de DATABASE_URL: mismo servidor, nombre con sufijo.
// _test para integración (brief-3.1, D-1) y _e2e para end-to-end (brief-3.5, D-8).

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

function withSuffix(connectionString: string, suffix: string): string {
  const url = new URL(connectionString);
  const name = databaseName(url);
  url.pathname = `/${name.endsWith(suffix) ? name : `${name}${suffix}`}`;
  return url.toString();
}

export function testDatabaseUrl(connectionString: string): string {
  return withSuffix(connectionString, "_test");
}

export function testDatabaseName(connectionString: string): string {
  return databaseName(new URL(testDatabaseUrl(connectionString)));
}

export function e2eDatabaseUrl(connectionString: string): string {
  return withSuffix(connectionString, "_e2e");
}

export function e2eDatabaseName(connectionString: string): string {
  return databaseName(new URL(e2eDatabaseUrl(connectionString)));
}

// Base de mantenimiento del mismo servidor, para crear y borrar las de test.
export function maintenanceUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}
