import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestPrisma } from '../../test-helpers/real-prisma';
import { PrismaService } from '../prisma.service';

/** The pg pool behind `PrismaPg` holds ten connections unless told otherwise. */
const POOL_SIZE = 10;
const HOLD_SECONDS = 3;

async function waitForSleepingBackends(observer: PrismaClient, count: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const [{ sleeping }] = await observer.$queryRaw<Array<{ sleeping: number }>>`
      SELECT COUNT(*)::int AS sleeping
      FROM pg_stat_activity
      WHERE state = 'active'
        AND query LIKE 'SELECT pg_sleep%'
        AND pid <> pg_backend_pid()
    `;
    if (sleeping >= count) return;
    if (Date.now() > deadline) throw new Error(`only ${sleeping} of ${count} connections were held`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * A dashboard endpoint opens several read transactions at once while a
 * collection's chunk writes hold connections of their own. Browser QA on
 * 2026-09-14 saw /api/dashboard/{sales,inventory,ad} answer 500 with P2028
 * "Unable to start a transaction in the given time": Prisma's own default
 * gives a transaction two seconds to get a pooled connection.
 */
describe('PrismaService interactive transactions (PG integration)', () => {
  let service: PrismaService;
  let observer: PrismaClient;

  beforeAll(async () => {
    service = new PrismaService();
    await service.$connect();
    observer = makeTestPrisma();
    await observer.$connect();
  });

  afterAll(async () => {
    await service.$disconnect();
    await observer.$disconnect();
  });

  it('waits for a pooled connection rather than failing after two seconds', async () => {
    const holders = Array.from({ length: POOL_SIZE }, () => service.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_sleep(${HOLD_SECONDS})`);
    }));
    try {
      await waitForSleepingBackends(observer, POOL_SIZE);

      const startedAt = Date.now();
      const read = service.$transaction(async (tx) => tx.$queryRaw<Array<{ ok: number }>>`SELECT 1::int AS ok`);

      await expect(read).resolves.toEqual([{ ok: 1 }]);
      // It queued behind the held connections past Prisma's two-second default.
      expect(Date.now() - startedAt).toBeGreaterThan(2_000);
    } finally {
      await Promise.allSettled(holders);
    }
  }, 20_000);
});
