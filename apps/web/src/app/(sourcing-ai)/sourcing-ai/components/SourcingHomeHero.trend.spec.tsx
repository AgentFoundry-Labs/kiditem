import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { SourcingHomeHero } from './SourcingHomeHero';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), getNullable: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// The recommendation rail is unrelated to the Hero's Trend collection CTA.
vi.mock('./SourcingHomeRecommendationRail', () => ({ SourcingHomeRecommendationRail: () => null }));

function renderHero() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SourcingHomeHero /></QueryClientProvider>);
  return { ...view, client };
}

describe('Sourcing home direct Trend CTA', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getNullable).mockResolvedValue(null);
    vi.mocked(apiClient.get).mockImplementation(async (url) => {
      if (url === '/api/sourcing/trend/status') return { naver: { latestAttempt: null, actualCutoffAt: null }, shorts: { latestAttempt: null, actualCutoffAt: null } };
      if (url === '/api/ads/keyword-rank/trackers') return [];
      return { keywords: [], boards: [], items: [] };
    });
  });

  it('does not collect on mount or announce success for mixed HTTP-200 owner results', async () => {
    const { client } = renderHero();
    expect(apiClient.post).not.toHaveBeenCalled();
    vi.mocked(apiClient.post).mockResolvedValue({ results: [
      { source: 'naver', state: 'COMPLETE', ok: true, collected: 2 },
      { source: 'shorts', state: 'FAILED', ok: false, collected: 0 },
    ] });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '데이터 수집' })); });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('일부 트렌드 수집에 실패했습니다. 다시 시도해주세요.');
    expect(apiClient.post).toHaveBeenCalledWith('/api/sourcing/trend/collect', { sources: ['naver', 'shorts'] }, expect.any(Object));
    client.clear();
  });

  it('retains the same key after transport uncertainty without a success notification', async () => {
    const { client } = renderHero();
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '데이터 수집' })); });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    vi.mocked(apiClient.post).mockResolvedValue({ results: [{ source: 'naver', state: 'FAILED', ok: false, collected: 0 }] });
    await waitFor(() => expect(screen.getByRole('button', { name: '데이터 수집' })).not.toBeDisabled());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '데이터 수집' })); });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiClient.post).mock.calls[1][2]).toEqual(vi.mocked(apiClient.post).mock.calls[0][2]);
    expect(toast.success).not.toHaveBeenCalled();
    client.clear();
  });

  it.each(['RUNNING', 'COMPLETE'] as const)('reports %s distinctly', async (state) => {
    const { client } = renderHero();
    vi.mocked(apiClient.post).mockResolvedValue({ results: ['naver', 'shorts'].map((source) => ({
      source, state, ok: state === 'COMPLETE', collected: 0, attemptId: source,
    })) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '데이터 수집' })); });
    await waitFor(() => expect(state === 'RUNNING' ? toast.info : toast.success).toHaveBeenCalled());
    if (state === 'RUNNING') {
      expect(toast.info).toHaveBeenCalledWith('트렌드 수집이 진행 중입니다.');
      expect(toast.success).not.toHaveBeenCalled();
    } else {
      expect(toast.success).toHaveBeenCalledWith('트렌드 수집이 완료됐습니다.');
      expect(toast.info).not.toHaveBeenCalled();
    }
    expect(toast.error).not.toHaveBeenCalled();
    client.clear();
  });
});
