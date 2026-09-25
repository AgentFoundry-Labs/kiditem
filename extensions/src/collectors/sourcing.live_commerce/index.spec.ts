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

  it('reports the operator attention the site raises and clears it', async () => {
    const reports: Array<Record<string, unknown>> = [];
    const site = {
      broadcast: async (pageUrl: string, options?: { onAttention?(a: { kind: 'verification'; site: string; label: string } | null): void | Promise<void> }) => {
        await options?.onAttention?.({ kind: 'verification', site: '라이브 방송', label: '방송' });
        await options?.onAttention?.(null);
        return { source: 'douyin' as const, pageUrl, broadcast: { broadcastId: 'b' }, products: [] };
      },
    };
    for await (const _ of sourcingLiveCommerceCollector.collect({ source: 'douyin', pageUrl: 'https://live.douyin.com/1' }, site,
      { signal: new AbortController().signal, tabId: null, report: async (progress) => { reports.push(progress); } })) { /* drain */ }
    expect(reports.map((report) => report.attention === null ? null : (report.attention as { kind: string }).kind)).toEqual(['verification', null]);
  });
});
