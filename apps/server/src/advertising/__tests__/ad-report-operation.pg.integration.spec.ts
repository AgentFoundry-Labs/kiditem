import { createHash, randomUUID } from 'node:crypto';
import { Injectable, type INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { accountLockKey, OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, type OperationBeginResponse } from '@kiditem/shared/operation';
import { businessDateKey, evidenceCutoffDate, shiftBusinessDateKey } from '@kiditem/shared/common';
import { WING_CATALOG_LIST_KIND } from '@kiditem/shared/coupang-catalog-snapshot';
import {
  AD_REPORT_ADS_CHUNK_KIND,
  AD_REPORT_CAMPAIGNS_CHUNK_KIND,
  AD_REPORT_KEYWORD_ROWS_CHUNK_KIND,
  AD_REPORT_KIND,
  AD_REPORT_PERIOD_CHUNK_KIND,
  AD_REPORT_PRODUCT_ROWS_CHUNK_KIND,
  AD_REPORT_SETTLEMENT_ROWS_CHUNK_KIND,
  type AdReportAd,
  type AdReportCampaign,
  type AdReportKeywordRow,
  type AdReportPeriod,
  type AdReportProductRow,
  type AdReportSettlementRow,
} from '@kiditem/shared/advertising-operations';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwner } from '../../common/operation/application/port/out/owner/operation-owner.decorator';
import type { OperationOwnerPort } from '../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import { AdReportOperationOwner } from '../adapter/in/operation/ad-report-operation-owner';
import { AdReportOperationRepository } from '../adapter/out/repository/ad-report-operation.repository';

// 확장 수집기(advertising.ad_report)가 밟는 길을 서버에서 그대로: begin → 청크 6종 → finish. 원장 5표 쓰기는
// finish 트랜잭션 안에서만(ADR-0025, KID-371).
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/** Wing 카탈로그 첫 동기화가 잡는 `account:<id>`만 흉내 낸다 — 광고 보고서와 잠금이 겹치지 않는지 본다. */
@OperationOwner()
@Injectable()
class WingCatalogLockOwner implements OperationOwnerPort {
  readonly kind = WING_CATALOG_LIST_KIND;
  async plan(scope: Record<string, unknown>) {
    const channelAccountId = String(scope.channelAccountId);
    return { lockKeys: [accountLockKey(channelAccountId)], plan: { channelAccountId } };
  }
  async finalize() {
    return {};
  }
}

const closedDay = () => businessDateKey(evidenceCutoffDate());
const day = (offset: number) => shiftBusinessDateKey(closedDay(), offset);

function productRow(values: Partial<AdReportProductRow> & Pick<AdReportProductRow, 'date'>): AdReportProductRow {
  return {
    campaignId: '11',
    campaignName: '봄 캠페인',
    adGroupId: '101',
    adGroupName: '그룹 가',
    advertisedVendorItemId: '1001',
    vendorItemId: '1001',
    placementGroup: '검색',
    impressions: 100,
    clicks: 10,
    spend: 1_000,
    orders: 1,
    units: 1,
    revenue: 15_000,
    ...values,
  };
}

function keywordRow(values: Partial<AdReportKeywordRow> & Pick<AdReportKeywordRow, 'date'>): AdReportKeywordRow {
  return {
    campaignId: '11',
    adGroupId: '101',
    adGroupName: '그룹 가',
    advertisedVendorItemId: '1001',
    vendorItemId: '1001',
    keyword: '장난감',
    impressions: 50,
    clicks: 5,
    spend: 500,
    orders: 1,
    units: 1,
    revenue: 15_000,
    ...values,
  };
}

function settlementRow(values: Partial<AdReportSettlementRow> & Pick<AdReportSettlementRow, 'date'>): AdReportSettlementRow {
  return {
    settlementDomain: 'SELLER',
    campaignId: '11',
    campaignName: '봄 캠페인',
    deliveredSpend: 0,
    billedSpend: 0,
    promotionAdjustment: 0,
    billableAdjustment: 0,
    ...values,
  };
}

const campaign = (values: Partial<AdReportCampaign> = {}): AdReportCampaign => ({
  campaignId: '11',
  name: '봄 캠페인',
  isActive: true,
  status: 'ACTIVE',
  servingStatus: 'SERVING',
  budget: 50_000,
  budgetType: 'DAILY',
  roasTarget: 350,
  adSelectionType: 'MANUAL',
  adGroups: [{ adGroupId: '101', name: '그룹 가' }],
  totalAdCount: 1,
  ...values,
});

const ad = (values: Partial<AdReportAd> = {}): AdReportAd => ({
  adId: '9001',
  campaignId: '11',
  adGroupId: '101',
  vendorItemId: '1001',
  isActive: true,
  status: 'ON',
  ...values,
});

type Capture = {
  products?: AdReportProductRow[];
  keywords?: AdReportKeywordRow[];
  settlements?: AdReportSettlementRow[];
  campaigns?: AdReportCampaign[];
  ads?: AdReportAd[];
  vendorId?: string | null;
  /** false면 기간 증거(`ad_period`)를 보내지 않는다 — 보고서를 만들었다는 증거가 없는 수집. */
  period?: boolean;
};

describe('advertising.ad_report owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let accountId: string;
  let listingId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const ports = channelFactTestPorts(prisma as never);
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        {
          provide: AdReportOperationOwner,
          useValue: new AdReportOperationOwner(new AdReportOperationRepository(ports.accounts, ports.listings, prisma as never)),
        },
        WingCatalogLockOwner,
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { headers: Record<string, string>; authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: req.headers['x-test-org'] ?? ORG };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Primary Wing', isPrimary: true, vendorId: 'VENDOR-A' },
    });
    accountId = account.id;
    const listing = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: account.id, externalId: 'PRODUCT-A', displayName: 'Winner Toy', isActive: true },
    });
    listingId = listing.id;
    await prisma.channelListingOption.create({
      data: { organizationId: ORG, listingId: listing.id, externalOptionId: '1001', itemName: '빨강', isActive: true },
    });
  });

  const begin = (scope: Record<string, unknown>, kind: string = AD_REPORT_KIND) => request(httpUrl).post('/api/operations').send({ kind, scope });
  async function beginRun(scope: Record<string, unknown> = { channelAccountId: accountId, startDate: day(-2), endDate: day(0) }): Promise<OperationBeginResponse> {
    return OperationBeginResponseSchema.parse((await begin(scope).expect(201)).body);
  }
  async function put(run: OperationBeginResponse, chunkKind: string, sequence: number, payload: unknown[]) {
    await request(httpUrl)
      .put(`/api/operations/${run.operation.id}/chunks/${chunkKind}/${sequence}`)
      .set(OPERATION_TOKEN_HEADER, run.token)
      .send({ checksum: checksum(payload), payload })
      .expect(200);
  }
  function finish(run: OperationBeginResponse, body: Record<string, unknown> = { outcome: 'succeeded' }) {
    return request(httpUrl).post(`/api/operations/${run.operation.id}/finish`).set(OPERATION_TOKEN_HEADER, run.token).send(body);
  }
  /** 확장 수집기의 순서: 캠페인 → 광고 → 상품 행 → 키워드 행 → 정산 행 → 기간 증거. */
  async function collect(run: OperationBeginResponse, capture: Capture) {
    const plan = run.operation.plan as { startDate: string; endDate: string };
    const campaigns = capture.campaigns ?? [campaign()];
    const ads = capture.ads ?? [ad()];
    const products = capture.products ?? [];
    const keywords = capture.keywords ?? [];
    await put(run, AD_REPORT_CAMPAIGNS_CHUNK_KIND, 1, campaigns);
    await put(run, AD_REPORT_ADS_CHUNK_KIND, 1, ads);
    if (products.length > 0) await put(run, AD_REPORT_PRODUCT_ROWS_CHUNK_KIND, 1, products);
    if (keywords.length > 0) await put(run, AD_REPORT_KEYWORD_ROWS_CHUNK_KIND, 1, keywords);
    if ((capture.settlements ?? []).length > 0) await put(run, AD_REPORT_SETTLEMENT_ROWS_CHUNK_KIND, 1, capture.settlements!);
    const now = new Date().toISOString();
    const period: AdReportPeriod = {
      startDate: plan.startDate,
      endDate: plan.endDate,
      capturedAt: now,
      vendorId: capture.vendorId === undefined ? 'VENDOR-A' : capture.vendorId,
      reports: [
        { granularity: 'vendorItem', reportId: 'r-1', requestedAt: now, completedAt: now, rowCount: products.length, isLargeReport: false },
        { granularity: 'keyword', reportId: 'r-2', requestedAt: now, completedAt: now, rowCount: keywords.length, isLargeReport: false },
      ],
      campaignCount: campaigns.length,
      adCount: ads.length,
    };
    if (capture.period !== false) await put(run, AD_REPORT_PERIOD_CHUNK_KIND, 1, [period]);
  }

  it('plan locks the ad center of the account, defaults to the 15 days through yesterday and refuses a bad window', async () => {
    const run = await beginRun({ channelAccountId: accountId });
    expect(run.operation.lockKeys).toEqual([`resource:ad-center:${accountId}`]);
    expect(run.operation.plan).toEqual({
      channelAccountId: accountId,
      vendorId: 'VENDOR-A',
      startDate: day(-14),
      endDate: day(0),
      settlementDomains: ['SELLER', 'RETAIL'],
      startedAt: expect.any(String),
    });
    expect(run.operation.window).toEqual({ start: day(-14), end: day(0) });
    await finish(run, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED' }).expect(200);

    const tooLong = await begin({ channelAccountId: accountId, startDate: day(-31), endDate: day(0) }).expect(400);
    expect(tooLong.body).toMatchObject({ code: 'VALIDATION_FAILED', message: '광고 보고서 기간은 31일까지입니다. 기간을 줄여 주세요.', details: { reason: 'window_too_long' } });
    const today = await begin({ channelAccountId: accountId, endDate: day(1) }).expect(400);
    expect(today.body.details.reason).toBe('window_after_closed_day');
    await begin({ channelAccountId: accountId, extra: true }).expect(400);
    const missing = await begin({ channelAccountId: randomUUID() }).expect(404);
    expect(missing.body.code).toBe('ADVERTISING_ACCOUNT_NOT_FOUND');
  });

  it('a second run on the same account is refused, while the Wing catalog holding account:<id> does not block it', async () => {
    const catalog = OperationBeginResponseSchema.parse((await begin({ channelAccountId: accountId }, WING_CATALOG_LIST_KIND).expect(201)).body);
    expect(catalog.operation.lockKeys).toEqual([`account:${accountId}`]);
    const first = await beginRun();
    const refused = await begin({ channelAccountId: accountId }).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
  });

  it('finish writes the five ledgers for the window, summing search and non-search rows and resolving the listing', async () => {
    const run = await beginRun();
    await collect(run, {
      products: [
        productRow({ date: day(-2), placementGroup: '검색', spend: 600, impressions: 60 }),
        productRow({ date: day(-2), placementGroup: '비검색', spend: 400, impressions: 40, vendorItemId: '2002' }),
        productRow({ date: day(0), spend: 1_000 }),
        productRow({ date: day(-1), campaignId: '77', campaignName: '지난 캠페인', adGroupId: '707', advertisedVendorItemId: '5555', vendorItemId: '5555', spend: 300 }),
      ],
      keywords: [
        keywordRow({ date: day(-2), keyword: '장난감', spend: 300 }),
        keywordRow({ date: day(-2), keyword: '', adGroupId: null, spend: 100 }),
      ],
      settlements: [
        settlementRow({ date: day(-2), deliveredSpend: 1_000, billedSpend: 901 }),
        settlementRow({ date: day(0), deliveredSpend: 1_000, billedSpend: 1_000 }),
        settlementRow({ date: day(-1), campaignId: null, campaignName: null, billedSpend: -50, billableAdjustment: -50 }),
      ],
      ads: [ad(), ad({ adId: '9002', vendorItemId: null, isActive: null, status: null })],
    });
    const finished = await finish(run).expect(200);
    expect(finished.body.operation).toMatchObject({
      status: 'succeeded',
      window: { start: day(-2), end: day(0) },
      result: {
        startDate: day(-2),
        endDate: day(0),
        confirmedEndDate: day(0),
        productRowCount: 3,
        keywordRowCount: 2,
        campaignCount: 2,
        adCount: 2,
        settlementRowCount: 3,
        spendTotal: 2_300,
        billedTotal: 1_851,
        unsettledCampaignDays: 1,
        accountAdjustmentRows: 1,
        warnings: [],
      },
    });

    const products = await prisma.channelAdProductDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: [{ date: 'asc' }, { campaignId: 'asc' }] });
    expect(products.map((row) => ({
      date: businessDateKey(row.date), campaignId: row.campaignId, optionId: row.optionId, listingId: row.listingId, optionName: row.optionName,
      spend: row.spend, billedSpend: row.billedSpend, impressions: row.impressions, operationId: row.operationId,
    }))).toEqual([
      { date: day(-2), campaignId: '11', optionId: '1001', listingId, optionName: '빨강', spend: 1_000, billedSpend: 901, impressions: 100, operationId: run.operation.id },
      { date: day(-1), campaignId: '77', optionId: '5555', listingId: null, optionName: null, spend: 300, billedSpend: 300, impressions: 100, operationId: run.operation.id },
      { date: day(0), campaignId: '11', optionId: '1001', listingId, optionName: '빨강', spend: 1_000, billedSpend: 1_000, impressions: 100, operationId: run.operation.id },
    ]);
    const keywords = await prisma.channelAdKeywordDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: { keyword: 'asc' } });
    // 키워드 보고서가 빈 광고그룹을 준 행은 상품 보고서의 (캠페인, 그룹 이름)으로 채운다.
    expect(keywords.map((row) => ({ keyword: row.keyword, adGroupId: row.adGroupId, spend: row.spend }))).toEqual([
      { keyword: '', adGroupId: '101', spend: 100 },
      { keyword: '장난감', adGroupId: '101', spend: 300 },
    ]);
    const billings = await prisma.channelAdDailyBilling.findMany({ where: { organizationId: ORG }, orderBy: { date: 'asc' } });
    expect(billings.map((row) => ({ date: businessDateKey(row.date), campaignKey: row.campaignKey, billedSpend: row.billedSpend, billableAdjustment: row.billableAdjustment }))).toEqual([
      { date: day(-2), campaignKey: '11', billedSpend: 901, billableAdjustment: 0 },
      { date: day(-1), campaignKey: '', billedSpend: -50, billableAdjustment: -50 },
      { date: day(0), campaignKey: '11', billedSpend: 1_000, billableAdjustment: 0 },
    ]);
    const campaigns = await prisma.channelAdCampaign.findMany({ where: { organizationId: ORG }, orderBy: { campaignId: 'asc' } });
    expect(campaigns).toMatchObject([
      { campaignId: '11', name: '봄 캠페인', isActive: true, budget: 50_000, adSelectionType: 'MANUAL', deletedAt: null, operationId: run.operation.id },
      { campaignId: '77', name: '지난 캠페인', isActive: false, deletedAt: expect.any(Date), operationId: run.operation.id },
    ]);
    expect(Number(campaigns[0]!.roasTarget)).toBe(350);
    const ads = await prisma.channelAdCampaignAd.findMany({ where: { organizationId: ORG }, orderBy: { adId: 'asc' } });
    expect(ads).toMatchObject([
      { adId: '9001', campaignId: '11', adGroupId: '101', optionId: '1001', isActive: true, status: 'ON', operationId: run.operation.id },
      { adId: '9002', optionId: null, isActive: null, status: null },
    ]);
  });

  it('a second run over an overlapping window rewrites the fact rows of its window and keeps the days outside it', async () => {
    const first = await beginRun({ channelAccountId: accountId, startDate: day(-3), endDate: day(-1) });
    await collect(first, {
      products: [productRow({ date: day(-3), spend: 700 }), productRow({ date: day(-2), spend: 800 }), productRow({ date: day(-2), campaignId: '12', adGroupId: '102', spend: 50 })],
      keywords: [keywordRow({ date: day(-2), keyword: '옛 키워드' })],
      settlements: [settlementRow({ date: day(-2), campaignId: '99', billedSpend: 10 })],
    });
    await finish(first).expect(200);

    const second = await beginRun({ channelAccountId: accountId, startDate: day(-2), endDate: day(0) });
    await collect(second, {
      products: [productRow({ date: day(-2), spend: 900 }), productRow({ date: day(0), spend: 100 })],
      keywords: [keywordRow({ date: day(-2), keyword: '새 키워드' })],
    });
    await finish(second).expect(200);

    const products = await prisma.channelAdProductDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: { date: 'asc' } });
    expect(products.map((row) => [businessDateKey(row.date), row.campaignId, row.spend, row.operationId])).toEqual([
      [day(-3), '11', 700, first.operation.id],
      [day(-2), '11', 900, second.operation.id],
      [day(0), '11', 100, second.operation.id],
    ]);
    const keywords = await prisma.channelAdKeywordDailySnapshot.findMany({ where: { organizationId: ORG } });
    expect(keywords.map((row) => row.keyword)).toEqual(['새 키워드']);
    await expect(prisma.channelAdDailyBilling.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('bills a campaign-day to the won, bills an unsettled campaign-day at spend and warns on a large reconciliation gap', async () => {
    const run = await beginRun();
    await collect(run, {
      products: [
        productRow({ date: day(-2), advertisedVendorItemId: '1001', spend: 3 }),
        productRow({ date: day(-2), adGroupId: '102', advertisedVendorItemId: '1002', spend: 1 }),
        productRow({ date: day(-2), adGroupId: '103', advertisedVendorItemId: '1003', spend: 3 }),
        productRow({ date: day(-1), campaignId: '12', spend: 5_000 }),
        productRow({ date: day(0), spend: 20_000 }),
      ],
      settlements: [
        // 1,000 × 3/7·1/7은 나눠떨어지지 않는다: 내림 428·142·428 = 998, 남은 2원은 집행액 3인 두 행에.
        settlementRow({ date: day(-2), deliveredSpend: 7, billedSpend: 1_000 }),
        settlementRow({ date: day(0), deliveredSpend: 21_500, billedSpend: 21_500 }),
      ],
    });
    const finished = await finish(run).expect(200);
    expect(finished.body.operation.result).toMatchObject({
      unsettledCampaignDays: 1,
      warnings: [{ date: day(0), campaignId: '11', reportSpend: 20_000, settlementSpend: 21_500 }],
    });
    const rows = await prisma.channelAdProductDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: [{ date: 'asc' }, { optionId: 'asc' }] });
    expect(rows.map((row) => [businessDateKey(row.date), row.optionId, row.spend, row.billedSpend])).toEqual([
      [day(-2), '1001', 3, 429],
      [day(-2), '1002', 1, 142],
      [day(-2), '1003', 3, 429],
      [day(-1), '1001', 5_000, 5_000],
      [day(0), '1001', 20_000, 21_500],
    ]);
  });

  it('holds back a zero closed day after a day with spend: the run window and the ledgers end the day before', async () => {
    const run = await beginRun();
    await collect(run, {
      products: [productRow({ date: day(-2), spend: 500 }), productRow({ date: day(-1), spend: 700 }), productRow({ date: day(0), spend: 0, clicks: 0 })],
      keywords: [keywordRow({ date: day(0), spend: 0 })],
      settlements: [settlementRow({ date: day(0), billedSpend: 0 })],
    });
    const finished = await finish(run).expect(200);
    expect(finished.body.operation).toMatchObject({
      window: { start: day(-2), end: day(-1) },
      result: { endDate: day(0), confirmedEndDate: day(-1), productRowCount: 2, keywordRowCount: 0, settlementRowCount: 0 },
    });
    const products = await prisma.channelAdProductDailySnapshot.findMany({ where: { organizationId: ORG } });
    expect(products.map((row) => businessDateKey(row.date)).sort()).toEqual([day(-2), day(-1)]);
    await expect(prisma.channelAdKeywordDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('fills a missing ad group id from the campaign list by group name and keys an unresolved one as empty', async () => {
    const run = await beginRun();
    await collect(run, {
      products: [
        // 큰 보고서(TSV)는 광고그룹 id가 없다: 캠페인 목록의 (캠페인, 그룹 이름)으로 푼다.
        productRow({ date: day(0), adGroupId: null, adGroupName: '그룹 가', spend: 400 }),
        productRow({ date: day(0), adGroupId: '101', placementGroup: '비검색', spend: 100 }),
        // 삭제 캠페인은 목록에도 없어 풀 수 없다: 키는 ''.
        productRow({ date: day(0), campaignId: '77', campaignName: '지난 캠페인', adGroupId: null, adGroupName: '옛 그룹', spend: 30 }),
        productRow({ date: day(0), campaignId: '77', campaignName: '지난 캠페인', adGroupId: null, adGroupName: '옛 그룹', placementGroup: '비검색', spend: 20 }),
      ],
      keywords: [keywordRow({ date: day(0), adGroupId: null, adGroupName: '그룹 가', keyword: '블록' })],
    });
    await finish(run).expect(200);
    const products = await prisma.channelAdProductDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: { campaignId: 'asc' } });
    expect(products.map((row) => [row.campaignId, row.adGroupId, row.spend])).toEqual([
      ['11', '101', 500],
      ['77', '', 50],
    ]);
    const keywords = await prisma.channelAdKeywordDailySnapshot.findMany({ where: { organizationId: ORG } });
    expect(keywords.map((row) => [row.keyword, row.adGroupId])).toEqual([['블록', '101']]);
  });

  it('refuses a one-day window on yesterday whose spend is still zero instead of storing a reversed window', async () => {
    const run = await beginRun({ channelAccountId: accountId, startDate: day(0), endDate: day(0) });
    await collect(run, { products: [productRow({ date: day(0), spend: 0 })] });
    const refused = await finish(run).expect(409);
    expect(refused.body).toMatchObject({
      code: 'ADVERTISING_AD_REPORT_DAY_NOT_READY',
      message: '어제 광고비가 아직 집계되지 않았습니다. 잠시 뒤 다시 수집해 주세요.',
    });
    await finish(run, { outcome: 'failed', errorCode: 'ADVERTISING_AD_REPORT_DAY_NOT_READY' }).expect(200);
    await expect(prisma.channelAdProductDailySnapshot.count()).resolves.toBe(0);
  });

  it('refuses a capture when the account stopped being an active Coupang account during the run', async () => {
    const run = await beginRun();
    await collect(run, { products: [productRow({ date: day(0) })] });
    await prisma.channelAccount.update({ where: { id: accountId }, data: { status: 'inactive' } });
    const refused = await finish(run).expect(400);
    expect(refused.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: '수집하는 동안 쿠팡 계정 설정이 바뀌었습니다. 다시 수집해 주세요.',
      details: { reason: 'account_changed' },
    });
    await expect(prisma.channelAdProductDailySnapshot.count()).resolves.toBe(0);
  });

  it('an account with no ads in the window succeeds: both reports were made, zero rows is a measured zero and clears the old rows (KID-45)', async () => {
    const first = await beginRun();
    await collect(first, {
      products: [productRow({ date: day(-1), spend: 500 })],
      keywords: [keywordRow({ date: day(-1) })],
      settlements: [settlementRow({ date: day(-1), deliveredSpend: 500, billedSpend: 500 })],
    });
    await finish(first).expect(200);

    const empty = await beginRun();
    await collect(empty, { campaigns: [], ads: [] });
    const finished = await finish(empty).expect(200);
    expect(finished.body.operation).toMatchObject({
      status: 'succeeded',
      window: { start: day(-2), end: day(0) },
      result: {
        confirmedEndDate: day(0),
        productRowCount: 0,
        keywordRowCount: 0,
        campaignCount: 0,
        adCount: 0,
        settlementRowCount: 0,
        spendTotal: 0,
        billedTotal: 0,
        unsettledCampaignDays: 0,
        accountAdjustmentRows: 0,
        warnings: [],
      },
    });
    await expect(prisma.channelAdProductDailySnapshot.count()).resolves.toBe(0);
    await expect(prisma.channelAdKeywordDailySnapshot.count()).resolves.toBe(0);
    await expect(prisma.channelAdDailyBilling.count()).resolves.toBe(0);
  });

  it('refuses a capture without the report evidence or under another vendor, and a failed run writes nothing', async () => {
    const empty = await beginRun();
    await collect(empty, { products: [productRow({ date: day(0) })], period: false });
    const refused = await finish(empty).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', message: '보고서 행이 없습니다. 광고센터에서 다시 수집해 주세요.', details: { reason: 'ad_report_rows_missing' } });
    await finish(empty, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);

    const other = await beginRun();
    await collect(other, { products: [productRow({ date: day(0) })], vendorId: 'VENDOR-B' });
    expect((await finish(other).expect(409)).body).toMatchObject({
      code: 'ADVERTISER_IDENTITY_MISMATCH',
      message: '광고센터에 다른 업체로 로그인돼 있습니다. 수집할 쿠팡 계정의 업체로 다시 로그인한 뒤 시작해 주세요.',
    });
    await finish(other, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);

    const failed = await beginRun();
    await collect(failed, { products: [productRow({ date: day(0) })] });
    await finish(failed, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED' }).expect(200);

    for (const count of [
      prisma.channelAdProductDailySnapshot.count(),
      prisma.channelAdKeywordDailySnapshot.count(),
      prisma.channelAdCampaign.count(),
      prisma.channelAdCampaignAd.count(),
      prisma.channelAdDailyBilling.count(),
    ]) {
      await expect(count).resolves.toBe(0);
    }
  });
});
