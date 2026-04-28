import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  ThumbnailImageFetcherService,
  MAX_FETCH_BYTES,
  MAX_REDIRECTS,
} from '../services/thumbnail-image-fetcher.service';

class StorageStub {
  publicUrl = 'http://storage.local/kiditem';
  extractKey(url: string): string | null {
    if (url.startsWith(`${this.publicUrl}/`)) return url.slice(this.publicUrl.length + 1);
    return null;
  }
}

function makeService(): {
  fetcher: ThumbnailImageFetcherService;
  storage: StorageStub;
} {
  const storage = new StorageStub();
  return {
    fetcher: new ThumbnailImageFetcherService(storage as never),
    storage,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ThumbnailImageFetcherService SSRF guards', () => {
  it('rejects localhost and loopback hosts', async () => {
    const { fetcher } = makeService();
    await expect(fetcher.fetchImage('http://localhost/x.jpg')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(fetcher.fetchImage('http://127.0.0.1/x.jpg')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects private IPv4 ranges (10/8, 192.168/16, 172.16/12, link-local)', async () => {
    const { fetcher } = makeService();
    for (const host of ['10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.0.1']) {
      await expect(fetcher.fetchImage(`http://${host}/x.jpg`)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('rejects IPv6 loopback / ULA / link-local / IPv4-mapped private', async () => {
    const { fetcher } = makeService();
    for (const host of ['[::1]', '[fe80::1]', '[fc00::1]', '[fd00::1]', '[::ffff:10.0.0.1]']) {
      await expect(fetcher.fetchImage(`http://${host}/x.jpg`)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('rejects non-http(s) protocols', async () => {
    const { fetcher } = makeService();
    await expect(fetcher.fetchImage('file:///etc/passwd')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(fetcher.fetchImage('javascript:alert(1)')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects unsupported content-type values', async () => {
    const { fetcher } = makeService();
    vi.stubGlobal('fetch', async () =>
      new Response('', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(fetcher.fetchImage('https://example.com/x.html')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects payloads larger than MAX_FETCH_BYTES', async () => {
    const { fetcher } = makeService();
    const tooBig = new Uint8Array(MAX_FETCH_BYTES + 1);
    vi.stubGlobal('fetch', async () =>
      new Response(tooBig, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    await expect(fetcher.fetchImage('https://example.com/x.png')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stops after bounded redirects', async () => {
    const { fetcher } = makeService();
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return new Response('', {
        status: 302,
        headers: { location: 'https://example.com/next' },
      });
    });
    await expect(fetcher.fetchImage('https://example.com/start')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(calls).toBeGreaterThanOrEqual(MAX_REDIRECTS);
  });

  it('allows own-storage URLs through StorageService.extractKey', async () => {
    const { fetcher, storage } = makeService();
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // tiny stub
    vi.stubGlobal('fetch', async () =>
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    // Mark storage URL — host resolves to "storage.local" which is not
    // private, so without allowOwnStorage=true the public-URL check would
    // still pass. The point of allowOwnStorage is to allow *internal* hosts
    // like minio (127.0.0.1:9000) when needed; we just verify the boolean
    // flag flows through without raising.
    const url = `${storage.publicUrl}/thumbnail-inputs/x.jpg`;
    const result = await fetcher.fetchImage(url, { allowOwnStorage: true });
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.storageKey).toBe('thumbnail-inputs/x.jpg');
  });

  it('allows localhost own-storage URLs only through the trusted wrapper', async () => {
    const { fetcher, storage } = makeService();
    storage.publicUrl = 'http://localhost:9000/kiditem';
    const url = `${storage.publicUrl}/thumbnail-inputs/local.jpg`;
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    vi.stubGlobal('fetch', async () =>
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    );

    await expect(fetcher.fetchImage(url)).rejects.toBeInstanceOf(BadRequestException);
    const result = await fetcher.fetchTrustedStorageImage(url);
    expect(result.storageKey).toBe('thumbnail-inputs/local.jpg');
  });
});
