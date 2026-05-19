import { describe, expect, it } from 'vitest';
import {
  buildThumbnailGenerateAgentInput,
  buildThumbnailGenerationInputMeta,
  inferThumbnailEditCase,
} from '../thumbnail-generation-requests';
import { ThumbnailGenerateAgentInputSchema } from '../../../domain/agent-output';
import type { ThumbnailEditorInputImage } from '../../../domain/model/thumbnail-editor';

const INPUT: ThumbnailEditorInputImage = {
  data: 'BASE64_IMAGE',
  mimeType: 'image/jpeg',
  label: 'Product photo',
  url: 'https://cdn.example.com/product.jpg',
  storageKey: 'thumbnail-inputs/product.jpg',
  role: 'product',
  sortOrder: 0,
  source: 'master_image',
  fileSize: 12345,
};

describe('thumbnail generation request builders', () => {
  it('builds schema-valid edit agent input from canonical thumbnail request fields', () => {
    const payload = buildThumbnailGenerateAgentInput({
      mode: 'edit',
      purpose: 'quality',
      editCase: 'compose',
      productName: 'Magnetic Blocks',
      productDescription: 'Colorful STEM blocks',
      category: 'Kids/Toys',
      supplementaryLabel: 'Package',
      pieceCount: 24,
      colorCount: 6,
      layout: 'grid',
      userPrompt: 'keep all pieces visible',
      inputs: [INPUT, { ...INPUT, label: 'Package', role: 'box', sortOrder: 1 }],
    });

    const parsed = ThumbnailGenerateAgentInputSchema.parse(payload);
    expect(parsed).toMatchObject({
      mode: 'edit',
      editCase: 'compose',
      purpose: 'quality',
      productName: 'Magnetic Blocks',
      productDescription: 'Colorful STEM blocks',
      category: 'Kids/Toys',
      supplementaryLabel: 'Package',
      pieceCount: 24,
      colorCount: 6,
      layout: 'grid',
      composition: '24개입, 6가지 색상',
      userPrompt: 'keep all pieces visible',
    });
    expect(parsed.inputs).toEqual([
      expect.objectContaining({
        data: 'BASE64_IMAGE',
        storageKey: 'thumbnail-inputs/product.jpg',
        role: 'product',
      }),
      expect.objectContaining({
        label: 'Package',
        role: 'box',
        sortOrder: 1,
      }),
    ]);
  });

  it('builds schema-valid creative agent input with style-reference intent', () => {
    const payload = buildThumbnailGenerateAgentInput({
      mode: 'creative',
      productName: 'Wooden Puzzle',
      productDescription: 'Warm wood toddler puzzle',
      category: 'Kids/Puzzles',
      sceneType: 'playroom',
      styleType: 'catalog',
      userPrompt: 'sunny shelf scene',
      hasStyleReference: true,
      inputs: [INPUT, { ...INPUT, label: 'Style reference', role: 'detail', sortOrder: 1 }],
    });

    const parsed = ThumbnailGenerateAgentInputSchema.parse(payload);
    expect(parsed.mode).toBe('creative');
    expect(parsed.editCase).toBeUndefined();
    expect(parsed.purpose).toBeUndefined();
    expect(parsed.hasStyleReference).toBe(true);
    expect(parsed.inputs[1]).toMatchObject({
      label: 'Style reference',
      role: 'detail',
    });
  });

  it('builds shared inputMeta for editor, product-generation, and post-promotion callers', () => {
    const meta = buildThumbnailGenerationInputMeta({
      mode: 'edit',
      purpose: 'compliance',
      editCase: 'single',
      method: 'generate',
      trigger: 'product_generation',
      productName: 'Magnetic Blocks',
      inputs: [INPUT],
    });

    expect(meta).toEqual({
      mode: 'edit',
      purpose: 'compliance',
      editCase: 'single',
      method: 'generate',
      trigger: 'product_generation',
      layout: null,
      sceneType: null,
      styleType: null,
      pieceCount: null,
      colorCount: null,
      productName: 'Magnetic Blocks',
      inputCount: 1,
      inputRoles: ['product'],
      inputLabels: ['Product photo'],
    });
  });

  it('infers the editor edit case from resolved request shape', () => {
    expect(inferThumbnailEditCase({})).toBe('single');
    expect(inferThumbnailEditCase({ packagingImage: 'box' })).toBe('compose');
    expect(inferThumbnailEditCase({ colorImages: ['red', 'blue'] })).toBe('color-variants');
    expect(inferThumbnailEditCase({ bundleImages: ['a', 'b'] })).toBe('bundle');
  });
});
