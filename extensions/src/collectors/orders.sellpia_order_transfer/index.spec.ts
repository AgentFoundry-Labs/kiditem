import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish } from '../collector';
import { collectorFor } from '../index';
import { sellpiaOrderTransferCollector, type SellpiaTransferAttempt, type SellpiaTransferSite } from './index';

const OP = '11111111-1111-4111-8111-111111111111';
const PLAN = {
  sourceOperationId: '22222222-2222-4222-8222-222222222222',
  shopName: '키드키즈',
  transport: null,
  fileName: '키드키즈_주문.xlsx',
  targetOrderNumbers: ['A-1', 'A-2'],
};
const FILE = new Uint8Array([80, 75, 3, 4]);

function attempt(overrides: Partial<SellpiaTransferAttempt>): SellpiaTransferAttempt {
  return { outcome: 'submitted', acceptedOrderNumbers: [], baselineRows: 3, afterRows: 5, mallMessage: null, verification: null, ...overrides };
}

function fakeSellpia(result: SellpiaTransferAttempt) {
  const sent: Array<Record<string, unknown>> = [];
  const site: SellpiaTransferSite = {
    async transferOrderFile(input) {
      sent.push({ ...input });
      return result;
    },
  };
  return { site, sent };
}

async function run(site: SellpiaTransferSite, plan: Record<string, unknown> = PLAN, source: Uint8Array | null = FILE) {
  const chunks: CollectedChunk[] = [];
  const stream = sellpiaOrderTransferCollector.collect(plan as never, site, {
    signal: new AbortController().signal,
    tabId: null,
    ...(source ? { readSource: async () => source } : {}),
  }) as AsyncGenerator<CollectedChunk, CollectFinish | void>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value ?? null };
    chunks.push(step.value);
  }
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('collectors/orders.sellpia_order_transfer', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓰며, 원천 파일은 그 실행의 source 라우트다', () => {
    expect(collectorFor('orders.sellpia_order_transfer')).toBe(sellpiaOrderTransferCollector);
    expect(sellpiaOrderTransferCollector.site).toBe('sellpia');
    expect(sellpiaOrderTransferCollector.sourcePath?.(OP)).toBe(`/api/orders/action-operations/${OP}/source`);
  });

  it('원천 파일을 base64로 plan의 파일 이름·판매처·대상과 함께 넣고, 접수되면 증거 청크 하나와 성공 result를 낸다', async () => {
    const sellpia = fakeSellpia(attempt({ acceptedOrderNumbers: ['A-1', 'A-2'] }));
    const { chunks, finish } = await run(sellpia.site);
    expect(sellpia.sent).toEqual([{ shopName: '키드키즈', fileName: '키드키즈_주문.xlsx', fileBase64: 'UEsDBA==', targetOrderNumbers: ['A-1', 'A-2'] }]);
    expect(chunks).toEqual([{
      chunkKind: 'transfer_evidence',
      payload: [{ outcome: 'submitted', acceptedOrderNumbers: ['A-1', 'A-2'], baselineRows: 3, afterRows: 5, mallMessage: null }],
      progress: { outcome: 'submitted' },
    }]);
    expect(finish).toEqual({ result: { outcome: 'submitted', acceptedOrderNumbers: ['A-1', 'A-2'], targetOrderCount: 2 } });
  });

  it('누르기 전에 셀피아가 받지 않았으면(not_submitted) 증거를 남기고 SELLPIA_TRANSFER_NOT_SUBMITTED로 실패한다(재전송 허용)', async () => {
    const sellpia = fakeSellpia(attempt({ outcome: 'not_submitted', baselineRows: null, afterRows: null, mallMessage: "판매처 '키드키즈'를 찾지 못했습니다." }));
    const chunks: CollectedChunk[] = [];
    const error = await failure((async () => {
      for await (const chunk of sellpiaOrderTransferCollector.collect(PLAN as never, sellpia.site, { signal: new AbortController().signal, tabId: null, readSource: async () => FILE })) chunks.push(chunk);
    })());
    expect(error).toMatchObject({ code: 'SELLPIA_TRANSFER_NOT_SUBMITTED', message: "판매처 '키드키즈'를 찾지 못했습니다." });
    expect(chunks.map((chunk) => chunk.payload[0])).toEqual([{ outcome: 'not_submitted', acceptedOrderNumbers: [], baselineRows: 0, afterRows: 0, mallMessage: "판매처 '키드키즈'를 찾지 못했습니다." }]);
  });

  it('결과를 몰랐지만 두 화면 확인에서 대상을 모두 찾으면 submitted로 성공한다', async () => {
    const { chunks, finish } = await run(fakeSellpia(attempt({ outcome: 'unknown', afterRows: null, mallMessage: '결과를 확인하지 못했습니다.', verification: { found: ['A-2', 'A-1'], missing: [], screensRead: 1 } })).site);
    expect(chunks[0]!.payload[0]).toMatchObject({ outcome: 'submitted', acceptedOrderNumbers: ['A-2', 'A-1'], afterRows: 0 });
    expect(finish).toEqual({ result: { outcome: 'submitted', acceptedOrderNumbers: ['A-2', 'A-1'], targetOrderCount: 2 } });
  });

  it('두 화면을 모두 읽었는데 하나도 없으면 not_submitted 실패(재전송 허용)', async () => {
    const error = await failure(run(fakeSellpia(attempt({ outcome: 'unknown', verification: { found: [], missing: ['A-1', 'A-2'], screensRead: 2 } })).site));
    expect(error).toMatchObject({ code: 'SELLPIA_TRANSFER_NOT_SUBMITTED', message: '셀피아에서 이 파일의 주문을 찾지 못했습니다. 접수되지 않았으므로 다시 전송해도 됩니다.' });
  });

  it('일부만 찾았거나 확인 화면을 다 읽지 못했으면 재전송하면 중복될 수 있어 reconciling으로 멈춘다(찾은 번호를 result에)', async () => {
    const partial = await run(fakeSellpia(attempt({ outcome: 'unknown', verification: { found: ['A-1'], missing: ['A-2'], screensRead: 1 } })).site);
    expect(partial.chunks[0]!.payload[0]).toMatchObject({ outcome: 'unknown', acceptedOrderNumbers: ['A-1'] });
    expect(partial.finish).toEqual({ outcome: 'reconciling', result: { outcome: 'submitted', acceptedOrderNumbers: ['A-1'], targetOrderCount: 2 } });

    const unread = await run(fakeSellpia(attempt({ outcome: 'unknown', verification: { found: [], missing: ['A-1', 'A-2'], screensRead: 1 } })).site);
    expect(unread.finish).toEqual({ outcome: 'reconciling', result: { outcome: 'submitted', acceptedOrderNumbers: [], targetOrderCount: 2 } });
  });

  it('plan이 틀리거나 원천 파일을 받을 수 없으면 셀피아에 가지 않고 RUNTIME_PLAN_INVALID', async () => {
    const sellpia = fakeSellpia(attempt({}));
    expect((await failure(run(sellpia.site, { ...PLAN, targetOrderNumbers: [] }))).code).toBe('RUNTIME_PLAN_INVALID');
    expect((await failure(run(sellpia.site, PLAN, null))).code).toBe('RUNTIME_PLAN_INVALID');
    expect((await failure(run(sellpia.site, PLAN, new Uint8Array()))).code).toBe('RUNTIME_PLAN_INVALID');
    expect(sellpia.sent).toEqual([]);
  });
});
