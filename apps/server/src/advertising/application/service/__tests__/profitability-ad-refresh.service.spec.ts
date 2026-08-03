import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfitabilityAdRefreshService } from '../profitability-ad-refresh.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000003';

describe('ProfitabilityAdRefreshService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T03:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('backfills the remainder of the current calendar month after the newest day is covered', async () => {
    const { service } = makeService({
      coverage: [{
        businessDate: new Date('2026-08-01T00:00:00.000Z'),
        authoritativeListingCount: 1,
        oldestObservedAt: new Date('2026-08-02T01:00:00.000Z'),
      }],
    });
    const next = await service.nextSlice(request());

    expect(next).toMatchObject({
      complete: false,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      totalDayCount: 401,
      completedDayCount: 1,
    });
    if (next.complete) throw new Error('expected a slice');
    expect(next.businessDates).toHaveLength(31);
    expect(next.sliceId).toBe('2026-07-01_2026-07-31');
  });

  it('prioritizes the most recent missing report slice before historical ABC backfill', async () => {
    const { service } = makeService();

    const next = await service.nextSlice(request());

    expect(next).toMatchObject({
      complete: false,
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      totalDayCount: 401,
      completedDayCount: 0,
    });
    if (next.complete) throw new Error('expected a slice');
    expect(next.businessDates).toEqual(['2026-08-01']);
  });

  it('refreshes the newest report day before the rest of the current month after initial coverage is complete', async () => {
    const coverage = coverageRows({ observedAt: new Date('2026-08-01T00:00:00.000Z') });
    const { service } = makeService({ coverage });
    const next = await service.nextSlice(request());

    expect(next).toMatchObject({
      complete: false,
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      completedDayCount: 370,
      totalDayCount: 401,
    });
  });

  it('always uses the code-owned official product report contract', async () => {
    const { service, repository } = makeService();
    repository.listTargets.mockResolvedValue([{
      id: 'legacy-dashboard-target',
      url: 'https://advertising.coupang.com/marketing/dashboard/sales',
      label: 'legacy',
      category: 'advertising',
    }]);

    const next = await service.nextSlice(request());

    if (next.complete) throw new Error('expected a slice');
    expect(next.targets).toEqual([{
      id: '',
      url: 'https://advertising.coupang.com/marketing-reporting/billboard/reports/pa',
      label: '쿠팡 상품별 광고 보고서',
      category: 'advertising',
    }]);
  });

  it('accepts only a complete exact-date daily product report for the planned slice', async () => {
    const { service, repository } = makeService();
    const next = await service.nextSlice(request());
    if (next.complete) throw new Error('expected a slice');
    const report = {
      collectionRunId: '00000000-0000-4000-8000-000000000004',
      advertiserId: 'advertiser-1',
      campaignCount: 47,
      expectedRowCount: 2,
      collectedRowCount: 2,
      businessDates: next.businessDates,
      rows: [{
        businessDate: next.startDate,
        externalOptionId: 'option-1',
        adSpend: 1200,
        impressions: 30,
        clicks: 2,
        orders: 1,
        conversions: 1,
        adRevenue: 5000,
      }],
    };

    await service.ingestReportSlice({
      ...request(),
      sliceId: next.sliceId,
      report,
    });

    expect(repository.replaceReportSlice).toHaveBeenCalledWith(expect.objectContaining({
      collectionRunId: report.collectionRunId,
      advertiserId: 'advertiser-1',
      startDate: new Date(`${next.startDate}T00:00:00.000Z`),
      endDate: new Date(`${next.endDate}T00:00:00.000Z`),
      report,
    }));
  });

  it('rejects partial report rows before any provider data is published', async () => {
    const { service, repository } = makeService();
    const next = await service.nextSlice(request());
    if (next.complete) throw new Error('expected a slice');

    await expect(service.ingestReportSlice({
      ...request(),
      sliceId: next.sliceId,
      report: {
        collectionRunId: '00000000-0000-4000-8000-000000000004',
        advertiserId: 'advertiser-1',
        campaignCount: 47,
        expectedRowCount: 2,
        collectedRowCount: 1,
        businessDates: next.businessDates,
        rows: [],
      },
    })).rejects.toThrow('profitability_ad_report_incomplete');
    expect(repository.replaceReportSlice).not.toHaveBeenCalled();
  });

  it('publishes a slice only after a complete provider marker and then advances', async () => {
    let coverage: ReturnType<typeof coverageRows> = [];
    const repository = repositoryMock({ coverage });
    repository.publishSlice.mockImplementation(async ({ startDate, endDate, observedAt }) => {
      coverage = coverageRows({ startDate, endDate, observedAt });
      repository.listCoverageDays.mockImplementation(async () => coverage);
      return coverage.length;
    });
    const service = new ProfitabilityAdRefreshService(repository);
    const first = await service.nextSlice(request());
    if (first.complete) throw new Error('expected a slice');

    const next = await service.finalizeSlice({
      ...request(),
      sliceId: first.sliceId,
      collectionRunId: '00000000-0000-4000-8000-000000000004',
      completedTargetCount: 1,
    });

    expect(repository.hasCompleteCollectionMarker).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: first.startDate,
        endDate: first.endDate,
        expectedTargetCount: 1,
      }),
    );
    expect(repository.publishSlice).toHaveBeenCalledOnce();
    expect(next).toMatchObject({ complete: false, startDate: '2026-07-01' });
  });
});

function request() {
  return {
    organizationId: ORGANIZATION_ID,
    operationRunId: RUN_ID,
    attemptToken: ATTEMPT_TOKEN,
  };
}

function makeService(input: { coverage?: ReturnType<typeof coverageRows> } = {}) {
  const repository = repositoryMock(input);
  return { service: new ProfitabilityAdRefreshService(repository), repository };
}

function repositoryMock(input: { coverage?: ReturnType<typeof coverageRows> } = {}) {
  return {
    findClaimedRun: vi.fn().mockResolvedValue({ startedAt: new Date('2026-08-02T00:00:00.000Z') }),
    countActiveListings: vi.fn().mockResolvedValue(1),
    listTargets: vi.fn().mockResolvedValue([{
      id: 'target-1',
      url: 'https://advertising.coupang.com/marketing/dashboard/sales',
      label: '쿠팡 광고',
      category: 'advertising',
    }]),
    listCoverageDays: vi.fn().mockResolvedValue(input.coverage ?? []),
    replaceReportSlice: vi.fn().mockResolvedValue({
      matchedRowCount: 1,
      unmatchedRowCount: 0,
      publishedTargetCount: 1,
    }),
    hasCompleteCollectionMarker: vi.fn().mockResolvedValue(true),
    publishSlice: vi.fn().mockResolvedValue(31),
  };
}

function coverageRows(input: {
  startDate?: Date;
  endDate?: Date;
  observedAt: Date;
}) {
  const start = input.startDate ?? new Date('2025-06-27T00:00:00.000Z');
  const end = input.endDate ?? new Date('2026-08-01T00:00:00.000Z');
  const rows = [];
  for (let date = start; date <= end; date = new Date(date.getTime() + 86_400_000)) {
    rows.push({
      businessDate: date,
      authoritativeListingCount: 1,
      oldestObservedAt: input.observedAt,
    });
  }
  return rows;
}
