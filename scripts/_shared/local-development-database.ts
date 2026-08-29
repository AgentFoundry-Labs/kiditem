const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const FORBIDDEN_DATABASE_NAME = /(prod|production|staging)/i;

export function assertLocalDevelopmentDatabase(databaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing non-local database: DATABASE_URL is invalid');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!LOCAL_HOSTS.has(url.hostname) || FORBIDDEN_DATABASE_NAME.test(databaseName)) {
    throw new Error('Refusing non-local development database');
  }
  if (!databaseName) {
    throw new Error('Refusing non-local database: database name is missing');
  }
  return url;
}
