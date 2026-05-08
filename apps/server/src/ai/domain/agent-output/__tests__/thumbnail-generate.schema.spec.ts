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
  it('accepts creative mode with optional fields omitted', () => {
    const parsed = ThumbnailGenerateAgentInputSchema.safeParse({
      mode: 'creative',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts edit mode with editCase + supplemental fields', () => {
    const parsed = ThumbnailGenerateAgentInputSchema.safeParse({
      mode: 'edit',
      editCase: 'compose',
      supplementaryLabel: '구성',
      pieceCount: 4,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown mode', () => {
    const parsed = ThumbnailGenerateAgentInputSchema.safeParse({
      mode: 'unknown',
    });
    expect(parsed.success).toBe(false);
  });
});
