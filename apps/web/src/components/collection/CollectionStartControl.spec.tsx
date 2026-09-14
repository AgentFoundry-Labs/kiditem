import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestCollectionStart } from '@/lib/collection-start';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import {
  useCollectionSourceControl,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { CollectionStartControl } from './CollectionStartControl';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const EXTENSION_ID = 'kiditem-extension';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_PATH = '/api/spec/source';

type SpecAttempt = {
  attemptId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  startDate: string;
  endDate: string;
};
type SpecStatus = { latestAttempt: SpecAttempt | null; latestComplete: SpecAttempt | null };

function attempt(state: SpecAttempt['state'], attemptId = ATTEMPT_ID): SpecAttempt {
  return { attemptId, state, startDate: '2026-09-01', endDate: '2026-09-07' };
}

let serverStatus: SpecStatus;
let extensionReplies: Record<string, (message: Record<string, unknown>) => unknown>;

const REFUSAL = '쿠팡 광고 캠페인 수집이 수집 창을 쓰고 있습니다. 끝난 뒤 다시 시작해 주세요.';

function startedReply(message: Record<string, unknown>) {
  serverStatus = { ...serverStatus, latestAttempt: attempt('RUNNING') };
  return { success: true, outcome: 'started', producer: message.producer, attemptId: ATTEMPT_ID };
}

function refusedReply(message: Record<string, unknown>) {
  return {
    success: true,
    outcome: 'refused',
    producer: message.producer,
    holder: { producer: 'advertising.ad_sync', name: '쿠팡 광고 캠페인 수집', attemptId: null },
    message: REFUSAL,
  };
}

const specCollection: CollectionSourceAdapter<SpecStatus> = {
  sourceKey: 'advertising.ad_keyword',
  label: '광고 키워드 수집',
  statusQuery: collectionSourceStatusQueryOptions<SpecStatus, Error, SpecStatus, QueryKey>({
    queryKey: ['collection-start-control-spec'],
    queryFn: () => apiClient.get<SpecStatus>(SOURCE_PATH),
  }),
  readRunning: (status) =>
    status.latestAttempt?.state === 'RUNNING'
      ? {
          attemptId: status.latestAttempt.attemptId,
          scopeLabel: `${status.latestAttempt.startDate} ~ ${status.latestAttempt.endDate}`,
        }
      : null,
  start: () => requestCollectionStart('advertising.ad_keyword', {}),
  cancelOnServer: (attemptId) => apiClient.post(`/api/spec/attempts/${attemptId}/cancel`),
  readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
  onNewComplete: (client) => {
    void client.invalidateQueries({ queryKey: ['spec-ledger'] });
  },
};

function SpecControl() {
  const control = useCollectionSourceControl(specCollection);
  return (
    <CollectionStartControl
      control={control}
      startLabel="키워드 수집"
      onStart={() => control.start()}
      onStop={control.stop}
    />
  );
}

function renderControls(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}

function sentMessages(action: string) {
  return vi
    .mocked(sendToExtension)
    .mock.calls.map(([, message]) => message as Record<string, unknown>)
    .filter((message) => message.action === action);
}

beforeEach(() => {
  serverStatus = { latestAttempt: null, latestComplete: null };
  extensionReplies = {
    ping: () => ({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true, collectionStartV1: true },
    }),
    setAuthToken: () => ({ success: true }),
    startCollection: startedReply,
  };
  vi.mocked(detectExtensionId).mockResolvedValue(EXTENSION_ID);
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([EXTENSION_ID]);
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
    const action = (message as { action: string }).action;
    const reply = extensionReplies[action];
    if (!reply) throw new Error(`unexpected extension action ${action}`);
    return reply(message as Record<string, unknown>);
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === SOURCE_PATH) return serverStatus;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CollectionStartControl', () => {
  it('starts through the extension start contract and shows the running scope from the server status', async () => {
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '키워드 수집' }));

    expect(await screen.findByText('수집 중 · 2026-09-01 ~ 2026-09-07')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(sentMessages('startCollection')).toEqual([
      {
        action: 'startCollection',
        producer: 'advertising.ad_keyword',
        idempotencyKey: expect.stringMatching(UUID),
        scope: {},
      },
    ]);
    // The extension opens the attempt; the page never begins one itself.
    expect(vi.mocked(apiClient.post).mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/extension-handoff',
    ]);
  });

  it('asks for an extension update and starts nothing when the extension lacks the start contract', async () => {
    extensionReplies.ping = () => ({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true },
    });
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '키워드 수집' }));

    expect(await screen.findByText('확장 프로그램을 업데이트해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '키워드 수집' })).toBeEnabled();
    expect(sentMessages('startCollection')).toEqual([]);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('releases the start with a Korean reason when the auth handoff passes its deadline', async () => {
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === '/api/auth/extension-handoff') {
        throw new ApiError(0, 'request_timeout', '요청 시간이 초과되었습니다. 다시 시도해주세요.');
      }
      throw new Error(`unexpected POST ${path}`);
    });
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '키워드 수집' }));

    expect(
      await screen.findByText('확장 프로그램에 로그인 정보를 넘기지 못했습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '키워드 수집' })).toBeEnabled();
    expect(sentMessages('startCollection')).toEqual([]);
  });

  it("shows the extension's own reason when it cannot take the start request", async () => {
    extensionReplies.startCollection = () => ({
      success: false,
      errorCode: 'KIDITEM_AUTH_REQUIRED',
      error: 'KidItem 로그인이 필요합니다.',
    });
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '키워드 수집' }));

    expect(await screen.findByText('KidItem 로그인이 필요합니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '키워드 수집' })).toBeEnabled();
  });

  it('asks for an extension update when the start reply does not follow the contract', async () => {
    extensionReplies.startCollection = () => ({ success: true, attemptId: ATTEMPT_ID });
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '키워드 수집' }));

    expect(await screen.findByText('확장 프로그램을 업데이트해 주세요.')).toBeInTheDocument();
  });

  it('blocks a start until the first status read', async () => {
    let answerRead!: (status: SpecStatus) => void;
    vi.mocked(apiClient.get).mockImplementationOnce(
      () => new Promise((resolve) => { answerRead = resolve; }),
    );
    renderControls(<SpecControl />);

    expect(screen.getByRole('button', { name: '상태 확인 중' })).toBeDisabled();
    answerRead({ latestAttempt: null, latestComplete: null });

    expect(await screen.findByRole('button', { name: '키워드 수집' })).toBeEnabled();
  });

  it('keeps the start unavailable while no status has ever been read', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('status read failed'));
    renderControls(<SpecControl />);

    expect(await screen.findByRole('button', { name: '상태 확인 필요' })).toBeDisabled();
    expect(screen.getByText('수집 상태를 불러오지 못했습니다.')).toBeInTheDocument();
  });

  it('keeps acting on the last known status while a later read fails', async () => {
    const { client } = renderControls(<SpecControl />);
    expect(await screen.findByRole('button', { name: '키워드 수집' })).toBeEnabled();

    vi.mocked(apiClient.get).mockRejectedValue(new Error('status read failed'));
    await act(() => client.refetchQueries({ queryKey: ['collection-start-control-spec'] }));

    expect(await screen.findByText('상태를 다시 확인하는 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '키워드 수집' })).toBeEnabled();
  });

  it('names the collection holding the window and clears the reason on the next start', async () => {
    extensionReplies.startCollection = refusedReply;
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '키워드 수집' }));

    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '키워드 수집' })).toBeEnabled();

    extensionReplies.startCollection = startedReply;
    fireEvent.click(screen.getByRole('button', { name: '키워드 수집' }));

    expect(await screen.findByText('수집 중 · 2026-09-01 ~ 2026-09-07')).toBeInTheDocument();
    expect(screen.queryByText(REFUSAL)).not.toBeInTheDocument();
  });

  it('retires a refusal once the source status changes', async () => {
    extensionReplies.startCollection = refusedReply;
    const { client } = renderControls(<SpecControl />);
    fireEvent.click(await screen.findByRole('button', { name: '키워드 수집' }));
    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();

    serverStatus = { latestAttempt: attempt('COMPLETE'), latestComplete: attempt('COMPLETE') };
    await act(() => client.refetchQueries({ queryKey: ['collection-start-control-spec'] }));

    await waitFor(() => expect(screen.queryByText(REFUSAL)).not.toBeInTheDocument());
  });

  it('shows the same starting and running state on every mounted control of a source', async () => {
    let answerStart: (() => void) | null = null;
    extensionReplies.startCollection = (message) =>
      new Promise((resolve) => {
        answerStart = () => resolve(startedReply(message));
      });
    renderControls(
      <>
        <SpecControl />
        <SpecControl />
      </>,
    );
    const [first] = await screen.findAllByRole('button', { name: '키워드 수집' });

    fireEvent.click(first);

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '시작 요청 중…' })).toHaveLength(2),
    );
    for (const button of screen.getAllByRole('button', { name: '시작 요청 중…' })) {
      expect(button).toBeDisabled();
    }
    await waitFor(() => expect(answerStart).not.toBeNull());
    act(() => answerStart?.());
    await waitFor(() =>
      expect(screen.getAllByText('수집 중 · 2026-09-01 ~ 2026-09-07')).toHaveLength(2),
    );
  });

  it('sends one start when two mounted controls ask at the same moment', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const first = renderHook(() => useCollectionSourceControl(specCollection), { wrapper });
    const second = renderHook(() => useCollectionSourceControl(specCollection), { wrapper });
    await waitFor(() => {
      expect(first.result.current.state).toBe('idle');
      expect(second.result.current.state).toBe('idle');
    });

    act(() => {
      first.result.current.start();
      second.result.current.start();
    });

    await waitFor(() => expect(second.result.current.state).toBe('running'));
    expect(sentMessages('startCollection')).toHaveLength(1);
  });
});

describe('CollectionStartControl stop', () => {
  const CANCEL_PATH = `/api/spec/attempts/${ATTEMPT_ID}/cancel`;

  function cancelled(): SpecStatus {
    return { latestAttempt: attempt('FAILED'), latestComplete: null };
  }

  beforeEach(() => {
    serverStatus = { latestAttempt: attempt('RUNNING'), latestComplete: null };
  });

  it('stops through the owner route when the extension holds no session, showing stopping on every control', async () => {
    extensionReplies.cancelCollectionSession = () => ({
      success: false,
      error: 'Collection session not found',
    });
    let answerCancel: (() => void) | null = null;
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path !== CANCEL_PATH) return Promise.reject(new Error(`unexpected POST ${path}`));
      return new Promise((resolve) => {
        answerCancel = () => {
          serverStatus = cancelled();
          resolve(serverStatus.latestAttempt);
        };
      });
    });
    renderControls(
      <>
        <SpecControl />
        <SpecControl />
      </>,
    );
    const [stop] = await screen.findAllByRole('button', { name: '수집 중단' });

    fireEvent.click(stop);

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '중단 요청 중…' })).toHaveLength(2),
    );
    await waitFor(() => expect(answerCancel).not.toBeNull());
    act(() => answerCancel?.());
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '키워드 수집' })).toHaveLength(2),
    );
    expect(sentMessages('cancelCollectionSession')).toEqual([
      { action: 'cancelCollectionSession', attemptId: ATTEMPT_ID },
    ]);
  });

  it('stops through the owner route when no extension is connected', async () => {
    vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([]);
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== CANCEL_PATH) throw new Error(`unexpected POST ${path}`);
      serverStatus = cancelled();
      return serverStatus.latestAttempt;
    });
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '키워드 수집' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledWith(CANCEL_PATH);
  });

  it('leaves the owner route alone when the extension stops its own session', async () => {
    extensionReplies.cancelCollectionSession = () => {
      serverStatus = cancelled();
      return { success: true };
    };
    extensionReplies.getCollectionSession = () => null;
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '키워드 수집' })).toBeEnabled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("uses the source's own extension stop and hands both stops the status the stop was decided against", async () => {
    const running = serverStatus;
    const cancelInExtension = vi.fn(async () => {
      throw new Error('extension could not stop the batch');
    });
    const cancelOnServer = vi.fn(async () => {
      serverStatus = cancelled();
    });
    function OwnStopControl() {
      const control = useCollectionSourceControl({ ...specCollection, cancelInExtension, cancelOnServer });
      return (
        <CollectionStartControl
          control={control}
          startLabel="키워드 수집"
          onStart={() => control.start()}
          onStop={control.stop}
        />
      );
    }
    renderControls(<OwnStopControl />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '키워드 수집' })).toBeEnabled();
    expect(cancelInExtension).toHaveBeenCalledWith(ATTEMPT_ID, { status: running });
    expect(cancelOnServer).toHaveBeenCalledWith(ATTEMPT_ID, { status: running });
    expect(sentMessages('cancelCollectionSession')).toEqual([]);
  });

  it('reports a stop that could not reach the owner while the collection keeps running', async () => {
    extensionReplies.cancelCollectionSession = () => ({
      success: false,
      error: 'Collection session not found',
    });
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network down'));
    renderControls(<SpecControl />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(
      await screen.findByText('수집을 중단하지 못했습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(screen.getByText('수집 중 · 2026-09-01 ~ 2026-09-07')).toBeInTheDocument();
  });
});

describe('CollectionStartControl without a stop', () => {
  function renderAdapter(adapter: CollectionSourceAdapter<SpecStatus>) {
    function AdapterControl() {
      const control = useCollectionSourceControl(adapter);
      return (
        <CollectionStartControl
          control={control}
          startLabel="키워드 수집"
          onStart={() => control.start()}
          onStop={control.stop}
        />
      );
    }
    return renderControls(<AdapterControl />);
  }

  beforeEach(() => {
    serverStatus = { latestAttempt: attempt('RUNNING'), latestComplete: null };
  });

  it('shows a running collection without a stop when the owner has no operator stop', async () => {
    const { cancelOnServer: _cancelOnServer, ...serverRun } = specCollection;
    renderAdapter(serverRun);

    expect(await screen.findByText('수집 중 · 2026-09-01 ~ 2026-09-07')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수집 중단' })).not.toBeInTheDocument();
  });

  it('shows a running collection whose attempt the owner does not name without a stop', async () => {
    renderAdapter({
      ...specCollection,
      readRunning: (status) =>
        status.latestAttempt?.state === 'RUNNING' ? { attemptId: null, scopeLabel: null } : null,
    });

    expect(await screen.findByText('수집 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수집 중단' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '키워드 수집' })).not.toBeInTheDocument();
  });

  it('decides a start against the status it last read', async () => {
    serverStatus = { latestAttempt: attempt('FAILED'), latestComplete: null };
    const start = vi.fn(async () => ({ outcome: 'started' as const, attemptId: null }));
    renderAdapter({ ...specCollection, start });

    fireEvent.click(await screen.findByRole('button', { name: '키워드 수집' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(undefined, {
      status: { latestAttempt: attempt('FAILED'), latestComplete: null },
    });
  });
});

describe('CollectionStartControl polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads a running collection's owner status every two seconds without the source asking, and stops once it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serverStatus = { latestAttempt: attempt('RUNNING'), latestComplete: null };
    renderControls(<SpecControl />);
    expect(await screen.findByText('수집 중 · 2026-09-01 ~ 2026-09-07')).toBeInTheDocument();
    const reads = () => vi.mocked(apiClient.get).mock.calls.length;

    const whileRunning = reads();
    await act(() => vi.advanceTimersByTimeAsync(2_100));
    expect(reads()).toBeGreaterThan(whileRunning);

    serverStatus = { latestAttempt: attempt('COMPLETE'), latestComplete: attempt('COMPLETE') };
    await act(() => vi.advanceTimersByTimeAsync(2_100));
    expect(await screen.findByRole('button', { name: '키워드 수집' })).toBeEnabled();
    const afterEnd = reads();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reads()).toBe(afterEnd);
  });
});

describe('CollectionStartControl completion', () => {
  const statusKey = ['collection-start-control-spec'];
  const ledgerKey = ['spec-ledger'];

  it('refreshes the source readers only when a new complete appears after the first read', async () => {
    serverStatus = { latestAttempt: attempt('COMPLETE'), latestComplete: attempt('COMPLETE') };
    const { client } = renderControls(<SpecControl />);
    client.setQueryData(ledgerKey, { rows: [] });
    expect(await screen.findByRole('button', { name: '키워드 수집' })).toBeEnabled();

    // Reading again the COMPLETE this page already shows is not a new collection.
    await act(() => client.refetchQueries({ queryKey: statusKey }));
    expect(client.getQueryState(ledgerKey)?.isInvalidated).toBe(false);

    const next = attempt('COMPLETE', '22222222-2222-4222-8222-222222222222');
    serverStatus = { latestAttempt: next, latestComplete: next };
    await act(() => client.refetchQueries({ queryKey: statusKey }));

    await waitFor(() => expect(client.getQueryState(ledgerKey)?.isInvalidated).toBe(true));
  });
});
