import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { salesProductKeys } from '@/lib/sales-product-api';
import { sourcingApi } from '../lib/sourcing-api';
import { useScrapeUrl } from './useScrapeUrl';

const navigation = vi.hoisted(() => ({ query: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.query),
  usePathname: () => '/product-pipeline/collected-products', useRouter: () => ({ replace: navigation.replace }) }));
vi.mock('../lib/sourcing-api', () => ({ sourcingApi: { scrapeUrl: vi.fn(), scrapeUrlStatus: vi.fn() } }));
const url = 'https://detail.1688.com/offer/123.html';
const missing = { status: 'available', candidateId: null, href: null, platform: '1688',
  source: { ready: false, latestAttempt: null, latestComplete: null, actualCutoffAt: null, errorCode: null, errorMessage: null } };
let client: QueryClient;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return renderHook(() => useScrapeUrl(), { wrapper: ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
beforeEach(() => { vi.clearAllMocks(); navigation.query = '';
  vi.mocked(sourcingApi.scrapeUrlStatus).mockResolvedValue(missing as never); });
afterEach(cleanup);

describe('retained scrape URL action', () => {
  it('reloads owner status from URL and query changes without starting collection', async () => {
    navigation.query = new URLSearchParams({ scrapeUrl: url }).toString();
    const hook = mount();
    await waitFor(() => expect(sourcingApi.scrapeUrlStatus).toHaveBeenCalledWith(url));
    expect(hook.result.current.showScrapeInput).toBe(true);
    navigation.query = new URLSearchParams({ scrapeUrl: `${url}?track=changed` }).toString();
    hook.rerender();
    await waitFor(() => expect(sourcingApi.scrapeUrlStatus).toHaveBeenCalledWith(`${url}?track=changed`));
    expect(sourcingApi.scrapeUrl).not.toHaveBeenCalled();
  });

  it('keeps only URL and request-key correlation after an uncertain request, rechecks status and reuses that key on explicit retry', async () => {
    navigation.query = new URLSearchParams({ scrapeUrl: url }).toString();
    vi.mocked(sourcingApi.scrapeUrl).mockRejectedValue(new Error('response lost'));
    const hook = mount();
    await waitFor(() => expect(sourcingApi.scrapeUrlStatus).toHaveBeenCalledOnce());
    await act(async () => hook.result.current.handleSubmit());
    await waitFor(() => expect(sourcingApi.scrapeUrl).toHaveBeenCalledOnce());
    const key = vi.mocked(sourcingApi.scrapeUrl).mock.calls[0][1];
    expect(key).toBeTruthy();
    await waitFor(() => expect(sourcingApi.scrapeUrlStatus).toHaveBeenCalledTimes(2));
    const saved = new URL(navigation.replace.mock.calls.at(-1)![0], 'https://app.test');
    expect([...saved.searchParams.keys()].sort()).toEqual(['scrapeKey', 'scrapeUrl']);
    hook.unmount(); navigation.query = saved.searchParams.toString();
    const reloaded = mount();
    await waitFor(() => expect(reloaded.result.current.scrapeUrl).toBe(url));
    await act(async () => reloaded.result.current.handleSubmit());
    await waitFor(() => expect(sourcingApi.scrapeUrl).toHaveBeenCalledTimes(2));
    expect(vi.mocked(sourcingApi.scrapeUrl).mock.calls[1]).toEqual([url, key]);
  });

  it('uses a new explicit key after FAILED and displays the last complete cutoff without copying it into the route', async () => {
    navigation.query = new URLSearchParams({ scrapeUrl: url, scrapeKey: 'old-key' }).toString();
    const source = { ...missing.source, ready: false, actualCutoffAt: '2026-09-06T00:00:00Z',
      latestAttempt: { attemptId: 'failed', state: 'FAILED', errorMessage: 'provider unavailable' },
      latestComplete: { attemptId: 'complete', state: 'COMPLETE' }, errorMessage: 'provider unavailable' };
    vi.mocked(sourcingApi.scrapeUrlStatus).mockResolvedValue({ ...missing, source } as never);
    vi.mocked(sourcingApi.scrapeUrl).mockRejectedValue(new Error('response lost'));
    const hook = mount();
    await waitFor(() => expect(hook.result.current.scrapeError).toBe('provider unavailable'));
    expect(hook.result.current.ownerStatus?.actualCutoffAt).toBe(source.actualCutoffAt);
    expect(sourcingApi.scrapeUrl).not.toHaveBeenCalled();
    await act(async () => hook.result.current.handleSubmit());
    await waitFor(() => expect(sourcingApi.scrapeUrl).toHaveBeenCalledOnce());
    expect(vi.mocked(sourcingApi.scrapeUrl).mock.calls[0][1]).not.toBe('old-key');
    const key = vi.mocked(sourcingApi.scrapeUrl).mock.calls[0][1];
    const saved = new URL(navigation.replace.mock.calls.at(-1)![0], 'https://app.test');
    hook.unmount(); navigation.query = saved.searchParams.toString();
    const reloaded = mount();
    await waitFor(() => expect(reloaded.result.current.scrapeError).toBe('provider unavailable'));
    await act(async () => reloaded.result.current.handleSubmit());
    await waitFor(() => expect(sourcingApi.scrapeUrl).toHaveBeenCalledTimes(2));
    expect(vi.mocked(sourcingApi.scrapeUrl).mock.calls[1][1]).toBe(key);
  });
});

describe('URL 수집이 만든 판매상품 초안', () => {
  const attempt = (state: 'RUNNING' | 'COMPLETE') => ({ attemptId: 'attempt-1', state, expiresAt: '', completedAt: null,
    errorCode: null, errorMessage: null });

  it('refreshes the sales-product list after a collect request settles', async () => {
    navigation.query = new URLSearchParams({ scrapeUrl: url }).toString();
    vi.mocked(sourcingApi.scrapeUrl).mockResolvedValue({ ok: true, message: '수집했습니다.', product_id: null, attempt: null } as never);
    const hook = mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await waitFor(() => expect(sourcingApi.scrapeUrlStatus).toHaveBeenCalledOnce());
    await act(async () => hook.result.current.handleSubmit());
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: salesProductKeys.all }));
  });

  it('refreshes the sales-product list when the polled attempt turns COMPLETE', async () => {
    navigation.query = new URLSearchParams({ scrapeUrl: url }).toString();
    vi.mocked(sourcingApi.scrapeUrlStatus)
      .mockResolvedValueOnce({ ...missing, source: { ...missing.source, latestAttempt: attempt('RUNNING') } } as never)
      .mockResolvedValue({ ...missing, status: 'collected', candidateId: 'candidate-1', salesProductId: 'sales-product-1',
        href: '/product-pipeline/collected-products/sales-product-1',
        source: { ...missing.source, ready: true, latestAttempt: attempt('COMPLETE') } } as never);
    mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await waitFor(() => expect(sourcingApi.scrapeUrlStatus).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: salesProductKeys.all }));
  });
});
