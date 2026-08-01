import { beforeEach, describe, expect, it, vi } from 'vitest';
import { operationsApi } from '@/lib/operations-api';
import {
  startSellpiaInventoryRefreshAction,
  startTrendCollectionAction,
} from '@/lib/manual-operation-actions';

vi.mock('@/lib/operations-api', () => ({
  operationsApi: { start: vi.fn() },
}));

describe('manual operation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(operationsApi.start).mockResolvedValue({} as never);
  });

  it('keeps trend input identical while allowing only the trigger surface to differ', async () => {
    await startTrendCollectionAction({
      sourceSurface: 'dashboard',
      sources: ['naver', '1688'],
    });
    await startTrendCollectionAction({
      sourceSurface: 'domain_screen',
      sources: ['naver', '1688'],
    });

    expect(operationsApi.start).toHaveBeenNthCalledWith(
      1,
      'sourcing.collect_daily_trends',
      { sourceSurface: 'dashboard', input: { sources: ['naver', '1688'] } },
    );
    expect(operationsApi.start).toHaveBeenNthCalledWith(
      2,
      'sourcing.collect_daily_trends',
      { sourceSurface: 'domain_screen', input: { sources: ['naver', '1688'] } },
    );
  });

  it('uses the same manual Sellpia reason on either trigger surface', async () => {
    await startSellpiaInventoryRefreshAction({
      sourceSurface: 'dashboard',
      reason: 'manual_request',
    });
    await startSellpiaInventoryRefreshAction({
      sourceSurface: 'domain_screen',
      reason: 'manual_request',
    });

    expect(operationsApi.start).toHaveBeenNthCalledWith(
      1,
      'inventory.refresh_sellpia_snapshot',
      { sourceSurface: 'dashboard', input: { reason: 'manual_request' } },
    );
    expect(operationsApi.start).toHaveBeenNthCalledWith(
      2,
      'inventory.refresh_sellpia_snapshot',
      { sourceSurface: 'domain_screen', input: { reason: 'manual_request' } },
    );
  });
});
