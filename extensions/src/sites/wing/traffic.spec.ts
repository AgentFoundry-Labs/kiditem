import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, createSiteCaller, type SiteCallerDeps } from '../../core/site-caller';
import {
  WING_TRAFFIC_CALLER,
  WING_TRAFFIC_DETAIL_URL,
  WING_TRAFFIC_SUMMARY_URL,
  readWingTrafficDetailPage,
  readWingTrafficFreshness,
  readWingTrafficSummary,
} from './traffic';

function wing(respond: (url: string) => Response, xsrf: string | null = 'token') {
  const sent: Array<{ url: string; body: unknown; headers: Headers; redirect: RequestRedirect | undefined }> = [];
  const deps: SiteCallerDeps = {
    async fetch(url, init) {
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init?.headers), redirect: init?.redirect });
      return respond(url);
    },
    cookies: { get: async () => (xsrf ? { value: xsrf } : null) },
    now: () => 0,
    sleep: async () => undefined,
  };
  return { caller: createSiteCaller(WING_TRAFFIC_CALLER, deps), sent };
}

const item = (vendorItemId: unknown, overrides: Record<string, unknown> = {}) => ({
  vendorItemDetails: { vendorItemId, inventoryId: 77, vendorId: 'A0001', itemName: '상품', ...overrides },
  businessInsightsMetricsResponse: {
    totalUniqueVisitor: 3, totalPageViews: '5', totalAddToCart: 1, totalOrders: 1, totalUnitsSold: 2, totalGmv: 9900, pvToOrder: 0.2,
  },
});

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

describe('sites/wing/traffic — Wing 매출분석 읽기(서비스워커, 읽기 전용)', () => {
  it('하루 한 쪽을 옛 본문(NORMAL·RFM, 100개, GMV 내림차순)으로 XSRF와 함께 POST하고 옵션 행을 정규화한다', async () => {
    const site = wing(() => Response.json({
      paginationDetails: { pageNumber: 0, pageSize: 100, totalResults: 1, totalPages: 1 },
      vendorItems: [item('1001')],
    }));
    const page = await readWingTrafficDetailPage(site.caller, { businessDate: '2026-09-01', pageNumber: 0, vendorId: 'A0001' });
    expect(site.sent[0]).toMatchObject({
      url: WING_TRAFFIC_DETAIL_URL,
      redirect: 'manual',
      body: { startDate: '2026-09-01', endDate: '2026-09-01', registrationTypes: ['NORMAL', 'RFM'], pageNumber: 0, pageSize: 100, sortBy: 'GMV', sortOrder: 'DESC' },
    });
    expect(site.sent[0]!.headers.get('X-XSRF-TOKEN')).toBe('token');
    expect(page).toEqual({
      rows: [{ vendorItemId: '1001', productId: '77', visitors: 3, views: 5, cartAdds: 1, orders: 1, salesQty: 2, revenue: 9900 }],
      totalResults: 1, totalPages: 1, pageSize: 100, pageNumber: 0,
    });
  });

  it('다른 판매자 행이나 값이 빠진 행은 받지 않는다', async () => {
    const other = await rejection(readWingTrafficDetailPage(wing(() => Response.json({
      paginationDetails: { pageNumber: 0, pageSize: 100, totalResults: 1, totalPages: 1 }, vendorItems: [item('1001', { vendorId: 'B0002' })],
    })).caller, { businessDate: '2026-09-01', pageNumber: 0, vendorId: 'A0001' }));
    expect(other.details).toMatchObject({ reason: 'advertiser_identity_mismatch' });
    const broken = await rejection(readWingTrafficDetailPage(wing(() => Response.json({
      paginationDetails: { pageNumber: 0, pageSize: 100, totalResults: 1, totalPages: 1 },
      vendorItems: [{ ...item('1001'), businessInsightsMetricsResponse: { totalPageViews: 'x' } }],
    })).caller, { businessDate: '2026-09-01', pageNumber: 0, vendorId: 'A0001' }));
    expect(broken.details).toMatchObject({ reason: 'wing_traffic_row_invalid' });
  });

  it('요약은 쿠팡 전환율(비율)을 퍼센트로 바꾸고, 공개 기간은 KST 날짜로 읽는다', async () => {
    const summary = await readWingTrafficSummary(wing(() => Response.json({
      summaryMetrics: { totalUniqueVisitor: 10, totalPageViews: 20, totalAddToCart: 2, totalOrders: 1, totalUnitsSold: 1, totalGmv: 500, pvToOrder: 0.05 },
    })).caller, { startDate: '2026-09-01', endDate: '2026-09-02' });
    expect(summary).toEqual({ visitors: 10, views: 20, cartAdds: 2, orders: 1, salesQty: 1, revenue: 500, providerConversionRate: 5 });
    const freshness = await readWingTrafficFreshness(wing(() => Response.json({
      dataFreshness: { metrics: { SALES_DAILY: { latestDataDate: '2026-09-24T15:00:00Z' }, TRAFFIC_DAILY: { latestDataDate: '2026-09-23' } } },
      viewablePeriods: { sa: { startDate: '2025-09-01', endDate: '2026-09-25' } },
    })).caller, new Date('2026-09-26T00:00:00Z'));
    expect(freshness).toEqual({ salesLatest: '2026-09-25', trafficLatest: '2026-09-23', viewableStart: '2025-09-01', viewableEnd: '2026-09-25' });
  });

  it('XSRF 쿠키가 없거나 로그인이 풀렸으면 로그인 필요로 멈춘다', async () => {
    const noCookie = wing(() => Response.json({}), null);
    expect((await rejection(readWingTrafficSummary(noCookie.caller, { startDate: '2026-09-01', endDate: '2026-09-01' }))).code).toBe(SITE_LOGIN_REQUIRED);
    expect(noCookie.sent).toHaveLength(0);
    const redirected = wing(() => new Response('', { status: 403 }));
    expect((await rejection(readWingTrafficSummary(redirected.caller, { startDate: '2026-09-01', endDate: '2026-09-01' }))).code).toBe(SITE_LOGIN_REQUIRED);
    expect(WING_TRAFFIC_SUMMARY_URL).toContain('/tenants/rfm-ss/api/business-insight/vendor-summary');
  });
});
