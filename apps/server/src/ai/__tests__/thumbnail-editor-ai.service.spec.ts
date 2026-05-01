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
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-api-key';
  process.env.AI_IMAGE_MODEL = process.env.AI_IMAGE_MODEL ?? 'test-image-model';
  const generateContent = vi.fn(async () => ({
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                data: 'b3V0cHV0',
                mimeType: 'image/png',
              },
            },
          ],
        },
      },
    ],
  }));
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
  );
  (service as unknown as { client: unknown }).client = { models: { generateContent } };
  return { service, generateContent, references };
}

function requestParts(generateContent: ReturnType<typeof vi.fn>) {
  return generateContent.mock.calls[0][0].contents[0].parts as Array<{ text?: string }>;
}

describe('ThumbnailEditorAiService reference prompt parity', () => {
  it('keeps creative generation free of generation reference images', async () => {
    const { service, generateContent, references } = makeService();

    await service.generateCreative([makeInput()], ORGANIZATION_ID, {
      sceneType: 'white-studio',
      styleType: 'minimal',
    });

    expect(references.generationParts).not.toHaveBeenCalled();
    expect(requestParts(generateContent).some((part) => part.text === 'REFERENCE PART')).toBe(false);
  });

  it('keeps editor generation references on the generateFromInputs-compatible path', async () => {
    const { service, generateContent, references } = makeService();

    await service.generateEdit([makeInput()], ORGANIZATION_ID, {
      purpose: 'compliance',
      editCase: 'single',
    });

    expect(references.generationParts).toHaveBeenCalledTimes(1);
    expect(requestParts(generateContent).some((part) => part.text === 'REFERENCE PART')).toBe(true);
  });

  it('uses edit-image references only for compliance re-edits', async () => {
    const quality = makeService();
    await quality.service.generateEdit([makeInput()], ORGANIZATION_ID, {
      purpose: 'quality',
      editCase: 'single',
      referenceMode: 'edit-image',
    });

    expect(quality.references.generationParts).not.toHaveBeenCalled();
    expect(requestParts(quality.generateContent).some((part) => part.text === 'REFERENCE PART')).toBe(false);

    const compliance = makeService();
    await compliance.service.generateEdit([makeInput()], ORGANIZATION_ID, {
      purpose: 'compliance',
      editCase: 'single',
      referenceMode: 'edit-image',
    });

    expect(compliance.references.generationParts).toHaveBeenCalledTimes(1);
    expect(requestParts(compliance.generateContent).some((part) => part.text === 'REFERENCE PART')).toBe(true);
  });
});
