import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isRenderIntentId,
  measureRenderContentHeight,
  sanitizeClientRenderDocument,
  waitForRenderDocument,
} from './render-document';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('detail-page client render document helpers', () => {
  it('removes scripts, inline event handlers, active embeds, and refresh redirects', () => {
    const output = sanitizeClientRenderDocument(`<!DOCTYPE html>
      <html><head>
        <meta http-equiv="refresh" content="0;url=https://evil.example">
        <style>.hero { color: red; }</style>
        <script src="https://evil.example/a.js"></script>
      </head><body onload="steal()">
        <main><img src="https://cdn.example.com/hero.jpg" onerror="steal()"></main>
        <iframe src="https://evil.example"></iframe>
        <object data="https://evil.example/a.swf"></object>
      </body></html>`);

    expect(output).toContain('<style>.hero { color: red; }</style>');
    expect(output).toContain('https://cdn.example.com/hero.jpg');
    expect(output).not.toMatch(/<script\b/i);
    expect(output).not.toMatch(/\son[a-z]+=/i);
    expect(output).not.toMatch(/<iframe\b/i);
    expect(output).not.toMatch(/<object\b/i);
    expect(output).not.toMatch(/http-equiv="refresh"/i);
  });

  it('forces detail images to load eagerly while preserving styles and markup', () => {
    const output = sanitizeClientRenderDocument(
      '<html><head><style>.x{display:block}</style></head><body><main class="x"><img src="hero.jpg" loading="lazy"></main></body></html>',
    );

    const doc = new DOMParser().parseFromString(output, 'text/html');
    expect(doc.querySelector('style')?.textContent).toContain('display:block');
    expect(doc.querySelector('main.x')).not.toBeNull();
    expect(doc.querySelector('img')?.getAttribute('loading')).toBe('eager');
    expect(doc.querySelector('img')?.getAttribute('decoding')).toBe('sync');
  });

  it('accepts only UUID render intent IDs', () => {
    expect(isRenderIntentId('77777777-7777-4777-8777-777777777777')).toBe(true);
    expect(isRenderIntentId('../other')).toBe(false);
    expect(isRenderIntentId('')).toBe(false);
  });

  it('uses the tallest document extent and rounds it up', () => {
    const fakeDocument = {
      documentElement: { scrollHeight: 1000, offsetHeight: 900 },
      body: { scrollHeight: 1001.2, offsetHeight: 998 },
    } as unknown as Document;

    expect(measureRenderContentHeight(fakeDocument)).toBe(1002);
  });

  it('finishes in a background tab when animation frames are suspended', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const fakeDocument = {
      images: [],
      fonts: { ready: Promise.resolve() },
      documentElement: { scrollHeight: 1200, offsetHeight: 1200 },
      body: { scrollHeight: 1200, offsetHeight: 1200 },
    } as unknown as Document;

    const outcome = Promise.race([
      waitForRenderDocument(fakeDocument).then((height) => ({ status: 'ready', height })),
      new Promise<{ status: 'timeout'; height: null }>((resolve) => {
        setTimeout(() => resolve({ status: 'timeout', height: null }), 250);
      }),
    ]);

    await vi.advanceTimersByTimeAsync(250);

    await expect(outcome).resolves.toEqual({ status: 'ready', height: 1200 });
  });

  it('does not wait forever for web fonts that stay suspended in a background tab', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const fakeDocument = {
      images: [],
      fonts: { ready: new Promise(() => undefined) },
      documentElement: { scrollHeight: 7655, offsetHeight: 7655 },
      body: { scrollHeight: 7655, offsetHeight: 7655 },
    } as unknown as Document;

    const outcome = waitForRenderDocument(fakeDocument);
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(outcome).resolves.toBe(7655);
  });
});
