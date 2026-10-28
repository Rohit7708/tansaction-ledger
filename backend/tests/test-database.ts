import 'dotenv/config';

/**
 * Resolves the database used by the integration tests. The suite truncates
 * tables, so it refuses to run against anything that does not look like a
 * dedicated test database.
 */
export function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL must be set to run the integration tests (see .env.example).');
  }
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.includes('test')) {
    throw new Error(`Refusing to run tests against "${databaseName}": the database name must contain "test".`);
  }
  return url;
}
