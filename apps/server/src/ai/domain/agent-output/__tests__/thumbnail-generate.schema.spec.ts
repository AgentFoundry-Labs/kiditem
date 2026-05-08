import { describe, expect, it } from 'vitest';
import {
  ThumbnailGenerateAgentInputSchema,
  ThumbnailGenerateAgentOutputSchema,
} from '../thumbnail-generate.schema';

describe('ThumbnailGenerateAgentOutputSchema', () => {
  it('accepts at least one candidate with an https url', () => {
    const parsed = ThumbnailGenerateAgentOutputSchema.safeParse({
      candidates: [
        {
          url: 'https://cdn.example.com/img-1.png',
          filename: 'img-1.png',
          mimeType: 'image/png',
          fileSize: 12345,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a data:image url candidate', () => {
    const parsed = ThumbnailGenerateAgentOutputSchema.safeParse({
      candidates: [
        {
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty candidates array', () => {
    const parsed = ThumbnailGenerateAgentOutputSchema.safeParse({
      candidates: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects candidate with non-https / non-data URL', () => {
    const parsed = ThumbnailGenerateAgentOutputSchema.safeParse({
      candidates: [{ url: 'ftp://example.com/img.png' }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('ThumbnailGenerateAgentInputSchema', () => {
  // Phase 3 made `inputs` required — every real Agent OS run delivers at
  // least the product image plus 0..N supplemental images. Each scenario
  // here uses a minimal one-image payload to stay focused on the field
  // under test.
  const sampleInputs = [
    {
      data: 'YmFzZTY0LWRhdGE=',
      mimeType: 'image/png',
      label: 'Product photo',
      url: 'https://cdn.example.com/p.png',
      storageKey: 'thumbnail-inputs/org/p.png',
      role: 'product' as const,
      sortOrder: 0,
      source: 'upload',
      fileSize: 1234,
    },
  ];

  it('accepts creative mode with optional fields omitted', () => {
    const parsed = ThumbnailGenerateAgentInputSchema.safeParse({
      mode: 'creative',
      inputs: sampleInputs,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts edit mode with editCase + supplemental fields', () => {
    const parsed = ThumbnailGenerateAgentInputSchema.safeParse({
      mode: 'edit',
      editCase: 'compose',
      supplementaryLabel: '구성',
      pieceCount: 4,
      inputs: sampleInputs,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown mode', () => {
    const parsed = ThumbnailGenerateAgentInputSchema.safeParse({
      mode: 'unknown',
      inputs: sampleInputs,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects missing inputs (Phase 3 required field)', () => {
    const parsed = ThumbnailGenerateAgentInputSchema.safeParse({
      mode: 'edit',
    });
    expect(parsed.success).toBe(false);
  });
});
