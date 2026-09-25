import { describe, expect, it } from 'vitest';
import { sourcingLiveCommerceCollector } from './index';

describe('sourcing.live_commerce collector (KID-360)', () => {
  it('yields the broadcast chunk and a products chunk only when there are products', async () => {
    const run = async (products: Array<Record<string, unknown>>) => {
      const chunks = [];
      for await (const chunk of sourcingLiveCommerceCollector.collect({ source: 'douyin', pageUrl: 'https://live.douyin.com/1' }, {
        broadcast: async (pageUrl) => ({ source: 'douyin', pageUrl, broadcast: { broadcastId: 'b' }, products }),
      }, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
      return chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length]);
    };
    expect(await run([{ productId: 'p' }])).toEqual([['live_broadcast', 1], ['live_products', 1]]);
    expect(await run([])).toEqual([['live_broadcast', 1]]);
  });
});
