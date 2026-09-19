import { describe, expect, it } from 'vitest';
import { SalesProductImageService } from './sales-product-image.service';
import type { SalesProductRepositoryPort } from '../port/out/repository/sales-product.repository.port';
import type { SalesProductImageMirrorPort } from '../port/out/storage/sales-product-image-mirror.port';

const ORG = '11111111-1111-1111-1111-111111111111';
const pic = (name: string) => `https://pic.sabangnet.co.kr/product_image/mw69839/100/${name}.jpg`;

function setup(options: { broken?: string[]; staleIds?: string[] } = {}) {
  const rows = [
    { id: 'a', code: '100001', version: 1, imageUrls: [pic('a1'), pic('a2')] },
    { id: 'b', code: '100002', version: 1, imageUrls: [pic('b1'), 'https://kiditem.diskn.com/b2.jpg'] },
  ];
  const repository = {
    listImageUrls: async () => rows.map((row) => ({ ...row, imageUrls: [...row.imageUrls] })),
    replaceImageUrls: async (input: { salesProductId: string; expectedVersion: number; imageUrls: string[] }) => {
      const row = rows.find((candidate) => candidate.id === input.salesProductId)!;
      if (options.staleIds?.includes(row.id) || row.version !== input.expectedVersion) return false;
      Object.assign(row, { imageUrls: input.imageUrls, version: row.version + 1 });
      return true;
    },
  } as unknown as SalesProductRepositoryPort;
  const mirror: SalesProductImageMirrorPort = {
    urlFor: (key) => `http://storage.local/${key}`,
    mirror: async ({ sourceUrl, key }) => (options.broken?.includes(sourceUrl)
      ? { ok: false, reason: '빈 파일' }
      : { ok: true, url: `http://storage.local/${key}` }),
  };
  return { rows, service: new SalesProductImageService(repository, mirror) };
}

describe('SalesProductImageService', () => {
  it('moves Sabangnet photos batch by batch and skips a photo it cannot move', async () => {
    const { rows, service } = setup({ broken: [pic('a1')] });
    expect(await service.external(ORG)).toEqual({ images: 3, products: 2 });

    const first = await service.mirror(ORG, { limit: 2 });
    expect(first).toMatchObject({ mirrored: 1, failedCount: 1, productsUpdated: 1, remaining: 2, nextSkip: 1 });
    expect(rows[0]!.imageUrls[0]).toBe(pic('a1'));
    expect(rows[0]!.imageUrls[1]).toMatch(/^http:\/\/storage\.local\/sales-products\//);

    const second = await service.mirror(ORG, { limit: 2, skip: first.nextSkip });
    expect(second).toMatchObject({ mirrored: 1, failedCount: 0, remaining: 1, nextSkip: 1 });
    expect(rows[1]!.imageUrls[1]).toBe('https://kiditem.diskn.com/b2.jpg');
  });

  it('leaves a product someone edited meanwhile for the next run', async () => {
    const { rows, service } = setup({ staleIds: ['b'] });
    const result = await service.mirror(ORG, { limit: 10 });
    expect(result).toMatchObject({ mirrored: 3, productsUpdated: 1, productsSkipped: 1, remaining: 1 });
    expect(rows[1]!.imageUrls[0]).toBe(pic('b1'));
  });
});
