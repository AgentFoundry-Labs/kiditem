import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ImageEditGeminiMediaAdapter } from '../image-edit-gemini-media.adapter';

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
  const imageFetcher = {
    fetchImage: vi.fn(async () => ({
      buffer: Buffer.from('input'),
      mimeType: 'image/jpeg',
      storageKey: null,
    })),
    fetchTrustedStorageImage: vi.fn(async () => ({
      buffer: Buffer.from('trusted'),
      mimeType: 'image/png',
      storageKey: 'stored/input.png',
    })),
    assertSupportedMime: vi.fn(),
    extForMime: vi.fn(() => 'png'),
  };
  const storage = {
    save: vi.fn(async (key: string) => `https://cdn.example.com/${key}`),
    extractKey: vi.fn(() => null),
  };
  const adapter = new ImageEditGeminiMediaAdapter(
    imageFetcher as never,
    storage as never,
  );
  (adapter as unknown as { client: unknown }).client = {
    models: { generateContent },
  };
  return { adapter, generateContent, imageFetcher, storage };
}

function requestParts(generateContent: ReturnType<typeof vi.fn>) {
  return generateContent.mock.calls[0][0].contents[0].parts as Array<{
    text?: string;
    inlineData?: { data: string; mimeType: string };
  }>;
}

describe('ImageEditGeminiMediaAdapter', () => {
  it('returns provider bytes without storing the generated image', async () => {
    const { adapter, generateContent, imageFetcher, storage } = makeAdapter();

    const result = await adapter.editImage({
      organizationId: 'org-1',
      model: 'gemini-image-direct',
      preset: 'remove_background',
      imageUrl: 'https://source.example.com/product.jpg',
      userPrompt: 'crisp edges',
    });

    expect(imageFetcher.fetchImage).toHaveBeenCalledWith(
      'https://source.example.com/product.jpg',
      { signal: undefined },
    );
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-image-direct',
    }));
    const prompt = requestParts(generateContent).find((part) => part.text)?.text ?? '';
    expect(prompt).toContain('pure white (#FFFFFF) background');
    expect(prompt).toContain('checkerboard');
    expect(prompt).toContain('Additional: crisp edges');
    expect(storage.save).not.toHaveBeenCalled();
    expect(result).toEqual({
      buffer: Buffer.from('output'),
      mimeType: 'image/png',
    });
  });

  it('builds a multi-image color guide request', async () => {
    const { adapter, generateContent, imageFetcher } = makeAdapter();

    await adapter.editImage({
      organizationId: 'org-1',
      model: 'gemini-image-direct',
      preset: 'color_guide',
      imageUrls: [
        'data:image/png;base64,aW1nMQ==',
        'https://source.example.com/blue.jpg',
      ],
    });

    expect(imageFetcher.fetchImage).toHaveBeenCalledWith(
      'https://source.example.com/blue.jpg',
      { signal: undefined },
    );
    const parts = requestParts(generateContent);
    expect(parts.filter((part) => part.inlineData).map((part) => part.inlineData?.mimeType))
      .toEqual(['image/png', 'image/jpeg']);
    expect(parts.find((part) => part.text)?.text).toContain('side by side');
  });

  it('fails when Gemini returns no image', async () => {
    const { adapter, generateContent } = makeAdapter();
    generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'no image' }] } }],
    });

    await expect(
      adapter.editImage({
        organizationId: 'org-1',
        model: 'gemini-image-direct',
        preset: 'custom',
        imageUrl: 'data:image/png;base64,aW1n',
        userPrompt: 'make it brighter',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not fetch or invoke Gemini when already cancelled', async () => {
    const { adapter, generateContent, imageFetcher } = makeAdapter();
    const controller = new AbortController();
    controller.abort('cancelled');

    await expect(adapter.editImage({
      organizationId: 'org-1',
      model: 'gemini-image-direct',
      preset: 'custom',
      imageUrl: 'https://source.example.com/product.jpg',
      signal: controller.signal,
    })).rejects.toBe('cancelled');
    expect(imageFetcher.fetchImage).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });
});
