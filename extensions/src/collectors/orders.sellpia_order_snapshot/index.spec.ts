import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish } from '../collector';
import { collectorFor } from '../index';
import { sellpiaOrderSnapshotCollector, type SellpiaSnapshotScreen, type SellpiaOrderSnapshotSite } from './index';

const order = (orderNo: string, provider = '몰') => ({ orderNo, receiver: '홍', provider });

function site(screens: SellpiaSnapshotScreen[] | Error): SellpiaOrderSnapshotSite {
  return {
    async orderSnapshot() {
      if (screens instanceof Error) throw screens;
      return { screens };
    },
  };
}

async function run(snapshot: SellpiaOrderSnapshotSite) {
  const chunks: CollectedChunk[] = [];
  const stream = sellpiaOrderSnapshotCollector.collect({} as never, snapshot, { signal: new AbortController().signal, tabId: null }) as AsyncGenerator<CollectedChunk, CollectFinish | void>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value ?? null };
    chunks.push(step.value);
  }
}

describe('collectors/orders.sellpia_order_snapshot', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓴다', () => {
    expect(collectorFor('orders.sellpia_order_snapshot')).toBe(sellpiaOrderSnapshotCollector);
    expect(sellpiaOrderSnapshotCollector.site).toBe('sellpia');
  });

  it('두 화면의 주문을 주문번호로 합쳐(먼저 본 화면이 이긴다) snapshot_rows로 내고 finish result에 partial:false', async () => {
    const { chunks, finish } = await run(site([
      { source: 'pending', rows: [order('A-1'), order('B-1')] },
      { source: 'stockmatch', rows: [order('B-1', '다른몰'), order('C-1')] },
    ]));
    expect(chunks).toEqual([{
      chunkKind: 'snapshot_rows',
      payload: [
        { ...order('A-1'), source: 'pending' },
        { ...order('B-1'), source: 'pending' },
        { ...order('C-1'), source: 'stockmatch' },
      ],
      progress: { orderCount: 3, partial: false },
    }]);
    expect(finish).toEqual({ result: { partial: false } });
  });

  it('한 화면만 읽었으면 partial:true, 셀피아에 주문이 없으면 청크 없이 끝난다', async () => {
    const half = await run(site([{ source: 'pending', rows: null }, { source: 'stockmatch', rows: [] }]));
    expect(half.chunks).toEqual([]);
    expect(half.finish).toEqual({ result: { partial: true } });
  });

  it('두 화면 다 못 읽으면 사이트의 SITE_LOGIN_REQUIRED 그대로 실패한다', async () => {
    const login = new RuntimeError('SITE_LOGIN_REQUIRED', '셀피아 주문 목록을 읽지 못했습니다.');
    await expect(run(site(login))).rejects.toBe(login);
  });
});
