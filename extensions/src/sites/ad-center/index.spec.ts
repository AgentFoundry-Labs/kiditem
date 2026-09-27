import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { siteFactoryFor, type SiteDeps, type SiteLease } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import {
  AD_CENTER_CAMPAIGNS_URL,
  AD_CENTER_GRAPHQL_URL,
  AD_CENTER_HOME_URL,
  AD_CENTER_VENDOR_FILE,
  parseReportNdjson,
  parseReportTsv,
  type AdCenterSite,
} from './index';
import { AD_CENTER_LOGIN } from './login';

const XAUTH = 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth?client_id=advertising';
const SELECTOR = 'https://advertising.coupang.com/user/login';
const TAB = 11;
const CREDENTIALS = { loginId: 'fake-ad-id', password: 'fake-ad-password' };

type Sent = { url: string; method: string; body: Record<string, unknown> | null; redirect: RequestRedirect | undefined };

function redirected(): Response {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
  return response;
}

/** 광고센터 경계 가짜: `respond`가 요청마다 답한다. 탭은 `fakeTabPages`. */
function adCenter(options: {
  respond: (request: Sent, index: number) => Response;
  tabId?: number | null;
  credentials?: typeof CREDENTIALS | null;
  tabs?: ReturnType<typeof fakeTabPages>;
}) {
  const sent: Sent[] = [];
  const fake = options.tabs ?? fakeTabPages({ answer: () => ({ ok: false, error: 'unexpected' }) });
  const clock = fastClock();
  const deps: SiteDeps = {
    tabs: fake.tabs,
    randomId: () => 'id',
    ...clock,
    cookies: { get: async () => null },
    async fetch(input, init) {
      const request: Sent = {
        url: String(input),
        method: init?.method ?? 'GET',
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
        redirect: init?.redirect,
      };
      sent.push(request);
      return options.respond(request, sent.length - 1);
    },
  };
  const lease: SiteLease = { tabId: options.tabId === undefined ? TAB : options.tabId, credentials: options.credentials === undefined ? CREDENTIALS : options.credentials };
  const site = siteFactoryFor('ad-center')!.create(deps, lease) as AdCenterSite;
  return { site, sent, fake };
}

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

const RANGE = { startDate: '2026-09-10', endDate: '2026-09-11' };

describe('sites/ad-center — 광고센터 읽기(서비스워커, 보고서 생성만 쓰기)', () => {
  it('등록 이름은 잠금 키 resource:ad-center:<id>의 둘째 마디, 탭은 /marketing(열면 곧 워밍업)', () => {
    const factory = siteFactoryFor('ad-center');
    expect(factory).toMatchObject({ name: 'ad-center', origin: 'https://advertising.coupang.com/marketing' });
    expect(AD_CENTER_HOME_URL).toBe('https://advertising.coupang.com/marketing');
  });

  it('GraphQL은 날짜를 YYYYMMDD 정수로, 보고서 둘을 옛 조건(상품 daily·클릭 없는 행 포함, 키워드 daily·클릭 있는 행만)으로 부른다', async () => {
    const { site, sent } = adCenter({
      respond: ({ body }) => Response.json({ data: String(body?.query).includes('getCampaignList')
        ? { getCampaignList: [{ id: 101, name: '상시 캠페인' }, { id: '102', name: 'AI' }] }
        : { requestReport: { id: 15116068, status: 'inprogress', isLargeReport: false } } }),
    });
    await expect(site.listReportCampaigns(RANGE)).resolves.toEqual([{ id: '101', name: '상시 캠페인' }, { id: '102', name: 'AI' }]);
    await expect(site.requestReport({ ...RANGE, campaignIds: ['101', '102'], granularity: 'vendorItem' })).resolves.toEqual({ id: '15116068', isLargeReport: false });
    await site.requestReport({ ...RANGE, campaignIds: ['101'], granularity: 'keyword' });
    expect(sent.map((request) => [request.url, request.method, request.redirect])).toEqual([
      [AD_CENTER_GRAPHQL_URL, 'POST', 'manual'],
      [AD_CENTER_GRAPHQL_URL, 'POST', 'manual'],
      [AD_CENTER_GRAPHQL_URL, 'POST', 'manual'],
    ]);
    expect(sent[0]!.body!.variables).toEqual({ startDate: 20260910, endDate: 20260911, reportType: 'pa', rbacReportType: 'AD_REPORT' });
    expect(sent[1]!.body!.variables).toEqual({
      startDate: 20260910, endDate: 20260911, campaignIds: ['101', '102'], reportType: 'pa', dateGroup: 'daily', granularity: 'vendorItem', excludeIfNoClickCount: false,
    });
    expect(sent[1]!.body!.query).toContain('requestReport(data:');
    expect(sent[2]!.body!.variables).toMatchObject({ granularity: 'keyword', excludeIfNoClickCount: true });
  });

  it('보고서 목록은 1쪽 10개·90일로 본다', async () => {
    const { site, sent } = adCenter({
      respond: () => Response.json({ data: { reportList: { reports: [{ id: 7, status: 'completed', isLargeReport: true }] } } }),
    });
    await expect(site.listReports()).resolves.toEqual([{ id: '7', status: 'completed', isLargeReport: true }]);
    expect(sent[0]!.body!.variables).toEqual({ reportType: 'pa', page: 1, pageSize: 10, duration: 90 });
  });

  it('HTTP 200에 errors[]면 SITE_REQUEST_FAILED(graphql_error, 첫 message) — 400 GraphQL 오류 본문도 같다', async () => {
    const ok200 = adCenter({ respond: () => Response.json({ errors: [{ message: 'reading \'map\'', extensions: { code: 'INTERNAL_SERVER_ERROR' } }, { message: 'second' }], data: null }) });
    const first = await rejection(ok200.site.requestReport({ ...RANGE, campaignIds: [], granularity: 'vendorItem' }));
    expect(first).toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'graphql_error', graphqlMessage: 'reading \'map\'', graphqlCode: 'INTERNAL_SERVER_ERROR' } });
    expect(first.message).toContain('reading \'map\'');

    const bad400 = adCenter({ respond: () => Response.json({ errors: [{ message: 'Variable "$campaignIds" got invalid value "x"' }] }, { status: 400 }) });
    const second = await rejection(bad400.site.readSettlement({ ...RANGE, domain: 'SELLER', campaignIds: [101] }));
    expect(second).toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'graphql_error' } });
    // GraphQL 오류는 세션 워밍업 문제가 아니므로 탭을 다시 열지 않는다.
    expect(bad400.sent).toHaveLength(1);

    // `data`가 앞에 와도 본문 어딘가의 `"errors": [`로 GraphQL 오류를 알아본다.
    const dataFirst = adCenter({ respond: () => Response.json({ data: null, errors: [{ message: 'Int cannot represent non-integer value' }] }, { status: 400 }) });
    const third = await rejection(dataFirst.site.readSettlement({ ...RANGE, domain: 'SELLER', campaignIds: [101] }));
    expect(third).toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'graphql_error', graphqlMessage: 'Int cannot represent non-integer value', httpStatus: 400 } });
  });

  it('정산은 캠페인 ID(Int)로 getDailySettlementByCampaigns, null이면 계정 전체 getDailySettlement', async () => {
    const { site, sent } = adCenter({
      respond: ({ body }) => Response.json({ data: String(body?.query).includes('getDailySettlementByCampaigns')
        ? { getDailySettlementByCampaigns: { items: [{ date: '2026-09-10', campaignId: 101 }] } }
        : { getDailySettlement: { items: [{ date: '2026-09-10', campaignId: null }] } } }),
    });
    await expect(site.readSettlement({ ...RANGE, domain: 'RETAIL', campaignIds: [101, 102] })).resolves.toEqual([{ date: '2026-09-10', campaignId: 101 }]);
    await expect(site.readSettlement({ ...RANGE, domain: 'SELLER', campaignIds: null })).resolves.toEqual([{ date: '2026-09-10', campaignId: null }]);
    expect(sent[0]!.body!.variables).toEqual({ startDate: 20260910, endDate: 20260911, settlementDomain: 'RETAIL', campaignIds: [101, 102] });
    expect(sent[1]!.body!.variables).toEqual({ startDate: 20260910, endDate: 20260911, settlementDomain: 'SELLER' });
    expect(sent[1]!.body!.query).toContain('getDailySettlement(');
  });

  it('처음 나온 500이면 탭을 /marketing으로 다시 열고 한 번 다시 묻는다 — 두 번째 500은 실패', async () => {
    const once = adCenter({ respond: (_request, index) => (index === 0 ? new Response('vendorMarket', { status: 500 }) : Response.json({ data: { campaigns: [] } })) });
    await expect(once.site.listCampaigns(0)).resolves.toEqual([]);
    expect(once.fake.log).toEqual([`navigate ${AD_CENTER_HOME_URL} (continue on timeout)`]);
    expect(once.sent.map((request) => request.url)).toEqual([AD_CENTER_CAMPAIGNS_URL, AD_CENTER_CAMPAIGNS_URL]);
    expect(once.sent[0]!.body).toEqual({ isDeleted: false, pagination: { page: 0, size: 500 }, sortedBy: 'IS_ACTIVE', isSortDesc: false });

    const twice = adCenter({ respond: () => new Response('boom', { status: 500 }) });
    await expect(twice.site.listCampaigns(0)).rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { status: 500 } });
    expect(twice.sent).toHaveLength(2);
    // 한 실행에 한 번만 다시 연다.
    await expect(twice.site.listCampaigns(0)).rejects.toMatchObject({ details: { status: 500 } });
    expect(twice.fake.log).toHaveLength(1);
  });

  it('보고서 생성(유일한 쓰기)은 500이어도 탭을 다시 열거나 다시 묻지 않는다 — 보고서가 두 번 생기지 않게', async () => {
    const { site, sent, fake } = adCenter({ respond: () => new Response('vendorMarket', { status: 500 }) });
    await expect(site.requestReport({ ...RANGE, campaignIds: ['101'], granularity: 'vendorItem' })).rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { status: 500 } });
    expect(sent).toHaveLength(1);
    expect(fake.log).toEqual([]);
    // 읽기(보고서 목록)는 그 뒤에도 첫 500에 한 번 다시 연다.
    await expect(site.listReports()).rejects.toMatchObject({ details: { status: 500 } });
    expect(fake.log).toEqual([`navigate ${AD_CENTER_HOME_URL} (continue on timeout)`]);
    expect(sent).toHaveLength(3);
  });

  it('광고 목록은 그룹 경로로 500개씩 묻고, 목록·전체 수 필드 후보를 읽는다', async () => {
    const { site, sent } = adCenter({ respond: () => Response.json({ data: { content: [{ adId: 1 }], totalCount: 1, hasNextPage: false } }) });
    await expect(site.listAds({ adGroupId: '202', page: 1 })).resolves.toEqual({ ads: [{ adId: 1 }], totalCount: 1 });
    expect(sent[0]).toMatchObject({ url: 'https://advertising.coupang.com/marketing/tetris-api/202/ads', method: 'POST', body: { pagination: { page: 1, size: 500 } } });
  });

  it('보고서를 NDJSON(chart-report) 또는 큰 보고서 TSV(excel-report)로 받는다', async () => {
    const { site, sent } = adCenter({
      respond: ({ url }) => new Response(url.includes('chart-report')
        ? '{"dt":"20260910","campaign_id":101}\n\n{"dt":"20260911","campaign_id":102}\n'
        : '\uFEFFdt\tcampaign_id\tad_group_name\r\n20260910\t101\t그룹 A\r\n'),
    });
    await expect(site.downloadReport({ id: '15', isLargeReport: false })).resolves.toEqual([{ dt: '20260910', campaign_id: 101 }, { dt: '20260911', campaign_id: 102 }]);
    await expect(site.downloadReport({ id: '16', isLargeReport: true })).resolves.toEqual([{ dt: '20260910', campaign_id: '101', ad_group_name: '그룹 A' }]);
    expect(sent.map((request) => request.url)).toEqual([
      'https://advertising.coupang.com/marketing-reporting/v2/api/chart-report?id=15',
      'https://advertising.coupang.com/marketing-reporting/v2/api/excel-report?id=16',
    ]);
  });

  it('NDJSON 줄이 객체가 아니거나 excel-report가 xlsx(PK)면 받지 않는다', () => {
    expect(() => parseReportNdjson('{"dt":1}\nnot json\n')).toThrow(expect.objectContaining({ code: SITE_REQUEST_FAILED, details: expect.objectContaining({ reason: 'report_invalid', line: 2 }) }));
    expect(() => parseReportTsv('PK\u0003\u0004binary')).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'excel_report_not_tsv' }) }));
    expect(parseReportTsv('a\tb\n1\n')).toEqual([{ a: '1', b: '' }]);
  });

  it('업체코드는 잠금 탭 화면의 "업체코드" 항목에서 읽는다(옛 ads-report.js 규칙)', async () => {
    const tabs = fakeTabPages({
      answer: () => ({ ok: false }),
      currentUrl: 'https://advertising.coupang.com/marketing/dashboard',
      frames: (_files, call) => [{ frameId: 0, result: { vendorId: call < 3 ? null : 'A00057379' } }],
    });
    const { site } = adCenter({ respond: () => Response.json({}), tabs });
    await expect(site.readVendorId()).resolves.toBe('A00057379');
    expect(tabs.log.filter((line) => line.startsWith('frames'))).toEqual([
      `frames ${AD_CENTER_VENDOR_FILE}`, `frames ${AD_CENTER_VENDOR_FILE}`, `frames ${AD_CENTER_VENDOR_FILE}`,
    ]);

    const missing = fakeTabPages({ answer: () => ({ ok: false }), currentUrl: AD_CENTER_HOME_URL, frames: () => [{ frameId: 0, result: { vendorId: null } }] });
    const none = adCenter({ respond: () => Response.json({}), tabs: missing });
    await expect(none.site.readVendorId()).rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'vendor_code_missing' } });
  });

  it('탭이 광고센터 밖이면 /marketing으로 옮긴 뒤 읽는다', async () => {
    const tabs = fakeTabPages({ answer: () => ({ ok: false }), frames: () => [{ frameId: 0, result: { vendorId: 'A1' } }] });
    const { site } = adCenter({ respond: () => Response.json({}), tabs });
    await expect(site.readVendorId()).resolves.toBe('A1');
    expect(tabs.log[0]).toBe(`navigate ${AD_CENTER_HOME_URL} (continue on timeout)`);
  });

  it('로그인 입구: /marketing → 로그인 화면(광고센터 /user/login·xauth), 아이디·비밀번호 두 칸(Wing과 같은 칸)', () => {
    expect(AD_CENTER_LOGIN).toMatchObject({ loginUrl: AD_CENTER_HOME_URL, hosts: ['advertising.coupang.com', 'xauth.coupang.com'], fields: ['loginId', 'password'] });
    expect(AD_CENTER_LOGIN.isLoginUrl(new URL(XAUTH))).toBe(true);
    expect(AD_CENTER_LOGIN.isLoginUrl(new URL(SELECTOR))).toBe(true);
    // 옛 `startsWith('/user/login')`처럼 넓게.
    expect(AD_CENTER_LOGIN.isLoginUrl(new URL('https://advertising.coupang.com/user/login/sso?returnUrl=%2Fmarketing'))).toBe(true);
    expect(AD_CENTER_LOGIN.isLoginUrl(new URL('https://advertising.coupang.com/marketing/dashboard'))).toBe(false);
  });

  it('로그인 리다이렉트면 잠금 탭의 xauth 폼에 실행 자격을 채우고 같은 요청을 한 번 다시 한다', async () => {
    const login = fakeLoginScreen({ loginAt: XAUTH });
    const tabs = fakeTabPages({ landAt: login.landAt, frames: login.frames, answer: (message) => login.answer(message) ?? { ok: false } });
    const { site, sent } = adCenter({ tabs, respond: () => (login.state.signedIn ? Response.json({ data: { reportList: { reports: [] } } }) : redirected()) });
    await expect(site.listReports()).resolves.toEqual([]);
    expect(login.state.filled).toEqual([{ loginId: 'fake-ad-id', password: 'fake-ad-password' }]);
    expect(sent).toHaveLength(2);
    expect(tabs.log).toContain(`navigate ${AD_CENTER_HOME_URL} (continue on timeout)`);
  });

  it('자격이 없으면 로그인하지 않고 SITE_LOGIN_REQUIRED{no_credentials}', async () => {
    const { site } = adCenter({ credentials: null, respond: () => redirected() });
    await expect(site.listReports()).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'no_credentials' } });
  });

  it('계정 유형 선택 화면(/user/login, 폼 없음)이면 "쿠팡 wing 로그인"을 한 번 눌러 xauth 폼을 기다렸다 실행 자격으로 채운다', async () => {
    const login = fakeLoginScreen({ loginAt: XAUTH });
    const chosen: string[] = [];
    const tabs = fakeTabPages({
      landAt: (url) => (login.state.signedIn ? url : SELECTOR),
      // 누르기 전에는 폼이 없다(계정 유형 카드뿐), 누른 뒤에는 xauth 폼이 보인다.
      frames: () => [{ frameId: 0, result: { loginForm: chosen.length > 0 && !login.state.signedIn } }],
      answer: (message) => {
        if (message.call === 'adCenter.chooseWingAccount') {
          chosen.push(String(message.call));
          return { ok: true, value: { state: 'clicked' } };
        }
        return login.answer(message) ?? { ok: false };
      },
    });
    const { site, sent } = adCenter({ tabs, respond: () => (login.state.signedIn ? Response.json({ data: { reportList: { reports: [] } } }) : redirected()) });
    await expect(site.listReports()).resolves.toEqual([]);
    expect(chosen).toEqual(['adCenter.chooseWingAccount']);
    expect(login.state.filled).toEqual([{ loginId: 'fake-ad-id', password: 'fake-ad-password' }]);
    expect(sent).toHaveLength(2);
  });

  it('누를 계정 버튼이 없으면 탭을 운영자에게 남기고 SITE_LOGIN_REQUIRED{login_unconfirmed}', async () => {
    const tabs = fakeTabPages({
      landAt: () => SELECTOR,
      frames: () => [{ frameId: 0, result: { loginForm: false } }],
      answer: (message) => (message.call === 'adCenter.chooseWingAccount' ? { ok: true, value: { state: 'not_found' } } : { ok: false }),
    });
    const { site, sent } = adCenter({ tabs, respond: () => redirected() });
    await expect(site.listReports()).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'login_unconfirmed' } });
    expect(sent).toHaveLength(2);
    expect(tabs.log.some((line) => line.startsWith('close'))).toBe(false);
  });
});
