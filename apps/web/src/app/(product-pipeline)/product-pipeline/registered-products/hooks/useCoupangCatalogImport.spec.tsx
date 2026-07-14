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
  cancelBrowser: vi.fn(),
  detectExtensionId: vi.fn(),
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuthSession: () => ({ session: { access_token: 'test-token' } }),
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: mocks.detectExtensionId,
}));

vi.mock('../lib/coupang-catalog-import', () => ({
  startCoupangCatalogBrowser: mocks.startBrowser,
  getCoupangCatalogBrowserStatus: mocks.getBrowserStatus,
  cancelCoupangCatalogBrowser: mocks.cancelBrowser,
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
  });
});
