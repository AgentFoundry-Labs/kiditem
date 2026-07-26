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
  });

  it('shows extension phases without polling and completes the attempt once', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onReady = vi.fn();
    const onError = vi.fn();
    let finishPreparation!: (value: unknown) => void;
    mockPrepareWingRegistration.mockImplementation(
      async (_candidateId, _defaults, options) => {
        options.onRenderProgress('capturing');
        return new Promise((resolve) => {
          finishPreparation = resolve;
        });
      },
    );
    const hook = renderHook(
      () => useWingRegistrationPreparation({ onReady, onError }),
      { wrapper: wrapper(client) },
    );

    act(() => hook.result.current.start(CANDIDATE));
    await waitFor(() =>
      expect(hook.result.current.message).toBe(
        '상세페이지를 긴 이미지 한 장으로 캡처하고 있습니다.',
      ),
    );

    const query = client.getQueryCache().getAll().find(
      (item) =>
        item.queryKey[0] === 'wing-registration-preparation'
        && item.queryKey[1] === CANDIDATE,
    );
    expect(query).toBeDefined();
    expect(query!.options.refetchInterval).toBe(false);
    expect(mockPrepareWingRegistration).toHaveBeenCalledOnce();
    expect(mockPrepareWingRegistration).toHaveBeenCalledWith(
      CANDIDATE,
      undefined,
      { onRenderProgress: expect.any(Function) },
    );

    const draft = { candidateId: CANDIDATE };
    await act(async () => {
      finishPreparation({ status: 'ready', draft });
    });
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(draft));
    expect(onReady).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(hook.result.current.isPreparing).toBe(false);
    expect(hook.result.current.message).toBeNull();
  });
});
