import { afterEach, describe, expect, it } from 'vitest';
import { makeTestPrisma } from '../real-prisma';

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('makeTestPrisma database identity guard', () => {
  it('accepts the exact integration username and database without connecting', async () => {
    process.env.DATABASE_URL =
      'postgresql://kiditem_test:secret@localhost:6543/kiditem_test?schema=public';

    const prisma = makeTestPrisma();

    expect(prisma).toBeDefined();
    await prisma.$disconnect();
  });

  it.each([
    ['wrong username', 'postgresql://other:secret@localhost:6543/kiditem_test'],
    ['username query override', 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test?user=other'],
    ['host query override', 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test?host=production-db'],
    ['non-Postgres scheme', 'mysql://kiditem_test:secret@localhost:6543/kiditem_test'],
    ['test name in password', 'postgresql://other:kiditem_test@localhost:6543/production'],
    [
      'test name in query',
      'postgresql://other:secret@localhost:6543/production?application_name=kiditem_test',
    ],
    ['backup database', 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test_backup'],
    ['prefixed database', 'postgresql://kiditem_test:secret@localhost:6543/backup_kiditem_test'],
    ['nested pathname', 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test/archive'],
    ['malformed URL', 'kiditem_test'],
  ])('rejects %s', (_case, databaseUrl) => {
    process.env.DATABASE_URL = databaseUrl;

    expect(() => makeTestPrisma()).toThrow(
      'Refusing to use non-test DATABASE_URL for integration tests.',
    );
  });

  it('does not expose authority or query-string passwords in refusal errors', () => {
    process.env.DATABASE_URL =
      'postgresql://kiditem_test:authority-secret@localhost:6543/kiditem_test?password=query-secret';

    expect(() => makeTestPrisma()).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining('authority-secret'),
      }),
    );
    expect(() => makeTestPrisma()).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining('query-secret'),
      }),
    );
  });
});
