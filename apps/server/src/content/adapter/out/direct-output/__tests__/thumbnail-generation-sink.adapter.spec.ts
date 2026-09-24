import { describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationSinkAdapter } from '../thumbnail-generation-sink.adapter';
import type { ImageStoragePort } from '../../../../application/port/out/storage/image-storage.port';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST = '22222222-2222-2222-2222-222222222222';
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
      attemptNumber: 1,
    }),
    projectDirectFailure: vi.fn().mockResolvedValue({
      fromStatus: 'running',
      attemptNumber: 1,
    }),
  };
}

function makeStorage(): ImageStoragePort {
  return {
    getUrl: vi.fn((key: string) => `https://storage.example.com/${key}`),
  } as unknown as ImageStoragePort;
}

describe('ThumbnailGenerationSinkAdapter', () => {
  it('projects validated provider output through the thumbnail lifecycle owner', async () => {
    const lifecycle = makeLifecycle();
    const sink = new ThumbnailGenerationSinkAdapter(
      lifecycle as never,
      makeStorage(),
    );

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      sourceResourceId: GEN_ID,
      output: VALID_OUTPUT,
    });

    expect(lifecycle.projectDirectSuccess).toHaveBeenCalledWith({
      generationId: GEN_ID,
      organizationId: ORG,
      candidates: [
        {
          ...VALID_OUTPUT.candidates[0],
          url: 'https://storage.example.com/thumbnail-generations/org/c1.png',
        },
      ],
      projection: { executionMode: 'direct_ai', aiJobId: REQUEST },
    });
  });

  it('rebuilds managed candidate URLs from the current storage configuration', async () => {
    const lifecycle = makeLifecycle();
    const storage = makeStorage();
    const sink = new ThumbnailGenerationSinkAdapter(
      lifecycle as never,
      storage,
    );

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      sourceResourceId: GEN_ID,
      output: {
        candidates: [
          {
            url: 'http://old-storage.example.com/kiditem/thumbnail-generations/output.png',
            storageKey: 'thumbnail-generations/output.png',
          },
        ],
      },
    });

    expect(storage.getUrl).toHaveBeenCalledWith(
      'thumbnail-generations/output.png',
    );
    expect(lifecycle.projectDirectSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [
          expect.objectContaining({
            url: 'https://storage.example.com/thumbnail-generations/output.png',
            storageKey: 'thumbnail-generations/output.png',
          }),
        ],
      }),
    );
  });

  it('projects provider failure through the same lifecycle owner', async () => {
    const lifecycle = makeLifecycle();
    const sink = new ThumbnailGenerationSinkAdapter(
      lifecycle as never,
      makeStorage(),
    );

    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      sourceResourceId: GEN_ID,
      errorCode: 'runtime_not_configured',
      errorMessage: 'no provider',
    });

    expect(lifecycle.projectDirectFailure).toHaveBeenCalledWith({
      generationId: GEN_ID,
      organizationId: ORG,
      errorMessage: 'no provider',
    });
  });

  it('does not project success or failure without a source generation id', async () => {
    const lifecycle = makeLifecycle();
    const sink = new ThumbnailGenerationSinkAdapter(
      lifecycle as never,
      makeStorage(),
    );

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      sourceResourceId: null,
      output: VALID_OUTPUT,
    });
    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      sourceResourceId: null,
      errorCode: 'runtime_failed',
      errorMessage: 'missing source row',
    });

    expect(lifecycle.projectDirectSuccess).not.toHaveBeenCalled();
    expect(lifecycle.projectDirectFailure).not.toHaveBeenCalled();
  });

  it('forwards the authenticated organization fence to the lifecycle owner', async () => {
    const lifecycle = makeLifecycle();
    const sink = new ThumbnailGenerationSinkAdapter(
      lifecycle as never,
      makeStorage(),
    );
    const otherOrganizationId = '55555555-5555-4555-8555-555555555555';

    await sink.applySuccess({
      organizationId: otherOrganizationId,
      requestId: REQUEST,
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
    const sink = new ThumbnailGenerationSinkAdapter(
      lifecycle as never,
      makeStorage(),
    );

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      sourceResourceId: GEN_ID,
      output: VALID_OUTPUT,
    });
    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      sourceResourceId: GEN_ID,
      errorCode: 'provider_late_failure',
      errorMessage: 'late provider failure',
    });

    expect(lifecycle.projectDirectSuccess).toHaveBeenCalledTimes(1);
    expect(lifecycle.projectDirectFailure).toHaveBeenCalledTimes(1);
  });
});
