import { describe, expect, it, vi } from 'vitest';
import { ThumbnailEditorController } from '../adapter/in/http/thumbnail-editor.controller';
import type { ThumbnailEditorDto } from '../adapter/in/http/dto/thumbnail-editor.dto';
import type { ThumbnailEditorInputImage } from '../domain/model/thumbnail-editor';

const COMPANY_ID = 'company-1';
const PRODUCT_ID = '7d000000-0000-4000-8000-000000000001';

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

function makeController() {
  const editorAi = {
    resolveInputImage: vi.fn(async (
      value: string,
      _companyId: string,
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
    findProductForEditor: vi.fn(async () => ({
      id: PRODUCT_ID,
      name: 'Sample product',
      category: 'toys',
      imageUrl: 'master-url',
    })),
    saveEditorResult: vi.fn(async () => 'generation-1'),
  };
  const controller = new ThumbnailEditorController(
    editorAi as never,
    generationService as never,
  );
  return { controller, editorAi, generationService };
}

describe('ThumbnailEditorController parity behavior', () => {
  it('prepends the main product image for color-variant generation', async () => {
    const { controller, editorAi } = makeController();
    const body = {
      productId: PRODUCT_ID,
      productImage: 'main-product-url',
      colorImages: ['red-url', 'blue-url'],
      purpose: 'compliance',
      mode: 'edit',
    } satisfies ThumbnailEditorDto;

    await controller.generate(body, COMPANY_ID);

    const inputs = editorAi.generateEdit.mock.calls[0][0] as ThumbnailEditorInputImage[];
    expect(inputs.map((input) => input.label)).toEqual([
      'Main product',
      'Color variant 1',
      'Color variant 2',
    ]);
    expect(inputs.map((input) => input.role)).toEqual(['product', 'color_variant', 'color_variant']);
  });

  it('does not add product/category context to creative prompt options', async () => {
    const { controller, editorAi } = makeController();
    const body = {
      productId: PRODUCT_ID,
      productImage: 'main-product-url',
      purpose: 'quality',
      mode: 'creative',
      sceneType: 'white-studio',
      styleType: 'minimal',
    } satisfies ThumbnailEditorDto;

    await controller.generate(body, COMPANY_ID);

    const options = editorAi.generateCreative.mock.calls[0][2] as Record<string, unknown>;
    expect(options.productName).toBeUndefined();
    expect(options.category).toBeUndefined();
  });
});
