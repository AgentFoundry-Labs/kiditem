import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationSinkAdapter } from '../thumbnail-generation-sink.adapter';
import * as persistence from '../../prisma/thumbnail-generation.persistence';
import type { OperationAlertPort } from '../../../../application/port/out/operation-alert.port';
import type { ThumbnailGenerationEventPort } from '../../../../application/port/out/thumbnail-generation-event.port';
import type { ProductGenerationAlertService } from '../../../../application/service/product-generation-alert.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';
const GEN_ID = '44444444-4444-4444-4444-444444444444';

function makePrismaStub() {
  return {
    thumbnailGeneration: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  } as unknown as Parameters<typeof persistence.lockGenerationForProcessing>[0];
}

function makeAlerts(): OperationAlertPort {
  return {
    succeed: vi.fn().mockResolvedValue(null),
    fail: vi.fn().mockResolvedValue(null),
  } as unknown as OperationAlertPort;
}

function makeEvents(): ThumbnailGenerationEventPort {
  return { append: vi.fn().mockResolvedValue(undefined) };
}

function makeProductGenerationAlerts(): ProductGenerationAlertService {
  return {
    markChildFinished: vi.fn().mockResolvedValue({}),
  } as unknown as ProductGenerationAlertService;
}

const VALID_OUTPUT = {
  candidates: [
    {
      url: 'https://cdn.example.com/c1.png',
      filename: 'c1.png',
      storageKey: 'thumbnail-generations/org/c1.png',
      mimeType: 'image/png',
      fileSize: 12345,
    },
  ],
};

describe('ThumbnailGenerationSinkAdapter', () => {
  let alerts: OperationAlertPort;
  let events: ThumbnailGenerationEventPort;
  let lockSpy: ReturnType<typeof vi.spyOn>;
  let applySuccessSpy: ReturnType<typeof vi.spyOn>;
  let markFailedSpy: ReturnType<typeof vi.spyOn>;
  let productGenerationAlerts: ProductGenerationAlertService;

  beforeEach(() => {
    alerts = makeAlerts();
    events = makeEvents();
    lockSpy = vi
      .spyOn(persistence, 'lockGenerationForProcessing')
      .mockResolvedValue({ fromStatus: 'pending', fromPhase: null, attemptNumber: 1 });
    applySuccessSpy = vi
      .spyOn(persistence, 'applyAgentSuccessResult')
      .mockResolvedValue({ fromStatus: 'running', fromPhase: null, attemptNumber: 1 });
    markFailedSpy = vi
      .spyOn(persistence, 'markGenerationFailed')
      .mockResolvedValue({ fromStatus: 'running', fromPhase: null, attemptNumber: 1 });
    productGenerationAlerts = makeProductGenerationAlerts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('applySuccess', () => {
    it('locks → applyAgentSuccessResult → status event → alert succeed (with results href)', async () => {
      const sink = new ThumbnailGenerationSinkAdapter(makePrismaStub() as never, alerts, events);
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        output: VALID_OUTPUT,
      });

      expect(lockSpy).toHaveBeenCalledWith(expect.anything(), GEN_ID, ORG);
      expect(applySuccessSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          generationId: GEN_ID,
          organizationId: ORG,
          inputMeta: expect.objectContaining({ agentRequestId: REQUEST }),
        }),
      );
      expect(events.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'status_change',
          fromStatus: 'running',
          toStatus: 'succeeded',
          toPhase: 'ready',
        }),
      );
      expect(alerts.succeed).toHaveBeenCalledWith(
        ORG,
        `thumbnail-edit:${GEN_ID}`,
        expect.objectContaining({
          href: `/product-pipeline/thumbnail-generation?generationId=${encodeURIComponent(GEN_ID)}`,
          metadata: expect.objectContaining({
            candidateCount: 1,
            agentRequestId: REQUEST,
          }),
        }),
      );
    });

    it('no-ops when lock returns null (row already terminal — reconcile-replay safe)', async () => {
      lockSpy.mockResolvedValueOnce(null);
      const sink = new ThumbnailGenerationSinkAdapter(makePrismaStub() as never, alerts, events);
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        output: VALID_OUTPUT,
      });
      expect(applySuccessSpy).not.toHaveBeenCalled();
      expect(alerts.succeed).not.toHaveBeenCalled();
    });

    it('no-ops when sourceResourceId is missing (defensive)', async () => {
      const sink = new ThumbnailGenerationSinkAdapter(makePrismaStub() as never, alerts, events);
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: null,
        output: VALID_OUTPUT,
      });
      expect(lockSpy).not.toHaveBeenCalled();
    });
  });

  describe('applyFailure', () => {
    it('locks → markGenerationFailed → status event → alert fail (with code metadata)', async () => {
      const sink = new ThumbnailGenerationSinkAdapter(makePrismaStub() as never, alerts, events);
      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        errorCode: 'runtime_not_configured',
        errorMessage: 'no provider',
      });
      expect(lockSpy).toHaveBeenCalledWith(expect.anything(), GEN_ID, ORG);
      expect(markFailedSpy).toHaveBeenCalledWith(
        expect.anything(),
        GEN_ID,
        ORG,
        'no provider',
      );
      expect(events.append).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatus: 'running',
          toStatus: 'failed',
          errorMessage: 'no provider',
        }),
      );
      expect(alerts.fail).toHaveBeenCalledWith(
        ORG,
        `thumbnail-edit:${GEN_ID}`,
        expect.objectContaining({
          message: 'no provider',
          metadata: expect.objectContaining({
            errorCode: 'runtime_not_configured',
            agentRequestId: REQUEST,
          }),
        }),
      );
    });

    it('updates the product generation parent alert on thumbnail failure', async () => {
      const prisma = {
        thumbnailGeneration: {
          findFirst: vi.fn().mockResolvedValue({
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
      } as unknown as Parameters<typeof persistence.lockGenerationForProcessing>[0];
      const sink = new ThumbnailGenerationSinkAdapter(
        prisma as never,
        alerts,
        events,
        productGenerationAlerts,
      );

      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        errorCode: 'agent_failed',
        errorMessage: 'thumbnail failed',
      });

      expect(productGenerationAlerts.markChildFinished).toHaveBeenCalledWith({
        organizationId: ORG,
        parentOperationKey: 'product-generation:batch-1',
        childKind: 'thumbnail',
        status: 'failed',
        childId: GEN_ID,
        errorMessage: 'thumbnail failed',
      });
      expect(alerts.fail).not.toHaveBeenCalledWith(
        ORG,
        `thumbnail-edit:${GEN_ID}`,
        expect.anything(),
      );
    });

    it('does not apply thumbnail success when parent product operation is cancelled', async () => {
      const prisma = {
        thumbnailGeneration: {
          findFirst: vi.fn().mockResolvedValue({
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
      } as unknown as Parameters<typeof persistence.lockGenerationForProcessing>[0];
      const operationAlerts = {
        ...makeAlerts(),
        findByOperationKey: vi.fn().mockResolvedValue({ status: 'cancelled' }),
      } as unknown as OperationAlertPort;
      const sink = new ThumbnailGenerationSinkAdapter(
        prisma as never,
        operationAlerts,
        events,
        productGenerationAlerts,
      );

      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        output: VALID_OUTPUT,
      });

      expect(lockSpy).not.toHaveBeenCalled();
      expect(applySuccessSpy).not.toHaveBeenCalled();
      expect(productGenerationAlerts.markChildFinished).not.toHaveBeenCalled();
    });

    it('no-ops when lock returns null (already terminal)', async () => {
      lockSpy.mockResolvedValueOnce(null);
      const sink = new ThumbnailGenerationSinkAdapter(makePrismaStub() as never, alerts, events);
      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        errorCode: 'agent_run_failed',
        errorMessage: 'second attempt',
      });
      expect(markFailedSpy).not.toHaveBeenCalled();
      expect(alerts.fail).not.toHaveBeenCalled();
    });
  });
});
