/**
 * 광고센터 응답 fixture(`advertising.ad_report`, KID-371). 모양은 2026-09-25 광고 분석 세션 복원본(scratchpad
 * `ad-center-fixtures/graphql.md`, Linear 문서 "KID-338 분석" §13.3·§13.9)을 따른다. 값은 지어낸 것이다.
 * 실측이 없는 곳: 보고서 NDJSON의 `campaign_name`·`ad_group_name` 열 이름(문서에는 `campaign_id`/`name`), `/ads` 응답의
 * 광고 필드 이름(문서: "실측 미기록"), 정산 `items[].date`의 형식.
 */

/** 상품 보고서(vendorItem) NDJSON 한 줄. 40열 가운데 수집이 버리는 열(24시간 귀속·organic·discount 등)도 싣는다. */
function productLine(row: {
  dt: string;
  campaignId: number;
  campaignName: string;
  adGroupId: number;
  adGroupName: string;
  advertised: number;
  sold: number;
  placement: string;
  impressions: number;
  clicks: number;
  cost: number;
  orders: [number, number];
  units: [number, number];
  sales: [number, number];
}): Record<string, unknown> {
  return {
    dt: row.dt,
    campaign_id: row.campaignId,
    campaign_name: row.campaignName,
    ad_group_id: row.adGroupId,
    ad_group_name: row.adGroupName,
    advertised_vendor_item_id: row.advertised,
    vendor_item_id: row.sold,
    placement_group: row.placement,
    placement_level: row.placement === '검색 영역' ? 'search' : 'non_search',
    impressions_count: row.impressions,
    clicks_count: row.clicks,
    ad_cost_sum: row.cost,
    direct_order_24_hours_by_cli_count: row.orders[0],
    halo_order_24_hours_by_cli_count: 0,
    direct_unit_24_hours_by_cli_count: row.units[0],
    halo_unit_24_hours_by_cli_count: 0,
    direct_sale_24_hours_by_cli_price: row.sales[0],
    halo_sale_24_hours_by_cli_price: 0,
    direct_order_14_days_by_cli_count: row.orders[0],
    halo_order_14_days_by_cli_count: row.orders[1],
    direct_unit_14_days_by_cli_count: row.units[0],
    halo_unit_14_days_by_cli_count: row.units[1],
    direct_sale_14_days_by_cli_price: row.sales[0],
    halo_sale_14_days_by_cli_price: row.sales[1],
    target_type: 'PRODUCT',
    price_type: 'CPC',
    organic_order_count: 0,
    organic_sale_price: 0,
    promotion_cost: 0,
    discount_item_count: 0,
    discount_item_price: 0,
    isCmc: false,
  };
}

const SEARCH = '검색 영역';
const NON_SEARCH = '비검색 영역';
const A = { campaignId: 101, campaignName: '상시 캠페인', adGroupId: 201, adGroupName: '그룹 A' };
const B = { campaignId: 102, campaignName: 'AI스마트광고', adGroupId: 202, adGroupName: '새 광고 그룹' };

/** 12행: 두 날 × (A 9001 검색·비검색, A 9002 검색, B 9101 검색·비검색, A 9001 광고 → 9003 판매 halo). */
export const PRODUCT_REPORT_ROWS: Record<string, unknown>[] = ['20260910', '20260911'].flatMap((dt) => [
  productLine({ dt, ...A, advertised: 9001, sold: 9001, placement: SEARCH, impressions: 1000, clicks: 20, cost: 3000, orders: [2, 1], units: [3, 1], sales: [30000, 9000] }),
  productLine({ dt, ...A, advertised: 9001, sold: 9001, placement: NON_SEARCH, impressions: 400, clicks: 4, cost: 800, orders: [0, 0], units: [0, 0], sales: [0, 0] }),
  productLine({ dt, ...A, advertised: 9002, sold: 9002, placement: SEARCH, impressions: 50, clicks: 1, cost: 150, orders: [1, 0], units: [1, 0], sales: [12000, 0] }),
  productLine({ dt, ...B, advertised: 9101, sold: 9101, placement: SEARCH, impressions: 700, clicks: 9, cost: 2100, orders: [1, 0], units: [2, 0], sales: [18000, 0] }),
  productLine({ dt, ...B, advertised: 9101, sold: 9101, placement: NON_SEARCH, impressions: 300, clicks: 3, cost: 600, orders: [0, 0], units: [0, 0], sales: [0, 0] }),
  productLine({ dt, ...A, advertised: 9001, sold: 9003, placement: SEARCH, impressions: 0, clicks: 0, cost: 0, orders: [0, 1], units: [0, 2], sales: [0, 15000] }),
]);
export const PRODUCT_NDJSON = `${PRODUCT_REPORT_ROWS.map((row) => JSON.stringify(row)).join('\n')}\n`;

/** 키워드 보고서(keyword) 행: `ad_group_id`·`placement_level`이 없고 `keywords`가 있다. 비검색 영역은 키워드가 빈 행 하나다. */
function keywordLine(row: { dt: string; campaignId: number; campaignName: string; adGroupName: string; advertised: number; sold: number; keyword: string; clicks: number; cost: number }) {
  const { ad_group_id: _group, placement_level: _level, ...rest } = productLine({
    dt: row.dt,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    adGroupId: 1,
    adGroupName: row.adGroupName,
    advertised: row.advertised,
    sold: row.sold,
    placement: row.keyword ? SEARCH : NON_SEARCH,
    impressions: row.clicks * 40,
    clicks: row.clicks,
    cost: row.cost,
    orders: [1, 0],
    units: [1, 0],
    sales: [10000, 0],
  });
  return { ...rest, keywords: row.keyword };
}

export const KEYWORD_REPORT_ROWS: Record<string, unknown>[] = [
  keywordLine({ dt: '20260910', ...A, advertised: 9001, sold: 9001, keyword: '유아 식판', clicks: 12, cost: 1800 }),
  keywordLine({ dt: '20260910', ...A, advertised: 9001, sold: 9001, keyword: '', clicks: 4, cost: 800 }),
  keywordLine({ dt: '20260911', ...B, advertised: 9101, sold: 9101, keyword: '아기 수저', clicks: 9, cost: 2100 }),
  // 상품 보고서에 없는 (캠페인, 그룹 이름) — 그룹 ID를 채울 수 없어 null.
  keywordLine({ dt: '20260911', campaignId: 103, campaignName: '지난 캠페인', adGroupName: '옛 그룹', advertised: 9201, sold: 9201, keyword: '빨대컵', clicks: 1, cost: 300 }),
];
export const KEYWORD_NDJSON = `${KEYWORD_REPORT_ROWS.map((row) => JSON.stringify(row)).join('\n')}\n`;

/** GraphQL `getCampaignList` data — 삭제 캠페인(103) 포함. */
export const CAMPAIGN_LIST_DATA = {
  getCampaignList: [
    { id: '101', name: '상시 캠페인' },
    { id: '102', name: 'AI스마트광고' },
    { id: '103', name: '지난 캠페인' },
  ],
};

/** GraphQL `requestReport` data(상품·키워드). */
export const REQUEST_REPORT_DATA = {
  vendorItem: {
    requestReport: { id: '15116068', requestDate: '20260912', startDate: 20260910, endDate: 20260911, dateGroup: 'daily', granularity: 'vendorItem', campaignCount: 3, status: 'inprogress', isLargeReport: false },
  },
  keyword: {
    requestReport: { id: '15116069', requestDate: '20260912', startDate: 20260910, endDate: 20260911, dateGroup: 'daily', granularity: 'keyword', campaignCount: 3, status: 'inprogress', isLargeReport: false },
  },
};

/** GraphQL `reportList` data를 차례로: 둘 다 진행 중 → 상품만 끝 → 둘 다 끝. 지난 보고서도 섞여 있다. */
export const REPORT_LIST_SEQUENCE = [
  { reportList: { reports: [
    { id: '15116069', status: 'inprogress', isLargeReport: false },
    { id: '15116068', status: 'inprogress', isLargeReport: false },
    { id: '15000001', status: 'completed', isLargeReport: false },
  ] } },
  { reportList: { reports: [
    { id: '15116069', status: 'inprogress', isLargeReport: false },
    { id: '15116068', status: 'completed', isLargeReport: false },
  ] } },
  { reportList: { reports: [
    { id: '15116069', status: 'completed', isLargeReport: false },
    { id: '15116068', status: 'completed', isLargeReport: false },
  ] } },
];

/** `POST /marketing/tetris-api/campaigns` 응답. */
export const TETRIS_CAMPAIGNS_BODY = {
  data: {
    campaigns: [
      {
        id: 101, name: '상시 캠페인', isActive: true, status: 'ACTIVE', servingStatus: 'SERVING', budget: 50000, capType: 'DAILY',
        roasTarget: 350, objective: 'MANUAL', groupList: [{ id: 201, name: '그룹 A' }], totalAdCount: 2,
      },
      {
        id: 102, name: 'AI스마트광고', isActive: false, status: 'PAUSED', servingStatus: null, budget: null, capType: null,
        roasTarget: null, objective: 'AUTO', groupList: [{ id: 202, name: '새 광고 그룹' }], totalAdCount: 3,
      },
    ],
    pageInfo: { page: 0, size: 500, totalCount: 2, hasNextPage: false },
  },
};

/**
 * `POST /marketing/tetris-api/{groupId}/ads` 응답(그룹 → 본문). 광고 필드 이름은 실측이 없어 후보를 섞었다:
 * `id`/`adId`, `vendorItemId`/`vendorItem.vendorItemId`, `isActive`/`active`, `status`/`adStatus`.
 */
export const TETRIS_ADS_BODIES: Record<string, unknown> = {
  '201': {
    data: {
      ads: [
        { id: 5001, vendorItemId: 9001, isActive: true, status: 'ON' },
        { adId: '5002', vendorItem: { vendorItemId: '9002' }, active: false, adStatus: 'OFF' },
      ],
      totalCount: 2,
      hasNextPage: false,
    },
  },
  '202': {
    data: {
      content: [
        { adId: 5101, vendorItemId: '9101', isActive: false, status: 'PAUSED' },
        { adId: 5102, vendorItemId: null, isActive: null, status: null },
        { adId: 5103, vendorItemId: 9103 },
      ],
      totalCount: 3,
      hasNextPage: false,
    },
  },
};

const SUMMARY = {
  total: { vendorName: '키드아이템', deliveredAdcost: 0, deliveredAdcostAfterCap: 0, promotionAdjustment: 0, billableAdjustment: 0, billableAmount: 0, totalFinalAmount: 0 },
  nonRod: null,
  rod: null,
  rocketGrowth: null,
};

function settlementItem(item: {
  date: string;
  domain: 'SELLER' | 'RETAIL';
  campaignId: number | null;
  campaignName: string | null;
  delivered: number;
  billable: number;
  promotion: number;
  adjustment: number;
}) {
  return {
    date: item.date,
    type: item.campaignId === null ? 'ADJUSTMENT' : 'CAMPAIGN',
    settlementDomain: item.domain,
    campaignId: item.campaignId,
    campaignName: item.campaignName,
    adType: 'PA',
    goalType: 'SALES',
    deliveredAdcost: item.delivered,
    deliveredAdcostAdj: 0,
    deliveredAdcostAfterAdj: item.delivered,
    budgetAmount: 50000,
    budgetType: 'DAILY',
    priorSpend: 0,
    deliveredAdcostAfterCap: item.billable,
    billableAmount: item.billable,
    promotionAdjustment: item.promotion,
    billableAdjustment: item.adjustment,
    cumulativeMonthlyDeliveredAdcost: 0,
    monthlyCap: null,
    priorMonthRollover: 0,
    createdBy: 'system',
    ownership: 'SELF',
  };
}

/** GraphQL `getDailySettlementByCampaigns` data(영역별). SELLER에 캠페인 없는 조정 행이 하나 있다. */
export const SETTLEMENT_DATA = {
  SELLER: {
    getDailySettlementByCampaigns: {
      summary: SUMMARY,
      items: [
        settlementItem({ date: '2026-09-10', domain: 'SELLER', campaignId: 101, campaignName: '상시 캠페인', delivered: 3950, billable: 3950, promotion: 0, adjustment: 0 }),
        settlementItem({ date: '2026-09-11', domain: 'SELLER', campaignId: 101, campaignName: '상시 캠페인', delivered: 3950, billable: 3500, promotion: 0, adjustment: -450 }),
        settlementItem({ date: '2026-09-11', domain: 'SELLER', campaignId: null, campaignName: null, delivered: 0, billable: -3000, promotion: -3000, adjustment: 0 }),
      ],
      subtotals: null,
      dailyInvoiceAgencyCampaignAdjustments: [],
    },
  },
  RETAIL: {
    getDailySettlementByCampaigns: {
      summary: SUMMARY,
      items: [
        settlementItem({ date: '2026-09-10', domain: 'RETAIL', campaignId: 102, campaignName: 'AI스마트광고', delivered: 2700, billable: 2700, promotion: 0, adjustment: 0 }),
      ],
      subtotals: null,
      dailyInvoiceAgencyCampaignAdjustments: [],
    },
  },
};
