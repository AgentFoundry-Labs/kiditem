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
});
