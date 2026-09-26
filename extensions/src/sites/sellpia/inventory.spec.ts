import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeTabPages } from '../tab-page.fake';
import { createSellpiaSite } from './index';
import { SELLPIA_INVENTORY_URL } from './inventory';

const ROW = { productCode: '92', optionCode: '1', name: '첫째', optionName: '블루', barcode: '8801234567890', currentStock: 39, purchasePrice: 1_000, salePrice: 2_000 };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/sellpia inventory', () => {
  it('새 백그라운드 탭에서 상품 목록 화면을 열고 페이지 호출로 전체 목록을 읽은 뒤 탭을 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', rows: [ROW] } } : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createSellpiaSite(fake.tabs).inventory()).resolves.toEqual({ rows: [ROW] });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'sellpia.inventory', args: { timeoutMs: 45_000, maxRows: 20_000, maxBytes: 10 * 1024 * 1024 } });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${SELLPIA_INVENTORY_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/orders/sellpia-inventory.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인 화면으로 가거나 로그인이 풀려 있으면 SITE_LOGIN_REQUIRED이고 탭은 운영자에게 남긴다', async () => {
    const redirected = fakeTabPages({ landAt: () => 'https://kiditem.sellpia.com/login.html', answer: () => ({ ok: true }) });
    expect((await failure(createSellpiaSite(redirected.tabs).inventory())).code).toBe('SITE_LOGIN_REQUIRED');

    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    const error = await failure(createSellpiaSite(expired.tabs).inventory());
    expect(error).toMatchObject({ code: 'SITE_LOGIN_REQUIRED', message: expect.stringContaining('셀피아 로그인이 필요합니다') });
    expect(expired.log).not.toContain('close 7');
  });

  it('HTTP 오류·시간 초과·연결 실패·형식 틀림은 SITE_REQUEST_FAILED(사유 담아)이고 탭을 닫는다', async () => {
    const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ status: 'http_error', httpStatus: 500 }, { status: 500, reason: 'http' }],
      [{ status: 'timeout' }, { reason: 'timeout' }],
      [{ status: 'network_error' }, { reason: 'network' }],
      [{ status: 'unexpected_response', reason: 'empty' }, { reason: 'not_json', detail: 'empty' }],
      [{ status: 'odd' }, { reason: 'not_json' }],
    ];
    for (const [value, details] of cases) {
      const fake = fakeTabPages({ answer: () => ({ ok: true, value }) });
      expect(await failure(createSellpiaSite(fake.tabs).inventory())).toMatchObject({ code: 'SITE_REQUEST_FAILED', details });
      expect(fake.log.at(-1)).toBe('close 7');
    }
  });
});
