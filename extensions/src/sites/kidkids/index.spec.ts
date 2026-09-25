import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { siteFactoryFor } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createKidkidsSite, KIDKIDS_ORDER_URL } from './index';

const ORDER = { om: 'OM-1', items: [{ name: '색종이', qty: 1, unit: 1000, sum: 1000 }] };
const INPUT = { collectionDate: '2026-09-26', selectionMode: 'manual' as const, seenRowKeys: [] };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/kidkids — 몰 주문 읽기', () => {
  it('몰 키 이름으로 등록된다(몰 주문 라우터가 찾는다)', () => {
    expect(siteFactoryFor('kidkids')).not.toBeNull();
  });

  it('새 백그라운드 탭에서 출고관리 화면을 열고 그날 주문을 ISOLATED 처리기로 읽은 뒤 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', orders: [ORDER] } } : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createKidkidsSite(fake.tabs).readOrders(INPUT)).resolves.toEqual({ rows: [ORDER] });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'kidkids.orders', args: { dateFilter: '2026-09-26' } });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${KIDKIDS_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/orders/kidkids-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인 화면으로 가거나 본인확인·세션 만료면 SITE_LOGIN_REQUIRED이고 탭은 남긴다, 페이지 실패는 SITE_REQUEST_FAILED', async () => {
    const redirected = fakeTabPages({ landAt: () => 'https://www.kidkids.net/join/partner_login.htm', answer: () => ({ ok: true }) });
    expect((await failure(createKidkidsSite(redirected.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(redirected.log).not.toContain('close 7');

    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    expect((await failure(createKidkidsSite(expired.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(expired.log).not.toContain('close 7');

    const broken = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'failed', error: 'boom' } }) });
    expect(await failure(createKidkidsSite(broken.tabs).readOrders(INPUT))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'page_error' } });
    expect(broken.log.at(-1)).toBe('close 7');
  });
});
