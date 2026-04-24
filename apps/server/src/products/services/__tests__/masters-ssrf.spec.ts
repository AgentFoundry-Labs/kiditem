import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MastersService } from '../masters.service';

function makeService(row: { imageUrl?: string | null; thumbnailUrl?: string | null; images?: unknown } | null) {
  const prisma = {
    masterProduct: {
      findFirst: vi.fn().mockResolvedValue(row),
    },
  };
  const codeSvc = {} as any;
  const storage = {} as any;
  return new MastersService(prisma as any, codeSvc, storage);
}

describe('MastersService.originalImageBase64 — SSRF defense', () => {
  beforeEach(() => {
    // fetch must not be invoked for blocked URLs
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch must not be called on blocked host'));
  });

  const cases: Array<[string, string]> = [
    ['http://localhost/x.png', 'localhost'],
    ['http://127.0.0.1/x.png', 'IPv4 loopback'],
    ['http://10.0.0.5/x.png', 'RFC1918 10/8'],
    ['http://192.168.1.1/x.png', 'RFC1918 192.168/16'],
    ['http://172.16.5.5/x.png', 'RFC1918 172.16/12'],
    ['http://169.254.169.254/meta', 'cloud metadata 169.254.169.254'],
    ['http://0.0.0.0/x.png', 'unspecified 0.0.0.0'],
    ['http://100.64.0.1/x.png', 'CGNAT 100.64/10'],
    ['http://[::1]/x.png', 'IPv6 loopback ::1'],
    ['http://[::]/x.png', 'IPv6 unspecified ::'],
    ['http://[fe80::1]/x.png', 'IPv6 link-local fe80::/10'],
    ['http://[fe80::1%eth0]/x.png', 'IPv6 link-local with zone id'],
    ['http://[fc00::1]/x.png', 'IPv6 ULA fc00::/7'],
    ['http://[fd12::1]/x.png', 'IPv6 ULA fd00::/8'],
    ['ftp://example.com/x.png', 'non-http scheme'],
  ];

  for (const [url, label] of cases) {
    it(`blocks ${label} (${url})`, async () => {
      const svc = makeService({ imageUrl: url, thumbnailUrl: null, images: [] });
      await expect(svc.originalImageBase64('company-1', 'master-1'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  }

  it('allows a public HTTPS CDN URL (proceeds to fetch, which we stub)', async () => {
    const svc = makeService({ imageUrl: 'https://cdn.example.com/a.png', thumbnailUrl: null, images: [] });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new ArrayBuffer(4),
    }) as any;
    const result = await svc.originalImageBase64('company-1', 'master-1');
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('returns 404 when no image url is set on the master', async () => {
    const svc = makeService({ imageUrl: null, thumbnailUrl: null, images: [] });
    await expect(svc.originalImageBase64('company-1', 'master-1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
