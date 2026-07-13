import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AdIngestTransactionAdapter } from '../adapter/out/transaction/ad-ingest-transaction.adapter';
import { adIngestRepositoryClient } from '../adapter/out/transaction/ad-ingest-transaction-context';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('AdIngestTransactionAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let adapter: AdIngestTransactionAdapter;
  let channelAccountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new AdIngestTransactionAdapter(prisma as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Test Coupang',
        externalAccountId: 'test-coupang',
      },
      select: { id: true },
    });
    channelAccountId = account.id;
  });

  it('persists the response and returns it on retry without another run or snapshot', async () => {
    let invocations = 0;
    const operation = async () => {
      invocations += 1;
      const client = adIngestRepositoryClient(prisma);
      const run = await client.channelScrapeRun.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId,
          channel: 'coupang',
          source: 'wing',
          pageType: 'traffic',
          status: 'complete',
          rowCount: 1,
        },
        select: { id: true },
      });
      await client.channelScrapeSnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          scrapeRunId: run.id,
          channel: 'coupang',
          source: 'wing',
          pageType: 'traffic',
          rawJson: { externalId: 'listing-1', orders: 7 },
        },
      });
      return { runId: run.id, snapshotCount: 1 };
    };
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'authoritative-rebuild:123:00000000-0000-4000-8000-000000000101',
    };

    const first = await adapter.runIdempotent(input, operation);
    const retry = await adapter.runIdempotent(input, operation);

    expect(first.replayed).toBe(false);
    expect(retry).toEqual({ value: first.value, replayed: true });
    expect(invocations).toBe(1);
    await expect(prisma.channelScrapeRun.count()).resolves.toBe(1);
    await expect(prisma.channelScrapeSnapshot.count()).resolves.toBe(1);
  });

  it('rolls back the marker and ingest writes when the operation fails', async () => {
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'authoritative-rebuild:123:00000000-0000-4000-8000-000000000102',
    };

    await expect(adapter.runIdempotent(input, async () => {
      const client = adIngestRepositoryClient(prisma);
      await client.channelScrapeRun.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId,
          channel: 'coupang',
          source: 'wing',
          pageType: 'traffic',
        },
      });
      throw new Error('simulated ingest failure');
    })).rejects.toThrow('simulated ingest failure');

    await expect(prisma.channelScrapeRun.count()).resolves.toBe(0);
    await expect(prisma.systemSetting.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        key: { startsWith: 'advertising.extension-sync.idempotency.' },
      },
    })).resolves.toBe(0);
  });

  it('serializes concurrent delivery of the same key into one persisted ingest', async () => {
    let invocations = 0;
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'authoritative-rebuild:123:00000000-0000-4000-8000-000000000103',
    };
    const operation = async () => {
      invocations += 1;
      const client = adIngestRepositoryClient(prisma);
      const run = await client.channelScrapeRun.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId,
          channel: 'coupang',
          source: 'wing',
          pageType: 'traffic',
          status: 'complete',
        },
        select: { id: true },
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      await client.channelScrapeSnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          scrapeRunId: run.id,
          channel: 'coupang',
          source: 'wing',
          pageType: 'traffic',
          rawJson: { externalId: 'listing-concurrent' },
        },
      });
      return { runId: run.id };
    };

    const results = await Promise.all([
      adapter.runIdempotent(input, operation),
      adapter.runIdempotent(input, operation),
    ]);

    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]?.value).toEqual(results[1]?.value);
    expect(invocations).toBe(1);
    await expect(prisma.channelScrapeRun.count()).resolves.toBe(1);
    await expect(prisma.channelScrapeSnapshot.count()).resolves.toBe(1);
  });
});
