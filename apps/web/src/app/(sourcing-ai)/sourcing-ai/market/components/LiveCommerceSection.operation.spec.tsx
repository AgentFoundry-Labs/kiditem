import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCommerceSection } from './LiveCommerceSection';

const mocks = vi.hoisted(() => ({
  taobaoStart: vi.fn(),
  fetchStatus: vi.fn(),
  fetchSnapshots: vi.fn(),
  startOperation: vi.fn(),
  cancelInExtension: vi.fn(),
  listOperations: vi.fn(),
  cancelOnServer: vi.fn(),
}));

vi.mock('../lib/live-commerce-api', () => ({
  fetchLiveCommerceStatus: mocks.fetchStatus,
  collectTaobaoLive: mocks.taobaoStart,
  fetchLiveCommerceSnapshots: mocks.fetchSnapshots,
}));

vi.mock('@/lib/operation-start', () => ({
  requestOperationStart: mocks.startOperation,
  requestOperationCancel: mocks.cancelInExtension,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (path: string) => mocks.listOperations(path),
    post: (path: string) => mocks.cancelOnServer(path),
  },
}));

const ROOM = 'https://live.douyin.com/123';

function liveOperation(
  id: string,
  status: 'executing' | 'succeeded' | 'failed' | 'cancelled',
  patch: Record<string, unknown> = {},
) {
  return {
    id,
    kind: 'sourcing.live_commerce',
    status,
    lockKeys: ['resource:douyin:abc'],
    plan: { source: 'douyin', pageUrl: ROOM, maxProducts: 100 },
    progress: null,
    result: null,
    window: null,
    errorCode: status === 'cancelled' ? 'USER_CANCELLED' : null,
    errorMessage: null,
    startedAt: '2026-09-04T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-04T00:00:00.000Z',
    expiresAt: '2026-09-04T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LiveCommerceSection />
    </QueryClientProvider>,
  );
}

describe('LiveCommerceSection direct source-owner migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchStatus.mockResolvedValue({
      sources: [
        {
          source: 'taobao',
          connection: 'official-api',
          configured: true,
          missing: [],
          requiresLogin: false,
          latestCapturedAt: null,
        },
        {
          source: '1688',
          connection: 'chrome-extension',
          configured: true,
          missing: [],
          requiresLogin: true,
          latestCapturedAt: null,
        },
      ],
    });
    mocks.fetchSnapshots.mockResolvedValue({
      days: 7,
      broadcasts: [{
        source: 'taobao',
        broadcastId: 'persisted-live',
        title: '보존된 라이브 스냅샷',
        broadcasterName: null,
        coverImageUrl: null,
        sourceUrl: null,
        viewerCount: null,
      }],
      products: [{
        source: 'taobao',
        broadcastId: 'persisted-live',
        productId: 'persisted-product',
        title: '보존된 라이브 상품',
        imageUrl: null,
        priceCny: null,
        sourceUrl: null,
      }],
    });
    mocks.taobaoStart.mockResolvedValue({ attemptId: 'taobao-attempt', state: 'COMPLETE' });
    mocks.startOperation.mockResolvedValue({ outcome: 'started', operationId: '00000000-0000-4000-8000-000000000777' });
    mocks.listOperations.mockResolvedValue({ operations: [] });
    // 이 브라우저에는 그 실행이 없다 — 중단은 서버 cancel로 간다.
    mocks.cancelInExtension.mockRejectedValue(new Error('no extension run'));
  });

  it('keeps persisted snapshots on mount and calls only the extension from the explicit browser CTA', async () => {
    const view = renderSection();

    await screen.findByRole('button', { name: '공식 수집' });
    expect(await screen.findByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(mocks.startOperation).not.toHaveBeenCalled();
    expect(mocks.taobaoStart).not.toHaveBeenCalled();

    const url = 'https://live.douyin.com/123?token=keep#private';
    mocks.listOperations.mockResolvedValue({ operations: [liveOperation('00000000-0000-4000-8000-000000000777', 'succeeded', {
      plan: { source: 'douyin', pageUrl: url, maxProducts: 100 },
      result: { windowEndAt: '2026-09-04T00:00:00.000Z' },
    })] });
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), {
      target: { value: url },
    });
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));

    await waitFor(() => expect(mocks.startOperation).toHaveBeenCalledWith('sourcing.live_commerce', { platform: 'douyin', url }, { capability: 'sourcingOperationKindsV1' }));
    expect(screen.getByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(mocks.listOperations).toHaveBeenCalledWith('/api/operations?kinds=sourcing.live_commerce&limit=20');
    expect(await screen.findByText(/기준 09\.\s*04/)).toBeInTheDocument();

    view.unmount();
    renderSection();
    expect(await screen.findByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(mocks.startOperation).toHaveBeenCalledTimes(1);
  });

  it('uses the direct official CTA with a stable transport key and a new key after terminal failure', async () => {
    mocks.taobaoStart.mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ state: 'FAILED', errorMessage: 'provider failed' })
      .mockResolvedValueOnce({ state: 'COMPLETE' });
    renderSection();
    await screen.findByRole('button', { name: '공식 수집' });
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 수집' })).toBeEnabled());
    expect(mocks.taobaoStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await screen.findByText('타오바오 수집에 실패했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await screen.findByText('수집 작업이 실패했습니다. 다시 시도해 주세요.');
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await waitFor(() => expect(mocks.taobaoStart).toHaveBeenCalledTimes(3));
    const [first, second, third] = mocks.taobaoStart.mock.calls;
    expect(first[0]).toEqual({ liveIds: [] });
    expect(second[1]).toBe(first[1]);
    expect(third[1]).not.toBe(first[1]);
    expect(screen.getByText('보존된 라이브 스냅샷')).toBeInTheDocument();
  });

  it.each(['COMPLETE', 'FAILED'] as const)('uses a new key after a RUNNING replay is observed as %s by polling', async (terminalState) => {
    let state: 'RUNNING' | 'COMPLETE' | 'FAILED' | null = null;
    mocks.fetchStatus.mockImplementation(async () => ({ sources: [{
      source: 'taobao', configured: true, missing: [], connection: 'official-api', requiresLogin: false,
      latestCapturedAt: null,
      sourceStatus: {
        ready: state !== 'FAILED',
        latestAttempt: state ? { attemptId: 'replayed-attempt', state } : null,
        latestComplete: null, actualCutoffAt: null, errorCode: null, errorMessage: null,
      },
    }] }));
    mocks.taobaoStart.mockRejectedValueOnce(new Error('response lost'))
      .mockImplementationOnce(async () => {
        state = 'RUNNING';
        return { attemptId: 'replayed-attempt', state: 'RUNNING' };
      })
      .mockResolvedValueOnce({ attemptId: 'new-attempt', state: 'COMPLETE' });
    renderSection();
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 수집' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await screen.findByText('타오바오 수집에 실패했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '수집 중…' })).toBeDisabled());
    expect(mocks.taobaoStart).toHaveBeenCalledTimes(2);
    expect(mocks.taobaoStart.mock.calls[1][1]).toBe(mocks.taobaoStart.mock.calls[0][1]);

    state = terminalState;
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 수집' })).toBeEnabled(), { timeout: 6_500 });
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await waitFor(() => expect(mocks.taobaoStart).toHaveBeenCalledTimes(3));
    expect(mocks.taobaoStart.mock.calls[2][1]).not.toBe(mocks.taobaoStart.mock.calls[0][1]);
  }, 12_000);

  it('keeps an unrelated uncertain request key when polling terminalizes a confirmed attempt', async () => {
    let state: 'RUNNING' | 'COMPLETE' | null = null;
    mocks.fetchStatus.mockImplementation(async () => ({ sources: [{
      source: 'taobao', configured: true, missing: [], connection: 'official-api', requiresLogin: false,
      latestCapturedAt: null,
      sourceStatus: {
        ready: true,
        latestAttempt: state ? { attemptId: 'room-b-attempt', state } : null,
        latestComplete: null, actualCutoffAt: null, errorCode: null, errorMessage: null,
      },
    }] }));
    mocks.taobaoStart.mockRejectedValueOnce(new Error('room-a response lost'))
      .mockImplementationOnce(async () => {
        state = 'RUNNING';
        return { attemptId: 'room-b-attempt', state: 'RUNNING' };
      })
      .mockResolvedValue({ attemptId: 'completed-attempt', state: 'COMPLETE' });
    renderSection();
    const selectRoom = (room: string) => fireEvent.change(screen.getByPlaceholderText('방송 ID 여러 개: 123, 456'), { target: { value: room } });
    selectRoom('room-a');
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 수집' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await screen.findByText('타오바오 수집에 실패했습니다.');
    selectRoom('room-b');
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 수집' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '수집 중…' })).toBeDisabled());
    state = 'COMPLETE';
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 수집' })).toBeEnabled(), { timeout: 6_500 });
    selectRoom('room-a');
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 수집' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await waitFor(() => expect(mocks.taobaoStart).toHaveBeenCalledTimes(3));
    expect(mocks.taobaoStart.mock.calls[2][1]).toBe(mocks.taobaoStart.mock.calls[0][1]);
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 수집' })).toBeEnabled());
    selectRoom('room-b');
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await waitFor(() => expect(mocks.taobaoStart).toHaveBeenCalledTimes(4));
    expect(mocks.taobaoStart.mock.calls[3][1]).not.toBe(mocks.taobaoStart.mock.calls[1][1]);
  }, 12_000);

  it('refuses a URL that is not a 1688 or Douyin broadcast before asking the extension', async () => {
    renderSection();
    await screen.findByRole('button', { name: '방송 수집' });
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), {
      target: { value: 'https://example.com/live/1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));

    expect(await screen.findByText(/도우인 라이브\(live\.douyin\.com\) 방송 URL을 넣어 주세요/)).toBeInTheDocument();
    expect(mocks.startOperation).not.toHaveBeenCalled();
  });

  it('shows the extension refusal of a valid room URL on the control that sent the start', async () => {
    mocks.startOperation.mockResolvedValue({ outcome: 'refused', message: '이 방송을 이미 수집하고 있습니다.' });
    renderSection();
    await screen.findByRole('button', { name: '방송 수집' });
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), { target: { value: ROOM } });
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));

    expect(await screen.findByText('이 방송을 이미 수집하고 있습니다.')).toBeInTheDocument();
    expect(mocks.startOperation).toHaveBeenCalledWith('sourcing.live_commerce', { platform: 'douyin', url: ROOM }, { capability: 'sourcingOperationKindsV1' });
  });

  it("shows the submitted room's running collection with a stop that ends it through the operation cancel, then shows it stopped", async () => {
    const operationId = '00000000-0000-4000-8000-000000000780';
    mocks.listOperations.mockResolvedValue({ operations: [liveOperation(operationId, 'executing')] });
    mocks.cancelOnServer.mockImplementation(async () => {
      mocks.listOperations.mockResolvedValue({ operations: [liveOperation(operationId, 'cancelled')] });
    });
    renderSection();
    await screen.findByRole('button', { name: '방송 수집' });
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), {
      target: { value: ROOM },
    });
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText(/수집을 중단했습니다\. 저장된 완료본은 유지됩니다\./)).toBeInTheDocument();
    expect(mocks.cancelInExtension).toHaveBeenCalledWith(operationId);
    expect(mocks.cancelOnServer).toHaveBeenCalledWith(`/api/operations/${operationId}/cancel`);
    expect(screen.getByText('보존된 라이브 스냅샷')).toBeInTheDocument();
  });

  it('shows a failed refresh with the last successful cutoff without replacing a persisted snapshot', async () => {
    mocks.listOperations.mockResolvedValue({ operations: [
      liveOperation('00000000-0000-4000-8000-000000000779', 'failed', { errorCode: 'SITE_REQUEST_FAILED', errorMessage: '브라우저 수집 실패' }),
      liveOperation('00000000-0000-4000-8000-000000000770', 'succeeded', { result: { windowEndAt: '2026-09-03T00:00:00.000Z' } }),
    ] });
    renderSection();
    await screen.findByRole('button', { name: '방송 수집' });
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), {
      target: { value: ROOM },
    });
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));

    expect(await screen.findByText(/브라우저 수집 실패/)).toBeInTheDocument();
    expect(screen.getByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(screen.getByText(/기준 09\.\s*03/)).toBeInTheDocument();
  });
});
