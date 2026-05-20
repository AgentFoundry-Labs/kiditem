import { describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationLifecycleService } from '../thumbnail-generation-lifecycle.service';
import type { ThumbnailGenerationLedgerRepositoryPort } from '../../port/out/repository/thumbnail-generation-ledger.repository.port';
import type { ThumbnailGenerationEventPort } from '../../port/out/event/thumbnail-generation-event.port';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '22222222-2222-4222-8222-222222222222';

function makeLedger(): ThumbnailGenerationLedgerRepositoryPort {
  return {
    claimForDirectProjection: vi.fn().mockResolvedValue({
      fromStatus: 'pending',
      fromPhase: null,
      attemptNumber: 1,
    }),
    projectDirectSuccess: vi.fn().mockResolvedValue({
      fromStatus: 'running',
      fromPhase: null,
      attemptNumber: 1,
    }),
    projectDirectFailure: vi.fn().mockResolvedValue({
      fromStatus: 'running',
      fromPhase: 'processing',
      attemptNumber: 2,
    }),
    markGenerationCancelled: vi.fn().mockResolvedValue({
      fromStatus: 'pending',
      fromPhase: null,
    }),
  } as unknown as ThumbnailGenerationLedgerRepositoryPort;
}

function makeEvents(): ThumbnailGenerationEventPort {
  return { append: vi.fn().mockResolvedValue(undefined) };
}

describe('ThumbnailGenerationLifecycleService', () => {
  it('starts an attempt by claiming the row and appending status + attempt events', async () => {
    const ledger = makeLedger();
    const events = makeEvents();
    const lifecycle = new ThumbnailGenerationLifecycleService(ledger, events);

    const result = await lifecycle.startAttempt({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      payload: { purpose: 'compliance' },
    });

    expect(result).toEqual({
      fromStatus: 'pending',
      fromPhase: null,
      attemptNumber: 1,
    });
    expect(ledger.claimForDirectProjection).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
    });
    expect(events.append).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: 'status_change',
        fromStatus: 'pending',
        toStatus: 'running',
        attemptNumber: 1,
      }),
    );
    expect(events.append).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: 'attempt_started',
        fromStatus: 'pending',
        toStatus: 'running',
        attemptNumber: 1,
      }),
    );
  });

  it('projects direct success with status, phase, and finished attempt events', async () => {
    const ledger = makeLedger();
    const events = makeEvents();
    const lifecycle = new ThumbnailGenerationLifecycleService(ledger, events);

    const result = await lifecycle.projectDirectSuccess({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      candidates: [
        {
          url: 'https://cdn.example.com/thumbnail.png',
          filename: 'thumbnail.png',
          storageKey: 'thumbnail-generations/thumbnail.png',
          mimeType: 'image/png',
          fileSize: 1234,
        },
      ],
      inputMeta: { aiJobId: 'request-1' },
      payload: { aiJobId: 'request-1', candidateCount: 1 },
    });

    expect(result).toEqual({
      fromStatus: 'running',
      fromPhase: null,
      attemptNumber: 1,
    });
    expect(ledger.claimForDirectProjection).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
    });
    expect(ledger.projectDirectSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        generationId: GENERATION_ID,
        inputMeta: { aiJobId: 'request-1' },
      }),
    );
    expect(events.append).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: 'status_change',
        fromStatus: 'running',
        toStatus: 'succeeded',
        toPhase: 'ready',
        payload: { aiJobId: 'request-1', candidateCount: 1 },
      }),
    );
    expect(events.append).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: 'phase_change',
        fromStatus: 'running',
        toStatus: 'succeeded',
        fromPhase: null,
        toPhase: 'ready',
        payload: { aiJobId: 'request-1', candidateCount: 1 },
      }),
    );
    expect(events.append).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        eventType: 'attempt_finished',
        fromStatus: 'running',
        toStatus: 'succeeded',
        fromPhase: null,
        toPhase: 'ready',
        attemptNumber: 1,
        payload: { aiJobId: 'request-1', candidateCount: 1 },
      }),
    );
    expect(events.append).toHaveBeenCalledTimes(3);
  });

  it('projects direct failure with status, phase, and error events', async () => {
    const ledger = makeLedger();
    const events = makeEvents();
    const lifecycle = new ThumbnailGenerationLifecycleService(ledger, events);

    const result = await lifecycle.projectDirectFailure({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      errorMessage: 'Direct output invalid',
      payload: { aiJobId: 'request-2' },
    });

    expect(result).toEqual({
      fromStatus: 'running',
      fromPhase: 'processing',
      attemptNumber: 2,
    });
    expect(ledger.claimForDirectProjection).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
    });
    expect(ledger.projectDirectFailure).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      errorMessage: 'Direct output invalid',
    });
    expect(events.append).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: 'status_change',
        fromStatus: 'running',
        toStatus: 'failed',
        fromPhase: 'processing',
        toPhase: null,
        attemptNumber: 2,
        errorMessage: 'Direct output invalid',
        payload: { aiJobId: 'request-2' },
      }),
    );
    expect(events.append).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: 'phase_change',
        fromStatus: 'running',
        toStatus: 'failed',
        fromPhase: 'processing',
        toPhase: null,
        attemptNumber: 2,
        payload: { aiJobId: 'request-2' },
      }),
    );
    expect(events.append).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        eventType: 'error',
        fromStatus: 'running',
        toStatus: 'failed',
        fromPhase: 'processing',
        toPhase: null,
        attemptNumber: 2,
        errorMessage: 'Direct output invalid',
        payload: { aiJobId: 'request-2' },
      }),
    );
    expect(events.append).toHaveBeenCalledTimes(3);
  });

  it('does not project direct success when the row is already terminal', async () => {
    const ledger = makeLedger();
    vi.mocked(ledger.claimForDirectProjection).mockResolvedValueOnce(null);
    const events = makeEvents();
    const lifecycle = new ThumbnailGenerationLifecycleService(ledger, events);

    const result = await lifecycle.projectDirectSuccess({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      candidates: [],
      inputMeta: { aiJobId: 'request-1' },
      payload: { aiJobId: 'request-1' },
    });

    expect(result).toBeNull();
    expect(ledger.projectDirectSuccess).not.toHaveBeenCalled();
    expect(events.append).not.toHaveBeenCalled();
  });

  it('marks cancellation and records a status event through the same seam', async () => {
    const ledger = makeLedger();
    const events = makeEvents();
    const lifecycle = new ThumbnailGenerationLifecycleService(ledger, events);

    const result = await lifecycle.markCancelled({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      actorUserId: 'user-1',
      payload: { reason: '사용자 요청' },
    });

    expect(result).toEqual({ fromStatus: 'pending', fromPhase: null });
    expect(ledger.markGenerationCancelled).toHaveBeenCalledWith(
      GENERATION_ID,
      ORGANIZATION_ID,
    );
    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'status_change',
        toStatus: 'cancelled',
        actorUserId: 'user-1',
        payload: { reason: '사용자 요청' },
      }),
    );
  });
});
