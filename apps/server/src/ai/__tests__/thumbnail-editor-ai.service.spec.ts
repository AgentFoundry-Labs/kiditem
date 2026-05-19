import { describe, expect, it, vi } from 'vitest';
import { ThumbnailEditorAiService } from '../application/service/thumbnail-editor-ai.service';
import type { ThumbnailEditorInputImage } from '../domain/model/thumbnail-editor';

const ORGANIZATION_ID = 'organization-1';

function makeInput(over: Partial<ThumbnailEditorInputImage> = {}): ThumbnailEditorInputImage {
  return {
    data: 'aW5wdXQ=',
    mimeType: 'image/jpeg',
    label: 'Product photo',
    url: 'https://cdn.example.com/product.jpg',
    storageKey: null,
    role: 'product',
    sortOrder: 0,
    source: 'test',
    fileSize: 100,
    ...over,
  };
}

function makeService() {
  const generateImageParts = vi.fn(async () => [
    {
      inlineData: {
        data: 'b3V0cHV0',
        mimeType: 'image/png',
      },
    },
  ]);
  const storage = {
    save: vi.fn(async () => 'http://storage.local/kiditem/thumbnail-generations/out.png'),
  };
  const imageFetcher = {
    assertSupportedMime: vi.fn(),
    extForMime: vi.fn(() => 'png'),
  };
  const references = {
    generationParts: vi.fn(() => [{ text: 'REFERENCE PART' }]),
  };
  const service = new ThumbnailEditorAiService(
    storage as never,
    imageFetcher as never,
    references as never,
    { generateImageParts } as never,
  );
  return { service, generateImageParts, references };
}

function requestParts(generateImageParts: ReturnType<typeof vi.fn>) {
  return generateImageParts.mock.calls[0][0].parts as Array<{ text?: string }>;
}

describe('ThumbnailEditorAiService reference prompt parity', () => {
  it('keeps creative generation free of generation reference images', async () => {
    const { service, generateImageParts, references } = makeService();

    await service.generateCreative([makeInput()], ORGANIZATION_ID, {
      sceneType: 'white-studio',
      styleType: 'minimal',
    });

    expect(references.generationParts).not.toHaveBeenCalled();
    expect(requestParts(generateImageParts).some((part) => part.text === 'REFERENCE PART')).toBe(false);
  });

  it('keeps editor generation references on the generateFromInputs-compatible path', async () => {
    const { service, generateImageParts, references } = makeService();

    await service.generateEdit([makeInput()], ORGANIZATION_ID, {
      purpose: 'compliance',
      editCase: 'single',
    });

    expect(references.generationParts).toHaveBeenCalledTimes(1);
    expect(requestParts(generateImageParts).some((part) => part.text === 'REFERENCE PART')).toBe(true);
  });

  it('uses edit-image references only for compliance re-edits', async () => {
    const quality = makeService();
    await quality.service.generateEdit([makeInput()], ORGANIZATION_ID, {
      purpose: 'quality',
      editCase: 'single',
      referenceMode: 'edit-image',
    });

    expect(quality.references.generationParts).not.toHaveBeenCalled();
    expect(requestParts(quality.generateImageParts).some((part) => part.text === 'REFERENCE PART')).toBe(false);

    const compliance = makeService();
    await compliance.service.generateEdit([makeInput()], ORGANIZATION_ID, {
      purpose: 'compliance',
      editCase: 'single',
      referenceMode: 'edit-image',
    });

    expect(compliance.references.generationParts).toHaveBeenCalledTimes(1);
    expect(requestParts(compliance.generateImageParts).some((part) => part.text === 'REFERENCE PART')).toBe(true);
  });

  it('passes the selected model through the image generation port', async () => {
    const { service, generateImageParts } = makeService();

    await service.generateEdit([makeInput()], ORGANIZATION_ID, {
      model: 'gemini-image-from-agent-os',
      purpose: 'compliance',
      editCase: 'single',
    });

    expect(generateImageParts).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-image-from-agent-os',
    }));
  });
});
