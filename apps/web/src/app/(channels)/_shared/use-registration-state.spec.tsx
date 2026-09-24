import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistrationAccountState } from '@kiditem/shared/sales-product';
import { salesProductKeys } from '@/lib/sales-product-api';
import { REGISTRATION_STATE_POLL_MS, useRegistrationState } from './use-registration-state';

const api = vi.hoisted(() => ({ getParsed: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: (path: string, schema: { parse: (value: unknown) => unknown }) =>
      Promise.resolve(api.getParsed(path)).then((value) => schema.parse(value)),
  },
}));

const SALES_PRODUCT_ID = '00000000-0000-4000-8000-00000000aaaa';
const STATE_PATH = `/api/products/sales-products/${SALES_PRODUCT_ID}/registration/state`;

function account(state: RegistrationAccountState['state']): RegistrationAccountState {
  return {
    channelAccountId: '00000000-0000-4000-8000-000000000001',
    channel: 'mall-a',
    channelAccountName: '몰 A',
    registrationTargetId: '00000000-0000-4000-8000-0000000000a1',
    channelListingId: null,
    externalListingId: null,
    listingState: null,
    listingRawStatus: null,
    listingActive: false,
    state,
    soldOut: false,
    changedSinceRegistration: false,
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    lastExecution: null,
  };
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useRegistrationState', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getParsed.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the per-account state from the one registration-state route under its sales-product key', async () => {
    api.getParsed.mockResolvedValue({ accounts: [account('registered')] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useRegistrationState(SALES_PRODUCT_ID), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    expect(api.getParsed).toHaveBeenCalledWith(STATE_PATH);
    expect(client.getQueryData(salesProductKeys.registrationState(SALES_PRODUCT_ID))).toEqual({
      accounts: [account('registered')],
    });
  });

  it('polls while an account is live and stops once every account settles', async () => {
    api.getParsed
      .mockResolvedValueOnce({ accounts: [account('submitting')] })
      .mockResolvedValue({ accounts: [account('registered')] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useRegistrationState(SALES_PRODUCT_ID), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.accounts[0]?.state).toBe('submitting'));
    await vi.advanceTimersByTimeAsync(REGISTRATION_STATE_POLL_MS);
    await waitFor(() => expect(result.current.accounts[0]?.state).toBe('registered'));
    expect(api.getParsed).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(REGISTRATION_STATE_POLL_MS * 3);
    expect(api.getParsed).toHaveBeenCalledTimes(2);
  });

  it('does not read without a sales product', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useRegistrationState(null), { wrapper: wrapper(client) });
    expect(result.current.accounts).toEqual([]);
    expect(api.getParsed).not.toHaveBeenCalled();
  });
});
