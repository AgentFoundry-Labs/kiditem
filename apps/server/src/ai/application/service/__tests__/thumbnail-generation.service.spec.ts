import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationService } from '../thumbnail-generation.service';
import type { OperationAlertService } from '../../../../automation/application/service/operation-alert.service';
import type { ProductGenerationAlertService } from '../product-generation-alert.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  findJobMastersByIds: vi.fn(),
  findActiveJobForProduct: vi.fn(),
  createPendingEditJob: vi.fn(),
  markGenerationCancelled: vi.fn(),
  toThumbnailGenerationItem: vi.fn(),
  resolveMasterThumbnailImage: vi.fn(),
}));

vi.mock('../../../adapter/out/prisma/thumbnail-generation.query', () => ({
  findActiveJobForProduct: mocks.findActiveJobForProduct,
  findAutoBatchCandidates: vi.fn(),
  findGenerationMaster: vi.fn(),
  findGenerationMasters: vi.fn(),
  findGenerationOrThrow: vi.fn(),
  findGenerationRows: vi.fn(),
  findGenerationWithCandidatesOrThrow: vi.fn(),
  findGenerationWithInputImages: vi.fn(),
  findJobMaster: vi.fn(),
  findJobMastersByIds: mocks.findJobMastersByIds,
  findProductForEditor: vi.fn(),
  findRecentAutoJob: vi.fn(),
  findThumbnailAnalysisGrade: vi.fn(),
}));

vi.mock('../../../adapter/out/prisma/thumbnail-generation.persistence', () => ({
  applyGenerationToMaster: vi.fn(),
  createPendingEditJob: mocks.createPendingEditJob,
  deleteGeneration: vi.fn(),
  lockGenerationForProcessing: vi.fn(),
  markGenerationCancelled: mocks.markGenerationCancelled,
  markGenerationFailed: vi.fn(),
  persistPendingInputImages: vi.fn(),
  removeCandidate: vi.fn(),
  replaceGenerationResult: vi.fn(),
  resetGenerationForReEdit: vi.fn(),
  saveEditorResult: vi.fn(),
  setSelectedCandidate: vi.fn(),
}));

vi.mock('../../../domain/thumbnail-master-image', () => ({
  resolveMasterThumbnailImage: mocks.resolveMasterThumbnailImage,
}));

vi.mock('../../../mapper/thumbnail-generation.mapper', () => ({
  toThumbnailGenerationItem: mocks.toThumbnailGenerationItem,
}));

function makeOperationAlertsStub(): OperationAlertService {
  return {
    start: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    progress: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
  } as unknown as OperationAlertService;
}

function makeGenerationJobsStub() {
  return {
    enqueueEditorGeneration: vi.fn(),
    scheduleEditJob: vi.fn(),
    processEditJob: vi.fn(),
    cancelAgentRequestForGeneration: vi.fn(),
  };
}

function makeProductGenerationAlertsStub(): ProductGenerationAlertService {
  return {
    markChildFinished: vi.fn().mockResolvedValue({}),
  } as unknown as ProductGenerationAlertService;
}

function makeService(
  operationAlerts = makeOperationAlertsStub(),
  prisma: unknown = {},
  generationEvents: unknown = null,
  productGenerationAlerts: ProductGenerationAlertService = makeProductGenerationAlertsStub(),
) {
  const generationJobs = makeGenerationJobsStub();
  return {
    generationJobs,
    operationAlerts,
    productGenerationAlerts,
    service: new ThumbnailGenerationService(
      prisma as never,
      {} as never,
      operationAlerts,
      generationJobs as never,
      generationEvents as never,
      productGenerationAlerts,
    ),
  };
}

describe('ThumbnailGenerationService operation alerts', () => {
  let setImmediateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setImmediateSpy = vi.spyOn(globalThis, 'setImmediate').mockImplementation(() => 0 as never);
    mocks.findJobMastersByIds.mockResolvedValue(new Map([
      [
        MASTER_ID,
        {
          id: MASTER_ID,
          name: '검증용 상품',
          thumbnailAnalyses: [],
        },
      ],
    ]));
    mocks.findActiveJobForProduct.mockResolvedValue(null);
    mocks.resolveMasterThumbnailImage.mockReturnValue('https://cdn.example.com/source.jpg');
    mocks.createPendingEditJob.mockResolvedValue({
      id: GENERATION_ID,
      masterId: MASTER_ID,
      status: 'pending',
    });
    mocks.toThumbnailGenerationItem.mockReturnValue({
      id: GENERATION_ID,
      productId: MASTER_ID,
    });
  });

  afterEach(() => {
    setImmediateSpy.mockRestore();
  });

  it('links thumbnail edit alerts to the thumbnail workspace with generation context', async () => {
    const { service, operationAlerts } = makeService();

    await service.createEditJobs(
      [MASTER_ID],
      ORGANIZATION_ID,
      'compliance',
      'auto',
      USER_ID,
    );

    expect(mocks.createPendingEditJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ triggeredByUserId: USER_ID }),
    );
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: `thumbnail-edit:${GENERATION_ID}`,
        sourceType: 'thumbnail_generation',
        sourceId: GENERATION_ID,
        actorUserId: USER_ID,
        href: `/product-pipeline/thumbnail-generation?generationId=${GENERATION_ID}`,
      }),
    );
  });

  it('records cancellation audit in the thumbnail generation event payload', async () => {
    const prisma = {
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: GENERATION_ID,
          status: 'running',
          phase: 'processing',
        }),
      },
    };
    const operationAlerts = makeOperationAlertsStub();
    const generationEvents = { append: vi.fn() };
    const { service, generationJobs } = makeService(
      operationAlerts,
      prisma,
      generationEvents,
    );
    mocks.markGenerationCancelled.mockResolvedValueOnce({
      fromStatus: 'running',
      fromPhase: 'processing',
    });

    const result = await service.cancelForOperation({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      actorUserId: USER_ID,
      reason: '사용자 요청',
    });

    expect(result.status).toBe('cancelled');
    expect(generationEvents.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'status_change',
        payload: expect.objectContaining({
          operationCancellation: expect.objectContaining({
            requestedByUserId: USER_ID,
            reason: '사용자 요청',
            result: 'cancelled',
            target: {
              targetType: 'thumbnail_generation',
              generationId: GENERATION_ID,
            },
            affected: expect.objectContaining({
              thumbnailGenerationIds: [GENERATION_ID],
            }),
          }),
        }),
      }),
    );
    expect(generationJobs.cancelAgentRequestForGeneration).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      reason: '사용자 요청',
      actorUserId: USER_ID,
    });
  });

  it('marks the parent product-generation child finished when directly cancelling a child thumbnail generation', async () => {
    const prisma = {
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: GENERATION_ID,
          status: 'running',
          phase: 'processing',
          inputMeta: {
            productGeneration: {
              mode: 'parent',
              productGenerationBatchId: 'batch-1',
              parentOperationKey: 'product-generation:batch-1',
              childKind: 'thumbnail',
            },
          },
        }),
      },
    };
    const productGenerationAlerts = makeProductGenerationAlertsStub();
    const { service } = makeService(
      makeOperationAlertsStub(),
      prisma,
      { append: vi.fn() },
      productGenerationAlerts,
    );
    mocks.markGenerationCancelled.mockResolvedValueOnce({
      fromStatus: 'running',
      fromPhase: 'processing',
    });

    await service.cancelForOperation({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      actorUserId: USER_ID,
      reason: '사용자 요청',
    });

    expect(productGenerationAlerts.markChildFinished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: 'product-generation:batch-1',
      childKind: 'thumbnail',
      status: 'failed',
      childId: GENERATION_ID,
      errorMessage: '사용자 요청',
    });
  });
});
