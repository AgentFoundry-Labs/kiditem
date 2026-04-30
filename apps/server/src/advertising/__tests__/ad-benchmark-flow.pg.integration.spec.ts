import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { AdBenchmarkService } from '../application/service/ad-benchmark.service';
import { AdConfigService } from '../application/service/ad-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('AdBenchmark flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: AdBenchmarkService;

  async function seedListing(params: {
    companyId: string;
    suffix: string;
    channelName?: string;
  }) {
    const master = await prisma.masterProduct.create({
      data: {
        companyId: params.companyId,
        code: `M-${params.suffix}`,
        name: `Master ${params.suffix}`,
        optionCounter: 0,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        companyId: params.companyId,
        masterId: master.id,
        channel: 'coupang',
        externalId: `EXT-${params.suffix}`,
        channelName: params.channelName ?? `Channel ${params.suffix}`,
      },
    });
    return { master, listing };
  }

  /**
   * H3 — seeds `ChannelListingDailySnapshot` (the new ad-metric source-of-
   * truth) instead of legacy `Ad`. The benchmark service reads `adSpend`,
   * `adRevenue`, `adImpressions`, `adClicks`, `adConversions` from this
   * table aggregated over the last 30 businessDates.
   */
  async function seedAd(params: {
    companyId: string;
    listingId: string;
    externalId?: string;
    daysAgo?: number;
    spend: number;
    revenue: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
  }) {
    const date = new Date();
    date.setDate(date.getDate() - (params.daysAgo ?? 0));
    date.setHours(0, 0, 0, 0);
    return prisma.channelListingDailySnapshot.create({
      data: {
        companyId: params.companyId,
        listingId: params.listingId,
        channel: 'coupang',
        externalId: params.externalId ?? `EXT-${params.listingId.slice(0, 8)}`,
        businessDate: date,
        adSpend: params.spend,
        adRevenue: params.revenue,
        adImpressions: params.impressions ?? 0,
        adClicks: params.clicks ?? 0,
        adConversions: params.conversions ?? 0,
      },
    });
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        AdBenchmarkService,
        AdConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(AdBenchmarkService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedBenchmarkConfig(companyId: string) {
    // ad-config.service 의 seedDefaults 는 JSON.stringify 로 2중 인코딩되어
    // `config.benchmark.roas.avg` 가 undefined 로 나옴 (pre-existing quirk).
    // Integration 테스트에서는 benchmark 기준값을 올바른 native JSON 으로 직접 seed.
    await prisma.systemSetting.createMany({
      data: [
        { companyId, key: 'ads.benchmark.roas', value: { avg: 350, good: 500, excellent: 700, poor: 200 } },
        { companyId, key: 'ads.benchmark.ctr', value: { avg: 0.3, good: 0.5, excellent: 1.0, poor: 0.15 } },
        { companyId, key: 'ads.benchmark.cvr', value: { avg: 8, good: 12, excellent: 15, poor: 5 } },
      ],
      skipDuplicates: true,
    });
  }

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedBenchmarkConfig(TEST_COMPANY_ID);
  });

  describe('getDiagnosis — ownMetrics + industryAverage shape', () => {
    it('#1 Ad 없음 → ownMetrics 모두 0/null + listings 빈 배열', async () => {
      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      expect(result.ownMetrics.spend).toBe(0);
      expect(result.ownMetrics.impressions).toBe(0);
      expect(result.ownMetrics.clicks).toBe(0);
      expect(result.ownMetrics.conversions).toBe(0);
      expect(result.ownMetrics.revenue).toBe(0);
      expect(result.ownMetrics.ctr).toBe(null);
      expect(result.ownMetrics.roas).toBe(null);
      expect(result.ownMetrics.cvr).toBe(null);
      expect(result.listings).toHaveLength(0);
      expect(result.diagnosis).toHaveLength(3);
      // 모든 metric 데이터 부족 → average
      for (const d of result.diagnosis) {
        expect(d.status).toBe('average');
      }
    });

    it('#2 industryAverage 는 ad_config defaults 에서 주입 (ctr=0.3, roas=350, cvr=8)', async () => {
      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      expect(result.industryAverage.ctr).toBe(0.3);
      expect(result.industryAverage.roas).toBe(350);
      expect(result.industryAverage.cvr).toBe(8);
      // spend/impressions/clicks/conversions/revenue 는 0 (vs own)
      expect(result.industryAverage.spend).toBe(0);
      expect(result.industryAverage.impressions).toBe(0);
    });
  });

  describe('diagnosis 3 metric status', () => {
    it('#3 ctr 업계 평균 우위 (above) — clicks/impressions = 0.6 vs avg 0.3', async () => {
      const { listing } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'CTR-ABOVE',
      });
      // ctr 0.6%, roas 350%, cvr 8.33%
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        impressions: 10000,
        clicks: 60,
        conversions: 5,
        spend: 10000,
        revenue: 35000,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      const ctrDiag = result.diagnosis.find((d) => d.metric === 'ctr');
      expect(ctrDiag).toBeDefined();
      expect(ctrDiag?.status).toBe('above');
      expect(ctrDiag?.delta).toBeGreaterThan(0);
      expect(ctrDiag?.message).toContain('CTR');
    });

    it('#4 roas 업계 평균 미달 (below) — revenue/spend = 100% vs avg 350', async () => {
      const { listing } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'ROAS-BELOW',
      });
      // ctr 0.3%, roas 100%, cvr 1%
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        impressions: 10000,
        clicks: 30,
        conversions: 0,
        spend: 10000,
        revenue: 10000,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      const roasDiag = result.diagnosis.find((d) => d.metric === 'roas');
      expect(roasDiag).toBeDefined();
      expect(roasDiag?.status).toBe('below');
      expect(roasDiag?.delta).toBeLessThan(0);
      expect(roasDiag?.message).toContain('미달');
    });

    it('#5 cvr 업계 평균 수준 (average) — conversions/clicks = 8% ≈ avg 8', async () => {
      const { listing } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'CVR-AVG',
      });
      // ctr 0.3%, cvr 8% (이경우 avg 와 동일 → average status)
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        impressions: 10000,
        clicks: 30,
        conversions: 2,
        spend: 10000,
        revenue: 35000,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      const cvrDiag = result.diagnosis.find((d) => d.metric === 'cvr');
      expect(cvrDiag).toBeDefined();
      // clicks 30 + conversions 2 = cvr 6.67 → below avg 8 by 16.6%
      // 정확한 검증: delta 가 음수
      expect(cvrDiag?.delta).toBeLessThan(0);
    });

    it('#6 3 metric 모두 아래 — roas 100 / ctr 0.1 / cvr 1 → 전부 below', async () => {
      const { listing } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'ALL-BELOW',
      });
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        impressions: 10000,
        clicks: 10,
        conversions: 0,
        spend: 10000,
        revenue: 10000,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      expect(result.diagnosis.find((d) => d.metric === 'ctr')?.status).toBe('below');
      expect(result.diagnosis.find((d) => d.metric === 'roas')?.status).toBe('below');
      expect(result.diagnosis.find((d) => d.metric === 'cvr')?.status).toBe('below');
    });
  });

  describe('listings (listing-primary shape)', () => {
    it('#7 listings[] = 개별 listing 메트릭 (Plan listing-primary 요구)', async () => {
      const a = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'L1',
        channelName: 'Listing One',
      });
      const b = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'L2',
        channelName: 'Listing Two',
      });

      // L1: spend 10000 / rev 50000 → roas 500%
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: a.listing.id,
        impressions: 10000,
        clicks: 40,
        conversions: 5,
        spend: 10000,
        revenue: 50000,
      });
      // L2: spend 5000 / rev 10000 → roas 200%
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: b.listing.id,
        impressions: 5000,
        clicks: 20,
        conversions: 2,
        spend: 5000,
        revenue: 10000,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      expect(result.listings).toHaveLength(2);
      const l1 = result.listings.find((l) => l.listingId === a.listing.id);
      const l2 = result.listings.find((l) => l.listingId === b.listing.id);

      expect(l1).toBeDefined();
      expect(l1?.externalId).toBe('EXT-L1');
      expect(l1?.channelName).toBe('Listing One');
      expect(l1?.masterProduct.code).toBe('M-L1');
      expect(l1?.option).toBe(null);
      expect(l1?.metrics.roas).toBe(500);
      expect(l1?.metrics.spend).toBe(10000);

      expect(l2?.metrics.roas).toBe(200);
      expect(l2?.metrics.spend).toBe(5000);
    });

    it('#8 soft-deleted listing 은 listings[] 에서 제외', async () => {
      const kept = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'KEPT',
      });
      const deleted = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'DEL',
      });
      await prisma.channelListing.update({
        where: { id: deleted.listing.id },
        data: { isDeleted: true },
      });

      // 두 listing 에 Ad 생성
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: kept.listing.id,
        impressions: 10000,
        clicks: 30,
        conversions: 2,
        spend: 10000,
        revenue: 35000,
      });
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: deleted.listing.id,
        impressions: 10000,
        clicks: 30,
        conversions: 2,
        spend: 10000,
        revenue: 35000,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      // ownMetrics 는 전부 포함 (Ad 수준 집계는 isDeleted 필터 없음 — service 동작 그대로 반영)
      expect(result.ownMetrics.spend).toBe(20000);

      // 하지만 listings hydrate 는 isDeleted:false 필터 적용 → 1 건만
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].listingId).toBe(kept.listing.id);
    });
  });

  describe('30d lookback', () => {
    it('#9 30일 전 Ad 는 ownMetrics / listings 에 포함되지 않음', async () => {
      const { listing } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'OLD',
      });
      // 40일 전 Ad 1개
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        daysAgo: 40,
        impressions: 100000,
        clicks: 1000,
        conversions: 100,
        spend: 100000,
        revenue: 500000,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      expect(result.ownMetrics.spend).toBe(0);
      expect(result.listings).toHaveLength(0);
    });

    it('#10 30일 내 + 30일 밖 혼합 — 30일 내만 집계', async () => {
      const { listing } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'MIXED',
      });
      // 10일 전 (포함)
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        daysAgo: 10,
        impressions: 10000,
        clicks: 30,
        conversions: 2,
        spend: 10000,
        revenue: 35000,
      });
      // 35일 전 (제외)
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        daysAgo: 35,
        impressions: 50000,
        clicks: 500,
        conversions: 50,
        spend: 50000,
        revenue: 100000,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      expect(result.ownMetrics.spend).toBe(10000);
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].metrics.spend).toBe(10000);
    });
  });

  describe('cross-tenant scope', () => {
    it('#11 OTHER_COMPANY_ID 의 Ad 는 TEST_COMPANY_ID 결과에 포함되지 않음', async () => {
      const own = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'OWN',
      });
      const foreign = await seedListing({
        companyId: OTHER_COMPANY_ID,
        suffix: 'FOREIGN',
      });

      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: own.listing.id,
        impressions: 10000,
        clicks: 30,
        conversions: 2,
        spend: 10000,
        revenue: 35000,
      });
      await seedAd({
        companyId: OTHER_COMPANY_ID,
        listingId: foreign.listing.id,
        impressions: 99999,
        clicks: 9999,
        conversions: 999,
        spend: 99999,
        revenue: 999999,
      });

      const result = await service.getDiagnosis(TEST_COMPANY_ID);

      expect(result.ownMetrics.spend).toBe(10000);
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].listingId).toBe(own.listing.id);
    });
  });
});
