import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api-client';
import { recalculateProductAbc } from '../product-abc-api';

vi.mock('../api-client', () => ({
  apiClient: { post: vi.fn() },
}));

describe('recalculateProductAbc', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });

  it('posts only the explicit ABC route without a request deadline', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      outcome: 'PUBLISHED',
      publicationRevision: 5,
      formulaRevision: 2,
      officialCutoff: '2026-08-31',
      classifiedProductCount: 7,
      unclassifiedProductCount: 2,
      changedProductCount: 3,
    });

    await expect(recalculateProductAbc()).resolves.toMatchObject({
      outcome: 'PUBLISHED',
      publicationRevision: 5,
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/products/abc/recalculate',
      undefined,
      { timeoutMs: null },
    );
  });

  it('returns SOURCE_NOT_READY as ordinary 200 data', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      outcome: 'SOURCE_NOT_READY',
      publicationRevision: 4,
      officialCutoff: '2026-07-31',
      actualCutoff: '2026-07-31',
      sources: {
        sellpia: source(false),
        advertising: source(true),
      },
    });

    await expect(recalculateProductAbc()).resolves.toMatchObject({
      outcome: 'SOURCE_NOT_READY',
      sources: { sellpia: { ready: false } },
    });
  });

  it('preserves INPUT_CHANGED 409 for the Product Hub retry message', async () => {
    const conflict = { status: 409, code: 'INPUT_CHANGED' };
    vi.mocked(apiClient.post).mockRejectedValue(conflict);

    let caught: unknown;
    try {
      await recalculateProductAbc();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(conflict);
  });
});

function source(ready: boolean) {
  return {
    ready,
    requiredCutoff: '2026-08-31',
    actualCutoff: '2026-07-31',
    latestAttempt: { state: 'COMPLETE' },
    latestComplete: { actualCutoff: '2026-07-31' },
  } as const;
}
