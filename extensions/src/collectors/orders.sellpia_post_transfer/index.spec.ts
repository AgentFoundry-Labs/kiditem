import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish } from '../collector';
import { collectorFor } from '../index';
import { postTransferCollector, type SellpiaPostTransferSite } from './index';

function fakeSellpia(steps: { register?: () => Promise<{ registered: number | null; message: string | null }>; stockmatch?: () => Promise<{ matched: number; unmatchedOrderNumbers: string[]; message: string | null }> } = {}) {
  const log: string[] = [];
  const site: SellpiaPostTransferSite = {
    async openPostTransfer() {
      log.push('open');
      return {
        register: async () => {
          log.push('register');
          return (steps.register ?? (async () => ({ registered: 2, message: '2건이 등록되었습니다' })))();
        },
        stockmatch: async () => {
          log.push('stockmatch');
          return (steps.stockmatch ?? (async () => ({ matched: 1, unmatchedOrderNumbers: ['G-2'], message: '미매칭 1건' })))();
        },
        done: async () => {
          log.push('done');
        },
      };
    },
  };
  return { site, log };
}

async function run(site: SellpiaPostTransferSite) {
  const chunks: CollectedChunk[] = [];
  const stream = postTransferCollector.collect({} as never, site, { signal: new AbortController().signal, tabId: null }) as AsyncGenerator<CollectedChunk, CollectFinish | void>;
  try {
    for (;;) {
      const step = await stream.next();
      if (step.done) return { chunks, finish: step.value ?? null, error: null };
      chunks.push(step.value);
    }
  } catch (error) {
    return { chunks, finish: null, error };
  }
}

describe('collectors/orders.sellpia_post_transfer', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓴다', () => {
    expect(collectorFor('orders.sellpia_post_transfer')).toBe(postTransferCollector);
    expect(postTransferCollector.site).toBe('sellpia');
  });

  it('등록 → 재고매칭 순서로 단계마다 post_transfer_steps 청크를 내고, 미매칭 주문번호를 result에 싣는다(송장 대상 수는 owner가 센다)', async () => {
    const sellpia = fakeSellpia();
    const { chunks, finish } = await run(sellpia.site);
    expect(sellpia.log).toEqual(['open', 'register', 'stockmatch', 'done']);
    expect(chunks).toEqual([
      { chunkKind: 'post_transfer_steps', payload: [{ step: 'register', done: true, mallMessage: '2건이 등록되었습니다' }], progress: { step: 'register' } },
      { chunkKind: 'post_transfer_steps', payload: [{ step: 'stockmatch', done: true, mallMessage: '미매칭 1건', unmatchedOrderNumbers: ['G-2'] }], progress: { step: 'stockmatch' } },
    ]);
    expect(finish).toEqual({ result: { registered: true, stockMatched: true, unmatchedOrderNumbers: ['G-2'], invoiceTargetCount: 0 } });
  });

  it('등록이 실패하면 그 단계를 done:false로 남기고 재고매칭은 하지 않은 채 같은 오류로 실패한다(탭은 운영자에게)', async () => {
    const refused = new RuntimeError('SITE_REQUEST_FAILED', '등록할 수집 주문이 없습니다.', { reason: 'mall_refused' });
    const sellpia = fakeSellpia({ register: async () => { throw refused; } });
    const { chunks, error } = await run(sellpia.site);
    expect(error).toBe(refused);
    expect(sellpia.log).toEqual(['open', 'register', 'done']);
    expect(chunks.map((chunk) => chunk.payload[0])).toEqual([{ step: 'register', done: false, mallMessage: '등록할 수집 주문이 없습니다.' }]);
  });

  it('재고매칭이 실패하면 등록 청크 뒤 재고매칭 done:false를 남기고 실패한다', async () => {
    const unreadable = new RuntimeError('SELLPIA_SCREEN_UNREADABLE', '재고매칭 화면(그리드)을 찾지 못했습니다.');
    const { chunks, error } = await run(fakeSellpia({ stockmatch: async () => { throw unreadable; } }).site);
    expect(error).toBe(unreadable);
    expect(chunks.map((chunk) => chunk.payload[0])).toEqual([
      { step: 'register', done: true, mallMessage: '2건이 등록되었습니다' },
      { step: 'stockmatch', done: false, mallMessage: '재고매칭 화면(그리드)을 찾지 못했습니다.' },
    ]);
  });
});
