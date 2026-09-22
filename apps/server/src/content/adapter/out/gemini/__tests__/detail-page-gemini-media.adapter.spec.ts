import { describe, expect, it, vi } from 'vitest';
import { DetailPageGeminiMediaAdapter } from '../detail-page-gemini-media.adapter';

function makeAdapter() {
  const generateContent = vi.fn().mockResolvedValue({
    candidates: [{ content: { parts: [{ inlineData: { data: 'b3V0', mimeType: 'image/png' } }] } }],
  });
  const adapter = new DetailPageGeminiMediaAdapter();
  (adapter as unknown as { client: unknown }).client = { models: { generateContent } };
  return { adapter, generateContent };
}

describe('DetailPageGeminiMediaAdapter', () => {
  it('passes the explicit model, timeout, and abort signal to Gemini', async () => {
    const { adapter, generateContent } = makeAdapter();
    const signal = new AbortController().signal;

    await adapter.generateImage({
      images: [],
      prompt: 'generate detail image',
      model: 'gemini-image-direct',
      aspectRatio: '4:3',
      imageSize: '2K',
      noImageErrorCode: 'no_image',
      logContext: 'test',
      signal,
    });

    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-image-direct',
      config: expect.objectContaining({
        abortSignal: signal,
        httpOptions: { timeout: 120_000 },
      }),
    }));
  });

  it('does not invoke Gemini when already cancelled', async () => {
    const { adapter, generateContent } = makeAdapter();
    const controller = new AbortController();
    controller.abort('cancelled');

    await expect(adapter.completeVisionJson({
      images: [],
      prompt: 'classify',
      model: 'gemini-vision-direct',
      signal: controller.signal,
    })).rejects.toBe('cancelled');
    expect(generateContent).not.toHaveBeenCalled();
  });
});
