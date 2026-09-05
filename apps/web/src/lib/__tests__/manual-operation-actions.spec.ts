import { beforeEach, describe, expect, it, vi } from 'vitest';
import { operationsApi } from '@/lib/operations-api';
import {
  startSellpiaInventoryRefreshAction,
} from '@/lib/manual-operation-actions';

vi.mock('@/lib/operations-api', () => ({
  operationsApi: { start: vi.fn() },
}));

describe('manual operation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(operationsApi.start).mockResolvedValue({} as never);
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
