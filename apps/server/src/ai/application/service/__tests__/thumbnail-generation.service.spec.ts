import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationService } from '../thumbnail-generation.service';
import { ThumbnailGenerationLifecycleService } from '../thumbnail-generation-lifecycle.service';
import type { OperationAlertPort } from '../../port/out/cross-domain/operation-alert.port';
import type { ProductGenerationAlertService } from '../product-generation-alert.service';
import type { ThumbnailGenerationLedgerRepositoryPort } from '../../port/out/repository/thumbnail-generation-ledger.repository.port';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  toThumbnailGenerationItem: vi.fn(),
  resolveMasterThumbnailImage: vi.fn(),
}));

vi.mock('../../../domain/thumbnail-master-image', () => ({
  resolveMasterThumbnailImage: mocks.resolveMasterThumbnailImage,
}));

vi.mock('../../../mapper/thumbnail-generation.mapper', () => ({
  toThumbnailGenerationItem: mocks.toThumbnailGenerationItem,
}));

function makeOperationAlertsStub(): OperationAlertPort {
  return {
    start: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    progress: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
  } as unknown as OperationAlertPort;
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

function makeLedgerStub(): ThumbnailGenerationLedgerRepositoryPort {
  return {
    findJobMastersByIds: vi.fn().mockResolvedValue(new Map([
      [
        MASTER_ID,
        {
          id: MASTER_ID,
          name: '검증용 상품',
          thumbnailAnalyses: [],
        },
      ],
    ])),
    findActiveJobForProduct: vi.fn().mockResolvedValue(null),
    openPendingEditorJob: vi.fn().mockResolvedValue({
      id: GENERATION_ID,
      masterId: MASTER_ID,
      status: 'pending',
    }),
    markGenerationCancelled: vi.fn().mockResolvedValue({
      fromStatus: 'running',
      fromPhase: 'processing',
    }),
    findGenerationProjectionStatus: vi.fn().mockResolvedValue({
      id: GENERATION_ID,
      status: 'running',
      phase: 'processing',
      inputMeta: null,
      errorMessage: null,
    }),
  } as unknown as ThumbnailGenerationLedgerRepositoryPort;
}

function makeService(
  operationAlerts = makeOperationAlertsStub(),
  ledger: ThumbnailGenerationLedgerRepositoryPort = makeLedgerStub(),
  generationEvents: unknown = null,
  productGenerationAlerts: ProductGenerationAlertService = makeProductGenerationAlertsStub(),
) {
  const generationJobs = makeGenerationJobsStub();
  const lifecycle = new ThumbnailGenerationLifecycleService(
    ledger,
    generationEvents as never,
  );
  return {
    ledger,
    generationJobs,
    operationAlerts,
    productGenerationAlerts,
    service: new ThumbnailGenerationService(
      ledger,
      {} as never,
      operationAlerts,
      generationJobs as never,
      lifecycle,
      productGenerationAlerts,
    ),
  };
}

describe('ThumbnailGenerationService operation alerts', () => {
  let setImmediateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setImmediateSpy = vi.spyOn(globalThis, 'setImmediate').mockImplementation(() => 0 as never);
    mocks.resolveMasterThumbnailImage.mockReturnValue('https://cdn.example.com/source.jpg');
    mocks.toThumbnailGenerationItem.mockReturnValue({
      id: GENERATION_ID,
      productId: MASTER_ID,
    });
  });

  afterEach(() => {
    setImmediateSpy.mockRestore();
  });

  it('links thumbnail edit alerts to the thumbnail workspace with generation context', async () => {
    const { service, operationAlerts, ledger } = makeService();

    await service.createEditJobs(
      [MASTER_ID],
      ORGANIZATION_ID,
      'compliance',
      'auto',
      USER_ID,
    );

    expect(ledger.openPendingEditorJob).toHaveBeenCalledWith(
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
    const ledger = makeLedgerStub();
    const operationAlerts = makeOperationAlertsStub();
    const generationEvents = { append: vi.fn() };
    const { service, generationJobs } = makeService(
      operationAlerts,
      ledger,
      generationEvents,
    );

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
    const ledger = makeLedgerStub();
    vi.mocked(ledger.findGenerationProjectionStatus).mockResolvedValueOnce({
      id: GENERATION_ID,
      status: 'running',
      phase: 'processing',
      errorMessage: null,
      inputMeta: {
        productGeneration: {
          mode: 'parent',
          productGenerationBatchId: 'batch-1',
          parentOperationKey: 'product-generation:batch-1',
          childKind: 'thumbnail',
        },
      },
    });
    const productGenerationAlerts = makeProductGenerationAlertsStub();
    const { service } = makeService(
      makeOperationAlertsStub(),
      ledger,
      { append: vi.fn() },
      productGenerationAlerts,
    );

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
