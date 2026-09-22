import { ChannelIntegrityAdapter } from '../../../adapter/out/integrity/channel-integrity.adapter';
import { describe, expect, it } from 'vitest';
import { SalesProductImageService } from './sales-product-image.service';
import type { SalesProductRepositoryPort } from '../../port/out/persistence/sales-product.repository.port';
import type { SalesProductImageMirrorPort } from '../../port/out/storage/sales-product-image-mirror.port';

const channelIntegrity = new ChannelIntegrityAdapter();

const ORG = '11111111-1111-1111-1111-111111111111';
const pic = (name: string) => `https://pic.sabangnet.co.kr/product_image/mw69839/100/${name}.jpg`;

function setup(options: {
  broken?: string[];
  staleIds?: string[];
  includeDetail?: boolean;
  detailOnly?: boolean;
  unsupported?: boolean;
} = {}) {
  const rows = [
    {
      id: 'a',
      code: '100001',
      version: 1,
      imageUrls: options.detailOnly
        ? []
        : [pic('a1'), pic('a2'), ...(options.unsupported ? ['https://images.example.com/a.jpg'] : [])],
      detailHtml: options.includeDetail ? `<div><img src="${pic('a2')}"><img src="${pic('a3')}"></div>` : null,
      extraDetailHtml: options.includeDetail ? [`<img srcset="${pic('a3')} 1x, ${pic('a4')} 2x">`] : [],
    },
    { id: 'b', code: '100002', version: 1, imageUrls: [pic('b1'), 'https://kiditem.diskn.com/b2.jpg'], detailHtml: null, extraDetailHtml: [] },
  ];
  const repository = {
    listImageUrls: async () => rows.map((row) => ({ ...row, imageUrls: [...row.imageUrls] })),
    replaceImageUrls: async (input: {
      salesProductId: string;
      expectedVersion: number;
      imageUrls: string[];
      detailHtml?: string | null;
      extraDetailHtml?: string[];
    }) => {
      const row = rows.find((candidate) => candidate.id === input.salesProductId)!;
      if (options.staleIds?.includes(row.id) || row.version !== input.expectedVersion) return false;
      Object.assign(row, {
        imageUrls: input.imageUrls,
        ...(input.detailHtml !== undefined ? { detailHtml: input.detailHtml } : {}),
        ...(input.extraDetailHtml !== undefined ? { extraDetailHtml: input.extraDetailHtml } : {}),
        version: row.version + 1,
      });
      return true;
    },
  } as unknown as SalesProductRepositoryPort;
  const mirror: SalesProductImageMirrorPort = {
    urlFor: (key) => `http://storage.local/${key}`,
    isOwnedUrl: (url) => url.startsWith('http://storage.local/') || url.startsWith('https://kiditem.diskn.com/'),
    mirror: async ({ sourceUrl, key }) => (options.broken?.includes(sourceUrl)
      ? { ok: false, reason: '빈 파일' }
      : { ok: true, url: `http://storage.local/${key}` }),
  };
  return { rows, service: new SalesProductImageService(repository, mirror, { log() {}, warn() {} }, channelIntegrity) };
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

  it('mirrors detail HTML src and srcset references and replaces only successful copies', async () => {
    const { rows, service } = setup({ includeDetail: true, broken: [pic('a3')] });
    const result = await service.mirror(ORG, { limit: 20 });

    expect(result).toMatchObject({ mirrored: 4, failedCount: 1, productsUpdated: 2, remaining: 1 });
    expect(rows[0]!.detailHtml).toContain('http://storage.local/sales-products/');
    expect(rows[0]!.extraDetailHtml[0]).toContain(`srcset="${pic('a3')} 1x`);
    expect(rows[0]!.extraDetailHtml[0]).toContain('http://storage.local/sales-products/');
    expect(rows[0]!.detailHtml).toContain(pic('a3'));
  });

  it('mirrors a product whose only image references are in detail HTML', async () => {
    const { rows, service } = setup({ includeDetail: true, detailOnly: true });
    const result = await service.mirror(ORG, { limit: 20 });

    expect(result).toMatchObject({ mirrored: 4, failedCount: 0, productsUpdated: 2, remaining: 0 });
    expect(rows[0]!.imageUrls).toEqual([]);
    expect(rows[0]!.detailHtml).not.toContain('pic.sabangnet.co.kr');
    expect(rows[0]!.extraDetailHtml[0]).not.toContain('pic.sabangnet.co.kr');
  });

  it('reports unsupported external URLs as failures without fetching them', async () => {
    const { service } = setup({ unsupported: true });
    const result = await service.mirror(ORG, { limit: 20 });

    expect(result.failed).toContainEqual({ url: 'https://images.example.com/a.jpg', reason: '지원하지 않는 외부 이미지 주소' });
    expect(result.failedCount).toBe(1);
    expect(result.remaining).toBe(1);
  });
});
