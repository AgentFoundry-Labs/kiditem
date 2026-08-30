import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { AiDirectJobRepositoryAdapter } from '../ai-direct-job.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import { PrismaProductGenerationIdempotencyAdapter } from '../../transaction/prisma-product-generation-idempotency.adapter';
import { ProductGenerationAiService } from '../../../../application/service/product-generation-ai.service';
import { productGenerationOperationKey } from '../../../../application/service/product-generation-alert-link';

describe('AiDirectJobRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: AiDirectJobRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new AiDirectJobRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('claims once across workers and preserves a checkpoint across lease recovery', async () => {
    const now = new Date('2026-07-19T00:00:00.000Z');
    const created = await repository.create({
      organizationId: TEST_ORGANIZATION_ID,
      jobType: 'image_edit',
      sourceResourceId: randomUUID(),
      payload: {
        jobType: 'image_edit',
        models: { image: 'gemini-image-model' },
        input: {
          image_url: 'https://storage.example.com/input.png',
          preset: 'custom',
        },
      },
      status: 'held',
      scheduledFor: now,
    });

    const firstClaims = await Promise.all([
      repository.claimNext({
        workerId: 'worker-a',
        now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      }),
      repository.claimNext({
        workerId: 'worker-b',
        now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      }),
    ]);
    expect(firstClaims.filter(Boolean)).toHaveLength(1);
    expect(firstClaims.filter((claim) => claim === null)).toHaveLength(1);

    const reclaimAt = new Date(now.getTime() + 120_000);
    const reclaimed = await repository.claimNext({
      workerId: 'worker-c',
      now: reclaimAt,
      leaseExpiresAt: new Date(reclaimAt.getTime() + 60_000),
    });
    expect(reclaimed).toMatchObject({
      id: created.id,
      status: 'running',
      claimedFromStatus: 'running',
      attempts: 2,
    });

    const result = { image_url: 'https://storage.example.com/output.png' };
    await expect(
      repository.checkpointResult({
        organizationId: TEST_ORGANIZATION_ID,
        jobId: created.id,
        result,
      }),
    ).resolves.toBe(true);

    const projectionReclaimAt = new Date(reclaimAt.getTime() + 120_000);
    const projectionClaim = await repository.claimNext({
      workerId: 'worker-d',
      now: projectionReclaimAt,
      leaseExpiresAt: new Date(projectionReclaimAt.getTime() + 60_000),
    });
    expect(projectionClaim).toMatchObject({
      id: created.id,
      status: 'projecting',
      claimedFromStatus: 'projecting',
      attempts: 2,
      result,
    });
  });

  it('serializes the same product-generation key across separate Prisma clients', async () => {
    const otherPrisma = makeTestPrisma();
    await otherPrisma.$connect();
    const firstAdapter = new PrismaProductGenerationIdempotencyAdapter(
      prisma as unknown as PrismaService,
    );
    const secondAdapter = new PrismaProductGenerationIdempotencyAdapter(
      otherPrisma as unknown as PrismaService,
    );
    let releaseFirst!: () => void;
    let markFirstEntered!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstEntered = new Promise<void>((resolve) => {
      markFirstEntered = resolve;
    });
    let active = 0;
    let maxActive = 0;
    const coordinate = {
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'operation-1:listing.generate:item-1',
    };

    try {
      const first = firstAdapter.runExclusive(coordinate, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        markFirstEntered();
        await firstGate;
        active -= 1;
        return 'first';
      });
      await firstEntered;
      const second = secondAdapter.runExclusive(coordinate, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        active -= 1;
        return 'second';
      });

      releaseFirst();
      await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
      expect(maxActive).toBe(1);
    } finally {
      await otherPrisma.$disconnect();
    }
  });

  it('replays one keyed ProductGeneration result across concurrent real-PG locks and rejects a mismatched request', async () => {
    const otherPrisma = makeTestPrisma();
    await otherPrisma.$connect();
    const firstLock = new PrismaProductGenerationIdempotencyAdapter(
      prisma as unknown as PrismaService,
    );
    const secondLock = new PrismaProductGenerationIdempotencyAdapter(
      otherPrisma as unknown as PrismaService,
    );
    const candidateId = randomUUID();
    const detailId = randomUUID();
    const thumbnailId = randomUUID();
    const workspaceId = randomUUID();
    const parents = new Map<string, Record<string, unknown>>();
    let releaseDetail!: () => void;
    let enterDetail!: () => void;
    const detailGate = new Promise<void>((resolve) => { releaseDetail = resolve; });
    const detailEntered = new Promise<void>((resolve) => { enterDetail = resolve; });
    const parentAlerts = {
      find: async (_organizationId: string, operationKey: string) =>
        parents.get(operationKey) ?? null,
      start: async (input: { batchId: string; requestHash: string }) => {
        parents.set(productGenerationOperationKey(input.batchId), {
          metadata: { requestHash: input.requestHash, childIds: {} },
        });
      },
      canStartChild: async () => true,
      markChildFinished: async () => undefined,
    };
    const detailPages = {
      generate: async (_input: unknown, _organizationId: string, _actor: string | null, options: any) => {
        enterDetail();
        await detailGate;
        const parent = parents.get(options.operationAlert.parentOperationKey)!;
        const metadata = parent.metadata as Record<string, any>;
        metadata.childIds.detailPageGenerationId = detailId;
        return { id: detailId, contentWorkspaceId: workspaceId };
      },
    };
    const thumbnails = {
      enqueueCandidateGeneration: async (input: any) => {
        enterDetail();
        await detailGate;
        const parent = parents.get(input.operationAlert.parentOperationKey)!;
        const metadata = parent.metadata as Record<string, any>;
        metadata.childIds.thumbnailGenerationId = thumbnailId;
        return { generationId: thumbnailId };
      },
    };
    const common = [
      { findCandidate: async () => ({
        id: candidateId, name: '자석 다트게임', category: '완구',
        description: '안전한 다트 보드', thumbnailUrl: 'https://example.com/main.jpg',
        images: [{ url: 'https://example.com/main.jpg', sortOrder: 0 }],
      }) },
      detailPages,
      thumbnails,
      { resolveInputImage: async () => ({
        data: 'AAA', url: 'https://example.com/main.jpg', storageKey: null,
        mimeType: 'image/jpeg', label: 'Product photo', role: 'product', sortOrder: 0,
        source: 'sourcing_candidate', fileSize: null,
      }) },
      parentAlerts,
    ] as const;
    const first = new ProductGenerationAiService(...common, firstLock as never);
    const second = new ProductGenerationAiService(...common, secondLock as never);
    const request = {
      organizationId: TEST_ORGANIZATION_ID,
      task: 'thumbnail' as const,
      idempotencyKey: 'operation-1:listing.generate:item-1',
      requestHash: 'a'.repeat(64),
      triggeredByUserId: null,
      candidateId,
      productName: '자석 다트게임', category: '완구', description: '안전한 다트 보드',
      target: '초등학생', imageUrls: ['https://example.com/main.jpg'],
      thumbnailUrl: 'https://example.com/main.jpg', optionNames: ['기본'],
      templateId: 'bold-vertical' as const, ageGroup: 'age-8-plus' as const,
      detailImageCount: '2' as const, usageSectionMode: 'include' as const,
      kcCertificationStatus: 'unknown' as const, kcCertificationNumber: null,
    };
    try {
      const firstRun = first.startForCandidate(request);
      await detailEntered;
      const replay = second.startForCandidate(request);
      releaseDetail();
      const [created, replayed] = await Promise.all([firstRun, replay]);
      expect(replayed).toEqual(created);
      expect(created).toMatchObject({
        detailGenerationId: null, thumbnailGenerationId: thumbnailId,
        contentWorkspaceId: null,
      });
      await expect(second.startForCandidate({ ...request, requestHash: 'b'.repeat(64) }))
        .rejects.toThrow('product_generation_idempotency_conflict');
    } finally {
      await otherPrisma.$disconnect();
    }
  });
});
