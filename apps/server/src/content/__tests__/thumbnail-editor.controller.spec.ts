import { describe, expect, it, vi } from 'vitest';
import { ThumbnailEditorController } from '../adapter/in/http/thumbnail-editor.controller';
import type { ThumbnailEditorDto } from '../adapter/in/http/dto/thumbnail-editor.dto';
import type { ThumbnailEditorInputImage } from '../domain/model/thumbnail-editor';

const ORGANIZATION_ID = 'organization-1';
const CONTENT_WORKSPACE_ID = '7d000000-0000-4000-8000-000000000001';
const SOURCE_CANDIDATE_ID = '7d000000-0000-4000-8000-000000000002';
const GENERATED_CANDIDATE_ID = '7d000000-0000-4000-8000-000000000003';
const REGISTRATION_WORKSPACE_ID = '7d000000-0000-4000-8000-000000000004';

function makeInput(
  url: string,
  label: string,
  role: ThumbnailEditorInputImage['role'],
  sortOrder: number,
): ThumbnailEditorInputImage {
  return {
    data: Buffer.from(url).toString('base64'),
    mimeType: 'image/jpeg',
    label,
    url,
    storageKey: null,
    role,
    sortOrder,
    source: 'upload',
    fileSize: 100,
  };
}

function makeController(opts: { withProduct?: boolean } = {}) {
  const withProduct = opts.withProduct ?? true;
  const editorAi = {
    resolveInputImage: vi.fn(
      async (
        value: string,
        _organizationId: string,
        options: {
          label: string;
          role: ThumbnailEditorInputImage['role'];
          sortOrder: number;
        },
      ) => makeInput(value, options.label, options.role, options.sortOrder),
    ),
    generateEdit: vi.fn(async () => [
      {
        url: 'generated-url',
        filename: 'generated.png',
        storageKey: null,
        mimeType: 'image/png',
        fileSize: 50,
      },
    ]),
    generateCreative: vi.fn(async () => [
      {
        url: 'creative-url',
        filename: 'creative.png',
        storageKey: null,
        mimeType: 'image/png',
        fileSize: 50,
      },
    ]),
  };
  const generationService = {
    findWorkspaceForThumbnailEditor: vi.fn(async () =>
      withProduct
        ? {
            id: CONTENT_WORKSPACE_ID,
            name: 'Sample product',
            category: 'toys',
            imageUrl: 'workspace-url',
          }
        : null,
    ),
    enqueueEditorGeneration: vi.fn(async () => ({
      generationId: 'generation-async-1',
      status: 'pending' as const,
    })),
    enqueueCandidateGeneration: vi.fn(async () => ({
      generationId: 'candidate-generation-async-1',
      status: 'pending' as const,
    })),
    enqueueStandaloneGeneration: vi.fn(async () => ({
      generationId: 'standalone-generation-async-1',
      status: 'pending' as const,
    })),
    saveEditorResult: vi.fn(async () => 'generation-1'),
  };
  const generatedCandidates = {
    createFromThumbnailInputs: vi.fn(async () => ({
      id: GENERATED_CANDIDATE_ID,
      name: 'Manual thumbnail candidate',
      category: null,
    })),
  };
  const contentWorkspaces = {
    ensureForGeneration: vi.fn(async () => ({ id: CONTENT_WORKSPACE_ID, displayName: 'Sample product', normalizedTitle: 'sampleproduct' })),
  };
  const controller = new ThumbnailEditorController(editorAi as never, generationService as never, contentWorkspaces as never);
  return { controller, editorAi, generationService, generatedCandidates, contentWorkspaces };
}

describe('ThumbnailEditorController draft-bound', () => {
  const SALES_PRODUCT_ID = '66666666-6666-4666-8666-666666666666';

  it('binds an edit opened from a draft to that draft\'s workspace instead of a standalone upload', async () => {
    const { controller, generationService, contentWorkspaces } = makeController();

    await controller.generate({
      salesProductId: SALES_PRODUCT_ID,
      productName: '초안 상품',
      productImage: 'main-product-url',
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto, ORGANIZATION_ID);

    expect(contentWorkspaces.ensureForGeneration).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID, salesProductId: SALES_PRODUCT_ID, rawTitle: '초안 상품',
    }));
    expect(generationService.findWorkspaceForThumbnailEditor).toHaveBeenCalledWith(CONTENT_WORKSPACE_ID, ORGANIZATION_ID);
    expect(generationService.enqueueEditorGeneration).toHaveBeenCalledWith(expect.objectContaining({ contentWorkspaceId: CONTENT_WORKSPACE_ID }));
    expect(generationService.enqueueStandaloneGeneration).not.toHaveBeenCalled();
  });

  it('refuses a request that names both a workspace and a draft', async () => {
    const { controller, contentWorkspaces } = makeController();

    await expect(controller.generate({
      contentWorkspaceId: CONTENT_WORKSPACE_ID,
      salesProductId: SALES_PRODUCT_ID,
      productImage: 'main-product-url',
      purpose: 'compliance',
    } satisfies ThumbnailEditorDto, ORGANIZATION_ID)).rejects.toThrow('함께 보낼 수 없습니다');
    expect(contentWorkspaces.ensureForGeneration).not.toHaveBeenCalled();
  });
});

describe('ThumbnailEditorController workspace-bound (async direct AI)', () => {
  it('returns pending status + generationId without calling editorAi directly', async () => {
    const { controller, editorAi, generationService } = makeController();
    const body = {
      contentWorkspaceId: CONTENT_WORKSPACE_ID,
      productImage: 'main-product-url',
      colorImages: ['red-url', 'blue-url'],
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto;

    const result = await controller.generate(body, ORGANIZATION_ID);

    expect(result).toEqual({
      candidates: [],
      generationId: 'generation-async-1',
      status: 'pending',
    });
    // The direct job now owns the LLM call; controller must not touch editorAi
    // when enqueueing asynchronous generation.
    expect(editorAi.generateEdit).not.toHaveBeenCalled();
    expect(editorAi.generateCreative).not.toHaveBeenCalled();
    expect(generationService.enqueueEditorGeneration).toHaveBeenCalledTimes(1);
  });

  it('forwards resolved inputs (with role + label ordering preserved) into the direct payload', async () => {
    const { controller, generationService } = makeController();
    const body = {
      contentWorkspaceId: CONTENT_WORKSPACE_ID,
      productImage: 'main-product-url',
      colorImages: ['red-url', 'blue-url'],
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto;

    await controller.generate(body, ORGANIZATION_ID);

    const arg = generationService.enqueueEditorGeneration.mock.calls[0][0] as {
      directPayload: { inputs: ThumbnailEditorInputImage[] };
      inputs: ThumbnailEditorInputImage[];
      method: string;
    };
    expect(arg.method).toBe('generate');
    expect(arg.directPayload.inputs.map((i) => i.label)).toEqual([
      'Main product',
      'Color variant 1',
      'Color variant 2',
    ]);
    expect(arg.directPayload.inputs.map((i) => i.role)).toEqual(['product', 'color_variant', 'color_variant']);
  });

  it('passes productName + category from the resolved workspace into the direct payload', async () => {
    const { controller, generationService } = makeController();
    const body = {
      contentWorkspaceId: CONTENT_WORKSPACE_ID,
      productImage: 'main-product-url',
      purpose: 'quality',
      mode: 'creative',
      sceneType: 'white-studio',
      styleType: 'minimal',
    } satisfies ThumbnailEditorDto;

    await controller.generate(body, ORGANIZATION_ID);

    const arg = generationService.enqueueEditorGeneration.mock.calls[0][0] as {
      directPayload: {
        productName: string;
        category: string;
        mode: string;
        hasStyleReference: boolean;
      };
      method: string;
    };
    expect(arg.directPayload.productName).toBe('Sample product');
    expect(arg.directPayload.category).toBe('toys');
    expect(arg.directPayload.mode).toBe('creative');
    expect(arg.method).toBe('creative');
  });
});

describe('ThumbnailEditorController workspace-bound generation', () => {
  it('enqueues a standalone generation without creating a sourcing candidate when owner ids are omitted', async () => {
    const { controller, editorAi, generationService, generatedCandidates } = makeController({ withProduct: false });
    const body = {
      productImage: 'main-product-url',
      productName: 'Uploaded toy',
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto;

    const result = await controller.generate(body, ORGANIZATION_ID);
    expect(generationService.enqueueEditorGeneration).not.toHaveBeenCalled();
    expect(generationService.enqueueCandidateGeneration).not.toHaveBeenCalled();
    expect(editorAi.generateEdit).not.toHaveBeenCalled();
    expect(generatedCandidates.createFromThumbnailInputs).not.toHaveBeenCalled();
    expect(generationService.enqueueStandaloneGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        productName: 'Uploaded toy',
        originalUrl: 'main-product-url',
        inputMeta: expect.objectContaining({
          productName: 'Uploaded toy',
        }),
      }),
    );
    expect(result).toEqual({
      candidates: [],
      generationId: 'standalone-generation-async-1',
      status: 'pending',
    });
  });

  it('rejects a missing registered workspace instead of treating it as direct upload', async () => {
    const { controller, generationService } = makeController({
      withProduct: false,
    });
    const body = {
      contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
      productImage: 'workspace-product-url',
      productName: 'Ownerless workspace toy',
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto;

    await expect(controller.generate(body, ORGANIZATION_ID)).rejects.toThrow(
      `ContentWorkspace ${REGISTRATION_WORKSPACE_ID} not found`,
    );
    expect(generationService.enqueueStandaloneGeneration).not.toHaveBeenCalled();
  });
});
