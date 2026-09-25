import { makeChannelListingQuery, makeChannelRecipes } from '../../../../../test-helpers/channel-catalog-ports';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { aiDirectJobOperations } from '../../../../__tests__/helpers/ai-direct-job-operations';
import { aiDirectJobLockKey } from '../../../../domain/direct-job/ai-direct-job-operation';
import { DetailPageGenerationRepositoryAdapter } from '../detail-page-generation.repository.adapter';
import { DetailPageRepositoryAdapter } from '../detail-page.repository.adapter';
import { deriveProductGenerationChildIdentity } from '../../../../application/service/product-generation-child-identity';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../thumbnail-generation-ledger.repository.adapter';
import { ThumbnailGenerationSinkAdapter } from '../../direct-output/thumbnail-generation-sink.adapter';
import { ThumbnailGenerationLifecycleService } from '../../../../application/service/thumbnail-generation-lifecycle.service';
import { AiDirectJobProcessorService } from '../../../../application/service/ai-direct-job-processor.service';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../../prisma/prisma.service';

/**
 * 생성 기록과 AI job(실행)이 한 트랜잭션으로 열리고 닫힌다(KID-358). 상품 생성의 결정적 자식은 동시에 와도
 * 기록 하나 · 실행 하나로 모이고, 취소는 기록과 살아 있는 실행을 함께 닫는다.
 */
describe('AI direct job with its generation ledger (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('converges concurrent detail-child replay on one durable row and rejects request-hash drift', async () => {
    const otherPrisma = makeTestPrisma();
    await otherPrisma.$connect();
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
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
    ) => detailPages.openGeneration({
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
      title: 'Concurrent child',
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
      },
    });

    try {
      const [first, second] = await Promise.all([
        open(firstRepository),
        open(secondRepository),
      ]);

      expect([first.status, second.status].sort()).toEqual(['created', 'existing']);
      expect(first.page.id).toBe(identity.generationId);
      expect(second.page.id).toBe(identity.generationId);
      await expect(prisma.detailPage.count({
        where: { id: identity.generationId, organizationId: TEST_ORGANIZATION_ID },
      })).resolves.toBe(1);
      // 실행은 하나이고 바로 claim될 수 있다(prepared, 예정 시각 없음).
      await expect(liveJobs('detail_page_generate', identity.generationId)).resolves.toEqual([
        expect.objectContaining({ kind: 'content.detail_page_generate', status: 'prepared', scheduledFor: null }),
      ]);

      const driftIdentity = deriveProductGenerationChildIdentity({
        ...coordinate,
        requestHash: 'b'.repeat(64),
        kind: 'detail_page',
      });
      await expect(open(firstRepository, driftIdentity)).rejects.toMatchObject(
        { code: 'STATE_CONFLICT', details: { reason: 'PRODUCT_GENERATION_IDEMPOTENCY_CONFLICT' } },
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
      await expect(prisma.thumbnailGeneration.count({
        where: { id: identity.generationId, organizationId: TEST_ORGANIZATION_ID },
      })).resolves.toBe(1);
      await expect(liveJobs('thumbnail_generate', identity.generationId)).resolves.toEqual([
        expect.objectContaining({ kind: 'content.thumbnail_generate', status: 'prepared' }),
      ]);

      const driftIdentity = deriveProductGenerationChildIdentity({
        ...coordinate,
        requestHash: 'b'.repeat(64),
        kind: 'thumbnail',
      });
      await expect(open(firstRepository, driftIdentity)).rejects.toMatchObject(
        { code: 'STATE_CONFLICT', details: { reason: 'PRODUCT_GENERATION_IDEMPOTENCY_CONFLICT' } },
      );
    } finally {
      await otherPrisma.$disconnect();
    }
  });

  it('atomically terminalizes detail and thumbnail owner rows with their live jobs, even when a result was already saved', async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        normalizedTitle: 'cancellation owner',
        createdByUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
      },
      select: { id: true },
    });
    const detail = await prisma.detailPage.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        source: 'generated',
        status: 'processing',
      },
      select: { id: true },
    });
    const thumbnail = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        inputMeta: { originalUrl: 'https://example.com/input.jpg' },
        status: 'running',
      },
      select: { id: true },
    });

    const { jobs } = operations(prisma);
    const detailJob = await jobs.prepare(undefined, {
      organizationId: TEST_ORGANIZATION_ID,
      jobType: 'detail_page_generate',
      sourceResourceId: detail.id,
      payload: detailDirectPayload(),
    });
    const thumbnailJob = await jobs.prepare(undefined, {
      organizationId: TEST_ORGANIZATION_ID,
      jobType: 'thumbnail_generate',
      sourceResourceId: thumbnail.id,
      payload: thumbnailDirectPayload(),
    });
    // 두 job 모두 워커가 집어 결과를 받아 둔 상태(옛 projecting)에서 취소가 온다.
    for (let taken = 0; taken < 2; taken += 1) {
      const claimed = (await jobs.claim('worker-1'))!;
      await jobs.saveResult(claimed.job, claimed.token, { candidates: [{ url: 'https://example.com/out.png' }] });
    }

    const detailCanceller = detailGenerationRepository(prisma);
    const thumbnailCanceller = thumbnailGenerationRepository(prisma);
    const [detailResults, thumbnailResults] = await Promise.all([
      Promise.all([
        detailCanceller.cancelDirectGeneration({
          organizationId: TEST_ORGANIZATION_ID,
          detailPageId: detail.id,
          reason: 'operator_cancelled',
        }),
        detailCanceller.cancelDirectGeneration({
          organizationId: TEST_ORGANIZATION_ID,
          detailPageId: detail.id,
          reason: 'operator_cancelled',
        }),
      ]),
      Promise.all([
        thumbnailCanceller.cancelDirectGeneration({
          organizationId: TEST_ORGANIZATION_ID,
          generationId: thumbnail.id,
          reason: 'operator_cancelled',
        }),
        thumbnailCanceller.cancelDirectGeneration({
          organizationId: TEST_ORGANIZATION_ID,
          generationId: thumbnail.id,
          reason: 'operator_cancelled',
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
    await expect(prisma.detailPage.findUniqueOrThrow({
      where: { id: detail.id },
      select: { status: true, errorMessage: true },
    })).resolves.toEqual({
      status: 'failed',
      errorMessage: 'operator_cancelled',
    });
    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({
      where: { id: thumbnail.id },
      select: { status: true, errorMessage: true },
    })).resolves.toEqual({
      status: 'cancelled',
      errorMessage: 'operator_cancelled',
    });
    await expect(prisma.operation.findMany({
      where: { id: { in: [detailJob.jobId, thumbnailJob.jobId] } },
      select: { id: true, status: true, errorCode: true },
    })).resolves.toEqual(expect.arrayContaining([
      { id: detailJob.jobId, status: 'cancelled', errorCode: 'USER_CANCELLED' },
      { id: thumbnailJob.jobId, status: 'cancelled', errorCode: 'USER_CANCELLED' },
    ]));
    await expect(prisma.operationLock.count()).resolves.toBe(0);
    await expect(prisma.operationChunk.count()).resolves.toBe(0);
  });

  it('restarts a thumbnail re-edit: the live job is cancelled and a new one prepared in one transaction', async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        normalizedTitle: 'reedit owner',
        createdByUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
      },
      select: { id: true },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: { organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspace.id, status: 'pending' },
      select: { id: true },
    });
    const ledger = thumbnailGenerationRepository(prisma);
    const reedit = (purpose: 'compliance' | 'quality') => ledger.restartReeditJob({
      organizationId: TEST_ORGANIZATION_ID,
      generationId: generation.id,
      directJob: {
        jobType: 'thumbnail_reedit',
        payload: {
          jobType: 'thumbnail_reedit',
          models: { image: 'gemini-image-model' },
          input: { generationId: generation.id, purpose, variantKey: 'auto' },
        },
      },
    });

    const first = await reedit('compliance');
    const { jobs } = operations(prisma);
    const running = (await jobs.claim('worker-1'))!;
    expect(running.job.id).toBe(first.jobId);
    const second = await reedit('quality');

    expect(second.jobId).not.toBe(first.jobId);
    await expect(prisma.operation.findUniqueOrThrow({ where: { id: first.jobId } })).resolves.toMatchObject({ status: 'cancelled' });
    await expect(jobs.heartbeat(running.job, running.token)).resolves.toBe('cancelled');
    await expect(liveJobs('thumbnail_reedit', generation.id)).resolves.toEqual([
      expect.objectContaining({ id: second.jobId, status: 'prepared', plan: expect.objectContaining({ payload: expect.objectContaining({ input: expect.objectContaining({ purpose: 'quality' }) }) }) }),
    ]);

    // 이전 job이 끝난 뒤의 재편집은 새 job 하나만 만든다.
    await jobs.cancel(TEST_ORGANIZATION_ID, second.jobId);
    const third = await reedit('compliance');
    await expect(liveJobs('thumbnail_reedit', generation.id)).resolves.toEqual([expect.objectContaining({ id: third.jobId })]);
  });

  it('a cancel that arrives while the finish projects the result neither deadlocks nor splits the outcome', async () => {
    // 실제 썸네일 sink가 finish 트랜잭션 안에서 반영한다. 모델 호출만 없다(결과는 받아 둔 상태에서 시작).
    const scoped = prisma as unknown as PrismaService;
    let processor!: AiDirectJobProcessorService;
    const contract = aiDirectJobOperations(prisma, {
      project: (job, result, transaction) => processor.project(job, result, transaction),
      projectFailure: (job, error, transaction) => processor.projectFailure(job, error, transaction),
    });
    const ledger = new ThumbnailGenerationLedgerRepositoryAdapter(
      scoped, contract.jobs, makeChannelListingQuery(prisma), makeChannelRecipes(prisma),
    );
    const sink = new ThumbnailGenerationSinkAdapter(new ThumbnailGenerationLifecycleService(ledger), { getUrl: (key: string) => key } as never);
    processor = new AiDirectJobProcessorService(
      {} as never, {} as never, {} as never, {} as never, {} as never, sink, {} as never, ledger, {} as never,
    );
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        normalizedTitle: 'race owner',
        createdByUserId: 'f1234567-89ab-4cde-8f01-23456789abcd',
      },
      select: { id: true },
    });

    for (let round = 0; round < 6; round += 1) {
      const generation = await prisma.thumbnailGeneration.create({
        data: { organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspace.id, status: 'running' },
        select: { id: true },
      });
      await contract.jobs.prepare(undefined, {
        organizationId: TEST_ORGANIZATION_ID,
        jobType: 'thumbnail_generate',
        sourceResourceId: generation.id,
        payload: thumbnailDirectPayload(),
      });
      const claimed = (await contract.jobs.claim('worker-1'))!;
      await contract.jobs.saveResult(claimed.job, claimed.token, { candidates: [{ url: 'https://example.com/out.png' }] });

      const [finished, cancelled] = await Promise.all([
        contract.jobs.succeed(claimed.job, claimed.token),
        ledger.cancelDirectGeneration({ organizationId: TEST_ORGANIZATION_ID, generationId: generation.id, reason: 'operator_cancelled' }),
      ]);

      const row = await prisma.thumbnailGeneration.findUniqueOrThrow({ where: { id: generation.id }, select: { status: true } });
      const operation = await prisma.operation.findUniqueOrThrow({ where: { id: claimed.job.id }, select: { status: true } });
      const candidates = await prisma.contentAsset.count({ where: { thumbnailGenerationId: generation.id, isDeleted: false } });
      if (finished) {
        expect({ row, operation, candidates, cancelled: cancelled.status }).toEqual({
          row: { status: 'succeeded' }, operation: { status: 'succeeded' }, candidates: 1, cancelled: 'already_terminal',
        });
      } else {
        expect({ row, operation, candidates, cancelled: cancelled.status }).toEqual({
          row: { status: 'cancelled' }, operation: { status: 'cancelled' }, candidates: 0, cancelled: 'cancelled',
        });
      }
    }
    await expect(prisma.operationLock.count()).resolves.toBe(0);
  }, 20_000);

  /** 이 원천의 이 종류 job 가운데 잠금을 쥔(끝나지 않은) 실행. */
  async function liveJobs(jobType: Parameters<typeof aiDirectJobLockKey>[0], sourceResourceId: string) {
    return prisma.operation.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, locks: { some: { lockKey: aiDirectJobLockKey(jobType, sourceResourceId) } } },
    });
  }
});

function operations(prisma: PrismaClient) {
  return aiDirectJobOperations(prisma, { project: vi.fn(), projectFailure: vi.fn() });
}

function detailGenerationRepository(prisma: PrismaClient): DetailPageGenerationRepositoryAdapter {
  const scopedPrisma = prisma as unknown as PrismaService;
  return new DetailPageGenerationRepositoryAdapter(
    scopedPrisma,
    new DetailPageRepositoryAdapter(scopedPrisma),
    operations(prisma).jobs,
  );
}

function thumbnailGenerationRepository(prisma: PrismaClient): ThumbnailGenerationLedgerRepositoryAdapter {
  const scopedPrisma = prisma as unknown as PrismaService;
  return new ThumbnailGenerationLedgerRepositoryAdapter(
    scopedPrisma,
    operations(prisma).jobs, makeChannelListingQuery(prisma), makeChannelRecipes(prisma));
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
