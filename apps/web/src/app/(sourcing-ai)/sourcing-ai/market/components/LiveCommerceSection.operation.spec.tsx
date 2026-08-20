import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCommerceSection } from './LiveCommerceSection';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  retryAttention: vi.fn(),
  useAction: vi.fn(),
  fetchStatus: vi.fn(),
  fetchSnapshots: vi.fn(),
}));

vi.mock('../../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: mocks.useAction,
}));

vi.mock('../../components/SourcingOperationRunPanel', () => ({
  SourcingOperationRunPanel: ({
    run,
    onCancel,
    onRetryAttention,
  }: {
    run: { status: string } | null;
    onCancel?: () => void;
    onRetryAttention?: () => void;
  }) => (
    <div>
      <span>live-operation:{run?.status ?? 'none'}</span>
      <button type="button" onClick={onCancel}>live-operation-cancel</button>
      <button type="button" onClick={onRetryAttention}>live-operation-retry</button>
    </div>
  ),
}));

vi.mock('../lib/live-commerce-api', () => ({
  fetchLiveCommerceStatus: mocks.fetchStatus,
  fetchLiveCommerceSnapshots: mocks.fetchSnapshots,
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

describe('LiveCommerceSection operation migration', () => {
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
    mocks.start.mockResolvedValue({ id: 'live-operation-run' });
    mocks.useAction.mockImplementation(() => ({
      run: null,
      start: mocks.start,
      cancel: mocks.cancel,
      retryAttention: mocks.retryAttention,
      isStarting: false,
      isCancelling: false,
      isRetrying: false,
    }));
  });

  it('mounts persisted live snapshots without starting a collection and starts exact operations only from CTAs', async () => {
    const view = renderSection();

    await screen.findByRole('button', { name: '공식 수집' });
    expect(await screen.findByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.useAction).toHaveBeenCalledWith({
      operationKey: 'sourcing.collect_taobao_live',
      input: { liveIds: [] },
      snapshotQueryKey: ['sourcing', 'live-commerce', 'snapshots', 7],
      snapshotQueryKeys: [
        ['sourcing', 'live-commerce', 'status'],
        ['sourcing', 'live-commerce', 'snapshots', 7],
      ],
      wakeBrowserRuntime: false,
    });
    expect(mocks.useAction).toHaveBeenCalledWith({
      operationKey: 'sourcing.collect_live_commerce_url',
      input: { url: '' },
      snapshotQueryKey: ['sourcing', 'live-commerce', 'snapshots', 7],
      snapshotQueryKeys: [
        ['sourcing', 'live-commerce', 'status'],
        ['sourcing', 'live-commerce', 'snapshots', 7],
      ],
    });

    fireEvent.change(screen.getByPlaceholderText('방송 ID 여러 개: 123, 456'), {
      target: { value: '123, 456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '공식 수집' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({ liveIds: ['123', '456'] }));

    fireEvent.change(screen.getByPlaceholderText(/https:\/\/live\.douyin\.com/), {
      target: { value: 'https://live.douyin.com/123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '방송 수집' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({
      url: 'https://live.douyin.com/123',
    }));
    expect(screen.getByText('보존된 라이브 스냅샷')).toBeInTheDocument();

    const cancelButtons = screen.getAllByRole('button', { name: 'live-operation-cancel' });
    const retryButtons = screen.getAllByRole('button', { name: 'live-operation-retry' });
    expect(cancelButtons).toHaveLength(2);
    expect(retryButtons).toHaveLength(2);
    cancelButtons.forEach((button) => fireEvent.click(button));
    retryButtons.forEach((button) => fireEvent.click(button));
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
    expect(mocks.retryAttention).toHaveBeenCalledTimes(2);

    view.unmount();
    renderSection();
    expect(await screen.findByText('보존된 라이브 스냅샷')).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });
});
