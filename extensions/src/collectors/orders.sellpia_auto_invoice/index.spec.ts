import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish } from '../collector';
import { collectorFor } from '../index';
import { autoInvoiceCollector, type SellpiaInvoiceAttempt, type SellpiaAutoInvoiceSite } from './index';

const PLAN = { targetOrderNumbers: ['T-1', 'T-2', 'T-3'] };
const row = (orderNo: string) => ({ orderNo, trackingNumber: `INV-${orderNo}`, courier: '1136' });

function fakeSellpia(attempt: SellpiaInvoiceAttempt) {
  const asked: string[][] = [];
  const site: SellpiaAutoInvoiceSite = {
    async issueInvoices(targets) {
      asked.push([...targets]);
      return attempt;
    },
  };
  return { site, asked };
}

async function run(site: SellpiaAutoInvoiceSite, plan: Record<string, unknown> = PLAN) {
  const chunks: CollectedChunk[] = [];
  const stream = autoInvoiceCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null }) as AsyncGenerator<CollectedChunk, CollectFinish | void>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value ?? null };
    chunks.push(step.value);
  }
}

describe('collectors/orders.sellpia_auto_invoice', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓴다', () => {
    expect(collectorFor('orders.sellpia_auto_invoice')).toBe(autoInvoiceCollector);
    expect(autoInvoiceCollector.site).toBe('sellpia');
  });

  it('plan 대상만 채번을 부탁하고, 고른 번호 모두 발급 행이 읽히면 invoice_rows 청크와 성공 result(그리드에 없던 번호는 notFound)', async () => {
    const sellpia = fakeSellpia({ state: 'pressed', selectedOrderNumbers: ['T-1', 'T-2'], issued: [row('T-1'), row('T-2')], message: '채번 완료' });
    const { chunks, finish } = await run(sellpia.site);
    expect(sellpia.asked).toEqual([['T-1', 'T-2', 'T-3']]);
    expect(chunks).toEqual([{ chunkKind: 'invoice_rows', payload: [row('T-1'), row('T-2')], progress: { issued: 2 } }]);
    expect(finish).toEqual({ result: { issued: [row('T-1'), row('T-2')], selectedOrderNumbers: ['T-1', 'T-2'], notFoundOrderNumbers: ['T-3'] } });
  });

  it('일치하는 대기 행이 없어 누르지 않았으면 발급 없이 성공한다(리더 결정: 대기 행 전체 채번 금지)', async () => {
    const { chunks, finish } = await run(fakeSellpia({ state: 'not_pressed', selectedOrderNumbers: [], issued: [], message: '일치하는 행이 없습니다.' }).site);
    expect(chunks).toEqual([]);
    expect(finish).toEqual({ result: { issued: [], selectedOrderNumbers: [], notFoundOrderNumbers: ['T-1', 'T-2', 'T-3'] } });
  });

  it('누른 뒤 발급 행을 다 읽지 못했으면 reconciling(운영자가 셀피아에서 확인) — 읽은 행은 청크와 result에 남긴다', async () => {
    const partial = await run(fakeSellpia({ state: 'pressed', selectedOrderNumbers: ['T-1', 'T-2'], issued: [row('T-1')], message: null }).site);
    expect(partial.chunks.map((chunk) => chunk.payload)).toEqual([[row('T-1')]]);
    expect(partial.finish).toEqual({ outcome: 'reconciling', result: { issued: [row('T-1')], selectedOrderNumbers: ['T-1', 'T-2'], notFoundOrderNumbers: ['T-3'] } });

    const none = await run(fakeSellpia({ state: 'pressed', selectedOrderNumbers: ['T-1'], issued: [], message: null }).site);
    expect(none.chunks).toEqual([]);
    expect(none.finish).toMatchObject({ outcome: 'reconciling' });
  });

  it('눌렀는지 모르면(답 끊김) reconciling이고 못 찾은 번호를 단정하지 않는다', async () => {
    const { finish } = await run(fakeSellpia({ state: 'unknown', selectedOrderNumbers: [], issued: [], message: '시간 초과' }).site);
    expect(finish).toEqual({ outcome: 'reconciling', result: { issued: [], selectedOrderNumbers: [], notFoundOrderNumbers: [] } });
  });

  it('plan에 대상이 없으면 셀피아에 가지 않고 RUNTIME_PLAN_INVALID', async () => {
    const sellpia = fakeSellpia({ state: 'not_pressed', selectedOrderNumbers: [], issued: [], message: null });
    const error = await run(sellpia.site, { targetOrderNumbers: [] }).then(() => null, (caught: unknown) => caught);
    expect(isRuntimeError(error) && error.code).toBe('RUNTIME_PLAN_INVALID');
    expect(sellpia.asked).toEqual([]);
  });
});
