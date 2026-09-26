import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeTabPages } from '../tab-page.fake';
import { createSellpiaSite } from './index';
import { SELLPIA_PROFIT_URL } from './profit';

const INPUT = {
  start: '2026-05-15',
  end: '2026-06-30',
  periods: [
    { yearMonth: '2026-05', from: '2026-05-15', to: '2026-05-31' },
    { yearMonth: '2026-06', from: '2026-06-01', to: '2026-06-30' },
  ],
};
const ROWS = (inAmount: number) => ({ status: 'ok', skippedAdjustmentCount: 0, products: [{ productCode: 'SKU-1', totalInAmount: inAmount }] });

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/sellpia product profit', () => {
  it('새 탭 하나에서 판매 창 한 번 + 달마다 구매기간 한 번 페이지 호출하고, 달마다 진행을 알린 뒤 탭을 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        if (!injected) return { ok: false, error: 'content_script_missing' };
        asked.push(message.args as Record<string, unknown>);
        return { ok: true, value: ROWS(asked.length * 100) };
      },
    });
    const progress: Array<[number, number]> = [];
    const result = await createSellpiaSite(fake.tabs).productProfit(INPUT, async (done, total) => { progress.push([done, total]); });
    expect(asked).toEqual([
      { start: '2026-05-15', end: '2026-06-30', purchaseStart: '2026-05-15', purchaseEnd: '2026-06-30' },
      { start: '2026-05-15', end: '2026-06-30', purchaseStart: '2026-05-15', purchaseEnd: '2026-05-31' },
      { start: '2026-05-15', end: '2026-06-30', purchaseStart: '2026-06-01', purchaseEnd: '2026-06-30' },
    ]);
    expect(result.baseline.products).toEqual([{ productCode: 'SKU-1', totalInAmount: 100 }]);
    expect(result.periods.map((period) => [period.yearMonth, period.rows.products[0]])).toEqual([
      ['2026-05', { productCode: 'SKU-1', totalInAmount: 200 }],
      ['2026-06', { productCode: 'SKU-1', totalInAmount: 300 }],
    ]);
    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(fake.log[0]).toBe('open about:blank');
    expect(fake.log[1]).toBe(`navigate ${SELLPIA_PROFIT_URL}`);
    expect(fake.log).toContain('inject content/page-call/bridge.js,content/page-call/runner.js,content/orders/sellpia-profit.js');
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('중단 신호가 오면 다음 달 페이지 호출 없이 멈추고 탭을 닫는다', async () => {
    const asked: unknown[] = [];
    const fake = fakeTabPages({ answer: (message) => { asked.push(message.args); return { ok: true, value: ROWS(0) }; } });
    const controller = new AbortController();
    const reading = createSellpiaSite(fake.tabs).productProfit({ ...INPUT, signal: controller.signal }, async () => { controller.abort(); });
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(asked).toHaveLength(2);
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('로그인이 풀렸으면 SITE_LOGIN_REQUIRED이고 탭은 운영자에게 남긴다', async () => {
    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    expect((await failure(createSellpiaSite(expired.tabs).productProfit(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(expired.log).not.toContain('close 7');
  });

  it('HTTP 오류·형식 틀림은 SITE_REQUEST_FAILED(사유 담아)이고 탭을 닫는다', async () => {
    const odd = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'unexpected_response', reason: 'invalid_row' } }) });
    expect(await failure(createSellpiaSite(odd.tabs).productProfit(INPUT))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'not_json', detail: 'invalid_row' } });
    expect(odd.log.at(-1)).toBe('close 7');
    const http = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'http_error', httpStatus: 500 } }) });
    expect(await failure(createSellpiaSite(http.tabs).productProfit(INPUT))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { status: 500, reason: 'http' } });
  });
});
