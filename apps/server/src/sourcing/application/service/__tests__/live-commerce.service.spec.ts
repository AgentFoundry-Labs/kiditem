import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCommerceService } from '../live-commerce.service';
import type { TaobaoLivePort } from '../../port/out/provider/taobao-live.port';
import type { LiveCommerceRepositoryPort } from '../../port/out/repository/live-commerce.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

function buildService() {
  const taobao: TaobaoLivePort = {
    readiness: vi.fn(() => ({ configured: true, mode: 'official-api', missing: [] })),
    collect: vi.fn(async () => ({ rooms: [], products: [], warnings: [] })),
  };
  const repository: LiveCommerceRepositoryPort = {
    findBroadcastSnapshots: vi.fn(async () => []),
    findProductSnapshots: vi.fn(async () => []),
  };
  return {
    service: new LiveCommerceService(taobao, repository, {} as never),
    taobao,
    repository,
  };
}

describe('LiveCommerceService', () => {
  let ports: ReturnType<typeof buildService>;

  beforeEach(() => {
    ports = buildService();
  });

  it('derives stationery/toy trend keywords from live product titles across sources', async () => {
    const capturedAt = new Date('2026-07-13T05:00:00.000Z');
    ports.repository.findProductSnapshots = vi.fn(async () => [
      // 도우인/1688 라이브 중문 상품명 → 玩具(완구)로 분류
      { source: 'douyin', broadcastId: 'b1', productId: 'p1', businessDate: capturedAt, capturedAt, rank: 1, title: '儿童玩具批发', priceCny: 12.5, salesCount: 300, imageUrl: 'https://img/1.jpg', sourceUrl: null },
      { source: '1688', broadcastId: 'b2', productId: 'p2', businessDate: capturedAt, capturedAt, rank: 1, title: '益智玩具套装', priceCny: 8, salesCount: 100, imageUrl: null, sourceUrl: null },
      // 문구·완구와 무관 → 제외
      { source: '1688', broadcastId: 'b2', productId: 'p3', businessDate: capturedAt, capturedAt, rank: 2, title: '不锈钢保温杯', priceCny: 20, salesCount: 50, imageUrl: null, sourceUrl: null },
    ] as never);

    const result = await ports.service.keywordDigest(ORGANIZATION_ID, { days: 7 });

    const toy = result.keywords.find((k) => k.keyword === '완구');
    expect(toy).toBeDefined();
    expect(toy!.productCount).toBe(2);
    expect(toy!.sources).toEqual(['1688', 'douyin']);
    expect(toy!.totalSales).toBe(400);
    expect(result.keywords.some((k) => k.sampleTitles.includes('不锈钢保温杯'))).toBe(false);
  });

  it('keeps distinct source/broadcast/product composite identities separate', async () => {
    const capturedAt = new Date('2026-07-13T05:00:00.000Z');
    ports.repository.findProductSnapshots = vi.fn(async () => [
      { source: 'douyin', broadcastId: 'a', productId: 'bc', businessDate: capturedAt, capturedAt, rank: 1, title: '儿童玩具', priceCny: 12, salesCount: 10, imageUrl: null, sourceUrl: null },
      { source: 'douyin', broadcastId: 'ab', productId: 'c', businessDate: capturedAt, capturedAt, rank: 1, title: '儿童玩具', priceCny: 12, salesCount: 10, imageUrl: null, sourceUrl: null },
    ] as never);

    const result = await ports.service.keywordDigest(ORGANIZATION_ID, { days: 7 });
    const toy = result.keywords.find((keyword) => keyword.keyword === '완구');

    expect(toy).toEqual(expect.objectContaining({ productCount: 2, broadcastCount: 2 }));
  });
});
