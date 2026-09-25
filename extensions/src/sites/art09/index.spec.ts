import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { siteFactoryFor } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { ART09_ORDER_URL, createArt09Site } from './index';

const ROW = { orderId: '20260926-0000001', productName: '색종이', qty: '1' };
const INPUT = { collectionDate: '2026-09-26', selectionMode: 'manual' as const, seenRowKeys: [] };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/art09 — 아트공구(Cafe24) 몰 주문 읽기', () => {
  it('몰 키 이름으로 등록된다', () => {
    expect(siteFactoryFor('art09')).not.toBeNull();
  });

  it('새 백그라운드 탭에서 주문목록을 열고 그날 배송준비전 주문을 ISOLATED 처리기로 읽은 뒤 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', rows: [ROW], failures: ['20260926-0000002: 상세 HTTP 500'] } } : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createArt09Site(fake.tabs).readOrders(INPUT)).resolves.toEqual({ rows: [ROW] });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'art09.orders', args: { dateFilter: '2026-09-26' } });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${ART09_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/orders/art09-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('주문목록을 벗어난 화면(로그인)은 SITE_LOGIN_REQUIRED로 탭을 남기고, 상세가 모두 실패하면 SITE_REQUEST_FAILED', async () => {
    const redirected = fakeTabPages({ landAt: () => 'https://zzogzzog1.cafe24.com/admin/php/login.php', answer: () => ({ ok: true }) });
    expect((await failure(createArt09Site(redirected.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(redirected.log).not.toContain('close 7');

    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    expect((await failure(createArt09Site(expired.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');

    const broken = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'failed', error: '아트공구 주문 상세 수집 실패' } }) });
    expect(await failure(createArt09Site(broken.tabs).readOrders(INPUT))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'page_error' } });
  });
});
