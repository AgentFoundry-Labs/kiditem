import { describe, expect, it, vi } from 'vitest';
import {
  ProfitabilityAdImportService,
} from '../profitability-ad-import.service';
import type {
  AdvertisingProfitabilityPlan,
  AdvertisingProfitabilitySourceView,
} from '../../port/in/profitability-ad-import.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000003';
const SLICE_ID = 'account-a:2026-08-01_2026-08-31';

const plan: AdvertisingProfitabilityPlan = {
  attemptId: ATTEMPT_ID,
  attemptToken: ATTEMPT_TOKEN,
  expiresAt: '2026-09-04T10:00:00.000Z',
  mappingGeneration: '7',
  adSourcePolicyHash: 'a'.repeat(64),
  accounts: [{
    channelAccountId: '00000000-0000-4000-8000-000000000010',
    externalAccountId: 'account-a',
    expectedAdvertiserId: 'A0001',
    slices: [{
      sliceId: SLICE_ID,
      from: '2026-08-01',
      to: '2026-08-31',
      businessDates: ['2026-08-01', '2026-08-02'],
    }],
  }],
};

const sourceView: AdvertisingProfitabilitySourceView = {
  latestAttempt: {
    attemptId: ATTEMPT_ID,
    state: 'RUNNING',
    startedAt: '2026-09-04T09:00:00.000Z',
    capturedAt: null,
    expiresAt: plan.expiresAt,
    errorCode: null,
    errorMessage: null,
  },
  latestComplete: null,
  status: 'MISSING',
};

describe('ProfitabilityAdImportService', () => {
  it('returns the same immutable server plan for a retried idempotency key', async () => {
    const repository = {
      beginAttempt: vi.fn().mockResolvedValue(plan),
    };
    const service = new ProfitabilityAdImportService(repository as never);

    const first = await service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'same-key',
    });
    const retry = await service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'same-key',
    });

    expect(retry).toEqual(first);
    expect(repository.beginAttempt).toHaveBeenNthCalledWith(1, {
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'same-key',
    });
    expect(repository.beginAttempt).toHaveBeenNthCalledWith(2, {
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'same-key',
    });
  });

  it('rejects an empty idempotency key before opening a repository transaction', async () => {
    const repository = { beginAttempt: vi.fn() };
    const service = new ProfitabilityAdImportService(repository as never);

    await expect(service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: '   ',
    })).rejects.toThrow('INVALID_IDEMPOTENCY_KEY');
    expect(repository.beginAttempt).not.toHaveBeenCalled();
  });

  it('keeps current status and exact attempt control as separate owner reads', async () => {
    const repository = {
      readSourceStatus: vi.fn().mockResolvedValue(sourceView),
      readAttemptControl: vi.fn().mockResolvedValue(plan),
    };
    const service = new ProfitabilityAdImportService(repository as never);

    await expect(service.readSourceStatus({ organizationId: ORGANIZATION_ID }))
      .resolves.toEqual(sourceView);
    await expect(service.readAttemptControl({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
    })).resolves.toEqual(plan);

    expect(repository.readSourceStatus).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
    });
    expect(repository.readAttemptControl).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
    });
  });

  it('passes the authenticated organization and owner fence to upload and terminal commands', async () => {
    const repository = {
      uploadSlice: vi.fn().mockResolvedValue({ replayed: false }),
      finalizeAttempt: vi.fn().mockResolvedValue(sourceView),
      failAttempt: vi.fn().mockResolvedValue(sourceView),
    };
    const service = new ProfitabilityAdImportService(repository as never);
    const fence = {
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
    };

    await service.uploadSlice({
      ...fence,
      sliceId: SLICE_ID,
      sequence: 1,
      checksum: 'b'.repeat(64),
      providerAdvertiserId: 'A0001',
      reportId: 'report-1',
      campaignCount: 0,
      expectedRowCount: 0,
      collectedRowCount: 0,
      responseBytes: 1,
      rows: [],
    });
    await service.finalizeAttempt(fence);
    await service.failAttempt({ ...fence, code: 'PROVIDER_FAILED', message: 'failed' });

    expect(repository.uploadSlice).toHaveBeenCalledWith(expect.objectContaining(fence));
    expect(repository.finalizeAttempt).toHaveBeenCalledWith(fence);
    expect(repository.failAttempt).toHaveBeenCalledWith({
      ...fence,
      code: 'PROVIDER_FAILED',
      message: 'failed',
    });
  });

  it('rejects malformed provider dates before opening a repository transaction', async () => {
    const repository = { uploadSlice: vi.fn() };
    const service = new ProfitabilityAdImportService(repository as never);

    await expect(service.uploadSlice({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      sliceId: SLICE_ID,
      sequence: 1,
      checksum: 'b'.repeat(64),
      providerAdvertiserId: 'A0001',
      reportId: 'report-1',
      campaignCount: 0,
      expectedRowCount: 1,
      collectedRowCount: 1,
      responseBytes: 1,
      rows: [{
        businessDate: 'not-a-date',
        externalOptionId: 'option-1',
        adSpend: 1,
        impressions: 0,
        clicks: 0,
        orders: 0,
        conversions: 0,
        adRevenue: 0,
      }],
    })).rejects.toThrow('INVALID_PROVIDER_DATE');
    expect(repository.uploadSlice).not.toHaveBeenCalled();
  });

  it('rejects a report proof whose raw counts do not agree before opening a repository transaction', async () => {
    const repository = { uploadSlice: vi.fn() };
    const service = new ProfitabilityAdImportService(repository as never);

    await expect(service.uploadSlice({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      sliceId: SLICE_ID,
      sequence: 1,
      checksum: 'b'.repeat(64),
      providerAdvertiserId: 'A0001',
      reportId: 'report-1',
      campaignCount: 0,
      expectedRowCount: 2,
      collectedRowCount: 1,
      responseBytes: 1,
      rows: [],
    })).rejects.toThrow('INVALID_PROFITABILITY_REPORT_PROOF');
    expect(repository.uploadSlice).not.toHaveBeenCalled();
  });

  it('rejects a report proof that claims more collected rows than it uploads', async () => {
    const repository = { uploadSlice: vi.fn() };
    const service = new ProfitabilityAdImportService(repository as never);

    await expect(service.uploadSlice({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      sliceId: SLICE_ID,
      sequence: 1,
      checksum: 'b'.repeat(64),
      providerAdvertiserId: 'A0001',
      reportId: 'report-1',
      campaignCount: 1,
      expectedRowCount: 2,
      collectedRowCount: 2,
      responseBytes: 1,
      rows: [{
        businessDate: '2026-08-01',
        externalOptionId: 'option-1',
        adSpend: 1,
        impressions: 0,
        clicks: 0,
        orders: 0,
        conversions: 0,
        adRevenue: 0,
      }],
    })).rejects.toThrow('INVALID_PROFITABILITY_REPORT_PROOF');
    expect(repository.uploadSlice).not.toHaveBeenCalled();
  });
});
