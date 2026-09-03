import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProfitabilityAdImportController } from '../profitability-ad-import.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000003';

describe('ProfitabilityAdImportController', () => {
  it('derives organization scope and never accepts an account plan from the request body', async () => {
    const service = { beginAttempt: vi.fn().mockResolvedValue({ attemptId: ATTEMPT_ID }) };
    const controller = new ProfitabilityAdImportController(service as never);

    await controller.begin(ORGANIZATION_ID, 'same-key');

    expect(service.beginAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'same-key',
    });
  });

  it('uses the token-free current read and the exact control read separately', async () => {
    const service = {
      readSourceStatus: vi.fn().mockResolvedValue({ status: 'MISSING' }),
      readAttemptControl: vi.fn().mockResolvedValue({ attemptId: ATTEMPT_ID }),
    };
    const controller = new ProfitabilityAdImportController(service as never);

    await expect(controller.readSourceStatus(ORGANIZATION_ID)).resolves.toEqual({ status: 'MISSING' });
    await expect(controller.readAttemptControl(ORGANIZATION_ID, ATTEMPT_ID)).resolves.toEqual({
      attemptId: ATTEMPT_ID,
    });

    expect(service.readSourceStatus).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
    expect(service.readAttemptControl).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
    });
  });

  it('returns not found instead of a successful null exact-attempt response', async () => {
    const service = { readAttemptControl: vi.fn().mockResolvedValue(null) };
    const controller = new ProfitabilityAdImportController(service as never);

    await expect(controller.readAttemptControl(ORGANIZATION_ID, ATTEMPT_ID))
      .rejects.toThrow(NotFoundException);
  });

  it('requires the source attempt token for upload and binds route identity', async () => {
    const service = { uploadSlice: vi.fn().mockResolvedValue({ replayed: false }) };
    const controller = new ProfitabilityAdImportController(service as never);

    await controller.uploadSlice(
      ORGANIZATION_ID,
      ATTEMPT_ID,
      'account-a:2026-08-01_2026-08-31',
      ATTEMPT_TOKEN,
      {
        sequence: 1,
        checksum: 'b'.repeat(64),
        providerAdvertiserId: 'A0001',
        reportId: 'report-1',
        campaignCount: 0,
        expectedRowCount: 0,
        collectedRowCount: 0,
        responseBytes: 1,
        rows: [],
      },
    );

    expect(service.uploadSlice).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      sliceId: 'account-a:2026-08-01_2026-08-31',
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
    expect(() => controller.uploadSlice(
      ORGANIZATION_ID,
      ATTEMPT_ID,
      'account-a:2026-08-01_2026-08-31',
      undefined,
      { sequence: 1, checksum: 'b'.repeat(64), providerAdvertiserId: 'A0001', rows: [] },
    )).toThrow(BadRequestException);
  });

  it('rejects an upload without provider report completion proof', () => {
    const service = { uploadSlice: vi.fn() };
    const controller = new ProfitabilityAdImportController(service as never);

    expect(() => controller.uploadSlice(
      ORGANIZATION_ID,
      ATTEMPT_ID,
      'account-a:2026-08-01_2026-08-31',
      ATTEMPT_TOKEN,
      {
        sequence: 1,
        checksum: 'b'.repeat(64),
        providerAdvertiserId: 'A0001',
        rows: [],
      },
    )).toThrow(BadRequestException);
    expect(service.uploadSlice).not.toHaveBeenCalled();
  });

  it('does not allow a client body to override route or organization identity', async () => {
    const service = { uploadSlice: vi.fn().mockResolvedValue({ replayed: false }) };
    const controller = new ProfitabilityAdImportController(service as never);

    expect(() => controller.uploadSlice(
      ORGANIZATION_ID,
      ATTEMPT_ID,
      'account-a:2026-08-01_2026-08-31',
      ATTEMPT_TOKEN,
      {
        organizationId: 'foreign-org',
        attemptId: 'foreign-attempt',
        sliceId: 'foreign-slice',
        sequence: 1,
        checksum: 'b'.repeat(64),
        providerAdvertiserId: 'A0001',
        rows: [],
      },
    )).toThrow(BadRequestException);
    expect(service.uploadSlice).not.toHaveBeenCalled();
  });
});
