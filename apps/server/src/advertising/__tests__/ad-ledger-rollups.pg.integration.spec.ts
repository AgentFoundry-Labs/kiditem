import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import {
  seedAdCampaign,
  seedAdProductDays,
  seedAdReportRun,
  seedCoupangAdAccount,
} from '../../test-helpers/ad-ledger-seeds';
import { setupChannelListing, setupMaster, setupProductOption } from '../../test-helpers/finance-seeds';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { AdLedgerReadPersistenceAdapter } from '../adapter/out/persistence/ad-ledger-read.persistence.adapter';

/**
 * 광고 운영 화면·규칙이 읽는 새 원장 rollup(KID-372 ①a). 잠그는 것: 캠페인·상품·키워드 합은 측정한 날의 행만 더하고,
 * 캠페인 상태·예산은 `ChannelAdCampaign`에서 오며 지운 캠페인은 빠지고, 키워드는 고른 기간의 일별 행을 모두 더하고
 * 비검색(keyword '')은 따로 표시하며, 규칙 입력은 최근 측정일 창만 본다. 다른 조직 행은 섞이지 않는다.
 */
describe('ad-ledger rollups (PG)', () => {
  let prisma: PrismaClient;
  const adapter = new AdLedgerReadPersistenceAdapter();
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function listing(code: string, channelAccountId: string) {
    const master = await setupMaster(prisma, { organizationId: ORG, code, name: `Listing ${code}` });
    const option = await setupProductOption(prisma, { organizationId: ORG, masterId: master.id, sku: `${code}-OPT` });
    return setupChannelListing(prisma, {
      organizationId: ORG, masterId: master.id, channel: 'coupang', externalId: `EXT-${code}`, optionId: option.id, externalOptionId: `VI-${code}`, channelAccountId,
    });
  }

  async function keywordDay(input: {
    organizationId?: string; channelAccountId: string; operationId: string; date: string; keyword: string;
    campaignId?: string; adGroupId?: string; vendorItemId?: string; spend?: number; clicks?: number; orders?: number; revenue?: number; impressions?: number;
  }) {
    await prisma.channelAdKeywordDailySnapshot.create({
      data: {
        organizationId: input.organizationId ?? ORG,
        channelAccountId: input.channelAccountId,
        operationId: input.operationId,
        date: day(input.date),
        campaignId: input.campaignId ?? 'C1',
        adGroupId: input.adGroupId ?? 'G1',
        vendorItemId: input.vendorItemId ?? 'VI-L1',
        keyword: input.keyword,
        impressions: input.impressions ?? 10,
        clicks: input.clicks ?? 1,
        spend: input.spend ?? 0,
        orders: input.orders ?? 0,
        units: input.orders ?? 0,
        revenue: input.revenue ?? 0,
      },
    });
  }

  /** 계정 A가 9/1~9/3을 측정했다(9/4 행은 측정 창 밖). */
  async function measuredAccount() {
    const account = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    const run = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: account.id, start: '2026-09-01', end: '2026-09-03' });
    return { account, run, scope: { organizationId: ORG, activeAccountIds: [account.id] } };
  }

  it('캠페인 합은 측정한 날의 상품 행을 캠페인으로 더하고 상태·예산·ROAS 목표는 캠페인 표에서 오며, 지운 캠페인은 빠지고 행 없는 캠페인은 0이다', async () => {
    const { account, run, scope } = await measuredAccount();
    const l1 = await listing('L1', account.id);
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C1', name: '여름 물총', status: 'ON', budget: 50_000, roasTarget: 400 });
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C2', name: '쉬는 캠페인', isActive: false, status: 'OFF' });
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C9', name: '지운 캠페인' });
    await prisma.channelAdCampaign.updateMany({ where: { campaignId: 'C9' }, data: { deletedAt: new Date() } });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-01', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, spend: 1000, billedSpend: 900, revenue: 5000, impressions: 100, clicks: 10, orders: 2 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-02', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, spend: 500, billedSpend: 500, revenue: 0, impressions: 50, clicks: 5 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-02', campaignId: 'C1', adGroupId: 'G2', vendorItemId: 'VI-X', spend: 200 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-04', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', spend: 9_999 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-02', campaignId: 'C9', vendorItemId: 'VI-9', spend: 777 },
    ]);

    const { coverage, rows } = await adapter.readCampaignWindowRollups(ownerTransaction(prisma), scope);
    expect(coverage.measuredDates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(rows.map((row) => row.campaignId)).toEqual(['C1', 'C2']);
    expect(rows[0]).toEqual(expect.objectContaining({
      channelAccountId: account.id, campaignName: '여름 물총', isActive: true, status: 'ON', budget: 50_000, roasTarget: 400,
      spend: 1700, billedSpend: 1600, revenue: 5000, impressions: 150, clicks: 15, orders: 2, listingIds: [l1.listingId],
    }));
    expect(rows[1]).toEqual(expect.objectContaining({ campaignName: '쉬는 캠페인', isActive: false, spend: 0, clicks: 0, listingIds: [] }));
  });

  it('상품 합은 (캠페인·광고그룹·옵션)마다 측정한 날을 더하고 캠페인으로 좁힐 수 있으며 광고 상태는 광고 표에서 온다', async () => {
    const { account, run, scope } = await measuredAccount();
    const other = await seedCoupangAdAccount(prisma, { organizationId: OTHER_ORGANIZATION_ID, externalAccountId: 'X' });
    const otherRun = await seedAdReportRun(prisma, { organizationId: OTHER_ORGANIZATION_ID, channelAccountId: other.id, start: '2026-09-01', end: '2026-09-03' });
    const l1 = await listing('L1', account.id);
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C1', name: '여름 물총' });
    await prisma.channelAdCampaignAd.create({
      data: { organizationId: ORG, channelAccountId: account.id, operationId: run.id, adId: 'AD1', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', isActive: false, status: 'PAUSED', lastSeenAt: new Date() },
    });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-01', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, optionName: '파랑', spend: 300, orders: 1, revenue: 9000 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-03', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, optionName: '파랑', spend: 200 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-02', campaignId: 'C2', adGroupId: 'G7', vendorItemId: 'VI-L1', listingId: l1.listingId, spend: 50 },
      { organizationId: OTHER_ORGANIZATION_ID, channelAccountId: other.id, operationId: otherRun.id, date: '2026-09-01', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', spend: 9_999 },
    ]);

    const all = await adapter.readProductWindowRollups(ownerTransaction(prisma), scope);
    expect(all.rows.map((row) => [row.campaignId, row.adGroupId, row.vendorItemId, row.spend])).toEqual([
      ['C1', 'G1', 'VI-L1', 500],
      ['C2', 'G7', 'VI-L1', 50],
    ]);
    expect(all.rows[0]).toEqual(expect.objectContaining({
      channelAccountId: account.id, campaignName: '여름 물총', listingId: l1.listingId, optionName: '파랑', isActive: false, status: 'PAUSED', days: 2, orders: 1, revenue: 9000,
    }));
    expect(all.rows[1]).toEqual(expect.objectContaining({ campaignName: null, isActive: null, status: null }));

    const narrowed = await adapter.readProductWindowRollups(ownerTransaction(prisma), { ...scope, campaign: { channelAccountId: account.id, campaignId: 'C2' } });
    expect(narrowed.rows.map((row) => row.campaignId)).toEqual(['C2']);
  });

  it('키워드 합은 고른 기간의 일별 행을 모두 더하고 비검색(keyword \'\')은 따로 표시하며 리스팅은 같은 옵션의 상품 행에서 찾는다', async () => {
    const { account, run, scope } = await measuredAccount();
    const l1 = await listing('L1', account.id);
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C1', name: '여름 물총' });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-09-01', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, optionName: '파랑' },
    ]);
    await keywordDay({ channelAccountId: account.id, operationId: run.id, date: '2026-09-01', keyword: '물총', spend: 100, clicks: 2, orders: 1, revenue: 9000 });
    await keywordDay({ channelAccountId: account.id, operationId: run.id, date: '2026-09-03', keyword: '물총', spend: 50, clicks: 1 });
    await keywordDay({ channelAccountId: account.id, operationId: run.id, date: '2026-09-04', keyword: '물총', spend: 9_999 });
    await keywordDay({ channelAccountId: account.id, operationId: run.id, date: '2026-09-02', keyword: '', spend: 30 });
    await keywordDay({ channelAccountId: account.id, operationId: run.id, date: '2026-09-02', keyword: '뽀로로 물총', campaignId: 'C2', vendorItemId: 'VI-Z', spend: 10 });

    const all = await adapter.readKeywordWindowRollups(ownerTransaction(prisma), scope);
    expect(all.coverage.observedAt).not.toBeNull();
    expect(all.rows.map((row) => [row.campaignId, row.keyword, row.nonSearch, row.spend, row.days])).toEqual([
      ['C1', '물총', false, 150, 2],
      ['C1', '', true, 30, 1],
      ['C2', '뽀로로 물총', false, 10, 1],
    ]);
    expect(all.rows[0]).toEqual(expect.objectContaining({
      campaignName: '여름 물총', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, optionName: '파랑', clicks: 3, orders: 1, revenue: 9000, lastDate: '2026-09-03',
    }));
    expect(all.rows[2]).toEqual(expect.objectContaining({ campaignName: null, listingId: null }));

    const oneDay = await adapter.readKeywordWindowRollups(ownerTransaction(prisma), { ...scope, from: '2026-09-03', to: '2026-09-04', campaign: { channelAccountId: account.id, campaignId: 'C1' } });
    expect(oneDay.rows.map((row) => [row.keyword, row.spend])).toEqual([['물총', 50]]);
  });

  it('두 계정이 같은 캠페인 id를 써도 캠페인·상품·키워드 합은 계정마다 따로이고 이름은 제 계정의 캠페인에서 온다', async () => {
    const a = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    const b = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'B' });
    const runA = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: a.id, start: '2026-09-01', end: '2026-09-03' });
    const runB = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: b.id, start: '2026-09-01', end: '2026-09-03' });
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: a.id, operationId: runA.id, campaignId: 'C1', name: 'A 캠페인', budget: 10_000 });
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: b.id, operationId: runB.id, campaignId: 'C1', name: 'B 캠페인', budget: 20_000 });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: a.id, operationId: runA.id, date: '2026-09-01', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-1', spend: 100 },
      { organizationId: ORG, channelAccountId: b.id, operationId: runB.id, date: '2026-09-01', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-1', spend: 700 },
    ]);
    await keywordDay({ channelAccountId: a.id, operationId: runA.id, date: '2026-09-02', keyword: '물총', campaignId: 'C1', vendorItemId: 'VI-1', spend: 10 });
    await keywordDay({ channelAccountId: b.id, operationId: runB.id, date: '2026-09-02', keyword: '물총', campaignId: 'C1', vendorItemId: 'VI-1', spend: 70 });
    const scope = { organizationId: ORG, activeAccountIds: [a.id, b.id] };
    const byAccount = <T extends { channelAccountId: string }>(rows: readonly T[]) =>
      [...rows].sort((x, y) => (x.channelAccountId === a.id ? -1 : 1) - (y.channelAccountId === a.id ? -1 : 1));
    const tx = ownerTransaction(prisma);

    const campaigns = byAccount((await adapter.readCampaignWindowRollups(tx, scope)).rows);
    expect(campaigns.map((row) => [row.channelAccountId, row.campaignName, row.budget, row.spend])).toEqual([
      [a.id, 'A 캠페인', 10_000, 100],
      [b.id, 'B 캠페인', 20_000, 700],
    ]);
    const products = byAccount((await adapter.readProductWindowRollups(tx, scope)).rows);
    expect(products.map((row) => [row.channelAccountId, row.campaignName, row.spend])).toEqual([
      [a.id, 'A 캠페인', 100],
      [b.id, 'B 캠페인', 700],
    ]);
    const keywords = byAccount((await adapter.readKeywordWindowRollups(tx, scope)).rows);
    expect(keywords.map((row) => [row.channelAccountId, row.campaignName, row.spend])).toEqual([
      [a.id, 'A 캠페인', 10],
      [b.id, 'B 캠페인', 70],
    ]);
    const onlyB = await adapter.readProductWindowRollups(tx, { ...scope, campaign: { channelAccountId: b.id, campaignId: 'C1' } });
    expect(onlyB.rows.map((row) => [row.channelAccountId, row.spend])).toEqual([[b.id, 700]]);
  });

  it('규칙 입력은 최근 측정일 창(기본 14일)의 캠페인·키워드 합과 캠페인 현재 상태이고 그보다 오래된 측정일은 빠진다', async () => {
    const account = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    const run = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: account.id, start: '2026-08-01', end: '2026-08-20' });
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C1', name: '여름 물총', budget: 20_000 });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-08-06', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-1', spend: 7_000 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-08-07', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-1', spend: 100, revenue: 400 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: '2026-08-20', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-1', spend: 200 },
    ]);
    await keywordDay({ channelAccountId: account.id, operationId: run.id, date: '2026-08-06', keyword: '물총', adGroupId: 'G1', vendorItemId: 'VI-1', spend: 5_000 });
    await keywordDay({ channelAccountId: account.id, operationId: run.id, date: '2026-08-19', keyword: '물총', adGroupId: 'G1', vendorItemId: 'VI-1', spend: 60 });

    const targets = await adapter.readCurrentAdTargets(ownerTransaction(prisma), { organizationId: ORG, activeAccountIds: [account.id] });
    expect(targets.measuredDates[0]).toBe('2026-08-07');
    expect(targets.measuredDates).toHaveLength(14);
    expect(targets.latestMeasuredDate).toBe('2026-08-20');
    expect(targets.campaigns).toEqual([expect.objectContaining({ campaignId: 'C1', budget: 20_000, spend: 300, revenue: 400, vendorItemIds: ['VI-1'] })]);
    expect(targets.keywords.map((row) => [row.keyword, row.spend])).toEqual([['물총', 60]]);
  });
});
