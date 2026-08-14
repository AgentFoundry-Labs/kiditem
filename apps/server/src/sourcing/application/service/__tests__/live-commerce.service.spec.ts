import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCommerceService } from '../live-commerce.service';
import type { TaobaoLivePort } from '../../port/out/provider/taobao-live.port';
import type { LiveCommerceRepositoryPort } from '../../port/out/repository/live-commerce.repository.port';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';

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
  const collectionOutputs: Array<{ typedRecords: Array<{ kind: string; row: unknown }> }> = [];
  const collectionCoordinator = {
    execute: vi.fn(async (input: any, collector: any) => {
      const output = await collector({
        permit: {
          runId: '00000000-0000-4000-8000-000000000010',
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          leaseToken: '00000000-0000-4000-8000-000000000011',
          generation: 1,
          entitlementVersionId: '00000000-0000-4000-8000-000000000012',
          entitlementVersionHash: 'a'.repeat(64),
          leaseExpiresAt: new Date('2026-08-08T01:02:00.000Z'),
        },
        checkpoint: async () => undefined,
      });
      collectionOutputs.push(output);
      return {
        kind: 'committed' as const,
        runId: input.idempotencyKey,
        acceptedCount: output.discoveredCount,
        duplicateCount: 0,
        staleDiscardedCount: 0,
      };
    }),
  } as unknown as SourcingCollectionCoordinator;
  return {
    service: new LiveCommerceService(taobao, repository, collectionCoordinator),
    taobao,
    repository,
    collectionCoordinator,
    collectionOutputs,
  };
}

function typedRows(
  ports: ReturnType<typeof buildService>,
  kind: string,
): Array<Record<string, unknown>> {
  return ports.collectionOutputs.flatMap((output) =>
    output.typedRecords
      .filter((record) => record.kind === kind)
      .map((record) => record.row as Record<string, unknown>),
  );
}

describe('LiveCommerceService', () => {
  let ports: ReturnType<typeof buildService>;

  beforeEach(() => {
    ports = buildService();
  });

  it('persists official Taobao rooms and products under the organization scope', async () => {
    ports.taobao.collect = vi.fn(async () => ({
      rooms: [{
        broadcastId: 'tb-live-1',
        title: '타오바오 완구 방송',
        broadcasterId: 'anchor-1',
        broadcasterName: '완구왕',
        status: 'live',
        viewerCount: 5000,
        likeCount: 300,
        startedAt: null,
        endedAt: null,
        coverImageUrl: null,
        sourceUrl: null,
      }],
      products: [{
        broadcastId: 'tb-live-1',
        productId: 'tb-item-1',
        rank: 1,
        title: '블록 완구',
        priceCny: 12,
        salesCount: null,
        imageUrl: null,
        sourceUrl: null,
      }],
      warnings: [],
    }));

    const result = await ports.service.collectTaobao(ORGANIZATION_ID, {
      queryDate: '20260714',
      liveIds: ['tb-live-1'],
    });

    expect(result).toEqual(expect.objectContaining({ broadcastCount: 1, productCount: 1 }));
    expect(typedRows(ports, 'live_commerce_broadcast')).toEqual([
      expect.objectContaining({ organizationId: ORGANIZATION_ID, source: 'taobao', broadcastId: 'tb-live-1' }),
    ]);
    expect(typedRows(ports, 'live_commerce_product')).toEqual([
      expect.objectContaining({ organizationId: ORGANIZATION_ID, source: 'taobao', productId: 'tb-item-1' }),
    ]);
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
});
