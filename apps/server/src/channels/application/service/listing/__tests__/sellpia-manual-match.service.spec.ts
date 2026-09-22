import { describe, expect, it, vi } from 'vitest';
import { SellpiaManualMatchService } from '../sellpia-manual-match.service';

const snapshot = {
  source: 'sellpia_product_manual_match' as const,
  version: 1 as const,
  targetCount: 1,
  targetCodes: ['6402-1'],
  rowCount: 0,
  rows: [],
};

describe('SellpiaManualMatchService', () => {
  it('keeps begin idempotency independent from the current inventory snapshot', async () => {
    const repository = {
      getCurrentStatus: vi.fn(),
      beginAttempt: vi.fn().mockResolvedValue({ attemptId: 'attempt-1' }),
    };
    const service = new SellpiaManualMatchService({} as never, repository as never);

    await expect(service.beginAttempt({
      organizationId: 'org-a',
      idempotencyKey: 'retry-key',
    })).resolves.toEqual({ attemptId: 'attempt-1' });
    expect(repository.beginAttempt).toHaveBeenCalledWith({
      organizationId: 'org-a',
      idempotencyKey: 'retry-key',
    });
  });

  it('preserves the sorted, deduplicated target response', async () => {
    const repository = { getCurrentStatus: vi.fn().mockResolvedValue(null) };
    const service = new SellpiaManualMatchService({
      listActiveForMatching: vi.fn().mockResolvedValue([
        { sellpiaInventorySkuId: 'sku-2', code: '6402-2' },
        { sellpiaInventorySkuId: 'sku-1', code: '6402-1' },
        { sellpiaInventorySkuId: 'sku-1-duplicate', code: '6402-1' },
      ]),
    } as never, repository as never);

    await expect(service.targets('org-a')).resolves.toMatchObject({
      targetCount: 2,
      targetCodes: ['6402-1', '6402-2'],
      currentSnapshot: null,
    });
  });

  it('keeps snapshot validation at the owner boundary before terminal publication', async () => {
    const repository = {
      completeAttempt: vi.fn().mockResolvedValue({ attemptId: 'attempt-1' }),
    };
    const service = new SellpiaManualMatchService({} as never, repository as never);

    await expect(service.completeAttempt({
      organizationId: 'org-a',
      attemptId: 'attempt-1',
      attemptToken: 'token-1',
      snapshot: { ...snapshot, targetCount: 2 },
    })).rejects.toMatchObject({ details: expect.objectContaining({
      code: 'sellpia_manual_match_invalid_snapshot',
    }) });
    expect(repository.completeAttempt).not.toHaveBeenCalled();

    await expect(service.completeAttempt({
      organizationId: 'org-a',
      attemptId: 'attempt-1',
      attemptToken: 'token-1',
      snapshot,
    })).resolves.toEqual({ attemptId: 'attempt-1' });
    expect(repository.completeAttempt).toHaveBeenCalledWith({
      organizationId: 'org-a',
      attemptId: 'attempt-1',
      attemptToken: 'token-1',
      snapshot,
    });
  });
});
