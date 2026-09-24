import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { keywordAnalysisInput } from '../lib/keyword-analysis-snapshot-api';
import { useNaverAnalysisSource } from './use-naver-analysis-source';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('direct Naver analysis intent', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(apiClient.get).mockResolvedValue({ latestAttempt: null }); });
  it('retires a RUNNING request key when polling observes FAILED and clears old errors on a new COMPLETE', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const input = keywordAnalysisInput('related', { keyword: '슬라임' });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useNaverAnalysisSource({ input }), { wrapper });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    vi.mocked(apiClient.post).mockResolvedValue({ attempt: { attemptId: 'pending', state: 'RUNNING', errorMessage: null }, payload: null });
    vi.mocked(apiClient.get).mockResolvedValue({ latestAttempt: { attemptId: 'pending', state: 'RUNNING', errorMessage: null } });
    await act(async () => { await result.current.collect(); });
    vi.mocked(apiClient.get).mockResolvedValue({ latestAttempt: { attemptId: 'pending', state: 'FAILED', errorMessage: 'provider failed' } });
    await act(async () => { await client.refetchQueries(); });
    await waitFor(() => expect(result.current.error).toBe('수집 작업이 실패했습니다. 다시 시도해 주세요.'));
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { await result.current.collect(); });
    const calls = vi.mocked(apiClient.post).mock.calls;
    expect(calls[1][2]).not.toEqual(calls[0][2]);
    expect(result.current.error).toBe('response lost');
    vi.mocked(apiClient.get).mockResolvedValue({ latestAttempt: { attemptId: 'new-success', state: 'COMPLETE', errorMessage: null } });
    await act(async () => { await client.refetchQueries(); });
    await waitFor(() => expect(result.current.error).toBeNull());
    client.clear();
  });

  it('reads on mount, collects only on intent, and reuses an uncertain request key before a new terminal retry', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const input = keywordAnalysisInput('related', { keyword: '슬라임' });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useNaverAnalysisSource({ input }), { wrapper });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(apiClient.post).not.toHaveBeenCalled();
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { await result.current.collect(); });
    expect(result.current.error).toBe('response lost');
    vi.mocked(apiClient.post).mockResolvedValue({ attempt: { state: 'FAILED', errorMessage: 'provider failed' }, payload: null });
    await act(async () => { await result.current.collect(); });
    const calls = vi.mocked(apiClient.post).mock.calls;
    expect(calls[0][0]).toBe('/api/sourcing/keyword-analysis/collect');
    expect(calls[1][2]).toEqual(calls[0][2]);
    expect(result.current.error).toBe('수집 작업이 실패했습니다. 다시 시도해 주세요.');
    await act(async () => { await result.current.collect(); });
    expect(calls[2][2]).not.toEqual(calls[0][2]);
  });
});
