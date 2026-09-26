import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/sabangnet-mall-listings.js?raw';

// 사방넷 송신 기록 페이지 스크립트(ISOLATED world 파일, 옛 `readSabangnetMallListings` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(fetch·document.cookie)뿐이다.
const ARGS = {
  listPath: '/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists',
  dateFrom: '20000101',
  dateTo: '20260926',
  pageSize: 500,
  currentPage: 2,
};

type Answer = { status: string; total?: number; items?: Array<Record<string, unknown>>; stage?: string };

function load(options: { cookie?: string; respond?: () => { status?: number; redirected?: boolean; body: string } } = {}) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const isolated: Record<string, unknown> = {};
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    const reply = options.respond?.() ?? { body: '{}' };
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      redirected: reply.redirected ?? false,
      text: async () => reply.body,
    };
  };
  new Function('globalThis', 'document', 'fetch', 'AbortController', 'setTimeout', 'clearTimeout', source)(
    isolated,
    { cookie: options.cookie ?? 'foo=1; Authorization=Bearer%20token-1' },
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
  );
  const handler = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Answer>>)['sabangnet.mallListingPage']!;
  return { handler, requests };
}

const LISTED = {
  shmaId: 'shop0472',
  prdRegsTrnmSrno: 5010000001,
  shmaPrdNo: 'KN-1',
  prdNo: '103177',
  prdNm: '할로윈 아트 네일팁',
  prdSplyStsCdNm: '공급중',
  modlNm: '10162-1',
  onsfPrdCd: '8806381806625',
  sepr: 1950,
  prdRegsFstTrnmDt: '20260914 13:47',
};

describe('sabangnet mall listings page script', () => {
  it('세션 토큰으로 목록 한 쪽을 POST하고, 행에서 허용한 칸만 복사한다 — 몰 로그인 ID·비밀번호는 싣지 않는다', async () => {
    const { handler, requests } = load({
      respond: () => ({
        body: JSON.stringify({
          code: 20000,
          data: {
            metaData: { total: 3 },
            list: [
              { ...LISTED, shmaCnctnLoginId: 'seller-id', shmaCnctnPwd: 'secret-password', type: 'data' },
              { type: 'message', prdRegsTrnmSrno: 5010000001, msg: '전송 실패' },
            ],
          },
        }),
      }),
    });
    const answer = await handler(ARGS);
    expect(answer).toEqual({ status: 'ok', total: 3, items: [LISTED] });
    expect(JSON.stringify(answer)).not.toContain('secret-password');
    expect(JSON.stringify(answer)).not.toContain('seller-id');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(ARGS.listPath);
    expect(requests[0]!.init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect((requests[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(JSON.parse(String(requests[0]!.init.body))).toMatchObject({
      startDate: '20000101',
      endDate: '20260926',
      pageSize: 500,
      currentPage: 2,
      searchDateType: 'PRD_REGS_FST_TRNM_DT',
    });
  });

  it('토큰 쿠키가 없거나, 401·토큰 오류 코드면 login_required', async () => {
    expect(await load({ cookie: 'foo=1' }).handler(ARGS)).toEqual({ status: 'login_required' });
    expect(await load({ respond: () => ({ status: 401, body: '' }) }).handler(ARGS)).toEqual({ status: 'login_required' });
    expect(await load({ respond: () => ({ body: JSON.stringify({ code: 50014 }) }) }).handler(ARGS)).toEqual({ status: 'login_required' });
  });

  it('형식이 다르면 contract_drift(단계), HTTP 오류는 http_error', async () => {
    expect(await load({ respond: () => ({ body: '<html>' }) }).handler(ARGS)).toEqual({ status: 'contract_drift', stage: 'json' });
    expect(await load({ respond: () => ({ body: JSON.stringify({ code: 20000, data: { metaData: { total: 1 } } }) }) }).handler(ARGS))
      .toEqual({ status: 'contract_drift', stage: 'list' });
    expect(await load({ respond: () => ({ status: 500, body: '' }) }).handler(ARGS)).toEqual({ status: 'http_error', httpStatus: 500 });
  });
});
