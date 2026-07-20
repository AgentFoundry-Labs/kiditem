import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChannelCatalogCollectionRepositoryAdapter } from '../adapter/out/repository/channel-catalog-collection.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';

const WING_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_WING_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_WING_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

describe('ChannelCatalogCollectionRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelCatalogCollectionRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ChannelCatalogCollectionRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedAccounts(prisma);
  });

  it('resumes the same client run only inside the owning organization and account', async () => {
    const clientRunKey = randomUUID();
    const first = await repository.startOrResume({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      clientRunKey,
      collectorVersion: '1.0.0',
    });
    const resumed = await repository.startOrResume({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      clientRunKey,
      collectorVersion: '1.0.0',
    });
    const secondAccount = await repository.startOrResume({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: SECOND_WING_ACCOUNT_ID,
      clientRunKey,
      collectorVersion: '1.0.0',
    });

    expect(resumed.id).toBe(first.id);
    expect(secondAccount.id).not.toBe(first.id);
    await expect(
      repository.getOwnedRunWithChunks({
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: OTHER_ORG_WING_ACCOUNT_ID,
        runId: first.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores raw chunks in JSONB and makes same-checksum retries idempotent', async () => {
    const run = await startRun(repository);
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      kind: 'discovery_page' as const,
      sequence: 1,
      checksum: 'a'.repeat(64),
      itemCount: 1,
      payload: {
        items: [{ externalProductId: '123', productName: '쿠팡 상품' }],
      },
    };

    await expect(repository.putChunk(input)).resolves.toMatchObject({ stored: true });
    await expect(repository.putChunk(input)).resolves.toMatchObject({ stored: false });

    const stored = await repository.getOwnedRunWithChunks({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
    });
    expect(stored.chunks).toHaveLength(1);
    expect(stored.chunks[0]).toMatchObject({
      kind: 'discovery_page',
      sequence: 1,
      itemCount: 1,
      payload: input.payload,
    });
  });

  it('rejects a different checksum for the same chunk coordinate', async () => {
    const run = await startRun(repository);
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      kind: 'product_details' as const,
      sequence: 3,
      itemCount: 1,
      payload: { items: [{ externalProductId: '123' }] },
    };

    await repository.putChunk({ ...base, checksum: 'a'.repeat(64) });
    await expect(
      repository.putChunk({ ...base, checksum: 'b'.repeat(64) }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['completed', 'failed'])('rejects writes after a run is %s', async (status) => {
    const run = await startRun(repository);
    await prisma.channelScrapeRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date() },
    });

    await expect(
      repository.putChunk({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
        runId: run.id,
        kind: 'manifest_confirmation',
        sequence: 1,
        checksum: 'c'.repeat(64),
        itemCount: 1,
        payload: { items: [{ externalProductId: '123' }] },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

async function startRun(repository: ChannelCatalogCollectionRepositoryAdapter) {
  return repository.startOrResume({
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    channelAccountId: WING_ACCOUNT_ID,
    clientRunKey: randomUUID(),
    collectorVersion: '1.0.0',
  });
}

async function seedAccounts(prisma: PrismaClient) {
  await prisma.channelAccount.createMany({
    data: [
      {
        id: WING_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing primary',
        externalAccountId: 'vendor-primary',
        vendorId: 'vendor-primary',
      },
      {
        id: SECOND_WING_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing secondary',
        externalAccountId: 'vendor-secondary',
        vendorId: 'vendor-secondary',
      },
      {
        id: OTHER_ORG_WING_ACCOUNT_ID,
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Other Wing',
        externalAccountId: 'vendor-other',
        vendorId: 'vendor-other',
      },
    ],
  });
}
