import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const RUN_ID = '06d1a75b-cbe6-4510-9e8a-2926a2aac321';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  useCatalogImport: vi.fn(),
  sendControl: vi.fn(),
  syncAlert: vi.fn(),
  updateCache: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('../hooks/useCoupangCatalogImport', () => ({
  useCoupangCatalogImport: mocks.useCatalogImport,
}));

vi.mock('../lib/channel-listings-api', () => ({
  channelListingsApi: { listAccounts: mocks.listAccounts },
}));

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/browser-collection-session')>()),
  sendBrowserCollectionControl: mocks.sendControl,
  syncBrowserCollectionAlert: mocks.syncAlert,
  updateBrowserCollectionSessionCache: mocks.updateCache,
}));

vi.mock('@/components/browser-collection/BrowserCollectionRunControls', () => ({
  BrowserCollectionRunControls: ({ showCancel }: { showCancel?: boolean }) => (
    <div data-testid="run-controls" data-show-cancel={String(showCancel)} />
  ),
}));

import { CoupangCatalogImportPanel } from './CoupangCatalogImportPanel';

function session(): BrowserCollectionSessionView {
  return {
    runId: RUN_ID,
    producer: 'channels.coupang_catalog',
    classification: 'background_preferred',
    status: 'running',
    attempt: 1,
    restartStrategy: 'extension',
    progress: {
      current: 400,
      total: 1_228,
      completed: 400,
      failed: 0,
      label: 'Wing 상품 상세 수집',
    },
    inputIdentity: { channelAccountId: ACCOUNT_ID },
    attention: null,
    startedAt: 1,
    updatedAt: 2,
    finishedAt: null,
  };
}

function cancelledSession(): BrowserCollectionSessionView {
  return {
    ...session(),
    status: 'cancelled',
    updatedAt: 3,
    finishedAt: 3,
  };
}

describe('CoupangCatalogImportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAccounts.mockResolvedValue([
      { id: ACCOUNT_ID, channel: 'coupang', name: 'Coupang Wing', isPrimary: true },
    ]);
    mocks.sendControl.mockResolvedValue(cancelledSession());
    mocks.syncAlert.mockResolvedValue(undefined);
    mocks.useCatalogImport.mockReturnValue({
      activeRun: { channelAccountId: ACCOUNT_ID, runId: RUN_ID },
      serverStatus: {
        id: RUN_ID,
        status: 'running',
        phase: 'hydration',
        manifest: { totalItems: 1_228 },
        progress: {
          discoveredProducts: 1_228,
          hydratedProducts: 400,
          publishedProducts: 400,
          publishedOptionCount: 522,
          publishedMediaCount: 2_100,
          firstPublishedAt: '2026-07-15T00:00:00.000Z',
        },
        createdAt: '2026-07-15T00:00:00.000Z',
        error: null,
        publication: null,
      },
      extensionStatus: { runId: RUN_ID, status: 'running' },
      collectionSession: { data: session() },
      isStarting: false,
      startError: null,
      start: vi.fn(),
      reset: vi.fn(),
    });
  });

  it('keeps a collecting status button visible with cancellation beside it', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <CoupangCatalogImportPanel />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: '수집 중' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수집 재개' })).not.toBeInTheDocument();
    expect(screen.getByTestId('run-controls')).toHaveAttribute(
      'data-show-cancel',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: '수집 중단' }));
    await waitFor(() => {
      expect(mocks.sendControl).toHaveBeenCalledWith(
        RUN_ID,
        'cancelCollectionSession',
      );
    });
    expect(mocks.syncAlert).toHaveBeenCalled();
  });

  it('treats an asynchronous cancellation response as a submitted stop request', async () => {
    mocks.sendControl.mockResolvedValueOnce(null);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(
      <QueryClientProvider client={queryClient}>
        <CoupangCatalogImportPanel />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        '쿠팡 상품 수집 중단을 요청했습니다.',
      );
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.browserCollection.session(RUN_ID),
    });
  });
});
