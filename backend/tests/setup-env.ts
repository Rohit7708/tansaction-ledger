import { resolveTestDatabaseUrl } from './test-database.js';

// Runs before each test file is imported, so the Prisma client and app config
// pick up the test database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = resolveTestDatabaseUrl();
