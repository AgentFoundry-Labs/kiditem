import { describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationSinkAdapter } from '../thumbnail-generation-sink.adapter';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';
const GEN_ID = '44444444-4444-4444-4444-444444444444';

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

function makeLifecycle() {
  return {
    projectDirectSuccess: vi.fn().mockResolvedValue({
      fromStatus: 'running',
      fromPhase: null,
      attemptNumber: 1,
    }),
    projectDirectFailure: vi.fn().mockResolvedValue({
      fromStatus: 'running',
      fromPhase: null,
      attemptNumber: 1,
    }),
  };
}

describe('ThumbnailGenerationSinkAdapter', () => {
  it('projects validated provider output through the thumbnail lifecycle owner', async () => {
    const lifecycle = makeLifecycle();
    const sink = new ThumbnailGenerationSinkAdapter(lifecycle as never);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: GEN_ID,
      output: VALID_OUTPUT,
    });

    expect(lifecycle.projectDirectSuccess).toHaveBeenCalledWith({
      generationId: GEN_ID,
      organizationId: ORG,
      candidates: VALID_OUTPUT.candidates,
      inputMeta: { executionMode: 'direct_ai', aiJobId: REQUEST },
      payload: {
        executionMode: 'direct_ai',
        aiJobId: REQUEST,
        candidateCount: 1,
      },
    });
  });

  it('projects provider failure through the same lifecycle owner', async () => {
    const lifecycle = makeLifecycle();
    const sink = new ThumbnailGenerationSinkAdapter(lifecycle as never);

    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      runId: undefined,
      sourceResourceId: GEN_ID,
      errorCode: 'runtime_not_configured',
      errorMessage: 'no provider',
    });

    expect(lifecycle.projectDirectFailure).toHaveBeenCalledWith({
      generationId: GEN_ID,
      organizationId: ORG,
      errorMessage: 'no provider',
      payload: {
        errorCode: 'runtime_not_configured',
        executionMode: 'direct_ai',
        aiJobId: REQUEST,
      },
    });
  });

  it('does not project success or failure without a source generation id', async () => {
    const lifecycle = makeLifecycle();
    const sink = new ThumbnailGenerationSinkAdapter(lifecycle as never);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: undefined,
      sourceResourceId: null,
      output: VALID_OUTPUT,
    });
    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      runId: undefined,
      sourceResourceId: null,
      errorCode: 'runtime_failed',
      errorMessage: 'missing source row',
    });

    expect(lifecycle.projectDirectSuccess).not.toHaveBeenCalled();
    expect(lifecycle.projectDirectFailure).not.toHaveBeenCalled();
  });

  it('forwards the authenticated organization fence to the lifecycle owner', async () => {
    const lifecycle = makeLifecycle();
    const sink = new ThumbnailGenerationSinkAdapter(lifecycle as never);
    const otherOrganizationId = '55555555-5555-4555-8555-555555555555';

    await sink.applySuccess({
      organizationId: otherOrganizationId,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: GEN_ID,
      output: VALID_OUTPUT,
    });

    expect(lifecycle.projectDirectSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: otherOrganizationId,
        generationId: GEN_ID,
      }),
    );
  });

  it('does not project late success or failure after the lifecycle owner rejects a terminal row', async () => {
    const lifecycle = makeLifecycle();
    lifecycle.projectDirectSuccess.mockResolvedValueOnce(null);
    lifecycle.projectDirectFailure.mockResolvedValueOnce(null);
    const sink = new ThumbnailGenerationSinkAdapter(lifecycle as never);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: GEN_ID,
      output: VALID_OUTPUT,
    });
    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: GEN_ID,
      errorCode: 'provider_late_failure',
      errorMessage: 'late provider failure',
    });

    expect(lifecycle.projectDirectSuccess).toHaveBeenCalledTimes(1);
    expect(lifecycle.projectDirectFailure).toHaveBeenCalledTimes(1);
  });
});
