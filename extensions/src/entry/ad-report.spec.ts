import { AdReportProductRowSchema } from '@kiditem/shared/advertising-operations';
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LIST_DATA,
  KEYWORD_NDJSON,
  PRODUCT_REPORT_ROWS,
  REPORT_LIST_SEQUENCE,
  REQUEST_REPORT_DATA,
  SETTLEMENT_DATA,
  TETRIS_ADS_BODIES,
  TETRIS_CAMPAIGNS_BODY,
} from '../collectors/advertising.ad_report/__fixtures__/ad-center';
import { adReportCollector } from '../collectors/advertising.ad_report';
import type { CollectedChunk } from '../collectors/collector';
import { fastClock } from '../sites/login.fake';
import { siteFactoryFor, type SiteDeps } from '../sites/registry';
import { fakeTabPages } from '../sites/tab-page.fake';
import '../sites/ad-center';

const PLAN = {
  channelAccountId: '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11',
  vendorId: 'A00057379',
  startDate: '2026-09-10',
  endDate: '2026-09-11',
  settlementDomains: ['SELLER', 'RETAIL'],
  startedAt: '2026-09-12T00:00:00.000Z',
};
const PRODUCT_REPORT_ID = REQUEST_REPORT_DATA.vendorItem.requestReport.id;

/** 큰 보고서 excel-report(TSV) 본문: fixture 상품 행에서 `ad_group_id`를 뺀 열(엑셀에는 광고그룹 ID가 없다, 문서 §13.11). */
function productTsv(): string {
  const rows = PRODUCT_REPORT_ROWS.map(({ ad_group_id: _group, ...rest }) => rest);
  const columns = Object.keys(rows[0]!);
  return [columns.join('\t'), ...rows.map((row) => columns.map((column) => String(row[column as keyof typeof row])).join('\t'))].join('\r\n');
}

/** 광고센터 경계 가짜: fixture 본문을 URL·GraphQL 연산별로 돌려준다. 상품 보고서는 큰 보고서로 끝난다. */
function adCenterFetch() {
  const sent: string[] = [];
  let reportListCalls = 0;
  async function fetch(input: string, init?: RequestInit): Promise<Response> {
    const url = String(input);
    sent.push(url);
    if (url.endsWith('/marketing-reporting/v2/graphql')) {
      const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
      if (query.includes('getCampaignList')) return Response.json({ data: CAMPAIGN_LIST_DATA });
      if (query.includes('requestReport')) return Response.json({ data: REQUEST_REPORT_DATA[variables.granularity as 'vendorItem' | 'keyword'] });
      if (query.includes('reportList')) {
        const step = REPORT_LIST_SEQUENCE[Math.min(reportListCalls++, REPORT_LIST_SEQUENCE.length - 1)]!;
        return Response.json({ data: { reportList: { reports: step.reportList.reports.map((report) => ({ ...report, isLargeReport: report.id === PRODUCT_REPORT_ID })) } } });
      }
      if (query.includes('getDailySettlementByCampaigns')) return Response.json({ data: SETTLEMENT_DATA[variables.settlementDomain as 'SELLER' | 'RETAIL'] });
    }
    if (url.includes('/excel-report?id=')) return new Response(productTsv());
    if (url.includes('/chart-report?id=')) return new Response(KEYWORD_NDJSON);
    if (url.endsWith('/tetris-api/campaigns')) return Response.json(TETRIS_CAMPAIGNS_BODY);
    const ads = /\/tetris-api\/(\d+)\/ads$/.exec(url);
    if (ads) return Response.json(TETRIS_ADS_BODIES[ads[1]!]);
    return new Response('unexpected', { status: 404 });
  }
  return { fetch, sent };
}

describe('advertising.ad_report + sites/ad-center — 큰 보고서 TSV 경로(KID-371)', () => {
  it('isLargeReport면 excel-report TSV를 받아 머리 행 열 이름으로 행을 옮기고, 광고그룹 ID는 캠페인 목록의 그룹으로 채운다', async () => {
    const boundary = adCenterFetch();
    const tabs = fakeTabPages({
      answer: () => ({ ok: false }),
      currentUrl: 'https://advertising.coupang.com/marketing/dashboard',
      frames: () => [{ frameId: 0, result: { vendorId: 'A00057379' } }],
    });
    const deps: SiteDeps = { tabs: tabs.tabs, randomId: () => 'id', ...fastClock(), cookies: { get: async () => null }, fetch: boundary.fetch };
    const site = siteFactoryFor('ad-center')!.create(deps, { tabId: 11, credentials: null });

    const chunks: CollectedChunk[] = [];
    for await (const chunk of adReportCollector.collect(PLAN as never, site as never, { signal: new AbortController().signal, tabId: 11 })) chunks.push(chunk);

    expect(boundary.sent).toContain(`https://advertising.coupang.com/marketing-reporting/v2/api/excel-report?id=${PRODUCT_REPORT_ID}`);
    const products = chunks.filter((chunk) => chunk.chunkKind === 'ad_product_rows').flatMap((chunk) => chunk.payload) as Record<string, unknown>[];
    expect(products).toHaveLength(12);
    for (const row of products) AdReportProductRowSchema.parse(row);
    // TSV 칸은 문자열이다 — 숫자·날짜·ID로 옮기고 14일 direct+halo를 더한다.
    expect(products[0]).toEqual({
      date: '2026-09-10', campaignId: '101', campaignName: '상시 캠페인', adGroupId: '201', adGroupName: '그룹 A',
      advertisedVendorItemId: '9001', vendorItemId: '9001', placementGroup: '검색 영역',
      impressions: 1000, clicks: 20, spend: 3000, orders: 3, units: 4, revenue: 39000,
    });
    expect(products.map((row) => row.adGroupId)).toEqual(['201', '201', '201', '202', '202', '201', '201', '201', '201', '202', '202', '201']);
    const period = chunks.find((chunk) => chunk.chunkKind === 'ad_period')!.payload[0];
    expect(period).toMatchObject({ reports: [{ granularity: 'vendorItem', isLargeReport: true, rowCount: 12 }, { granularity: 'keyword', isLargeReport: false }] });
  });
});
