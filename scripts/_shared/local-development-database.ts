const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const FORBIDDEN_DATABASE_NAME = /(prod|production|staging)/i;
// pg and Prisma read these query parameters as the connection target in place
// of the URL's own host, port, database or credentials, so a loopback-looking
// URL could still reach another server or database.
const CONNECTION_OVERRIDE_PARAMS = new Set([
  'host',
  'hostaddr',
  'port',
  'user',
  'password',
  'database',
  'db',
  'dbname',
]);

export function assertLocalDevelopmentDatabase(databaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing non-local database: DATABASE_URL is invalid');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('Refusing non-local database: DATABASE_URL is not a PostgreSQL URL');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!LOCAL_HOSTS.has(url.hostname) || FORBIDDEN_DATABASE_NAME.test(databaseName)) {
    throw new Error('Refusing non-local development database');
  }
  const overrides = [...url.searchParams.keys()].filter((key) =>
    CONNECTION_OVERRIDE_PARAMS.has(key.toLowerCase()));
  if (overrides.length > 0) {
    throw new Error(
      `Refusing non-local database: DATABASE_URL overrides the connection with ${overrides.join(', ')}`,
    );
  }
  if (!databaseName) {
    throw new Error('Refusing non-local database: database name is missing');
  }
  return url;
}
