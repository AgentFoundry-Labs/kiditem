import { describe, expect, it } from 'vitest';
import { sourcingTiktokCreativeCollector } from './index';

function site(items: Record<string, Array<Record<string, unknown>>>, region: string | null = 'KR') {
  const visited: string[] = [];
  return {
    visited,
    closed: 0,
    targetFor: (targetId: string) => ({ id: targetId }),
    async target(target: { id: string }) {
      visited.push(target.id);
      return { region, items: items[target.id] ?? [] };
    },
    async close() { this.closed += 1; },
  };
}

async function run(plan: { targetIds: string[]; maxItems: number; regionOverride: string | null }, fake: ReturnType<typeof site>) {
  const chunks = [];
  for await (const chunk of sourcingTiktokCreativeCollector.collect(plan, fake, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
  return chunks.map((chunk) => chunk.payload[0] as { targetId: string; region: string; items: Array<{ entityKey: string }> });
}

describe('sourcing.tiktok_creative collector (KID-360)', () => {
  it('visits every target, dedupes items across targets, and yields one chunk per target with one region', async () => {
    const fake = site({ hashtag: [{ trendType: 'hashtag', entityKey: 'a' }], product: [{ trendType: 'hashtag', entityKey: 'a' }, { trendType: 'product', entityKey: 'b' }] });
    const chunks = await run({ targetIds: ['hashtag', 'product', 'keyword:x'], maxItems: 50, regionOverride: null }, fake);
    expect(chunks.map((chunk) => [chunk.targetId, chunk.region, chunk.items.map((item) => item.entityKey)])).toEqual([
      ['hashtag', 'KR', ['a']], ['product', 'KR', ['b']], ['keyword:x', 'KR', []],
    ]);
    expect(fake.closed).toBe(1);
  });

  it('stops visiting once maxItems is reached (the server accepts the visited prefix)', async () => {
    const fake = site({ hashtag: [{ trendType: 'hashtag', entityKey: 'a' }, { trendType: 'hashtag', entityKey: 'b' }] });
    const chunks = await run({ targetIds: ['hashtag', 'product'], maxItems: 2, regionOverride: 'JP' }, fake);
    expect(fake.visited).toEqual(['hashtag']);
    expect(chunks).toEqual([{ targetId: 'hashtag', region: 'JP', items: [{ trendType: 'hashtag', entityKey: 'a' }, { trendType: 'hashtag', entityKey: 'b' }] }]);
  });

  it('falls back to US when no page reports a region', async () => {
    const chunks = await run({ targetIds: ['hashtag'], maxItems: 5, regionOverride: null }, site({}, null));
    expect(chunks[0].region).toBe('US');
  });

  it('reports the operator attention the site raises for a target and clears it', async () => {
    const reports: Array<Record<string, unknown>> = [];
    const site = {
      targetFor: (id: string) => ({ id }),
      target: async (target: { id: string }, _region: string | null, options?: { onAttention?(a: { kind: 'verification'; site: string; label: string } | null): void | Promise<void> }) => {
        await options?.onAttention?.({ kind: 'verification', site: 'TikTok', label: target.id });
        await options?.onAttention?.(null);
        return { region: 'KR', items: [] };
      },
      close: async () => undefined,
    };
    for await (const _ of sourcingTiktokCreativeCollector.collect({ targetIds: ['hashtag'], maxItems: 10, regionOverride: null }, site,
      { signal: new AbortController().signal, tabId: null, report: async (progress) => { reports.push(progress); } })) { /* drain */ }
    expect(reports[0]).toMatchObject({ label: 'hashtag', attention: { kind: 'verification', site: 'TikTok' } });
    expect(reports[1]).toMatchObject({ attention: null });
  });
});
