import { makeChannelListingQuery, makeChannelRecipes } from '../../../../../test-helpers/channel-catalog-ports';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { AiDirectJobRepositoryAdapter } from '../ai-direct-job.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from '../detail-page-generation.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from '../content-asset-library.repository.adapter';
import { deriveProductGenerationChildIdentity } from '../../../../application/service/product-generation-child-identity';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../thumbnail-generation-ledger.repository.adapter';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../../prisma/prisma.service';

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

  it('converges concurrent detail-child replay on one durable row and rejects request-hash drift', async () => {
    const otherPrisma = makeTestPrisma();
    await otherPrisma.$connect();
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Concurrent child',
        normalizedTitle: 'concurrent child',
        createdByUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
      },
      select: { id: true },
    });
    const coordinate = {
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'product-generation:concurrent-child',
    };
    const requestHash = 'a'.repeat(64);
    const identity = deriveProductGenerationChildIdentity({
      ...coordinate,
      requestHash,
      kind: 'detail_page',
    });
    const firstRepository = detailGenerationRepository(prisma);
    const secondRepository = detailGenerationRepository(otherPrisma);
    const open = (
      detailPages: DetailPageGenerationRepositoryAdapter,
      productGenerationIdentity = identity,
    ) => detailPages.openProcessingGenerationLedger({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspace.id,
      triggeredByUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: 'Concurrent child',
        rawCategory: '',
        rawDescription: '',
        rawOptions: '',
        imageUrls: [],
        heroImageMode: 'first',
        templateId: 'bold-vertical',
        productGenerationRequestHash: productGenerationIdentity.requestHash,
      },
      imageUrls: [],
      rawTitle: 'Concurrent child',
      sourceReferences: [],
      productGenerationIdentity,
      directJob: {
        jobType: 'detail_page_generate',
        payload: {
          jobType: 'detail_page_generate',
          models: {
            image: 'gemini-image-model',
            text: 'gemini-text-model',
            vision: 'gemini-vision-model',
          },
          input: {
            templateId: 'bold-vertical',
            generationMode: 'full',
            raw: {
              rawTitle: 'Concurrent child',
              rawCategory: '',
              rawDescription: '',
              rawOptions: '',
              imageUrls: [],
              ageGroup: 'age-8-plus',
              detailImageCount: '2',
              usageSectionMode: 'include',
              kcCertificationStatus: 'unknown',
              kcCertificationNumber: '',
            },
            heroImageMode: 'first',
          },
        },
        status: 'held',
        scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
      },
    });

    try {
      const [first, second] = await Promise.all([
        open(firstRepository),
        open(secondRepository),
      ]);

      expect([first.status, second.status].sort()).toEqual(['created', 'existing']);
      expect(first.row.id).toBe(identity.generationId);
      expect(second.row.id).toBe(identity.generationId);
      expect(first.directJobId).toBe(second.directJobId);
      expect(first.releaseRequired).toBe(true);
      expect(second.releaseRequired).toBe(true);
      await expect(prisma.contentGeneration.count({
        where: { id: identity.generationId, organizationId: TEST_ORGANIZATION_ID },
      })).resolves.toBe(1);
      await expect(prisma.aiDirectJob.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          jobType: 'detail_page_generate',
          sourceResourceId: identity.generationId,
        },
      })).resolves.toBe(1);

      await expect(Promise.all([
        new AiDirectJobRepositoryAdapter(prisma as unknown as PrismaService).release({
          organizationId: TEST_ORGANIZATION_ID,
          jobId: first.directJobId,
        }),
        new AiDirectJobRepositoryAdapter(otherPrisma as unknown as PrismaService).release({
          organizationId: TEST_ORGANIZATION_ID,
          jobId: second.directJobId,
        }),
      ])).resolves.toEqual([true, true]);
      await expect(prisma.aiDirectJob.findUniqueOrThrow({
        where: { id: first.directJobId },
        select: { status: true },
      })).resolves.toEqual({ status: 'pending' });

      const driftIdentity = deriveProductGenerationChildIdentity({
        ...coordinate,
        requestHash: 'b'.repeat(64),
        kind: 'detail_page',
      });
      await expect(open(firstRepository, driftIdentity)).rejects.toThrow(
        'product_generation_idempotency_conflict',
      );
    } finally {
      await otherPrisma.$disconnect();
    }
  });

  it('converges concurrent thumbnail-child replay on one durable row and rejects request-hash drift', async () => {
    const otherPrisma = makeTestPrisma();
    await otherPrisma.$connect();
    const salesProductId = randomUUID();
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId,
        displayName: 'Concurrent thumbnail',
        normalizedTitle: 'concurrent thumbnail',
        createdByUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
      },
      select: { id: true },
    });
    const coordinate = {
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'product-generation:concurrent-thumbnail',
    };
    const requestHash = 'a'.repeat(64);
    const identity = deriveProductGenerationChildIdentity({
      ...coordinate,
      requestHash,
      kind: 'thumbnail',
    });
    const firstRepository = thumbnailGenerationRepository(prisma);
    const secondRepository = thumbnailGenerationRepository(otherPrisma);
    const open = (
      thumbnails: ThumbnailGenerationLedgerRepositoryAdapter,
      productGenerationIdentity = identity,
    ) => thumbnails.openPendingDirectGeneration({
      subject: 'sales_product',
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId,
      productName: 'Concurrent thumbnail',
      contentWorkspaceId: workspace.id,
      originalUrl: 'https://example.com/concurrent-thumbnail.jpg',
      method: 'generate',
      inputMeta: {
        mode: 'edit',
        productGenerationRequestHash: productGenerationIdentity.requestHash,
      },
      triggeredByUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
      inputImages: [{
        data: 'AAA',
        mimeType: 'image/jpeg',
        label: 'Product photo',
        url: 'https://example.com/concurrent-thumbnail.jpg',
        storageKey: null,
        role: 'product',
        sortOrder: 0,
        source: 'sourcing_candidate',
        fileSize: null,
      }],
      productGenerationIdentity,
      directJob: {
        jobType: 'thumbnail_generate',
        payload: thumbnailDirectPayload(),
        status: 'held',
        scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
      },
    });

    try {
      const [first, second] = await Promise.all([
        open(firstRepository),
        open(secondRepository),
      ]);

      expect([first.status, second.status].sort()).toEqual(['created', 'existing']);
      expect(first.generationId).toBe(identity.generationId);
      expect(second.generationId).toBe(identity.generationId);
      expect(first.directJobId).toBe(second.directJobId);
      await expect(prisma.thumbnailGeneration.count({
        where: { id: identity.generationId, organizationId: TEST_ORGANIZATION_ID },
      })).resolves.toBe(1);
      await expect(prisma.aiDirectJob.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          jobType: 'thumbnail_generate',
          sourceResourceId: identity.generationId,
        },
      })).resolves.toBe(1);

      const driftIdentity = deriveProductGenerationChildIdentity({
        ...coordinate,
        requestHash: 'b'.repeat(64),
        kind: 'thumbnail',
      });
      await expect(open(firstRepository, driftIdentity)).rejects.toThrow(
        'product_generation_idempotency_conflict',
      );
    } finally {
      await otherPrisma.$disconnect();
    }
  });

  it('atomically terminalizes detail and thumbnail owner rows with their projecting direct jobs', async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Cancellation owner',
        normalizedTitle: 'cancellation owner',
        createdByUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
      },
      select: { id: true },
    });
    const group = await prisma.contentGenerationGroup.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        title: 'Cancellation owner',
      },
      select: { id: true },
    });
    const detail = await prisma.contentGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
        contentWorkspaceId: workspace.id,
        contentType: 'detail_page',
        generationInput: {},
        generationResult: {},
        status: 'PROCESSING',
      },
      select: { id: true },
    });
    const thumbnail = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        originalUrl: 'https://example.com/input.jpg',
        inputMeta: {},
        status: 'running',
        phase: 'processing',
      },
      select: { id: true },
    });

    const detailJob = await repository.create({
      organizationId: TEST_ORGANIZATION_ID,
      jobType: 'detail_page_generate',
      sourceResourceId: detail.id,
      payload: detailDirectPayload(),
      status: 'held',
      scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
    });
    const thumbnailJob = await repository.create({
      organizationId: TEST_ORGANIZATION_ID,
      jobType: 'thumbnail_generate',
      sourceResourceId: thumbnail.id,
      payload: thumbnailDirectPayload(),
      status: 'held',
      scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
    });
    await prisma.aiDirectJob.updateMany({
      where: { id: { in: [detailJob.id, thumbnailJob.id] } },
      data: { status: 'projecting' },
    });

    const detailCanceller = detailGenerationRepository(prisma);
    const thumbnailCanceller = thumbnailGenerationRepository(prisma);
    const [detailResults, thumbnailResults] = await Promise.all([
      Promise.all([
        detailCanceller.cancelDirectGeneration({
          organizationId: TEST_ORGANIZATION_ID,
          generationId: detail.id,
          reason: 'operator_cancelled',
        }),
        detailCanceller.cancelDirectGeneration({
          organizationId: TEST_ORGANIZATION_ID,
          generationId: detail.id,
          reason: 'operator_cancelled',
        }),
      ]),
      Promise.all([
        thumbnailCanceller.cancelDirectGeneration({
          organizationId: TEST_ORGANIZATION_ID,
          generationId: thumbnail.id,
          reason: 'operator_cancelled',
          actorUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
          payload: { reason: 'operator_cancelled' },
        }),
        thumbnailCanceller.cancelDirectGeneration({
          organizationId: TEST_ORGANIZATION_ID,
          generationId: thumbnail.id,
          reason: 'operator_cancelled',
          actorUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
          payload: { reason: 'operator_cancelled' },
        }),
      ]),
    ]);

    expect(detailResults.map((result) => result.status).sort()).toEqual([
      'already_terminal',
      'cancelled',
    ]);
    expect(thumbnailResults.map((result) => result.status).sort()).toEqual([
      'already_terminal',
      'cancelled',
    ]);
    await expect(prisma.contentGeneration.findUniqueOrThrow({
      where: { id: detail.id },
      select: { status: true, errorMessage: true },
    })).resolves.toEqual({
      status: 'CANCELLED',
      errorMessage: 'operator_cancelled',
    });
    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({
      where: { id: thumbnail.id },
      select: { status: true, phase: true, errorMessage: true },
    })).resolves.toEqual({
      status: 'cancelled',
      phase: null,
      errorMessage: 'operator_cancelled',
    });
    await expect(prisma.aiDirectJob.findMany({
      where: { id: { in: [detailJob.id, thumbnailJob.id] } },
      select: { id: true, status: true, lastErrorCode: true },
      orderBy: { id: 'asc' },
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: detailJob.id, status: 'cancelled', lastErrorCode: 'user_cancelled' }),
      expect.objectContaining({ id: thumbnailJob.id, status: 'cancelled', lastErrorCode: 'user_cancelled' }),
    ]));
    await expect(prisma.thumbnailGenerationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, generationId: thumbnail.id },
    })).resolves.toBe(2);
  });

});

function detailGenerationRepository(prisma: PrismaClient): DetailPageGenerationRepositoryAdapter {
  const scopedPrisma = prisma as unknown as PrismaService;
  return new DetailPageGenerationRepositoryAdapter(
    scopedPrisma,
    new ContentAssetLibraryRepositoryAdapter(scopedPrisma),
    new AiDirectJobRepositoryAdapter(scopedPrisma),
  );
}

function thumbnailGenerationRepository(prisma: PrismaClient): ThumbnailGenerationLedgerRepositoryAdapter {
  const scopedPrisma = prisma as unknown as PrismaService;
  return new ThumbnailGenerationLedgerRepositoryAdapter(
    scopedPrisma,
    new AiDirectJobRepositoryAdapter(scopedPrisma), makeChannelListingQuery(prisma), makeChannelRecipes(prisma));
}

function detailDirectPayload() {
  return {
    jobType: 'detail_page_generate' as const,
    models: {
      image: 'gemini-image-model',
      text: 'gemini-text-model',
      vision: 'gemini-vision-model',
    },
    input: {
      templateId: 'bold-vertical' as const,
      generationMode: 'full' as const,
      raw: {
        rawTitle: 'Cancellation owner',
        rawCategory: '',
        rawDescription: '',
        rawOptions: '',
        imageUrls: [],
        ageGroup: 'age-8-plus' as const,
        detailImageCount: '2' as const,
        usageSectionMode: 'include' as const,
        kcCertificationStatus: 'unknown' as const,
        kcCertificationNumber: '',
      },
      heroImageMode: 'first' as const,
    },
  };
}

function thumbnailDirectPayload() {
  return {
    jobType: 'thumbnail_generate' as const,
    models: { image: 'gemini-image-model' },
    input: {
      mode: 'edit' as const,
      editCase: 'single' as const,
      productName: 'Cancellation owner',
      inputs: [{
        mimeType: 'image/jpeg',
        label: 'Product photo',
        url: 'https://example.com/input.jpg',
        storageKey: null,
        role: 'product' as const,
        sortOrder: 0,
        source: 'test',
        fileSize: null,
      }],
    },
  };
}
