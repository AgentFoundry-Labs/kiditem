import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCommerceSection } from './LiveCommerceSection';

const mocks = vi.hoisted(() => ({
  taobaoStart: vi.fn(),
  fetchStatus: vi.fn(),
  fetchSnapshots: vi.fn(),
  collectBrowser: vi.fn(),
  fetchBrowserStatus: vi.fn(),
}));

vi.mock('../lib/live-commerce-api', () => ({
  fetchLiveCommerceStatus: mocks.fetchStatus,
  collectTaobaoLive: mocks.taobaoStart,
  fetchLiveCommerceSnapshots: mocks.fetchSnapshots,
}));

vi.mock('../../lib/sourcing-live-commerce-source-owner', () => ({
  collectSourcingLiveCommerceFromExtension: mocks.collectBrowser,
  fetchSourcingLiveCommerceSourceStatus: mocks.fetchBrowserStatus,
}));

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
    mocks.collectBrowser.mockResolvedValue({
      success: true,
      attemptId: '00000000-0000-4000-8000-000000000777',
      terminalState: 'COMPLETE',
    });
    mocks.fetchBrowserStatus.mockResolvedValue({
      status: 'READY',
      refreshing: false,
      latestAttempt: { state: 'COMPLETE' },
      latestComplete: { completedAt: '2026-09-04T00:00:00.000Z' },
      actualCutoffAt: '2026-09-04T00:00:00.000Z',
      errorCode: null,
      errorMessage: null,
    });
  });

  it('keeps persisted snapshots on mount and calls only the extension from the explicit browser CTA', async () => {
    const view = renderSection();

    await screen.findByRole('button', { name: '공식 수집' });
    expect(await screen.findByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(mocks.collectBrowser).not.toHaveBeenCalled();
    expect(mocks.taobaoStart).not.toHaveBeenCalled();

    const url = 'https://live.douyin.com/123?token=keep#private';
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), {
      target: { value: url },
    });
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));

    await waitFor(() => expect(mocks.collectBrowser).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String),
      url,
    }));
    expect(screen.getByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchBrowserStatus).toHaveBeenCalledWith(url));
    expect(screen.getByText(/기준 09\.\s*04/)).toBeInTheDocument();

    view.unmount();
    renderSection();
    expect(await screen.findByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(mocks.collectBrowser).toHaveBeenCalledTimes(1);
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
    await screen.findByText('response lost');
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await screen.findByText('provider failed');
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
        status: state === 'FAILED' ? 'STALE' : 'READY', refreshing: state === 'RUNNING',
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
    await screen.findByText('response lost');
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
        status: 'READY', refreshing: state === 'RUNNING',
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
    await screen.findByText('room-a response lost');
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

  it('reuses a fingerprint key after an uncertain extension response and clears it only after a terminal outcome', async () => {
    mocks.collectBrowser
      .mockRejectedValueOnce(new Error('extension response lost'))
      .mockResolvedValueOnce({
        success: true,
        attemptId: '00000000-0000-4000-8000-000000000778',
        terminalState: 'COMPLETE',
      });
    renderSection();
    await screen.findByRole('button', { name: '방송 수집' });
    const url = 'https://live.douyin.com/123';
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), {
      target: { value: url },
    });

    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));
    await waitFor(() => expect(mocks.collectBrowser).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));
    await waitFor(() => expect(mocks.collectBrowser).toHaveBeenCalledTimes(2));

    const [first, second] = mocks.collectBrowser.mock.calls;
    expect(first[0].url).toBe(url);
    expect(second[0].url).toBe(url);
    expect(second[0].idempotencyKey).toBe(first[0].idempotencyKey);
  });

  it('shows stale source status and actual cutoff without replacing a persisted snapshot after a failed refresh', async () => {
    mocks.collectBrowser.mockResolvedValue({
      success: false,
      attemptId: '00000000-0000-4000-8000-000000000779',
      terminalState: 'FAILED',
      error: '브라우저 수집 실패',
    });
    mocks.fetchBrowserStatus.mockResolvedValue({
      status: 'STALE',
      refreshing: false,
      latestAttempt: { state: 'FAILED' },
      latestComplete: { completedAt: '2026-09-03T00:00:00.000Z' },
      actualCutoffAt: '2026-09-03T00:00:00.000Z',
      errorCode: 'SOURCE_COLLECTION_FAILED',
      errorMessage: '브라우저 수집 실패',
    });
    renderSection();
    await screen.findByRole('button', { name: '방송 수집' });
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), {
      target: { value: 'https://live.douyin.com/123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));

    await waitFor(() => expect(screen.getByText(/원천 상태 이상/)).toBeInTheDocument());
    expect(screen.getByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(screen.getByText(/기준 09\.\s*03/)).toBeInTheDocument();
  });
});
