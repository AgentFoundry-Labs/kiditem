import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../core/errors';
import { createArt09Site } from './art09';
import { ART09_LISTINGS_URL } from './art09/listings';
import { createKidkidsSite } from './kidkids';
import { KIDKIDS_LISTINGS_URL } from './kidkids/listings';
import { fakeTabPages } from './tab-page.fake';

const PLAN = { mallKey: 'kidkids', sourceOrigin: 'https://partner.kidkids.net', pageSize: 20000 };
const SNAPSHOT = {
  collection: { totalRecords: 0, recordsRead: 0, pagesRead: 1, totalPages: 1, detailsRead: 0, detailsMissing: 0 },
  rows: [],
  proof: { mallKey: 'kidkids', pageSize: 20000, validatedList: true },
};

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/<mall> readListings (1차 몰 넷, KID-363 L2)', () => {
  it('새 백그라운드 탭을 몰 관리자 화면으로 열고 처리기 파일로 목록 전체를 읽은 뒤 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { success: true, snapshot: SNAPSHOT } } : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createKidkidsSite(fake.tabs).readListings(PLAN)).resolves.toEqual(SNAPSHOT);
    expect(asked.at(-1)).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'kidkids.listings', args: { plan: PLAN } });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${KIDKIDS_LISTINGS_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/orders/kidkids-listings.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인이 필요하면 SITE_LOGIN_REQUIRED이고 탭을 남긴다 — 아트공구는 상품목록이 아닌 화면을 로그인으로 본다', async () => {
    const login = fakeTabPages({ answer: () => ({ ok: true, value: { success: false, errorCode: 'mall_login_required' } }) });
    expect((await failure(createKidkidsSite(login.tabs).readListings(PLAN))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(login.log).not.toContain('close 7');

    const redirected = fakeTabPages({ landAt: () => 'https://zzogzzog1.cafe24.com/disp/common/login', answer: () => ({ ok: true }) });
    expect((await failure(createArt09Site(redirected.tabs).readListings({ ...PLAN, mallKey: 'art09' }))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(redirected.log).toContain(`navigate ${ART09_LISTINGS_URL}`);
  });

  it('형식 변화는 MALL_CONTRACT_CHANGED(단계), 수 변화·틀린 목록은 SOURCE_SNAPSHOT_INVALID, 시간 초과는 SITE_REQUEST_FAILED', async () => {
    const answer = (errorCode: string, stage?: string) => fakeTabPages({ answer: () => ({ ok: true, value: { success: false, errorCode, ...(stage ? { stage } : {}) } }) });
    expect(await failure(createKidkidsSite(answer('mall_contract_drift', 'download').tabs).readListings(PLAN)))
      .toMatchObject({ code: 'MALL_CONTRACT_CHANGED', details: { stage: 'download' } });
    expect(await failure(createKidkidsSite(answer('mall_total_changed').tabs).readListings(PLAN))).toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID' });
    expect(await failure(createKidkidsSite(answer('mall_invalid_snapshot', 'row_limit').tabs).readListings(PLAN))).toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID' });
    expect(await failure(createKidkidsSite(answer('mall_timeout').tabs).readListings(PLAN))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'timeout' } });
  });
});
