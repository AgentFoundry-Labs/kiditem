import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { DRAFT_ID, salesProductDraft } from '@/test/fixtures/sales-product-draft';
import { useProductDetail } from './useProductDetail';

const api = vi.hoisted(() => ({ get: vi.fn(), getParsed: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (path: string) => api.get(path),
    getParsed: (path: string, schema: { parse: (value: unknown) => unknown }) =>
      Promise.resolve(api.getParsed(path)).then((value) => schema.parse(value)),
  },
}));

const MEDIA_PATH = `/api/ai/content-workspaces/by-sales-product/${DRAFT_ID}/registration-media`;
const STATE_PATH = `/api/products/sales-products/${DRAFT_ID}/registration/state`;
const EMPTY_MEDIA = { registrationImages: { primary: [], thumbnail: [], detail: [] }, currentThumbnail: null };

const ACCOUNT = {
  channelAccountId: '00000000-0000-4000-8000-000000000001',
  channel: 'mall-a',
  channelAccountName: '몰 A',
  registrationTargetId: '00000000-0000-4000-8000-0000000000a1',
  channelListingId: '00000000-0000-4000-8000-0000000000c1',
  externalListingId: 'ext-1',
  state: 'registered' as const,
  soldOut: false,
  changedSinceRegistration: true,
  selectedThumbnailAssetId: null,
  selectedDetailPageRevisionId: null,
  lastExecution: null,
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useProductDetail', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.getParsed.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    api.get.mockImplementation(async (path: string) => {
      if (path === MEDIA_PATH) return EMPTY_MEDIA;
      throw new Error(`unexpected GET ${path}`);
    });
  });

  it('shows the per-account registration state from the one reader', async () => {
    api.getParsed.mockImplementation(async (path: string) => {
      if (path === STATE_PATH) return { accounts: [ACCOUNT] };
      return salesProductDraft({ sourceRecordId: null });
    });

    const { result } = renderHook(() => useProductDetail(DRAFT_ID), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.product.registrationAccounts).toEqual([ACCOUNT]);
  });

  it('still opens the workspace when the registration state cannot be read', async () => {
    api.getParsed.mockImplementation(async (path: string) => {
      if (path === STATE_PATH) throw new ApiError(500, 'Internal', 'boom');
      return salesProductDraft({ sourceRecordId: null });
    });

    const { result } = renderHook(() => useProductDetail(DRAFT_ID), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.product.registrationAccounts).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
