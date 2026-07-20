import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiTextCompletionAdapter } from '../gemini-text-completion.adapter';

describe('GeminiTextCompletionAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('combines caller cancellation with the provider timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const signal = new AbortController().signal;
      await new GeminiTextCompletionAdapter().complete({
        system: 'system',
        user: 'user',
        temperature: 0.1,
        model: 'gemini-text-direct',
        signal,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/gemini-text-direct:generateContent'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });

  it('does not issue an HTTP request when already cancelled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort('cancelled');

    await expect(new GeminiTextCompletionAdapter().complete({
      system: 'system',
      user: 'user',
      temperature: 0.1,
      model: 'gemini-text-direct',
      signal: controller.signal,
    })).rejects.toBe('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
