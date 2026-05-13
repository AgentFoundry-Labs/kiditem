import { describe, expect, it, vi } from 'vitest';
import { ImageEditContentGenerationSinkAdapter } from '../image-edit-content-generation-sink.adapter';

const ORG = '11111111-1111-4111-8111-111111111111';
const GEN_ID = '33333333-3333-4333-8333-333333333333';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';

function makePrisma(row: { id: string; masterId?: string | null; status: string } | null) {
  return {
    contentGeneration: {
      findFirst: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: row ? 1 : 0 }),
    },
  };
}

function makeContentAssets() {
  return {
    recordImageEditOutputAsset: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ImageEditContentGenerationSinkAdapter', () => {
  it('marks the image ContentGeneration ready and records the output asset', async () => {
    const prisma = makePrisma({ id: GEN_ID, masterId: MASTER_ID, status: 'PROCESSING' });
    const contentAssets = makeContentAssets();
    const sink = new ImageEditContentGenerationSinkAdapter(
      prisma as never,
      contentAssets as never,
    );

    await sink.applySuccess({
      organizationId: ORG,
      requestId: 'request-1',
      runId: 'run-1',
      sourceResourceId: GEN_ID,
      output: { image_url: 'https://cdn.example.com/edited.jpg' },
    });

    expect(contentAssets.recordImageEditOutputAsset).toHaveBeenCalledWith({
      organizationId: ORG,
      contentGenerationId: GEN_ID,
      masterId: MASTER_ID,
      imageUrl: 'https://cdn.example.com/edited.jpg',
    });
    expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processedImages: { edited: 'https://cdn.example.com/edited.jpg' },
          status: 'READY',
          errorMessage: null,
        }),
      }),
    );
  });

  it('marks the image ContentGeneration failed on terminal agent failure', async () => {
    const prisma = makePrisma({ id: GEN_ID, status: 'PROCESSING' });
    const sink = new ImageEditContentGenerationSinkAdapter(
      prisma as never,
      makeContentAssets() as never,
    );

    await sink.applyFailure({
      organizationId: ORG,
      requestId: 'request-1',
      runId: 'run-1',
      sourceResourceId: GEN_ID,
      errorCode: 'gemini_failed',
      errorMessage: 'Gemini failed',
    });

    expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'FAILED',
          errorMessage: 'Gemini failed',
        },
      }),
    );
  });

  it('does not apply legacy image_edit runs that have no sourceResourceId', async () => {
    const prisma = makePrisma(null);
    const contentAssets = makeContentAssets();
    const sink = new ImageEditContentGenerationSinkAdapter(
      prisma as never,
      contentAssets as never,
    );

    await sink.applySuccess({
      organizationId: ORG,
      requestId: 'request-legacy',
      runId: 'run-legacy',
      sourceResourceId: null,
      output: { image_url: 'https://cdn.example.com/edited.jpg' },
    });

    expect(prisma.contentGeneration.findFirst).not.toHaveBeenCalled();
    expect(contentAssets.recordImageEditOutputAsset).not.toHaveBeenCalled();
  });
});
