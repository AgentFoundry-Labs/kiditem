import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useTrendSourceCollection } from './use-trend-source-collection';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('direct trend collection intent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ naver: { latestAttempt: null, actualCutoffAt: null } });
  });
  it('retires a RUNNING request key after polled FAILED and clears stale errors after a new COMPLETE', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useTrendSourceCollection(), { wrapper });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    vi.mocked(apiClient.post).mockResolvedValue({ results: [{ source: 'naver', attemptId: 'pending', state: 'RUNNING', ok: false }] });
    vi.mocked(apiClient.get).mockResolvedValue({ naver: { latestAttempt: { attemptId: 'pending', state: 'RUNNING', errorMessage: null } } });
    await act(async () => { await result.current.collect(); });
    vi.mocked(apiClient.get).mockResolvedValue({ naver: { latestAttempt: { attemptId: 'pending', state: 'FAILED', errorMessage: 'provider failed' } } });
    await act(async () => { await client.refetchQueries(); });
    await waitFor(() => expect(result.current.error).toBe('provider failed'));
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { await result.current.collect(); });
    const calls = vi.mocked(apiClient.post).mock.calls;
    expect(calls[1][2]).not.toEqual(calls[0][2]);
    expect(result.current.error).toBe('response lost');
    vi.mocked(apiClient.get).mockResolvedValue({ naver: { latestAttempt: { attemptId: 'new-success', state: 'COMPLETE', errorMessage: null } } });
    await act(async () => { await client.refetchQueries(); });
    await waitFor(() => expect(result.current.error).toBeNull());
    client.clear();
  });

  it('reads on mount and retries an uncertain key, then starts a new attempt after terminal failure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useTrendSourceCollection(), { wrapper });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(apiClient.post).not.toHaveBeenCalled();
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { await result.current.collect(); });
    expect(result.current.error).toBe('response lost');
    vi.mocked(apiClient.post).mockResolvedValue({ results: [{ source: 'naver', state: 'FAILED', ok: false, error: 'provider failed' }] });
    await act(async () => { await result.current.collect(); });
    const calls = vi.mocked(apiClient.post).mock.calls;
    expect(calls[0][0]).toBe('/api/sourcing/trend/collect');
    expect(calls[1][2]).toEqual(calls[0][2]);
    expect(result.current.error).toBe('provider failed');
    await act(async () => { await result.current.collect(); });
    expect(calls[2][2]).not.toEqual(calls[0][2]);
    client.clear();
  });
});
