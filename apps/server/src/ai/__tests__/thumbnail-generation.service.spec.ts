import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThumbnailGenerationService } from '../services/thumbnail-generation.service';
import type { ThumbnailEditorInputImage } from '../services/thumbnail-editor-ai.service';

const COMPANY_ID = 'company-1';
const PRODUCT_ID = '7d000000-0000-4000-8000-000000000001';
const GENERATION_ID = '7d000000-0000-4000-8000-000000000010';

function makeProductRow(over: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    name: 'Master',
    imageUrl: 'https://example.com/p.jpg',
    thumbnailUrl: null,
    category: 'toys',
    images: [],
    thumbnailAnalyses: [
      {
        recompose: { kind: 'multi-pack-loose', requiresChoice: false },
        complianceGrade: 'PASS',
        complianceScores: {
          editSuggestions: { background_not_white: '배경을 순백으로 교체' },
        },
        overallScore: 80,
        grade: 'A',
        qualityAnalyzedAt: new Date(),
        complianceAnalyzedAt: new Date(),
      },
    ],
    ...over,
  };
}

function makeInputImage(over: Partial<ThumbnailEditorInputImage> = {}): ThumbnailEditorInputImage {
  return {
    data: 'YmFzZTY0',
    mimeType: 'image/jpeg',
    label: 'Product photo',
    url: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
    storageKey: 'thumbnail-inputs/x.jpg',
    role: 'product',
    sortOrder: 0,
    source: 'master_image',
    fileSize: 100,
    ...over,
  };
}

function makeFullGenerationRow(over: Record<string, unknown> = {}) {
  return {
    id: GENERATION_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'succeeded',
    phase: 'ready',
    grade: 'F',
    score: 0,
    masterId: PRODUCT_ID,
    method: 'generate',
    originalUrl: 'https://example.com/p.jpg',
    selectedUrl: null,
    prompt: null,
    editAnalysis: null,
    inputMeta: { mode: 'edit' },
    inputMetaVersion: 1,
    errorMessage: null,
    attemptCount: 0,
    triggeredByUserId: null,
    candidates: [
      {
        id: 'cand-1',
        url: 'http://storage.local/kiditem/thumbnail-generations/a.png',
        storageKey: 'thumbnail-generations/a.png',
        filename: 'a.png',
        sortOrder: 0,
        mimeType: 'image/png',
        width: null,
        height: null,
        fileSize: 100,
      },
    ],
    inputImages: [
      {
        id: 'in-1',
        url: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
        storageKey: 'thumbnail-inputs/x.jpg',
        role: 'product',
        label: 'Product photo',
        sortOrder: 0,
        source: 'master_image',
        mimeType: 'image/jpeg',
        width: null,
        height: null,
        fileSize: 100,
        createdAt: new Date(),
      },
    ],
    registrationAttempts: [],
    master: {
      id: PRODUCT_ID,
      name: 'Master',
      imageUrl: 'https://example.com/p.jpg',
      thumbnailUrl: null,
      category: 'toys',
      images: [],
      thumbnailAnalyses: [
        {
          recompose: { kind: 'multi-pack-loose' },
          complianceGrade: 'PASS',
          complianceScores: { editSuggestions: { background_not_white: '배경을 순백으로 교체' } },
          overallScore: 80,
          grade: 'A',
          qualityAnalyzedAt: new Date(),
          complianceAnalyzedAt: new Date(),
        },
      ],
    },
    ...over,
  };
}

describe('ThumbnailGenerationService normalized persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveEditorResult writes candidates and inputImages as relation rows', async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          created.push(args.data);
          return { id: GENERATION_ID };
        }),
      },
    };
    const service = new ThumbnailGenerationService(
      prisma as never,
      { resolveInputImage: vi.fn(), generateEdit: vi.fn() } as never,
      { create: vi.fn() } as never,
    );
    const id = await service.saveEditorResult({
      productId: PRODUCT_ID,
      companyId: COMPANY_ID,
      originalUrl: 'https://example.com/p.jpg',
      candidates: [
        { url: 'u1', storageKey: 'k1', filename: 'a.png', mimeType: 'image/png', fileSize: 100 },
      ],
      inputImages: [makeInputImage()],
      method: 'generate',
    });
    expect(id).toBe(GENERATION_ID);
    expect(created[0].candidates).toMatchObject({
      create: [
        expect.objectContaining({
          url: 'u1',
          storageKey: 'k1',
          mimeType: 'image/png',
        }),
      ],
    });
    expect(created[0].inputImages).toMatchObject({
      create: [
        expect.objectContaining({
          url: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
          role: 'product',
        }),
      ],
    });
  });

  it('createEditJobs creates pending jobs without blocking on Gemini', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn(async () => [makeProductRow()]),
      },
      thumbnailGeneration: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => makeFullGenerationRow({
          status: 'pending',
          phase: null,
          candidates: [],
        })),
      },
    };
    const editorAi = {
      resolveInputImage: vi.fn(async () => makeInputImage()),
      generateEdit: vi.fn(async () => [
        { url: 'u', storageKey: 'k', filename: 'a.png', mimeType: 'image/png', fileSize: 50 },
      ]),
    };
    const service = new ThumbnailGenerationService(
      prisma as never,
      editorAi as never,
      { create: vi.fn() } as never,
    );
    const schedule = vi
      .spyOn(service as unknown as { scheduleEditJob: () => void }, 'scheduleEditJob')
      .mockImplementation(() => {});
    const [created] = await service.createEditJobs([PRODUCT_ID], COMPANY_ID, 'compliance', 'auto', 'generate');

    expect(created.status).toBe('pending');
    expect(editorAi.generateEdit).not.toHaveBeenCalled();
    expect(prisma.thumbnailGeneration.create.mock.calls[0][0].data).toMatchObject({
      method: 'generate',
      status: 'pending',
      phase: null,
    });
    expect(schedule).toHaveBeenCalledWith(GENERATION_ID, COMPANY_ID, 'compliance', 'auto');
  });

  it('processEditJob feeds stored recompose kind and edit suggestions into prompt', async () => {
    const tx = {
      thumbnailGeneration: {
        findFirst: vi.fn(async () => ({ id: GENERATION_ID })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      thumbnailGenerationCandidate: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      thumbnailGenerationInputImage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const prisma = {
      thumbnailGeneration: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findFirst: vi.fn(async () => makeFullGenerationRow({
          status: 'running',
          phase: null,
          candidates: [],
          inputImages: [],
        })),
      },
      $transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx)),
    };
    const editorAi = {
      resolveInputImage: vi.fn(async () => makeInputImage()),
      generateEdit: vi.fn(async () => [
        { url: 'u', storageKey: 'k', filename: 'a.png', mimeType: 'image/png', fileSize: 50 },
      ]),
    };
    const service = new ThumbnailGenerationService(
      prisma as never,
      editorAi as never,
      { create: vi.fn() } as never,
    );

    await (service as unknown as {
      processEditJob: (
        id: string,
        companyId: string,
        purpose: 'compliance',
        variantKey: 'auto',
      ) => Promise<void>;
    }).processEditJob(GENERATION_ID, COMPANY_ID, 'compliance', 'auto');

    const editArgs = editorAi.generateEdit.mock.calls[0][2];
    expect(typeof editArgs.promptOverride).toBe('string');
    expect(editArgs.editSuggestions).toEqual({
      background_not_white: '배경을 순백으로 교체',
    });
    expect(editArgs.referenceMode).toBe('edit-image');
    expect(tx.thumbnailGenerationCandidate.createMany).toHaveBeenCalled();
    expect(tx.thumbnailGeneration.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'succeeded',
      phase: 'ready',
    });
  });

  it('createAutoBatch routes through createEditJobs and keeps method auto', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn(async () => [{ id: PRODUCT_ID }]),
      },
      thumbnailGeneration: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => makeFullGenerationRow({
          status: 'pending',
          phase: null,
          method: 'auto',
          candidates: [],
        })),
      },
    };
    const masterFindMany = vi.fn(async () => [makeProductRow()]);
    (prisma.masterProduct.findMany as unknown) = vi
      .fn()
      .mockImplementationOnce(async () => [{ id: PRODUCT_ID }])
      .mockImplementationOnce(async () => [makeProductRow()]);
    (prisma.thumbnailGeneration.findFirst as unknown) = vi
      .fn()
      .mockResolvedValueOnce(null) // cooldown check
      .mockResolvedValueOnce(null); // active job check
    const editorAi = {
      resolveInputImage: vi.fn(async () => makeInputImage()),
      generateEdit: vi.fn(async () => [
        { url: 'u', storageKey: 'k', filename: 'a.png', mimeType: 'image/png', fileSize: 50 },
      ]),
    };
    const service = new ThumbnailGenerationService(
      prisma as never,
      editorAi as never,
      { create: vi.fn() } as never,
    );
    vi
      .spyOn(service as unknown as { scheduleEditJob: () => void }, 'scheduleEditJob')
      .mockImplementation(() => {});
    const result = await service.createAutoBatch(COMPANY_ID, 1);
    expect(result.attempted).toBe(1);
    const createData = (prisma.thumbnailGeneration.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0].data;
    expect(createData.method).toBe('auto');
    void masterFindMany;
  });
});
