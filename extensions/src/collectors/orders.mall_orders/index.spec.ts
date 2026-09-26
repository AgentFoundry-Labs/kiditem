import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { mallOrdersCollector, type MallOrderReader, type MallOrdersSite } from './index';

const PLAN = {
  channelAccountId: '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11',
  mallKey: 'kidkids',
  mallName: '키드키즈',
  collectionDate: '2026-09-26',
  collectionMode: 'browser',
  selectionMode: 'automatic',
  seenRowKeys: ['A'],
};

function fakeSite(result: Awaited<ReturnType<MallOrderReader['readOrders']>>) {
  const asked: unknown[] = [];
  let closed = 0;
  const reader: MallOrderReader = {
    async readOrders(input) {
      asked.push(input);
      return result;
    },
    async close() {
      closed += 1;
    },
  };
  const site: MallOrdersSite = { reader: (mallKey) => (mallKey === 'kidkids' || mallKey === 'icecream-mall' ? reader : null) };
  return { site, asked, closed: () => closed };
}

async function collectAll(plan: Record<string, unknown>, site: MallOrdersSite) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of mallOrdersCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
  return chunks;
}

describe('collectors/orders.mall_orders — 몰 키로 그 몰 사이트를 골라 주문을 읽는다', () => {
  it('kind 이름으로 등록되고 몰 주문 라우터 사이트를 쓴다', () => {
    expect(collectorFor('orders.mall_orders')).toBe(mallOrdersCollector);
    expect(mallOrdersCollector.site).toBe('mall-orders');
  });

  it('plan의 수집일·선택 방식·본 행을 그 몰 읽기에 넘기고, 200개씩 order_rows 청크로 낸 뒤 사이트를 닫는다', async () => {
    const orders = Array.from({ length: 450 }, (_, index) => ({ om: `K-${index}`, items: [] }));
    const fake = fakeSite({ rows: orders });
    const chunks = await collectAll(PLAN, fake.site);
    expect(fake.asked).toEqual([{ collectionDate: '2026-09-26', selectionMode: 'automatic', seenRowKeys: ['A'], signal: expect.any(AbortSignal), onAttention: expect.any(Function) }]);
    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length])).toEqual([
      ['order_rows', 200],
      ['order_rows', 200],
      ['order_rows', 50],
    ]);
    expect(chunks.at(-1)?.progress).toEqual({ mallKey: 'kidkids', rows: 450 });
    expect(fake.closed()).toBe(1);
  });

  it('이어받기 정보(아이스크림몰)는 행 다음에 continuation 청크 한 장, 주문이 없으면 청크 없이 끝난다', async () => {
    const withContinuation = fakeSite({ rows: [['A', 'B']], continuation: { headers: ['h1', 'h2'] } });
    const chunks = await collectAll({ ...PLAN, mallKey: 'icecream-mall', mallName: '아이스크림몰' }, withContinuation.site);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['order_rows', 'continuation']);
    expect(chunks[1]!.payload).toEqual([{ headers: ['h1', 'h2'] }]);

    const empty = fakeSite({ rows: [] });
    await expect(collectAll(PLAN, empty.site)).resolves.toEqual([]);
    expect(empty.closed()).toBe(1);
  });

  it('몰이 운영자를 기다리면(GS샵 SMS 인증, KID-380) progress에 attention을 곧바로 올리고 풀리면 null로 올린다', async () => {
    const reports: Array<Record<string, unknown>> = [];
    const reader: MallOrderReader = {
      async readOrders(input) {
        await input.onAttention?.({ kind: 'verification', site: 'gs-shop', label: 'SMS 인증' });
        await input.onAttention?.(null);
        return { rows: [] };
      },
    };
    const site: MallOrdersSite = { reader: () => reader };
    const context = { signal: new AbortController().signal, tabId: null, report: async (progress: Record<string, unknown>) => { reports.push(progress); } };
    for await (const chunk of mallOrdersCollector.collect({ ...PLAN, mallKey: 'gs-shop' } as never, site, context)) void chunk;
    expect(reports).toEqual([
      { mallKey: 'gs-shop', attention: { kind: 'verification', site: 'gs-shop', label: 'SMS 인증', since: expect.any(String) } },
      { mallKey: 'gs-shop', attention: null },
    ]);
  });

  it('이 빌드에 없는 몰이거나 plan이 틀리면 읽지 않고 RUNTIME_PLAN_INVALID', async () => {
    for (const plan of [{ ...PLAN, mallKey: 'kidsnote' }, { mallKey: 'kidkids' }]) {
      const fake = fakeSite({ rows: [] });
      const error = await collectAll(plan, fake.site).then(() => null, (caught: unknown) => caught);
      expect(isRuntimeError(error) && error.code).toBe('RUNTIME_PLAN_INVALID');
      expect(fake.asked).toEqual([]);
    }
  });
});
