import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useInteractionBootstrap } from '../useInteractionBootstrap';
import { bootstrap, makeQueryClient, queryWrapper } from './test-fixtures';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn() },
}));

describe('useInteractionBootstrap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deduplicates and validates the read-only bootstrap through React Query', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue(bootstrap);
    const queryClient = makeQueryClient();

    const first = renderHook(useInteractionBootstrap, { wrapper: queryWrapper(queryClient) });
    const second = renderHook(useInteractionBootstrap, { wrapper: queryWrapper(queryClient) });

    await waitFor(() => expect(first.result.current.data).toEqual(bootstrap));
    await waitFor(() => expect(second.result.current.data).toEqual(bootstrap));
    expect(apiClient.getParsed).toHaveBeenCalledTimes(1);
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/agent-os/interaction/bootstrap',
      expect.objectContaining({ parse: expect.any(Function) }),
    );
    expect(queryKeys.agentInteraction.bootstrap()).toEqual([
      'agent-interaction',
      'bootstrap',
    ]);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('surfaces schema drift instead of caching an invalid response', async () => {
    vi.mocked(apiClient.getParsed).mockRejectedValue(new Error('schema drift'));

    const { result } = renderHook(useInteractionBootstrap, {
      wrapper: queryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
