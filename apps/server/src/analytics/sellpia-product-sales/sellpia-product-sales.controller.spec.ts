import { describe, expect, it, vi } from 'vitest';
import { SellpiaProductSalesController } from './sellpia-product-sales.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000010';

describe('SellpiaProductSalesController', () => {
  it('passes authenticated organization and Idempotency-Key to the source owner', async () => {
    const source = {
      beginAttempt: vi.fn().mockResolvedValue({ attemptId: ATTEMPT_ID }),
    };
    const controller = new SellpiaProductSalesController({} as never, source as never);
    const body = { normalizedSourceAvailabilityDate: '2026-01-01' };

    await expect(controller.beginAttempt('retry-key', body, ORGANIZATION_ID)).resolves.toEqual({
      attemptId: ATTEMPT_ID,
    });
    expect(source.beginAttempt).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'retry-key',
      body,
    );
  });

  it('fences complete and fail calls with the authenticated organization', async () => {
    const source = {
      submitAttempt: vi.fn().mockResolvedValue({ state: 'COMPLETE' }),
      failAttempt: vi.fn().mockResolvedValue({ state: 'FAILED' }),
    };
    const controller = new SellpiaProductSalesController({} as never, source as never);
    const complete = { attemptToken: 'token' } as never;
    const failure = { attemptToken: 'token', errorCode: 'FAILED', errorMessage: 'failed' } as never;

    await controller.submitAttempt(ATTEMPT_ID, complete, ORGANIZATION_ID);
    await controller.failAttempt(ATTEMPT_ID, failure, ORGANIZATION_ID);

    expect(source.submitAttempt).toHaveBeenCalledWith(ORGANIZATION_ID, ATTEMPT_ID, complete);
    expect(source.failAttempt).toHaveBeenCalledWith(ORGANIZATION_ID, ATTEMPT_ID, failure);
  });

  it('rehydrates the owner token only through the exact authenticated attempt control read', async () => {
    const source = {
      readAttemptControl: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        attemptToken: 'token',
        state: 'RUNNING',
        expiresAt: '2026-09-03T01:30:00.000Z',
        plan: { from: '2026-01-01', to: '2026-08-31', coveredMonths: ['2026-01'] },
      }),
    };
    const controller = new SellpiaProductSalesController({} as never, source as never);

    await expect(controller.readAttemptControl(ATTEMPT_ID, ORGANIZATION_ID)).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      attemptToken: 'token',
      state: 'RUNNING',
      expiresAt: '2026-09-03T01:30:00.000Z',
      plan: { from: '2026-01-01', to: '2026-08-31', coveredMonths: ['2026-01'] },
    });
    expect(source.readAttemptControl).toHaveBeenCalledWith(ORGANIZATION_ID, ATTEMPT_ID);
  });

  it('reads an exact terminal attempt without exposing its owner token', async () => {
    const source = {
      readAttemptStatus: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        state: 'COMPLETE',
        expiresAt: '2026-09-03T01:30:00.000Z',
        capturedAt: '2026-09-03T01:00:00.000Z',
        generation: '7',
        errorCode: null,
        errorMessage: null,
        plan: { from: '2026-01-01', to: '2026-08-31', coveredMonths: ['2026-01'] },
      }),
    };
    const controller = new SellpiaProductSalesController({} as never, source as never);

    await expect(controller.readAttemptStatus(ATTEMPT_ID, ORGANIZATION_ID)).resolves.toMatchObject({
      attemptId: ATTEMPT_ID,
      state: 'COMPLETE',
    });
    expect(source.readAttemptStatus).toHaveBeenCalledWith(ORGANIZATION_ID, ATTEMPT_ID);
  });

  it('keeps the general status response token-free', async () => {
    const source = {
      readSourceStatus: vi.fn().mockResolvedValue({
        latestAttempt: {
          attemptId: ATTEMPT_ID,
          state: 'RUNNING',
          expiresAt: '2026-09-03T01:30:00.000Z',
          capturedAt: '2026-09-03T01:00:00.000Z',
          generation: null,
          errorCode: null,
          errorMessage: null,
          plan: { from: '2026-01-01', to: '2026-08-31', coveredMonths: ['2026-01'] },
        },
        latestComplete: null,
        status: 'MISSING',
      }),
    };
    const controller = new SellpiaProductSalesController({} as never, source as never);

    const response = await controller.readSourceStatus(ORGANIZATION_ID);
    expect(response.latestAttempt).not.toHaveProperty('attemptToken');
    expect(source.readSourceStatus).toHaveBeenCalledWith(ORGANIZATION_ID);
  });
});
