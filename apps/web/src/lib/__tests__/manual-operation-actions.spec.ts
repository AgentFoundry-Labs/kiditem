import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectTrendSources } from '@/lib/source-trend-api';
import { operationsApi } from '@/lib/operations-api';
import {
  startSellpiaInventoryRefreshAction,
  startTrendCollectionAction,
} from '@/lib/manual-operation-actions';

vi.mock('@/lib/operations-api', () => ({
  operationsApi: { start: vi.fn() },
}));

vi.mock('@/lib/source-trend-api', () => ({ collectTrendSources: vi.fn() }));

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

    expect(collectTrendSources).toHaveBeenNthCalledWith(1, ['naver', '1688']);
    expect(collectTrendSources).toHaveBeenNthCalledWith(2, ['naver', '1688']);
    expect(operationsApi.start).not.toHaveBeenCalled();
  });

  it('uses the same manual Sellpia reason on either trigger surface', async () => {
    await startSellpiaInventoryRefreshAction({
      sourceSurface: 'dashboard',
      reason: 'manual_request',
      scope: 'inventory',
    });
    await startSellpiaInventoryRefreshAction({
      sourceSurface: 'domain_screen',
      reason: 'manual_request',
      scope: 'full',
    });

    expect(operationsApi.start).toHaveBeenNthCalledWith(
      1,
      'inventory.refresh_sellpia_snapshot',
      { sourceSurface: 'dashboard', input: { reason: 'manual_request', scope: 'inventory' } },
    );
    expect(operationsApi.start).toHaveBeenNthCalledWith(
      2,
      'inventory.refresh_sellpia_snapshot',
      { sourceSurface: 'domain_screen', input: { reason: 'manual_request', scope: 'full' } },
    );
  });
});
