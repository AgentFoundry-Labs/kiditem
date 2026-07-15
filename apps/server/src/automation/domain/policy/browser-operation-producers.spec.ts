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

  it('registers Sellpia inventory freshness at the canonical inventory drawer route', () => {
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
      href: `/inventory-hub?tab=overview&collectionRun=${runId}`,
    });
  });
});
