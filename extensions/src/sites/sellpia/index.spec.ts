import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeTabPages } from '../tab-page.fake';
import { createSellpiaSite, SELLPIA_REPRINT_URL } from './index';

const PLAN = { startDate: '2026-09-07', endDate: '2026-09-08' };
const ROW = { ordNo: 'ORDER-1', itemNo: '', invNo: 'INV-1', courier: '1136', provider: '스마트스토어', receiver: '홍길동', post: '06000', addr: '서울 1층' };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/sellpia', () => {
  it('새 백그라운드 탭에서 송장 재출력 화면을 열고 페이지 호출로 조회한 뒤 탭을 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', rows: [ROW], total: 3, range: { start: PLAN.startDate, end: PLAN.endDate } } } : { ok: false, error: 'content_script_missing' };
      },
    });
    const site = createSellpiaSite(fake.tabs);
    await expect(site.shipmentTracking(PLAN)).resolves.toEqual({ rows: [ROW], total: 3 });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'sellpia.shipmentTracking', args: PLAN });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${SELLPIA_REPRINT_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/orders/sellpia-shipment-tracking.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인 화면으로 가거나 로그인이 풀려 있으면 SITE_LOGIN_REQUIRED이고 탭은 운영자에게 남긴다', async () => {
    const redirected = fakeTabPages({ landAt: () => 'https://kiditem.sellpia.com/login.html', answer: () => ({ ok: true }) });
    const error = await failure(createSellpiaSite(redirected.tabs).shipmentTracking(PLAN));
    expect(error.code).toBe('SITE_LOGIN_REQUIRED');
    expect(redirected.log.at(-1)).toBe('navigate https://kiditem.sellpia.com/order_delivery_reprint.html');

    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    expect((await failure(createSellpiaSite(expired.tabs).shipmentTracking(PLAN))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(expired.log).not.toContain('close 7');
  });

  it('HTTP 오류·모르는 응답은 SITE_REQUEST_FAILED(사유 담아)이고 탭을 닫는다', async () => {
    const http = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'http_error', httpStatus: 500 } }) });
    const httpError = await failure(createSellpiaSite(http.tabs).shipmentTracking(PLAN));
    expect(httpError).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { status: 500, reason: 'http' } });
    expect(http.log.at(-1)).toBe('close 7');

    const odd = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'unexpected_response' } }) });
    expect(await failure(createSellpiaSite(odd.tabs).shipmentTracking(PLAN))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'not_json' } });

    const slow = fakeTabPages({ answer: () => ({ ok: false, error: 'timeout' }) });
    expect(await failure(createSellpiaSite(slow.tabs).shipmentTracking(PLAN))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'timeout' } });
    expect(slow.log.at(-1)).toBe('close 7');
  });
});
