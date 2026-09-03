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
});
