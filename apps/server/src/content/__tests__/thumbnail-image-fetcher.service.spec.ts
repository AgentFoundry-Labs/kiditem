import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  ThumbnailImageFetcherService,
  MAX_FETCH_BYTES,
  MAX_REDIRECTS,
} from '../adapter/out/image-fetch/thumbnail-image-fetcher.adapter';

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: lookupMock,
}));

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

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ]);
});

describe('ThumbnailImageFetcherService SSRF guards', () => {
  it('rejects a hostname that resolves to a private address before fetching', async () => {
    const { fetcher } = makeService();
    lookupMock.mockResolvedValueOnce([
      { address: '169.254.169.254', family: 4 },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetcher.fetchImage('https://attacker.example/image.png'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when the caller signal is already aborted', async () => {
    const { fetcher } = makeService();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort('cancelled');

    await expect(fetcher.fetchImage(
      'https://example.com/image.png',
      { signal: controller.signal },
    )).rejects.toBe('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates the resolved address again for every redirect hop', async () => {
    const { fetcher } = makeService();
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.8', family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('', {
        status: 302,
        headers: { location: 'https://private.example/image.png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetcher.fetchImage('https://public.example/image.png'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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

  it('cancels the response stream as soon as the byte ceiling is exceeded', async () => {
    const { fetcher } = makeService();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_FETCH_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    vi.stubGlobal('fetch', async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );

    await expect(
      fetcher.fetchImage('https://example.com/stream.png'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cancel).toHaveBeenCalled();
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
