import type { AdSettlementDomain } from '@kiditem/shared/advertising-operations';
import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED, createSiteCaller, type SiteCaller, type SiteCallerOptions } from '../../core/site-caller';
import { registerSite, type SiteDeps, type SiteLease } from '../registry';
import { createSiteLoginGate, ensureLoggedIn, withLoginTab, type LoginOutcome } from '../site-login';
import type { TabPage } from '../tab-page';
import { AD_CENTER_LOGIN } from './login';

/**
 * 쿠팡 광고센터(KID-371) — `advertising.ad_report`가 쓰는 읽기와 허용된 쓰기 하나(보고서 생성 `requestReport`). 서비스워커
 * fetch로 쿠키를 싣고 리다이렉트를 따라가지 않는다. 잠금 키 `resource:ad-center:<id>`가 이 사이트의 탭(`/marketing`)을 연다 —
 * 로그인 직후 그 화면을 한 번 열어야 `cmg-api`·`tetris-api`가 답하므로 탭을 여는 것이 곧 워밍업이다. 호출은 문서 "KID-338
 * 분석" §13의 복원본(`requestReport`·`reportList`·`chart-report`·`excel-report`·`getDailySettlement*`·`tetris-api`)이다.
 */
export const AD_CENTER_ORIGIN = 'https://advertising.coupang.com';
export const AD_CENTER_HOME_URL = `${AD_CENTER_ORIGIN}/marketing`;
export const AD_CENTER_GRAPHQL_URL = `${AD_CENTER_ORIGIN}/marketing-reporting/v2/graphql`;
export const AD_CENTER_CHART_REPORT_URL = `${AD_CENTER_ORIGIN}/marketing-reporting/v2/api/chart-report`;
export const AD_CENTER_EXCEL_REPORT_URL = `${AD_CENTER_ORIGIN}/marketing-reporting/v2/api/excel-report`;
export const AD_CENTER_CAMPAIGNS_URL = `${AD_CENTER_ORIGIN}/marketing/tetris-api/campaigns`;
/** 탭 화면의 업체코드를 읽는 파일(`TabPage.frames`, 읽기만). */
export const AD_CENTER_VENDOR_FILE = 'content/ad-center/vendor-code.js';
export const AD_CENTER_PAGE_SIZE = 500;
/** 분석 세션이 쓴 1.5~2초 직렬 간격. 큰 보고서(TSV 수십 MB)를 받을 수 있어 2분에 끊는다. */
export const AD_CENTER_CALLER: SiteCallerOptions = { minIntervalMs: 1_500, timeoutMs: 120_000, displayName: '쿠팡 광고센터' };
const NAVIGATION_TIMEOUT_MS = 30_000;
const VENDOR_READS = 10;
const VENDOR_READ_GAP_MS = 1_000;
const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

const CAMPAIGN_LIST_QUERY = `query ($startDate: Int!, $endDate: Int!, $reportType: ReportType!, $rbacReportType: String) {
  getCampaignList(startDate: $startDate, endDate: $endDate, reportType: $reportType, rbacReportType: $rbacReportType) { id name }
}`;
const REQUEST_REPORT_MUTATION = `mutation ($startDate: Int!, $endDate: Int!, $campaignIds: [ID], $reportType: ReportType!, $dateGroup: DateGroup!, $granularity: Granularity, $excludeIfNoClickCount: Boolean) {
  requestReport(data: {startDate: $startDate, endDate: $endDate, campaignIds: $campaignIds, reportType: $reportType, dateGroup: $dateGroup, granularity: $granularity, excludeIfNoClickCount: $excludeIfNoClickCount}) {
    id requestDate startDate endDate dateGroup granularity campaignCount status isLargeReport
  }
}`;
const REPORT_LIST_QUERY = `query ($reportType: ReportType!, $page: Int!, $pageSize: Int!, $duration: Int!) {
  reportList(data: {reportType: $reportType, page: $page, pageSize: $pageSize, duration: $duration}) { reports { id status isLargeReport } }
}`;
const SETTLEMENT_ITEMS = 'items { date type settlementDomain campaignId campaignName adType goalType deliveredAdcost deliveredAdcostAdj deliveredAdcostAfterAdj budgetAmount budgetType priorSpend deliveredAdcostAfterCap billableAmount promotionAdjustment billableAdjustment }';
const SETTLEMENT_BY_CAMPAIGNS_MUTATION = `mutation ($startDate: Int!, $endDate: Int!, $settlementDomain: SettlementDomain!, $campaignIds: [Int!]!) {
  getDailySettlementByCampaigns(startDate: $startDate, endDate: $endDate, settlementDomain: $settlementDomain, campaignIds: $campaignIds) { ${SETTLEMENT_ITEMS} }
}`;
const SETTLEMENT_ACCOUNT_MUTATION = `mutation ($startDate: Int!, $endDate: Int!, $settlementDomain: SettlementDomain!) {
  getDailySettlement(startDate: $startDate, endDate: $endDate, settlementDomain: $settlementDomain) { ${SETTLEMENT_ITEMS} }
}`;

export interface AdCenterSite {
  readVendorId(): Promise<string>;
  listReportCampaigns(range: { startDate: string; endDate: string }): Promise<Array<{ id: string; name: string }>>;
  requestReport(input: { startDate: string; endDate: string; campaignIds: string[]; granularity: 'vendorItem' | 'keyword' }): Promise<{ id: string; isLargeReport: boolean }>;
  listReports(): Promise<Array<{ id: string; status: string; isLargeReport: boolean }>>;
  downloadReport(input: { id: string; isLargeReport: boolean }): Promise<Record<string, unknown>[]>;
  listCampaigns(page: number): Promise<unknown[]>;
  listAds(input: { adGroupId: string; page: number }): Promise<{ ads: unknown[]; totalCount: number }>;
  readSettlement(input: { startDate: string; endDate: string; domain: AdSettlementDomain; campaignIds: number[] | null }): Promise<unknown[]>;
  pause(ms: number): Promise<void>;
}

/** 광고센터 핸들. 요청마다: 로그인 문턱(바깥) → 첫 500이면 탭을 다시 열고 한 번 다시(안) → 호출기. */
export function createAdCenterSite(deps: SiteDeps, lease: SiteLease): AdCenterSite {
  const caller = createSiteCaller(AD_CENTER_CALLER, deps);
  const page = lease.tabId !== null ? deps.tabs.attach(lease.tabId) : null;
  const call = adCenterCall(deps, lease, page);

  async function graphql(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    const body = record(await call(() => caller.json<unknown>(AD_CENTER_GRAPHQL_URL, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ query, variables }),
    }).catch((error: unknown) => {
      throw graphqlRejection(error) ?? error;
    })));
    const errors = body?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = record(errors[0]);
      throw graphqlError(typeof first?.message === 'string' ? first.message : '', text(record(first?.extensions)?.code));
    }
    const data = record(body?.data);
    if (!data) throw failed('graphql_invalid', '쿠팡 광고센터 응답 형식이 올바르지 않습니다.');
    return data;
  }

  return {
    async readVendorId() {
      if (!page) throw failed('tab_missing', '쿠팡 광고센터 탭이 없어 업체코드를 읽지 못했습니다.');
      // 로그인 뒤 다른 화면에 있으면 광고센터 첫 화면으로 옮긴다(업체코드는 광고센터 화면 머리에 있다).
      if (!(await page.currentUrl().catch(() => '')).startsWith(AD_CENTER_HOME_URL)) {
        await page.navigate(AD_CENTER_HOME_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS, continueOnTimeout: true, stopAt: isLoginUrl });
      }
      for (let read = 0; read < VENDOR_READS; read += 1) {
        if (read > 0) await deps.sleep(VENDOR_READ_GAP_MS);
        const frames = await page.frames<{ vendorId?: unknown }>([AD_CENTER_VENDOR_FILE]).catch(() => []);
        const found = frames.map((frame) => text(frame.result?.vendorId)?.trim()).find(Boolean);
        if (found) return found;
      }
      if (isLoginUrl(await page.currentUrl().catch(() => ''))) {
        throw new RuntimeError(SITE_LOGIN_REQUIRED, '쿠팡 광고센터 로그인이 필요합니다.', { reason: 'login_unconfirmed' });
      }
      throw failed('vendor_code_missing', '쿠팡 광고센터 화면에서 업체코드를 찾지 못했습니다.');
    },

    async listReportCampaigns(range) {
      const data = await graphql(CAMPAIGN_LIST_QUERY, { ...reportRange(range), reportType: 'pa', rbacReportType: 'AD_REPORT' });
      const list = data.getCampaignList;
      if (!Array.isArray(list)) throw failed('graphql_invalid', '쿠팡 광고센터 캠페인 목록 응답이 올바르지 않습니다.');
      return list.flatMap((value) => {
        const campaign = record(value);
        const campaignId = id(campaign?.id);
        return campaignId ? [{ id: campaignId, name: text(campaign?.name) ?? '' }] : [];
      });
    },

    async requestReport(input) {
      const data = await graphql(REQUEST_REPORT_MUTATION, {
        ...reportRange(input),
        campaignIds: input.campaignIds,
        reportType: 'pa',
        dateGroup: 'daily',
        granularity: input.granularity,
        // 상품 보고서는 클릭 없는 행까지(노출), 키워드 보고서는 클릭 있는 행만(광고비는 빠지지 않는다, 문서 §13.4).
        excludeIfNoClickCount: input.granularity === 'keyword',
      });
      const created = record(data.requestReport);
      const reportId = text(created?.id);
      if (!created || !reportId) throw failed('graphql_invalid', '쿠팡 광고센터 보고서 생성 응답이 올바르지 않습니다.');
      return { id: reportId, isLargeReport: created.isLargeReport === true };
    },

    async listReports() {
      const data = await graphql(REPORT_LIST_QUERY, { reportType: 'pa', page: 1, pageSize: 10, duration: 90 });
      const reports = record(data.reportList)?.reports;
      if (!Array.isArray(reports)) throw failed('graphql_invalid', '쿠팡 광고센터 보고서 목록 응답이 올바르지 않습니다.');
      return reports.flatMap((value) => {
        const entry = record(value);
        const reportId = text(entry?.id);
        return reportId ? [{ id: reportId, status: text(entry?.status) ?? '', isLargeReport: entry?.isLargeReport === true }] : [];
      });
    },

    async downloadReport(input) {
      const url = `${input.isLargeReport ? AD_CENTER_EXCEL_REPORT_URL : AD_CENTER_CHART_REPORT_URL}?id=${encodeURIComponent(input.id)}`;
      const body = await call(() => caller.text(url, { headers: { Accept: 'text/plain, application/x-ndjson, application/json' } }));
      return input.isLargeReport ? parseReportTsv(body) : parseReportNdjson(body);
    },

    async listCampaigns(pageNumber) {
      const body = record(await call(() => caller.json<unknown>(AD_CENTER_CAMPAIGNS_URL, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ isDeleted: false, pagination: { page: pageNumber, size: AD_CENTER_PAGE_SIZE }, sortedBy: 'IS_ACTIVE', isSortDesc: false }),
      })));
      const campaigns = record(body?.data)?.campaigns;
      if (!Array.isArray(campaigns)) throw failed('campaigns_invalid', '쿠팡 광고센터 캠페인 응답이 올바르지 않습니다.', { page: pageNumber });
      return campaigns;
    },

    async listAds(input) {
      const body = record(await call(() => caller.json<unknown>(`${AD_CENTER_ORIGIN}/marketing/tetris-api/${encodeURIComponent(input.adGroupId)}/ads`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ pagination: { page: input.page, size: AD_CENTER_PAGE_SIZE } }),
      })));
      // 응답 필드 이름은 실측이 없다(문서 "실측 미기록") — 목록·전체 수의 후보를 읽는다(가정).
      const data = record(body?.data) ?? body;
      const ads = [data?.ads, data?.adList, data?.content, data?.list, data?.items].find(Array.isArray) as unknown[] | undefined;
      const declared = count(data?.totalCount ?? record(data?.pageInfo)?.totalCount ?? body?.totalCount);
      const totalCount = declared ?? (ads && ads.length < AD_CENTER_PAGE_SIZE ? input.page * AD_CENTER_PAGE_SIZE + ads.length : null);
      if (!ads || totalCount === null) throw failed('ads_invalid', '쿠팡 광고센터 광고 응답이 올바르지 않습니다.', { adGroupId: input.adGroupId, page: input.page });
      return { ads, totalCount };
    },

    async readSettlement(input) {
      const byCampaigns = input.campaignIds !== null;
      const data = await graphql(byCampaigns ? SETTLEMENT_BY_CAMPAIGNS_MUTATION : SETTLEMENT_ACCOUNT_MUTATION, {
        ...reportRange(input),
        settlementDomain: input.domain,
        ...(byCampaigns ? { campaignIds: input.campaignIds } : {}),
      });
      const items = record(data[byCampaigns ? 'getDailySettlementByCampaigns' : 'getDailySettlement'])?.items;
      if (!Array.isArray(items)) throw failed('graphql_invalid', '쿠팡 광고센터 정산 응답이 올바르지 않습니다.', { domain: input.domain });
      return items;
    },

    pause: (ms) => deps.sleep(ms),
  };
}

/**
 * 요청 하나를 감싼다. 로그인 리다이렉트면 잠금 탭(없으면 새 탭)에서 실행 자격으로 한 번 로그인하고 다시 묻는다(Wing과 같은
 * 규칙, `../wing/login`). 로그인 직후 세션이 데워지지 않아 처음 500이 오면 탭을 `/marketing`으로 다시 열고 한 번 다시 묻는다 —
 * 한 실행에 한 번뿐이다.
 */
function adCenterCall(deps: SiteDeps, lease: SiteLease, page: TabPage | null) {
  const credentials = lease.credentials;
  const withLogin = createSiteLoginGate(credentials);
  const login = (target: TabPage): Promise<LoginOutcome> =>
    credentials ? ensureLoggedIn(target, AD_CENTER_LOGIN, credentials, deps) : Promise.resolve({ status: 'unconfirmed' });
  let warmed = false;
  const warm = async <T>(request: () => Promise<T>): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      if (warmed || !page || !(isRuntimeError(error) && error.code === SITE_REQUEST_FAILED && error.details?.status === 500)) throw error;
      warmed = true;
      await page.navigate(AD_CENTER_HOME_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS, continueOnTimeout: true, stopAt: isLoginUrl });
      return request();
    }
  };
  return <T>(request: () => Promise<T>): Promise<T> => (page
    ? withLogin(() => warm(request), () => login(page))
    : withLoginTab(withLogin, () => warm(request), () => deps.tabs.open('about:blank'), login));
}

/** chart-report NDJSON: 빈 줄을 건너뛰고 줄마다 객체 하나. */
export function parseReportNdjson(body: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const [index, raw] of body.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
    const row = record(parsed);
    if (!row) throw failed('report_invalid', '쿠팡 광고센터 보고서 파일 형식이 올바르지 않습니다.', { line: index + 1 });
    rows.push(row);
  }
  return rows;
}

/** 큰 보고서 excel-report(TSV): 첫 줄이 열 이름. 10만 행 이하 보고서는 xlsx로 오므로(문서 §13.11) 받지 않는다. */
export function parseReportTsv(body: string): Record<string, unknown>[] {
  if (body.startsWith('PK')) throw failed('excel_report_not_tsv', '쿠팡 광고센터 큰 보고서가 TSV가 아닙니다.');
  const lines = body.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  const [head, ...rest] = lines;
  if (!head) return [];
  const columns = head.split('\t').map((column) => column.trim());
  return rest.map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? '']));
  });
}

function isLoginUrl(value: string): boolean {
  try {
    return AD_CENTER_LOGIN.isLoginUrl(new URL(value));
  } catch {
    return false;
  }
}

/** HTTP 4xx·5xx인데 본문에 GraphQL `errors` 배열이 있으면 조회 거절이다(변수 형식 오류는 400으로 온다). */
function graphqlRejection(error: unknown): RuntimeError | null {
  if (!isRuntimeError(error) || error.code !== SITE_REQUEST_FAILED || error.details?.reason !== 'http') return null;
  const head = typeof error.details.bodyHead === 'string' ? error.details.bodyHead : '';
  // `{"errors":[…]}`이든 `{"data":null,"errors":[…]}`이든 본문 어딘가에 errors 배열이 있으면 GraphQL 오류다.
  if (!/"errors"\s*:\s*\[/.test(head)) return null;
  const match = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(head);
  let message = match?.[1] ?? '';
  try {
    message = JSON.parse(`"${message}"`) as string;
  } catch {
    // 잘린 본문 — 그대로 둔다.
  }
  return graphqlError(message, null, error.details.status);
}

function graphqlError(message: string, code: string | null, status: unknown = 200): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, `쿠팡 광고센터 조회가 거절됐습니다: ${message || '알 수 없음'}`, {
    reason: 'graphql_error',
    httpStatus: status,
    graphqlMessage: message,
    ...(code ? { graphqlCode: code } : {}),
  });
}

/** KST `YYYY-MM-DD` → 광고센터 YYYYMMDD 정수. */
function reportRange(range: { startDate: string; endDate: string }): { startDate: number; endDate: number } {
  return { startDate: Number(range.startDate.replace(/-/g, '')), endDate: Number(range.endDate.replace(/-/g, '')) };
}

function id(value: unknown): string | null {
  const textValue = typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : typeof value === 'string' ? value.trim() : '';
  return /^[1-9]\d*$/.test(textValue) ? textValue : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function count(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function failed(reason: string, message: string, details: Record<string, unknown> = {}): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, message, { reason, ...details });
}

// 잠금 키 `resource:ad-center:<channelAccountId>`의 둘째 마디와 같은 이름이라야 브라우저 자원이 이 탭을 연다.
registerSite({
  name: 'ad-center',
  origin: AD_CENTER_HOME_URL,
  create: (deps, lease) => createAdCenterSite(deps, lease),
});
