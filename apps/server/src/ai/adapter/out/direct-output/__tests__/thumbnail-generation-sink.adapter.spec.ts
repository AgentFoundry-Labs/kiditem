import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationSinkAdapter } from '../thumbnail-generation-sink.adapter';
import type { OperationAlertPort } from '../../../../application/port/out/cross-domain/operation-alert.port';
import type { ThumbnailGenerationEventPort } from '../../../../application/port/out/event/thumbnail-generation-event.port';
import type { ProductGenerationAlertService } from '../../../../application/service/product-generation-alert.service';
import type { ThumbnailGenerationLedgerRepositoryPort } from '../../../../application/port/out/repository/thumbnail-generation-ledger.repository.port';
import { ThumbnailGenerationLifecycleService } from '../../../../application/service/thumbnail-generation-lifecycle.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';
const GEN_ID = '44444444-4444-4444-4444-444444444444';

function makeLedger(
  overrides: Partial<ThumbnailGenerationLedgerRepositoryPort> = {},
): ThumbnailGenerationLedgerRepositoryPort {
  return {
    claimForDirectProjection: vi
      .fn()
      .mockResolvedValue({ fromStatus: 'pending', fromPhase: null, attemptNumber: 1 }),
    projectDirectSuccess: vi
      .fn()
      .mockResolvedValue({ fromStatus: 'running', fromPhase: null, attemptNumber: 1 }),
    projectDirectFailure: vi
      .fn()
      .mockResolvedValue({ fromStatus: 'running', fromPhase: null, attemptNumber: 1 }),
    readParentAlertLink: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as ThumbnailGenerationLedgerRepositoryPort;
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

function makeSink(
  ledger: ThumbnailGenerationLedgerRepositoryPort,
  alerts: OperationAlertPort,
  events: ThumbnailGenerationEventPort,
  productGenerationAlerts?: ProductGenerationAlertService,
): ThumbnailGenerationSinkAdapter {
  return new ThumbnailGenerationSinkAdapter(
    ledger,
    alerts,
    new ThumbnailGenerationLifecycleService(ledger, events),
    productGenerationAlerts,
  );
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
  let ledger: ThumbnailGenerationLedgerRepositoryPort;
  let productGenerationAlerts: ProductGenerationAlertService;

  beforeEach(() => {
    alerts = makeAlerts();
    events = makeEvents();
    ledger = makeLedger();
    productGenerationAlerts = makeProductGenerationAlerts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('applySuccess', () => {
    it('claims -> projectDirectSuccess -> terminal events -> alert succeed (with results href)', async () => {
      const sink = makeSink(ledger, alerts, events);
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        output: VALID_OUTPUT,
      });

      expect(ledger.claimForDirectProjection).toHaveBeenCalledWith({
        generationId: GEN_ID,
        organizationId: ORG,
      });
      expect(ledger.projectDirectSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          generationId: GEN_ID,
          organizationId: ORG,
          inputMeta: expect.objectContaining({ aiJobId: REQUEST }),
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
      expect(events.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'attempt_finished',
          fromStatus: 'running',
          toStatus: 'succeeded',
          toPhase: 'ready',
          attemptNumber: 1,
        }),
      );
      expect(events.append).toHaveBeenCalledTimes(3);
      expect(alerts.succeed).toHaveBeenCalledWith(
        ORG,
        `thumbnail-edit:${GEN_ID}`,
        expect.objectContaining({
          href: `/product-pipeline/thumbnail-generation?generationId=${encodeURIComponent(GEN_ID)}`,
          metadata: expect.objectContaining({
            candidateCount: 1,
            aiJobId: REQUEST,
          }),
        }),
      );
    });

    it('no-ops when claim returns null (row already terminal - retry safe)', async () => {
      vi.mocked(ledger.claimForDirectProjection).mockResolvedValueOnce(null);
      const sink = makeSink(ledger, alerts, events);
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        output: VALID_OUTPUT,
      });
      expect(ledger.projectDirectSuccess).not.toHaveBeenCalled();
      expect(alerts.succeed).not.toHaveBeenCalled();
    });

    it('no-ops when sourceResourceId is missing (defensive)', async () => {
      const sink = makeSink(ledger, alerts, events);
      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: null,
        output: VALID_OUTPUT,
      });
      expect(ledger.claimForDirectProjection).not.toHaveBeenCalled();
    });
  });

  describe('applyFailure', () => {
    it('claims -> projectDirectFailure -> terminal events -> alert fail (with code metadata)', async () => {
      const sink = makeSink(ledger, alerts, events);
      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        errorCode: 'runtime_not_configured',
        errorMessage: 'no provider',
      });
      expect(ledger.claimForDirectProjection).toHaveBeenCalledWith({
        generationId: GEN_ID,
        organizationId: ORG,
      });
      expect(ledger.projectDirectFailure).toHaveBeenCalledWith({
        generationId: GEN_ID,
        organizationId: ORG,
        errorMessage: 'no provider',
      });
      expect(events.append).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatus: 'running',
          toStatus: 'failed',
          errorMessage: 'no provider',
        }),
      );
      expect(events.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'error',
          fromStatus: 'running',
          toStatus: 'failed',
          errorMessage: 'no provider',
          attemptNumber: 1,
        }),
      );
      expect(events.append).toHaveBeenCalledTimes(2);
      expect(alerts.fail).toHaveBeenCalledWith(
        ORG,
        `thumbnail-edit:${GEN_ID}`,
        expect.objectContaining({
          message: 'no provider',
          metadata: expect.objectContaining({
            errorCode: 'runtime_not_configured',
            aiJobId: REQUEST,
          }),
        }),
      );
    });

    it('updates the product generation parent alert on thumbnail failure', async () => {
      const parentLedger = makeLedger({
        readParentAlertLink: vi.fn().mockResolvedValue({
          parentOperationKey: 'product-generation:batch-1',
          childKind: 'thumbnail',
          productGenerationBatchId: 'batch-1',
        }),
      });
      const sink = makeSink(parentLedger, alerts, events, productGenerationAlerts);

      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        errorCode: 'direct_ai_execution_failed',
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
      const parentLedger = makeLedger({
        readParentAlertLink: vi.fn().mockResolvedValue({
          parentOperationKey: 'product-generation:batch-1',
          childKind: 'thumbnail',
          productGenerationBatchId: 'batch-1',
        }),
      });
      const operationAlerts = {
        ...makeAlerts(),
        findByOperationKey: vi.fn().mockResolvedValue({ status: 'cancelled' }),
      } as unknown as OperationAlertPort;
      const sink = makeSink(parentLedger, operationAlerts, events, productGenerationAlerts);

      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        output: VALID_OUTPUT,
      });

      expect(parentLedger.claimForDirectProjection).not.toHaveBeenCalled();
      expect(parentLedger.projectDirectSuccess).not.toHaveBeenCalled();
      expect(productGenerationAlerts.markChildFinished).not.toHaveBeenCalled();
    });

    it('no-ops when claim returns null (already terminal)', async () => {
      vi.mocked(ledger.claimForDirectProjection).mockResolvedValueOnce(null);
      const sink = makeSink(ledger, alerts, events);
      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: GEN_ID,
        errorCode: 'direct_ai_execution_failed',
        errorMessage: 'second attempt',
      });
      expect(ledger.projectDirectFailure).not.toHaveBeenCalled();
      expect(alerts.fail).not.toHaveBeenCalled();
    });
  });
});
