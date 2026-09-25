import { describe, expect, it } from 'vitest';
import { sourcingTrend1688Collector } from './index';

describe('sourcing.trend_1688 collector (KID-360)', () => {
  it('yields one offers_1688 chunk per planned keyword and closes the site even when a keyword fails', async () => {
    const log: string[] = [];
    const site = {
      async offers(keyword: string) {
        log.push(keyword);
        if (keyword === 'bad') throw new Error('blocked');
        return [{ offerId: `${keyword}-1` }];
      },
      async close() { log.push('close'); },
    };
    const chunks = [];
    for await (const chunk of sourcingTrend1688Collector.collect({ keywords: ['笔袋', '文具'] }, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
    expect(chunks.map((chunk) => chunk.payload)).toEqual([[{ keyword: '笔袋', items: [{ offerId: '笔袋-1' }] }], [{ keyword: '文具', items: [{ offerId: '文具-1' }] }]]);
    expect(log).toEqual(['笔袋', '文具', 'close']);

    const failing = sourcingTrend1688Collector.collect({ keywords: ['bad'] }, site, { signal: new AbortController().signal, tabId: null });
    await expect((async () => { for await (const _ of failing) { /* drain */ } })()).rejects.toThrow('blocked');
    expect(log.at(-1)).toBe('close');
  });

  it('ends without chunks when the plan has no keywords (the server publishes an empty snapshot)', async () => {
    const chunks = [];
    for await (const chunk of sourcingTrend1688Collector.collect({ keywords: [] }, { offers: async () => [], close: async () => undefined }, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
    expect(chunks).toEqual([]);
  });
});
