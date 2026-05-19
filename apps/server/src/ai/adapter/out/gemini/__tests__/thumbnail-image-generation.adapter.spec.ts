import { describe, expect, it, vi } from 'vitest';
import { ThumbnailImageGenerationAdapter } from '../thumbnail-image-generation.adapter';

function makeAdapter() {
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
  const adapter = new ThumbnailImageGenerationAdapter();
  (adapter as unknown as { client: unknown }).client = {
    models: { generateContent },
  };
  return { adapter, generateContent };
}

describe('ThumbnailImageGenerationAdapter', () => {
  it('uses the explicit Agent OS model for Gemini image generation', async () => {
    const { adapter, generateContent } = makeAdapter();

    await adapter.generateImageParts({
      model: 'gemini-image-from-agent-os',
      parts: [{ text: 'generate a compliant thumbnail' }],
    });

    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-image-from-agent-os',
    }));
  });
});
