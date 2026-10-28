import { execSync } from 'node:child_process';
import { resolveTestDatabaseUrl } from './test-database.js';

/**
 * Applies any pending migrations to the test database once per run. This is
 * non-destructive; individual test files truncate the tables they use.
 */
export default function setup(): void {
  const databaseUrl = resolveTestDatabaseUrl();
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}
