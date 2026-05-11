import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationService } from '../thumbnail-generation.service';
import type { OperationAlertService } from '../../../../automation/application/service/operation-alert.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  findJobMastersByIds: vi.fn(),
  findActiveJobForProduct: vi.fn(),
  createPendingEditJob: vi.fn(),
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
  markGenerationCancelled: vi.fn(),
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
  };
}

function makeService(operationAlerts = makeOperationAlertsStub()) {
  const generationJobs = makeGenerationJobsStub();
  return {
    generationJobs,
    operationAlerts,
    service: new ThumbnailGenerationService(
      {} as never,
      {} as never,
      operationAlerts,
      generationJobs as never,
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
        href: `/thumbnails?generationId=${GENERATION_ID}`,
      }),
    );
  });
});
