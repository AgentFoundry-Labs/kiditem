import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailPageContentGenerationSinkAdapter } from '../detail-page-content-generation-sink.adapter';
import type { OperationAlertPort } from '../../../../application/port/out/operation-alert.port';
import type { DetailPageGeneratedImagesService } from '../../../../application/service/detail-page-generated-images.service';
import type { ContentAssetService } from '../../../../application/service/content-asset.service';
import type { ProductGenerationAlertService } from '../../../../application/service/product-generation-alert.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG = '22222222-2222-2222-2222-222222222222';
const REQUEST = '33333333-3333-3333-3333-333333333333';
const RUN = '44444444-4444-4444-4444-444444444444';
const CG_ID = '55555555-5555-5555-5555-555555555555';
const GROUP_ID = '66666666-6666-4666-8666-666666666666';
const CANDIDATE_ID = '77777777-7777-4777-8777-777777777777';
const ARTIFACT_ID = '88888888-8888-4888-8888-888888888888';
const REGISTRATION_WORKSPACE_ID = '99999999-9999-4999-8999-999999999999';

const STORED_RAW_INPUT = {
  rawTitle: '키즈 텀블러',
  rawCategory: '유아용품',
  rawDescription: '아이가 사용하기 좋은 텀블러',
  rawOptions: '핑크/블루',
  imageUrls: ['https://example.com/p1.jpg'],
  heroImageMode: 'first' as const,
  templateId: 'bold-vertical' as const,
  ageGroup: 'age-14-plus' as const,
  detailImageCount: '1' as const,
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CG_ID,
    organizationId: ORG,
    generationGroupId: GROUP_ID,
    contentType: 'detail_page',
    templateId: 'bold-vertical',
    generationInput: STORED_RAW_INPUT,
    generationResult: {
      templateId: 'bold-vertical',
      result: {},
      imageUrls: ['https://example.com/p1.jpg'],
      processedImages: {},
    },
    generatedTitle: '키즈 텀블러',
    sourceCandidateId: CANDIDATE_ID,
    contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
    detailPageArtifactId: null,
    triggeredByUserId: 'user-1',
    status: 'PROCESSING',
    errorMessage: null,
    createdAt: new Date('2026-05-08T00:00:00.000Z'),
    generationGroup: {
      targetMasterId: null,
    },
    ...overrides,
  };
}

function makePrismaStub(row: ReturnType<typeof makeRow> | null) {
  return {
    contentGeneration: {
      findFirst: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    detailPageArtifact: {
      create: vi.fn().mockResolvedValue({ id: ARTIFACT_ID }),
    },
    contentWorkspace: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makeAlertsStub(): OperationAlertPort {
  return {
    succeed: vi.fn().mockResolvedValue(null),
    fail: vi.fn().mockResolvedValue(null),
  } as unknown as OperationAlertPort;
}

function makeImagesStub(): DetailPageGeneratedImagesService {
  return {
    generateBestEffort: vi.fn().mockResolvedValue({
      __heroBanner: 'https://cdn.example.com/hero.png',
    }),
  } as unknown as DetailPageGeneratedImagesService;
}

function makeContentAssetsStub(): ContentAssetService {
  return {
    recordDetailPageGeneratedAssets: vi.fn().mockResolvedValue(undefined),
  } as unknown as ContentAssetService;
}

function makeProductGenerationAlertsStub(): ProductGenerationAlertService {
  return {
    markChildFinished: vi.fn().mockResolvedValue({}),
  } as unknown as ProductGenerationAlertService;
}

const VALID_OUTPUT = {
  templateId: 'bold-vertical' as const,
  result: {
    hook: {
      subtext: '이달의 추천',
      text: '키즈 텀블러',
      titleSub: '안심 음수',
      description: '아이가 들기 쉬운 휴대 텀블러',
      imageIndex: 0,
      bannerImageIndex: null,
    },
    section: { name: '키즈 텀블러', title: '안심 음수', subtitle: '안심 음수' },
    keyPoints: [
      { title: '가벼움', description: '들고 다녀도 부담 없음', imageIndex: 0 },
      { title: '논슬립', description: '미끄러짐 방지 그립', imageIndex: 0 },
      { title: '안심 재질', description: 'KC 인증 안심 재질', imageIndex: 0 },
    ],
    size: { subtitle: '500ml 표준', imageIndices: [] },
    color: { subtitle: '핑크/블루 2색', imageIndices: [] },
    usage: { subtitle: '뚜껑을 돌려 음수', imageIndices: [] },
    detailImageIndices: [0],
    productInfo: [
      { key: '제품명', value: '키즈 텀블러' },
      { key: '재질', value: '트라이탄' },
      { key: '색상', value: '핑크/블루' },
    ],
  },
  imageUrls: ['https://example.com/p1.jpg'],
  processedImages: {
    __heroBanner: 'https://cdn.example.com/hero.png',
  },
};

describe('DetailPageContentGenerationSinkAdapter', () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let alerts: OperationAlertPort;
  let images: DetailPageGeneratedImagesService;
  let contentAssets: ContentAssetService;
  let productGenerationAlerts: ProductGenerationAlertService;
  let sink: DetailPageContentGenerationSinkAdapter;

  beforeEach(() => {
    prisma = makePrismaStub(makeRow());
    alerts = makeAlertsStub();
    images = makeImagesStub();
    contentAssets = makeContentAssetsStub();
    productGenerationAlerts = makeProductGenerationAlertsStub();
    sink = new DetailPageContentGenerationSinkAdapter(
      prisma as never,
      alerts,
      images,
      contentAssets,
      productGenerationAlerts,
    );
  });

  describe('applySuccess', () => {
    it('updates the row to READY with generationResult media and closes the alert', async () => {
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        output: VALID_OUTPUT,
      });

      expect(images.generateBestEffort).not.toHaveBeenCalled();
      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: CG_ID, organizationId: ORG }),
          data: expect.objectContaining({
            detailPageArtifactId: ARTIFACT_ID,
            status: 'READY',
            errorMessage: null,
          }),
        }),
      );
      expect(prisma.detailPageArtifact.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
          sourceCandidateId: CANDIDATE_ID,
          targetMasterId: null,
          sourceContentGenerationId: CG_ID,
          title: '키즈 텀블러 안심 음수',
          status: 'generated',
          createdByUserId: 'user-1',
          metadata: {
            source: 'detail_page_generation_success',
            agentRequestId: REQUEST,
            agentRunId: RUN,
          },
        },
        select: { id: true },
      });
      expect(prisma.contentWorkspace.updateMany).toHaveBeenCalledWith({
        where: {
          id: REGISTRATION_WORKSPACE_ID,
          organizationId: ORG,
          isDeleted: false,
        },
        data: {
          currentDetailPageArtifactId: ARTIFACT_ID,
          status: 'active',
        },
      });
      const updateCall = prisma.contentGeneration.updateMany.mock.calls[0][0] as {
        data: { generationResult: { processedImages: Record<string, string>; result: { hook?: { text?: string } }; templateId: string } };
      };
      expect(updateCall.data.generationResult.processedImages).toMatchObject({
        __heroBanner: 'https://cdn.example.com/hero.png',
      });
      expect(contentAssets.recordDetailPageGeneratedAssets).toHaveBeenCalledWith({
        organizationId: ORG,
        contentGenerationId: CG_ID,
        generationGroupId: GROUP_ID,
        processedImages: {
          __heroBanner: 'https://cdn.example.com/hero.png',
        },
      });
      expect(updateCall.data.generationResult.templateId).toBe('bold-vertical');
      expect(updateCall.data.generationResult.result.hook?.text).toBe('키즈 텀블러');
      expect(alerts.succeed).toHaveBeenCalledWith(
        ORG,
        `detail-page:${CG_ID}`,
        expect.objectContaining({
          metadata: expect.objectContaining({ agentRequestId: REQUEST }),
        }),
      );
    });

    it('updates the product generation parent alert on detail success', async () => {
      prisma = makePrismaStub(makeRow({
        generationInput: {
          ...STORED_RAW_INPUT,
          productGeneration: {
            mode: 'parent',
            productGenerationBatchId: 'batch-1',
            parentOperationKey: 'product-generation:batch-1',
            childKind: 'detail_page',
          },
        },
      }));
      sink = new DetailPageContentGenerationSinkAdapter(
        prisma as never,
        alerts,
        images,
        contentAssets,
        productGenerationAlerts,
      );

      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        output: VALID_OUTPUT,
      });

      expect(productGenerationAlerts.markChildFinished).toHaveBeenCalledWith({
        organizationId: ORG,
        parentOperationKey: 'product-generation:batch-1',
        childKind: 'detail_page',
        status: 'succeeded',
        childId: CG_ID,
      });
      expect(alerts.succeed).not.toHaveBeenCalledWith(
        ORG,
        `detail-page:${CG_ID}`,
        expect.anything(),
      );
    });

    it('does not apply detail-page success when parent product operation is cancelled', async () => {
      prisma = makePrismaStub(makeRow({
        generationInput: {
          ...STORED_RAW_INPUT,
          productGeneration: {
            mode: 'parent',
            productGenerationBatchId: 'batch-1',
            parentOperationKey: 'product-generation:batch-1',
            childKind: 'detail_page',
          },
        },
      }));
      alerts = {
        ...makeAlertsStub(),
        findByOperationKey: vi.fn().mockResolvedValue({ status: 'cancelled' }),
      } as unknown as OperationAlertPort;
      sink = new DetailPageContentGenerationSinkAdapter(
        prisma as never,
        alerts,
        images,
        contentAssets,
        productGenerationAlerts,
      );

      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        output: VALID_OUTPUT,
      });

      expect(prisma.contentGeneration.updateMany).not.toHaveBeenCalled();
      expect(productGenerationAlerts.markChildFinished).not.toHaveBeenCalled();
      expect(alerts.succeed).not.toHaveBeenCalled();
    });

    it('reuses an existing detail page artifact on replay-compatible success', async () => {
      prisma = makePrismaStub(makeRow({ detailPageArtifactId: ARTIFACT_ID }));
      sink = new DetailPageContentGenerationSinkAdapter(
        prisma as never,
        alerts,
        images,
        contentAssets,
        productGenerationAlerts,
      );

      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        output: VALID_OUTPUT,
      });

      expect(prisma.detailPageArtifact.create).not.toHaveBeenCalled();
      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            detailPageArtifactId: ARTIFACT_ID,
            status: 'READY',
          }),
        }),
      );
    });

    it('trusts runtime output for draft-only detail-page runs', async () => {
      prisma = makePrismaStub(makeRow({
        generationInput: {
          ...STORED_RAW_INPUT,
          generationMode: 'draft',
        },
      }));
      sink = new DetailPageContentGenerationSinkAdapter(
        prisma as never,
        alerts,
        images,
        contentAssets,
        productGenerationAlerts,
      );

      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
          runId: RUN,
          sourceResourceId: CG_ID,
          output: {
            ...VALID_OUTPUT,
            processedImages: {},
          },
        });

      expect(images.generateBestEffort).not.toHaveBeenCalled();
      expect(contentAssets.recordDetailPageGeneratedAssets).not.toHaveBeenCalled();
      const updateCall = prisma.contentGeneration.updateMany.mock.calls[0][0] as {
        data: { generationResult: { processedImages: Record<string, string> } };
      };
      expect(updateCall.data.generationResult.processedImages).toEqual({});
    });

    it('scopes the lookup by organizationId (cross-tenant attempt is a no-op)', async () => {
      await sink.applySuccess({
        organizationId: OTHER_ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        output: VALID_OUTPUT,
      });
      // Stub returns the row regardless because it ignores the where clause,
      // but we assert the where clause itself passed the right scope so the
      // real Prisma path enforces IDOR.
      expect(prisma.contentGeneration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: OTHER_ORG }),
        }),
      );
    });

    it('does not double-apply when the row is already READY (idempotent)', async () => {
      prisma = makePrismaStub(makeRow({ status: 'READY' }));
      sink = new DetailPageContentGenerationSinkAdapter(
        prisma as never,
        alerts,
        images,
        contentAssets,
        productGenerationAlerts,
      );
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        output: VALID_OUTPUT,
      });
      expect(images.generateBestEffort).not.toHaveBeenCalled();
      expect(prisma.contentGeneration.updateMany).not.toHaveBeenCalled();
      expect(alerts.succeed).not.toHaveBeenCalled();
    });

    it('does not apply success after the user cancelled the row', async () => {
      prisma = makePrismaStub(makeRow({ status: 'CANCELLED' }));
      sink = new DetailPageContentGenerationSinkAdapter(
        prisma as never,
        alerts,
        images,
        contentAssets,
        productGenerationAlerts,
      );
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        output: VALID_OUTPUT,
      });
      expect(images.generateBestEffort).not.toHaveBeenCalled();
      expect(prisma.contentGeneration.updateMany).not.toHaveBeenCalled();
      expect(alerts.succeed).not.toHaveBeenCalled();
    });

    it('no-ops when sourceResourceId is missing (defensive)', async () => {
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: null,
        output: VALID_OUTPUT,
      });
      expect(prisma.contentGeneration.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('applyFailure', () => {
    it('updates the row to FAILED with errorMessage and fires alert.fail', async () => {
      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        errorCode: 'runtime_not_configured',
        errorMessage: 'no provider',
      });
      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: CG_ID, organizationId: ORG }),
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'no provider',
          }),
        }),
      );
      expect(alerts.fail).toHaveBeenCalledWith(
        ORG,
        `detail-page:${CG_ID}`,
        expect.objectContaining({
          message: 'no provider',
          metadata: expect.objectContaining({
            errorCode: 'runtime_not_configured',
            agentRequestId: REQUEST,
          }),
        }),
      );
    });

    it('skips when row already FAILED (idempotent reconcile-replay safe)', async () => {
      prisma = makePrismaStub(makeRow({ status: 'FAILED' }));
      sink = new DetailPageContentGenerationSinkAdapter(
        prisma as never,
        alerts,
        images,
        contentAssets,
        productGenerationAlerts,
      );
      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        errorCode: 'agent_run_failed',
        errorMessage: 'second attempt',
      });
      expect(prisma.contentGeneration.updateMany).not.toHaveBeenCalled();
      expect(alerts.fail).not.toHaveBeenCalled();
    });

    it('skips failure after the user cancelled the row', async () => {
      prisma = makePrismaStub(makeRow({ status: 'CANCELLED' }));
      sink = new DetailPageContentGenerationSinkAdapter(
        prisma as never,
        alerts,
        images,
        contentAssets,
        productGenerationAlerts,
      );
      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: CG_ID,
        errorCode: 'agent_run_failed',
        errorMessage: 'late failure',
      });
      expect(prisma.contentGeneration.updateMany).not.toHaveBeenCalled();
      expect(alerts.fail).not.toHaveBeenCalled();
    });
  });
});
