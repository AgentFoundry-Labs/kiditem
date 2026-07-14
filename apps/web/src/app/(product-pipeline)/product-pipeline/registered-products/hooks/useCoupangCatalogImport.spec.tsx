import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useCoupangCatalogImport } from './useCoupangCatalogImport';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => ({
  startCollection: vi.fn(),
  getCollection: vi.fn(),
  startBrowser: vi.fn(),
  getBrowserStatus: vi.fn(),
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
  useBrowserCollectionSession: vi.fn(),
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuthSession: () => ({ session: { access_token: 'test-token' } }),
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: mocks.detectExtensionId,
  isChromeExtensionRuntimeAvailable: mocks.isChromeExtensionRuntimeAvailable,
  sendToExtension: mocks.sendToExtension,
}));

vi.mock('@/hooks/useBrowserCollectionSession', () => ({
  useBrowserCollectionSession: mocks.useBrowserCollectionSession,
}));

vi.mock('../lib/coupang-catalog-import', () => ({
  startCoupangCatalogBrowser: mocks.startBrowser,
  getCoupangCatalogBrowserStatus: mocks.getBrowserStatus,
}));

vi.mock('../lib/channel-listings-api', () => ({
  channelListingsApi: {
    startCoupangCatalogCollection: mocks.startCollection,
    getCoupangCatalogCollection: mocks.getCollection,
  },
}));

describe('useCoupangCatalogImport', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.startCollection.mockResolvedValue({
      id: RUN_ID,
      channelAccountId: ACCOUNT_ID,
      status: 'running',
    });
    mocks.startBrowser.mockResolvedValue('extension-id');
    mocks.detectExtensionId.mockResolvedValue('extension-id');
    mocks.getBrowserStatus.mockResolvedValue({ runId: RUN_ID, status: 'running' });
    mocks.getCollection.mockResolvedValue({
      id: RUN_ID,
      channelAccountId: ACCOUNT_ID,
      status: 'running',
      progress: { publishedProducts: 0 },
    });
    mocks.useBrowserCollectionSession.mockReturnValue({ data: null });
    mocks.isChromeExtensionRuntimeAvailable.mockReturnValue(true);
  });

  it('refetches a previously idle extension status after collection starts', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useCoupangCatalogImport(ACCOUNT_ID),
      { wrapper },
    );

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.coupangCatalogImports.extension(RUN_ID),
      });
    });
    expect(mocks.useBrowserCollectionSession).toHaveBeenCalledWith(RUN_ID);
  });

  it('requires the generic browser session capability before catalog start', async () => {
    const actual = await vi.importActual<
      typeof import('../lib/coupang-catalog-import')
    >('../lib/coupang-catalog-import');
    mocks.detectExtensionId.mockResolvedValue('extension-id');
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      version: '1.2.32',
      capabilities: {
        coupangCatalogSnapshot: true,
        browserCollectionSessions: false,
      },
    });

    await expect(
      actual.startCoupangCatalogBrowser({
        channelAccountId: ACCOUNT_ID,
        runId: RUN_ID,
        accessToken: 'test-token',
      }),
    ).rejects.toThrow('새로고침');
    expect(mocks.sendToExtension).toHaveBeenCalledTimes(1);
  });
});
