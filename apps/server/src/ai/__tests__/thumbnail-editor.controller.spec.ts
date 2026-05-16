import { describe, expect, it, vi } from 'vitest';
import { ThumbnailEditorController } from '../adapter/in/http/thumbnail-editor.controller';
import type { ThumbnailEditorDto } from '../adapter/in/http/dto/thumbnail-editor.dto';
import type { ThumbnailEditorInputImage } from '../domain/model/thumbnail-editor';

const ORGANIZATION_ID = 'organization-1';
const PRODUCT_ID = '7d000000-0000-4000-8000-000000000001';
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
    resolveInputImage: vi.fn(async (
      value: string,
      _organizationId: string,
      options: { label: string; role: ThumbnailEditorInputImage['role']; sortOrder: number },
    ) => makeInput(value, options.label, options.role, options.sortOrder)),
    generateEdit: vi.fn(async () => [
      { url: 'generated-url', filename: 'generated.png', storageKey: null, mimeType: 'image/png', fileSize: 50 },
    ]),
    generateCreative: vi.fn(async () => [
      { url: 'creative-url', filename: 'creative.png', storageKey: null, mimeType: 'image/png', fileSize: 50 },
    ]),
  };
  const generationService = {
    findProductForEditor: vi.fn(async () =>
      withProduct
        ? {
            id: PRODUCT_ID,
            name: 'Sample product',
            category: 'toys',
            imageUrl: 'master-url',
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
  const reconcile = { reconcile: vi.fn() };
  const generatedCandidates = {
    createFromThumbnailInputs: vi.fn(async () => ({
      id: GENERATED_CANDIDATE_ID,
      name: 'Manual thumbnail candidate',
      category: null,
    })),
  };
  const controller = new ThumbnailEditorController(
    editorAi as never,
    generationService as never,
    reconcile as never,
  );
  return { controller, editorAi, generationService, generatedCandidates };
}

describe('ThumbnailEditorController product-bound (async Agent OS)', () => {
  it('returns pending status + generationId without calling editorAi directly', async () => {
    const { controller, editorAi, generationService } = makeController();
    const body = {
      productId: PRODUCT_ID,
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
    // The runtime handler now owns the LLM call; controller must not
    // touch editorAi when enqueueing the agent run.
    expect(editorAi.generateEdit).not.toHaveBeenCalled();
    expect(editorAi.generateCreative).not.toHaveBeenCalled();
    expect(generationService.enqueueEditorGeneration).toHaveBeenCalledTimes(1);
  });

  it('forwards resolved inputs (with role + label ordering preserved) into the agent payload', async () => {
    const { controller, generationService } = makeController();
    const body = {
      productId: PRODUCT_ID,
      productImage: 'main-product-url',
      colorImages: ['red-url', 'blue-url'],
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto;

    await controller.generate(body, ORGANIZATION_ID);

    const arg = generationService.enqueueEditorGeneration.mock.calls[0][0] as {
      agentPayload: { inputs: ThumbnailEditorInputImage[] };
      inputs: ThumbnailEditorInputImage[];
      method: string;
    };
    expect(arg.method).toBe('generate');
    expect(arg.agentPayload.inputs.map((i) => i.label)).toEqual([
      'Main product',
      'Color variant 1',
      'Color variant 2',
    ]);
    expect(arg.agentPayload.inputs.map((i) => i.role)).toEqual([
      'product',
      'color_variant',
      'color_variant',
    ]);
  });

  it('passes productName + category from the resolved master into the agent payload', async () => {
    const { controller, generationService } = makeController();
    const body = {
      productId: PRODUCT_ID,
      productImage: 'main-product-url',
      purpose: 'quality',
      mode: 'creative',
      sceneType: 'white-studio',
      styleType: 'minimal',
    } satisfies ThumbnailEditorDto;

    await controller.generate(body, ORGANIZATION_ID);

    const arg = generationService.enqueueEditorGeneration.mock.calls[0][0] as {
      agentPayload: { productName: string; category: string; mode: string; hasStyleReference: boolean };
      method: string;
    };
    expect(arg.agentPayload.productName).toBe('Sample product');
    expect(arg.agentPayload.category).toBe('toys');
    expect(arg.agentPayload.mode).toBe('creative');
    expect(arg.method).toBe('creative');
  });
});

describe('ThumbnailEditorController candidate-bound generation', () => {
  it('creates a persisted candidate-bound generation when sourceCandidateId is provided', async () => {
    const { controller, editorAi, generationService } = makeController({ withProduct: false });
    const body = {
      sourceCandidateId: SOURCE_CANDIDATE_ID,
      productImage: 'candidate-product-url',
      productName: 'Candidate toy',
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto;

    const result = await controller.generate(body, ORGANIZATION_ID);

    expect(result).toEqual({
      candidates: [],
      generationId: 'candidate-generation-async-1',
      status: 'pending',
    });
    expect(editorAi.generateEdit).not.toHaveBeenCalled();
    expect(generationService.enqueueCandidateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        productName: 'Candidate toy',
        originalUrl: 'candidate-product-url',
      }),
    );
  });

  it('enqueues a standalone generation without creating a sourcing candidate when productId and sourceCandidateId are omitted', async () => {
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
      }),
    );
    expect(result).toEqual({
      candidates: [],
      generationId: 'standalone-generation-async-1',
      status: 'pending',
    });
  });

  it('keeps ownerless registered workspace thumbnail work attached to the workspace', async () => {
    const { controller, generationService } = makeController({ withProduct: false });
    const body = {
      registrationWorkspaceId: REGISTRATION_WORKSPACE_ID,
      productImage: 'workspace-product-url',
      productName: 'Ownerless workspace toy',
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto;

    await controller.generate(body, ORGANIZATION_ID);

    expect(generationService.enqueueStandaloneGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        registrationWorkspaceId: REGISTRATION_WORKSPACE_ID,
        productName: 'Ownerless workspace toy',
        originalUrl: 'workspace-product-url',
      }),
    );
  });
});
