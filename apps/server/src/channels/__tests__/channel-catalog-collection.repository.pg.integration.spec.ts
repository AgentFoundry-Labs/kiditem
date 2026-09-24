import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { ChannelCatalogCollectionRepositoryAdapter } from '../adapter/out/repository/channel-catalog-collection.repository.adapter';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

const WING_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_WING_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_WING_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

describe('ChannelCatalogCollectionRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelCatalogCollectionRepositoryAdapter;
  let alerts: SourceFailureAlerts;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    repository = new ChannelCatalogCollectionRepositoryAdapter(
      prisma as unknown as PrismaService,
      alerts,
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
    const idempotencyKey = randomUUID();
    const first = await repository.startOrResume({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      idempotencyKey,
      collectorVersion: '1.0.0',
      stage: 'basics',
    });
    const resumed = await repository.startOrResume({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      idempotencyKey,
      collectorVersion: '1.0.0',
      stage: 'basics',
    });
    const secondAccount = await repository.startOrResume({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: SECOND_WING_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
      collectorVersion: '1.0.0',
      stage: 'basics',
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

  it('keeps a rate-limit pause RUNNING, fences chunks, and resumes after notBefore', async () => {
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
      collectorVersion: '1.0.0',
      stage: 'basics' as const,
    };
    const run = await repository.startOrResume(input);
    const pause = {
      code: 'WING_PROVIDER_RATE_LIMITED' as const,
      message: 'Wing rate limit',
      phase: 'hydration' as const,
      recoverable: true as const,
      notBefore: new Date(Date.now() - 1_000).toISOString(),
    };

    await repository.markPaused({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: run.id,
      attemptToken: run.attemptToken,
      error: pause,
    });
    const paused = await repository.getOwnedRunWithChunks({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: run.id,
      attemptToken: run.attemptToken,
      includePayload: false,
    });
    expect(paused.status).toBe('running');
    expect(paused.errorJson).toMatchObject(pause);

    await expect(repository.putChunk({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: run.id,
      attemptToken: run.attemptToken,
      kind: 'discovery_page',
      sequence: 1,
      checksum: 'a'.repeat(64),
      itemCount: 1,
      payload: {},
    })).rejects.toBeInstanceOf(ConflictException);

    const resumed = await repository.startOrResume(input);
    expect(resumed.id).toBe(run.id);
    const cleared = await repository.getOwnedRunWithChunks({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: run.id,
      attemptToken: run.attemptToken,
      includePayload: false,
    });
    expect(cleared.status).toBe('running');
    expect(cleared.errorJson).toBeNull();
  });

  it('does not resume a paused run before its notBefore timestamp', async () => {
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
      collectorVersion: '1.0.0',
      stage: 'basics' as const,
    };
    const run = await repository.startOrResume(input);
    await repository.markPaused({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: run.id,
      attemptToken: run.attemptToken,
      error: {
        code: 'WING_PROVIDER_RATE_LIMITED',
        message: 'Wing rate limit',
        phase: 'hydration',
        recoverable: true,
        notBefore: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    await expect(repository.startOrResume(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps an expired paused run immutable on same-key replay and retires it only for a new key', async () => {
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
      collectorVersion: '1.0.0',
      stage: 'basics' as const,
    };
    const run = await repository.startOrResume(input);
    const pause = {
      code: 'WING_PROVIDER_RATE_LIMITED' as const,
      message: 'Wing rate limit',
      phase: 'hydration' as const,
      recoverable: true as const,
      notBefore: new Date(Date.now() + 60_000).toISOString(),
    };
    await repository.markPaused({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: run.id,
      attemptToken: run.attemptToken,
      error: pause,
    });
    await prisma.sourceImportRun.update({
      where: { id: run.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const before = await prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: run.id },
      select: {
        status: true,
        expiresAt: true,
        attemptToken: true,
        errorCode: true,
        errorMessage: true,
        qualityReport: true,
      },
    });

    await expect(repository.startOrResume(input)).resolves.toMatchObject({
      id: run.id,
      status: 'running',
    });
    const afterReplay = await prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: run.id },
      select: {
        status: true,
        expiresAt: true,
        attemptToken: true,
        errorCode: true,
        errorMessage: true,
        qualityReport: true,
      },
    });
    expect(afterReplay).toEqual(before);
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toEqual([]);

    const next = await repository.startOrResume({
      ...input,
      idempotencyKey: randomUUID(),
    });
    expect(next.id).not.toBe(run.id);
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toMatchObject([
      { attemptId: run.id, status: 'OPEN' },
    ]);
  });

  it('starts scraper collection when vendorId differs from a legacy external alias', async () => {
    await prisma.channelAccount.update({
      where: { id: WING_ACCOUNT_ID },
      data: {
        externalAccountId: 'legacy-wing-alias',
        vendorId: 'vendor-primary',
      },
    });

    await expect(
      repository.startOrResume({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        channelAccountId: WING_ACCOUNT_ID,
        idempotencyKey: randomUUID(),
        collectorVersion: '1.0.0',
        stage: 'basics',
      }),
    ).resolves.toMatchObject({ status: 'running' });
  });

  it('does not start a browser attempt while a workbook import for the account is live', async () => {
    const workbook = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: WING_ACCOUNT_ID,
        fileName: 'wing.xlsx',
        fileHash: 'a'.repeat(64),
        status: 'running',
        rowCount: 1,
        createdBy: TEST_USER_ID,
      },
    });
    for (const stage of ['basics'] as const) {
      const blocked = await repository.startOrResume({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        channelAccountId: WING_ACCOUNT_ID,
        idempotencyKey: randomUUID(),
        collectorVersion: '1.0.0',
        stage,
      }).catch((error: unknown) => error);
      expect(blocked).toBeInstanceOf(ConflictException);
      expect((blocked as ConflictException).getResponse()).toMatchObject({
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: workbook.id,
      });
    }
    const otherAccount = await repository.startOrResume({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: SECOND_WING_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
      collectorVersion: '1.0.0',
      stage: 'basics',
    });
    expect(otherAccount.status).toBe('running');

    await prisma.sourceImportRun.update({
      where: { id: workbook.id },
      data: { updatedAt: new Date(Date.now() - 31 * 60 * 1_000) },
    });
    await expect(startRun(repository)).resolves.toMatchObject({ status: 'running' });
  });

  it('stores raw chunks in JSONB and makes same-checksum retries idempotent', async () => {
    const run = await startRun(repository);
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      attemptToken: run.attemptToken,
      kind: 'discovery_page' as const,
      sequence: 1,
      checksum: 'a'.repeat(64),
      itemCount: 1,
      payload: {
        items: [{ externalProductId: '123', productName: '쿠팡 상품' }],
      },
    };

    await expect(repository.putChunk(input)).resolves.toMatchObject({
      stored: true,
    });
    await expect(repository.putChunk(input)).resolves.toMatchObject({
      stored: false,
    });

    const stored = await repository.getOwnedRunWithChunks({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      attemptToken: run.attemptToken,
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
      attemptToken: run.attemptToken,
      kind: 'listing_basics' as const,
      sequence: 3,
      itemCount: 1,
      payload: { items: [{ externalProductId: '123' }] },
    };

    await repository.putChunk({ ...base, checksum: 'a'.repeat(64) });
    await expect(repository.putChunk({ ...base, checksum: 'b'.repeat(64) })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it.each(['completed', 'failed'])('rejects writes after a run is %s', async (status) => {
    const run = await startRun(repository);
    await prisma.sourceImportRun.update({
      where: { id: run.id },
      data: { status, importedAt: new Date() },
    });

    await expect(
      repository.putChunk({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
        runId: run.id,
        attemptToken: run.attemptToken,
        kind: 'manifest_confirmation',
        sequence: 1,
        checksum: 'c'.repeat(64),
        itemCount: 1,
        payload: { items: [{ externalProductId: '123' }] },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    { stage: 'basics' as const, kind: 'full_details' as const },
    { stage: 'basics' as const, kind: 'deletion_confirmation' as const },
  ])('rejects a %s receipt kind before inserting the chunk', async ({ stage, kind }) => {
    const run = await repository.startOrResume({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
      collectorVersion: '1.0.0',
      stage,
    });

    await expect(repository.putChunk({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      attemptToken: run.attemptToken,
      kind,
      sequence: 1,
      checksum: 'a'.repeat(64),
      itemCount: 1,
      payload: {},
    })).rejects.toBeInstanceOf(ConflictException);

    const stored = await repository.getOwnedRunWithChunks({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      attemptToken: run.attemptToken,
      stage,
      includePayload: false,
    });
    expect(stored.chunks).toHaveLength(0);
  });
});

async function startRun(repository: ChannelCatalogCollectionRepositoryAdapter) {
  return repository.startOrResume({
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    channelAccountId: WING_ACCOUNT_ID,
    idempotencyKey: randomUUID(),
    collectorVersion: '1.0.0',
    stage: 'basics',
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
