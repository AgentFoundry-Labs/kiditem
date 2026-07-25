import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrepareWingRegistration = vi.hoisted(() => vi.fn());

vi.mock('../lib/wing-registration-flow', () => ({
  prepareWingRegistration: mockPrepareWingRegistration,
}));

import { useWingRegistrationPreparation } from './useWingRegistrationPreparation';

const CANDIDATE = '7dbe40a5-8684-4347-b790-c54f014f627d';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useWingRegistrationPreparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareWingRegistration.mockResolvedValue({
      status: 'processing',
      candidateId: CANDIDATE,
      message: '상세페이지 이미지 준비 중',
    });
  });

  it('polls only while processing and completes the attempt once when ready', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onReady = vi.fn();
    const onError = vi.fn();
    const hook = renderHook(
      () => useWingRegistrationPreparation({ onReady, onError }),
      { wrapper: wrapper(client) },
    );

    act(() => hook.result.current.start(CANDIDATE));
    await waitFor(() => expect(hook.result.current.message).toBe('상세페이지 이미지 준비 중'));

    const query = client.getQueryCache().getAll().find(
      (item) =>
        item.queryKey[0] === 'wing-registration-preparation'
        && item.queryKey[1] === CANDIDATE,
    );
    expect(query).toBeDefined();
    const interval = query!.options.refetchInterval;
    expect(typeof interval === 'function' ? interval(query!) : interval).toBe(2_000);
    expect(mockPrepareWingRegistration).toHaveBeenLastCalledWith(
      CANDIDATE,
      undefined,
      { retryFailed: true },
    );

    await act(async () => {
      await client.refetchQueries({ queryKey: query!.queryKey });
    });
    expect(mockPrepareWingRegistration).toHaveBeenLastCalledWith(
      CANDIDATE,
      undefined,
      { retryFailed: false },
    );

    const draft = { candidateId: CANDIDATE };
    act(() => {
      client.setQueryData(query!.queryKey, { status: 'ready', draft });
    });
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(draft));
    expect(onReady).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(hook.result.current.isPreparing).toBe(false);
    expect(typeof interval === 'function' ? interval(query!) : interval).toBe(false);
  });
});
