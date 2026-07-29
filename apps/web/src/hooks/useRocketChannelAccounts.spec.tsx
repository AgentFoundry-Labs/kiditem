import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useRocketChannelAccounts } from './useRocketChannelAccounts';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: vi.fn(),
    post: vi.fn(),
  },
}));

const coupangAccount = {
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'coupang',
  name: 'Coupang Browser Collection',
  externalAccountId: 'A00057379',
  vendorId: null,
  sellerId: null,
  isPrimary: true,
};

const rocketAccount = {
  id: '22222222-2222-4222-8222-222222222222',
  channel: 'rocket',
  name: '쿠팡 로켓',
  externalAccountId: 'A00057379',
  vendorId: 'A00057379',
  sellerId: null,
  isPrimary: false,
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useRocketChannelAccounts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('automatically bootstraps and selects the internal Rocket account from extension identity', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue([coupangAccount]);
    vi.mocked(apiClient.post).mockResolvedValue(rocketAccount);

    const { result } = renderHook(useRocketChannelAccounts, {
      wrapper: wrapper(makeQueryClient()),
    });

    await waitFor(() => expect(result.current.rocketAccounts).toEqual([rocketAccount]));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/channels/accounts/rocket/bootstrap',
      {},
    );
    expect(result.current.isBootstrapping).toBe(false);
  });

  it('does not bootstrap when a Rocket identity already exists', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue([coupangAccount, rocketAccount]);

    const { result } = renderHook(useRocketChannelAccounts, {
      wrapper: wrapper(makeQueryClient()),
    });

    await waitFor(() => expect(result.current.rocketAccounts).toEqual([rocketAccount]));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('does not invent an account when the extension-detected vendor identity is missing', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue([{
      ...coupangAccount,
      externalAccountId: null,
    }]);

    const { result } = renderHook(useRocketChannelAccounts, {
      wrapper: wrapper(makeQueryClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rocketAccounts).toEqual([]);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
