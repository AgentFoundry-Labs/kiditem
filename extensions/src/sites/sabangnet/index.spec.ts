import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeTabPages } from '../tab-page.fake';
import { createSabangnetSite, SABANGNET_PAGE_DELAY_MS } from './index';

const QUERY = { listPath: '/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists', dateFrom: '20000101', dateTo: '20260926', pageSize: 500 };
const ITEM = { shmaId: 'shop0472', prdRegsTrnmSrno: '1', shmaPrdNo: 'KN-1', prdNo: '1', prdNm: '네일팁', prdSplyStsCdNm: '공급중', modlNm: null, onsfPrdCd: null, sepr: 1950, prdRegsFstTrnmDt: null };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/sabangnet', () => {
  it('새 백그라운드 탭 하나로 쪽마다 페이지 호출하고, 쪽 사이는 800ms 띄우고, close가 탭을 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const slept: number[] = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', total: 2, items: [ITEM] } } : { ok: false, error: 'content_script_missing' };
      },
    });
    const site = createSabangnetSite(fake.tabs, async (ms) => {
      slept.push(ms);
    });
    await expect(site.mallListingPage(QUERY, 1)).resolves.toEqual({ total: 2, items: [ITEM] });
    await site.mallListingPage(QUERY, 2);
    await site.close();
    expect(slept).toEqual([SABANGNET_PAGE_DELAY_MS]);
    expect(asked.at(-1)).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'sabangnet.mallListingPage', args: { ...QUERY, currentPage: 2 } });
    expect(fake.log).toEqual([
      'open about:blank',
      'navigate https://sbadmin08.sabangnet.co.kr/',
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/orders/sabangnet-mall-listings.js',
      'ask KIDITEM_PAGE_CALL',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인이 필요하면 SITE_LOGIN_REQUIRED이고 탭은 운영자에게 남긴다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    const site = createSabangnetSite(fake.tabs, async () => undefined);
    expect((await failure(site.mallListingPage(QUERY, 1))).code).toBe('SITE_LOGIN_REQUIRED');
    await site.close();
    expect(fake.log).not.toContain('close 7');

    const redirected = fakeTabPages({ landAt: () => 'https://sbadmin08.sabangnet.co.kr/#/login', answer: () => ({ ok: true }) });
    expect((await failure(createSabangnetSite(redirected.tabs, async () => undefined).mallListingPage(QUERY, 1))).code).toBe('SITE_LOGIN_REQUIRED');
  });

  it('형식 변화는 MALL_CONTRACT_CHANGED, HTTP·시간 초과는 SITE_REQUEST_FAILED(사유)이고 탭을 닫는다', async () => {
    const drift = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'contract_drift', stage: 'code' } }) });
    const driftSite = createSabangnetSite(drift.tabs, async () => undefined);
    expect(await failure(driftSite.mallListingPage(QUERY, 1))).toMatchObject({ code: 'MALL_CONTRACT_CHANGED', details: { stage: 'code' } });
    await driftSite.close();
    expect(drift.log.at(-1)).toBe('close 7');

    const http = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'http_error', httpStatus: 500 } }) });
    expect(await failure(createSabangnetSite(http.tabs, async () => undefined).mallListingPage(QUERY, 1)))
      .toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { status: 500, reason: 'http' } });

    const slow = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'timeout' } }) });
    expect(await failure(createSabangnetSite(slow.tabs, async () => undefined).mallListingPage(QUERY, 1)))
      .toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'timeout' } });
  });
});
