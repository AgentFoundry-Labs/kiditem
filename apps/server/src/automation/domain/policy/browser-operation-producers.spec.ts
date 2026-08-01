import { describe, expect, it } from 'vitest';
import { resolveBrowserOperationProducer } from './browser-operation-producers';

describe('browser operation producer policy', () => {
  it('labels a single Wing catalog analysis separately from batch sales-rank collection', () => {
    const runId = '11111111-1111-4111-8111-111111111111';

    expect(
      resolveBrowserOperationProducer({
        operationKey: `browser-collection:${runId}`,
        type: 'browser_collection',
        sourceType: 'browser_collection_session',
        sourceId: 'sourcing.wing_catalog',
      }),
    ).toEqual({
      title: '쿠팡 상품 분석',
      href: `/sourcing-ai/wing-catalog?collectionRun=${runId}`,
    });
  });

  it('registers Sellpia inventory freshness at the restored Sellpia sync tab', () => {
    const runId = '22222222-2222-4222-8222-222222222222';

    expect(
      resolveBrowserOperationProducer({
        operationKey: `browser-collection:${runId}`,
        type: 'browser_collection',
        sourceType: 'browser_collection_session',
        sourceId: 'inventory.sellpia',
      }),
    ).toEqual({
      title: 'Sellpia 재고 갱신',
      href: '/inventory-hub?tab=sellpia-sync',
    });
  });

  it('registers stable Sellpia quality warnings at the restored import-status tab', () => {
    const fileHash = 'a'.repeat(64);

    expect(
      resolveBrowserOperationProducer({
        operationKey: `sellpia-inventory-quality:${fileHash}:snapshot_churn`,
        type: 'sellpia_inventory_quality',
        sourceType: 'sellpia_inventory_import',
        sourceId: '33333333-3333-4333-8333-333333333333',
      }),
    ).toEqual({
      title: 'Sellpia 재고 품질 확인 필요',
      href: '/stock-ops?tab=freshness',
    });
  });

  it('routes mall order collection to the restored collection screen', () => {
    const runId = '44444444-4444-4444-8444-444444444444';

    expect(
      resolveBrowserOperationProducer({
        operationKey: `browser-collection:${runId}`,
        type: 'browser_collection',
        sourceType: 'browser_collection_session',
        sourceId: 'orders.mall',
      }),
    ).toEqual({
      title: '주문 데이터 수집',
      href: `/order-collection?collectionRun=${runId}`,
    });
  });

  it.each([
    ['orders.coupang_shipment_summary', '쿠팡 쉽먼트 조회', '/coupang-shipments'],
    ['orders.coupang_rocket_po', '쿠팡 로켓 PO 수집', '/rocket-orders'],
  ] as const)('routes %s to its operational screen', (sourceId, title, href) => {
    const runId = '66666666-6666-4666-8666-666666666666';

    expect(
      resolveBrowserOperationProducer({
        operationKey: `browser-collection:${runId}`,
        type: 'browser_collection',
        sourceType: 'browser_collection_session',
        sourceId,
      }),
    ).toEqual({
      title,
      href: `${href}?collectionRun=${runId}`,
    });
  });

  it('routes Sellpia manual matching to the product matching center', () => {
    const runId = '55555555-5555-4555-8555-555555555555';

    expect(
      resolveBrowserOperationProducer({
        operationKey: `browser-collection:${runId}`,
        type: 'browser_collection',
        sourceType: 'browser_collection_session',
        sourceId: 'orders.sellpia_manual_match',
      }),
    ).toEqual({
      title: 'Sellpia 상품 매칭',
      href: `/product-hub/matching?collectionRun=${runId}`,
    });
  });
});
