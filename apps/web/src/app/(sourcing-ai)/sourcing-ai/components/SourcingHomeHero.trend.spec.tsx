import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { SourcingHomeHero } from './SourcingHomeHero';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), getNullable: vi.fn(), getParsed: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// The recommendation rail is unrelated to the Hero's Trend collection CTA.
vi.mock('./SourcingHomeRecommendationRail', () => ({ SourcingHomeRecommendationRail: () => null }));

const STATUS_PATH = '/api/sourcing/trend/status';
const idle = {
  naver: { latestAttempt: null, latestComplete: null, actualCutoffAt: null },
  shorts: { latestAttempt: null, latestComplete: null, actualCutoffAt: null },
};
let status: Record<string, unknown>;

function renderHero() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SourcingHomeHero /></QueryClientProvider>);
  return { ...view, client };
}

/** The count badge of a rank board column: `N개`, or `-` when nothing was measured. */
function columnCount(label: string): string | null {
  const column = screen.getByText(label).closest('section')!;
  return within(column).getByText(/^(-|[\d,]+개)$/).textContent;
}

/** A loading card also reads `-`, so assert only once every read has landed. */
async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('Sourcing home trend control', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    status = idle;
    vi.mocked(apiClient.getNullable).mockResolvedValue(null);
    vi.mocked(apiClient.getParsed).mockImplementation(async (url) => {
      if (url === STATUS_PATH) return status;
      throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(apiClient.get).mockImplementation(async (url) => {
      if (url === '/api/ads/keyword-rank/trackers') return [];
      return { keywords: [], boards: [], items: [] };
    });
  });

  it('does not collect on mount and starts the default trend sources only from the explicit CTA', async () => {
    vi.mocked(apiClient.post).mockImplementation(() => {
      status = {
        naver: { latestAttempt: { attemptId: 'naver-run', state: 'RUNNING', errorMessage: null }, actualCutoffAt: null },
        shorts: { latestAttempt: { attemptId: 'shorts-run', state: 'RUNNING', errorMessage: null }, actualCutoffAt: null },
      };
      return new Promise(() => undefined);
    });
    const { client } = renderHero();
    expect(apiClient.post).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: '데이터 수집' }));

    expect(await screen.findByText('수집 중 · 네이버·쇼츠')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/sourcing/trend/collect', { sources: ['naver', 'shorts'] }, expect.any(Object));
    expect(screen.queryByRole('button', { name: '수집 중단' })).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    client.clear();
  });

  it('keeps the start available and names the failure when the server cannot take it', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('response lost'));
    const { client } = renderHero();

    fireEvent.click(await screen.findByRole('button', { name: '데이터 수집' }));

    expect(await screen.findByText('수집을 시작하지 못했습니다.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '데이터 수집' })).toBeEnabled());
    expect(toast.success).not.toHaveBeenCalled();
    client.clear();
  });
});

describe('Sourcing home rank board counts', () => {
  const complete = (attemptId: string) => ({
    latestAttempt: { attemptId, state: 'COMPLETE', errorMessage: null },
    latestComplete: { attemptId, state: 'COMPLETE' },
    actualCutoffAt: '2026-09-14T15:00:00.000Z',
  });
  // What the 7-day board read and the 30-day Shorts read return.
  let boards: unknown[];
  let shorts: Record<string, unknown>;

  beforeEach(() => {
    vi.resetAllMocks();
    status = idle;
    boards = [];
    shorts = { days: 30, businessDate: null, capturedAt: null, items: [] };
    vi.mocked(apiClient.getNullable).mockResolvedValue(null);
    vi.mocked(apiClient.getParsed).mockImplementation(async (url) => {
      if (url === STATUS_PATH) return status;
      throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(apiClient.get).mockImplementation(async (url) => {
      if (url === '/api/ads/keyword-rank/trackers') return [];
      if (url === '/api/sourcing/trend/popular-keywords?days=7') return { days: 7, boards };
      if (url === '/api/sourcing/trend/shorts?days=30') return shorts;
      if (url === '/api/sourcing/trend/naver-keywords?days=30') return { days: 30, keywords: [] };
      throw new Error(`unexpected GET ${url}`);
    });
  });

  it('shows a card whose trend source never completed as -, not 0개', async () => {
    const { client } = renderHero();
    await settle(client);

    // Naver feeds the keyword boards, Shorts the SNS card; no rising snapshot exists.
    for (const label of ['급상승 후보', '신규 키워드', 'SNS 소셜 인기', '인기 키워드']) {
      expect(columnCount(label)).toBe('-');
    }
    // Trackers are an operator list the read returned, so its empty count is measured.
    expect(columnCount('추적 키워드')).toBe('0개');
    client.clear();
  });

  it('shows a source whose last completion predates its read window as -, not 0개', async () => {
    // The status still names each source's older completion, but Naver last
    // collected 8 days ago and Shorts 31, so neither window read holds any of it.
    status = { naver: complete('naver-8-days-ago'), shorts: complete('shorts-31-days-ago') };
    const { client } = renderHero();
    await settle(client);

    expect(['신규 키워드', 'SNS 소셜 인기', '인기 키워드'].map(columnCount)).toEqual(['-', '-', '-']);
    client.clear();
  });

  it('counts the keyword cards from covered Naver boards while Shorts never collected', async () => {
    status = { ...idle, naver: complete('naver-done') };
    boards = [{
      boardKey: 'toys_dolls',
      boardLabel: '완구',
      latest: [{ rank: 1, keyword: '레고' }, { rank: 2, keyword: '슬라임' }],
      risers: [{ keyword: '슬라임', rankDelta: null }],
    }];
    const { client } = renderHero();
    await settle(client);

    expect(['신규 키워드', '인기 키워드', 'SNS 소셜 인기'].map(columnCount)).toEqual(['1개', '2개', '-']);
    client.clear();
  });

  it('counts the SNS card from a Shorts snapshot while Naver never collected', async () => {
    status = { ...idle, shorts: complete('shorts-done') };
    shorts = {
      days: 30,
      businessDate: '2026-09-14',
      capturedAt: '2026-09-14T06:00:00.000Z',
      items: [
        { videoKey: 'video-1', keyword: '슬라임', viewCount: 12_000 },
        { videoKey: 'video-2', keyword: '슬라임', viewCount: 3_000 },
        { videoKey: 'video-3', keyword: '레고', viewCount: 500 },
      ],
    };
    const { client } = renderHero();
    await settle(client);

    expect(['SNS 소셜 인기', '신규 키워드', '인기 키워드'].map(columnCount)).toEqual(['2개', '-', '-']);
    client.clear();
  });

  it('keeps a covered read that found nothing as 0개', async () => {
    status = { naver: complete('naver-done'), shorts: complete('shorts-done') };
    // A covered board that ranked no keyword, and a Shorts snapshot day none of
    // whose videos matched a stationery or toy trend.
    boards = [{ boardKey: 'toys_dolls', boardLabel: '완구', latest: [], risers: [] }];
    shorts = { days: 30, businessDate: '2026-09-14', capturedAt: '2026-09-14T06:00:00.000Z', items: [] };
    vi.mocked(apiClient.getNullable).mockResolvedValue({ model: { candidates: [] } } as never);
    const { client } = renderHero();
    await settle(client);

    for (const label of ['급상승 후보', '신규 키워드', 'SNS 소셜 인기', '추적 키워드', '인기 키워드']) {
      expect(columnCount(label)).toBe('0개');
    }
    client.clear();
  });
});
