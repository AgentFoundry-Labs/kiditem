import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProfitabilityAdRefreshController } from '../profitability-ad-refresh.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000003';
const COLLECTION_RUN_ID = '00000000-0000-4000-8000-000000000004';

describe('ProfitabilityAdRefreshController', () => {
  it('forwards the organization and claimed attempt fence to the next-slice port', async () => {
    const refresh = { nextSlice: vi.fn().mockResolvedValue({ complete: true }) };
    const controller = new ProfitabilityAdRefreshController(refresh as never);

    await controller.nextSlice(ORGANIZATION_ID, RUN_ID, ATTEMPT_TOKEN);

    expect(refresh.nextSlice).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
    });
  });

  it('binds the route slice ID and rejects malformed or mismatched body shapes', async () => {
    const refresh = { finalizeSlice: vi.fn().mockResolvedValue({ complete: false }) };
    const controller = new ProfitabilityAdRefreshController(refresh as never);

    await controller.finalizeSlice(
      ORGANIZATION_ID,
      RUN_ID,
      '2026-07-01_2026-07-31',
      ATTEMPT_TOKEN,
      { collectionRunId: COLLECTION_RUN_ID, completedTargetCount: 2 },
    );

    expect(refresh.finalizeSlice).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      sliceId: '2026-07-01_2026-07-31',
      collectionRunId: COLLECTION_RUN_ID,
      completedTargetCount: 2,
    });
    expect(() => controller.finalizeSlice(
      ORGANIZATION_ID,
      RUN_ID,
      'not-a-slice',
      ATTEMPT_TOKEN,
      { collectionRunId: COLLECTION_RUN_ID, completedTargetCount: 2 },
    )).toThrow(BadRequestException);
  });

  it('rejects a missing or malformed browser attempt token before calling the port', () => {
    const refresh = { finalizeRun: vi.fn() };
    const controller = new ProfitabilityAdRefreshController(refresh as never);

    expect(() => controller.finalizeRun(ORGANIZATION_ID, RUN_ID, undefined))
      .toThrow(BadRequestException);
    expect(refresh.finalizeRun).not.toHaveBeenCalled();
  });

  it('validates and forwards a complete product report payload', async () => {
    const refresh = { ingestReportSlice: vi.fn().mockResolvedValue({ publishedTargetCount: 1 }) };
    const controller = new ProfitabilityAdRefreshController(refresh as never);
    const report = {
      collectionRunId: COLLECTION_RUN_ID,
      advertiserId: 'advertiser-1',
      campaignCount: 47,
      expectedRowCount: 1,
      collectedRowCount: 1,
      businessDates: ['2026-07-01'],
      rows: [{
        businessDate: '2026-07-01',
        externalOptionId: 'option-1',
        adSpend: 100,
        impressions: 20,
        clicks: 2,
        orders: 1,
        conversions: 1,
        adRevenue: 1000,
      }],
    };

    await controller.ingestReportSlice(
      ORGANIZATION_ID,
      RUN_ID,
      '2026-07-01_2026-07-01',
      ATTEMPT_TOKEN,
      report,
    );

    expect(refresh.ingestReportSlice).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      sliceId: '2026-07-01_2026-07-01',
      report,
    });
  });
});
