import type { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdCampaignSyncStatus } from './useAdCampaignSyncStatus';

const mockGetParsed = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: mockGetParsed,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('useAdCampaignSyncStatus', () => {
  beforeEach(() => {
    mockGetParsed.mockReset();
  });

  it('reads the persisted campaign sweep status from the advertising API', async () => {
    mockGetParsed.mockResolvedValue({
      status: 'fresh',
      lastCompletedAt: '2026-07-25T02:00:00.000Z',
      campaignCount: 9,
    });

    const { result } = renderHook(() => useAdCampaignSyncStatus(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      status: 'fresh',
      campaignCount: 9,
    });
    expect(mockGetParsed).toHaveBeenCalledWith(
      '/api/ads/campaigns/sync-status',
      expect.anything(),
    );
  });
});
