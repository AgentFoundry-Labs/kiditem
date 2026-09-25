import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { siteFactoryFor } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createDomeggookSite, DOMEGGOOK_ORDER_LIST_API, DOMEGGOOK_PART_CHARS } from './index';

const INPUT = { collectionDate: '2026-09-26', selectionMode: 'manual' as const, seenRowKeys: [] };
// 옛 수집기 테스트에는 생성 목록 응답 기록이 없다. 아래 행은 옛 파서(`pickDomeggookUrl`)가 읽던 칸 그대로다 —
// state·dateReq('YYYY-MM-DD HH:mm:ss' 문자열 비교)·dlBtn(따옴표 href 링크 안에 ORDER_ALL 파일 이름). 주소는 합성 값.
const csvLink = (file: string) => `<a href='https://domeggook.com/excel/${file}' class='btn'>다운로드</a>`;
const OLD = { state: 'SUCCESS', dateReq: '2026-09-26 09:00:00', dlBtn: csvLink('ORDER_ALL_old.csv') };
const NEW = { state: 'SUCCESS', dateReq: '2026-09-26 10:00:00', dlBtn: csvLink('ORDER_ALL_20260926.csv') };
const PENDING = { state: 'WAIT', dateReq: '2026-09-26 10:00:00', dlBtn: '' };

/** 서비스워커 fetch 경계만 가짜: 엑셀 목록 응답을 차례로, CSV는 바이트로 준다. */
function fakeDomeggook(lists: unknown[], csv: Uint8Array = new TextEncoder().encode('a,b\r\n1,2\r\n')) {
  const requested: string[] = [];
  const redirects: Array<string | undefined> = [];
  const sleeps: number[] = [];
  let index = 0;
  const deps = {
    fetch: async (url: string, init?: RequestInit) => {
      requested.push(url);
      if (url === DOMEGGOOK_ORDER_LIST_API) {
        expect(new Headers(init?.headers).get('x-requested-with')).toBe('XMLHttpRequest');
        const body = lists[Math.min(index, lists.length - 1)];
        index += 1;
        return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
      }
      redirects.push(init?.redirect);
      return new Response(new Blob([csv.slice().buffer as ArrayBuffer]), { status: 200 });
    },
    cookies: { get: async () => null },
    now: () => 0,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
  return { deps, requested, redirects, sleeps };
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/domeggook — 도매꾹 몰 주문 읽기(엑셀 생성 → 완료 폴링 → CSV)', () => {
  it('몰 키 이름으로 등록된다', () => {
    expect(siteFactoryFor('domeggook')).not.toBeNull();
  });

  it('그날로 맞춘 주문목록 탭에서 생성을 요청하고, 요청 뒤 새로 완료된 ORDER_ALL CSV를 받아 조각으로 돌려준 뒤 탭을 닫는다', async () => {
    const shop = fakeDomeggook([{ dat: [OLD] }, { dat: [PENDING, OLD] }, { dat: [NEW, OLD] }]);
    const tabs = fakeTabPages({ answer: (_message, injected) => (injected ? { ok: true, value: { status: 'requested' } } : { ok: false, error: 'content_script_missing' }) });
    const result = await createDomeggookSite(tabs.tabs, shop.deps).readOrders(INPUT);
    const csv = btoa('a,b\r\n1,2\r\n');
    expect(result).toEqual({ rows: [{ fileName: 'ORDER_ALL_20260926.csv', part: 0, parts: 1, base64: csv }] });
    expect(shop.requested).toEqual([DOMEGGOOK_ORDER_LIST_API, DOMEGGOOK_ORDER_LIST_API, DOMEGGOOK_ORDER_LIST_API, 'https://domeggook.com/excel/ORDER_ALL_20260926.csv']);
    expect(shop.sleeps).toEqual([1_500, 5_000, 5_000]);
    // CDN 파일 주소는 리다이렉트를 따라간다(옛 서비스워커 fetch 기본값) — 로그인 판정용 manual이 아니다.
    expect(shop.redirects).toEqual(['follow']);
    expect(tabs.log).toEqual([
      'open about:blank',
      'navigate https://domeggook.com/sc/order/lstAll?dtbase=ord&dt1=2026.09.26&dt2=2026.09.26',
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/orders/domeggook-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('주문이 없다고 하면(alert) 폴링 없이 빈 수집, 큰 파일은 조각으로 나눈다', async () => {
    const empty = fakeDomeggook([{ dat: [] }]);
    const tabs = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'empty' } }) });
    await expect(createDomeggookSite(tabs.tabs, empty.deps).readOrders(INPUT)).resolves.toEqual({ rows: [] });
    expect(empty.requested).toEqual([DOMEGGOOK_ORDER_LIST_API]);

    const big = fakeDomeggook([{ dat: [] }, { dat: [NEW] }], new Uint8Array(DOMEGGOOK_PART_CHARS));
    const bigTabs = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'requested' } }) });
    const { rows } = await createDomeggookSite(bigTabs.tabs, big.deps).readOrders(INPUT);
    expect(rows.map((row) => [(row as { part: number }).part, (row as { parts: number }).parts])).toEqual([[0, 2], [1, 2]]);
    // 0 바이트 N개의 base64는 'AAAA' 반복이다(3바이트마다 네 글자).
    const joined = rows.map((row) => (row as { base64: string }).base64).join('');
    expect(joined).toHaveLength(Math.ceil(DOMEGGOOK_PART_CHARS / 3) * 4);
    expect(/^A+=*$/.test(joined)).toBe(true);
  });

  it('dat 배열이 없는 JSON(로그아웃 표시 res:false가 아닌)은 빈 목록으로 본다(옛 규칙)', async () => {
    const shop = fakeDomeggook([{ ok: true }, { ok: true }, { dat: [NEW] }]);
    const tabs = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'requested' } }) });
    await expect(createDomeggookSite(tabs.tabs, shop.deps).readOrders(INPUT)).resolves.toMatchObject({ rows: [{ fileName: 'ORDER_ALL_20260926.csv' }] });
  });

  it('로그아웃(res:false)은 탭을 열지 않고 SITE_LOGIN_REQUIRED, 4분 안에 완료되지 않으면 SITE_REQUEST_FAILED', async () => {
    const loggedOut = fakeDomeggook([{ res: false, msg: '로그인이 필요합니다' }]);
    const tabs = fakeTabPages({ answer: () => ({ ok: true }) });
    expect((await failure(createDomeggookSite(tabs.tabs, loggedOut.deps).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(tabs.log).toEqual([]);

    const slow = fakeDomeggook([{ dat: [OLD] }]);
    const slowTabs = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'requested' } }) });
    expect(await failure(createDomeggookSite(slowTabs.tabs, slow.deps).readOrders(INPUT))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'excel_not_ready' } });
    expect(slow.sleeps.filter((ms) => ms === 5_000)).toHaveLength(48);
    expect(slowTabs.log.at(-1)).toBe('close 7');
  });
});
