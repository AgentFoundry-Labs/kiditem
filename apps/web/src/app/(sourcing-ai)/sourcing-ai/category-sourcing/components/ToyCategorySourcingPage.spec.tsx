import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ToyCategorySourcingPage } from './ToyCategorySourcingPage';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), getNullable: vi.fn(), getParsed: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const STATUS_PATH = '/api/sourcing/trend/status';
const idleStatus = {
  naver: { latestAttempt: null, actualCutoffAt: null },
  shorts: { latestAttempt: null, actualCutoffAt: null },
};
// What the 7-day popular board read returns.
let boards: unknown[];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ToyCategorySourcingPage /></QueryClientProvider>);
  return { ...view, client };
}

/** The value a metric card shows beside its label. */
function metricValue(label: string): string | null | undefined {
  return screen.getByText(label).closest('article')?.querySelector('strong')?.textContent;
}

describe('Toy category rise signal count', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    boards = [];
    vi.mocked(apiClient.getParsed).mockImplementation(async (url) => {
      if (url === STATUS_PATH) return idleStatus;
      throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(apiClient.get).mockImplementation(async (url) => {
      if (url === '/api/sourcing/trend/popular-keywords?days=7') return { days: 7, boards };
      if (url === '/api/sourcing/trend/naver-keywords?days=30') return { days: 30, keywords: [] };
      if (url === '/api/sourcing/trend/seeds') return { seeds: [] };
      throw new Error(`unexpected GET ${url}`);
    });
  });

  it('shows rise signals as unknown, not 0개, while the toy board has no earlier day to compare', async () => {
    // One Naver collection ranked the toy board; no earlier day tells a new entry or a rank rise.
    boards = [{
      boardKey: 'toys_dolls',
      boardLabel: '완구/인형',
      latest: [{ rank: 1, keyword: '말랑이' }],
      comparedFrom: null,
      risers: [],
    }];
    const { client } = renderPage();

    await waitFor(() => expect(metricValue('조건 결과')).toBe('1개'));
    expect(metricValue('상승 신호')).toBe('—');
    client.clear();
  });

  it('counts rise signals once the toy board was compared with an earlier day', async () => {
    boards = [{
      boardKey: 'toys_dolls',
      boardLabel: '완구/인형',
      latest: [{ rank: 1, keyword: '말랑이' }, { rank: 2, keyword: '블록 장난감' }],
      comparedFrom: '2026-09-08',
      risers: [{ keyword: '말랑이', rankDelta: null }],
    }];
    const { client } = renderPage();

    await waitFor(() => expect(metricValue('조건 결과')).toBe('2개'));
    expect(metricValue('상승 신호')).toBe('1개');
    client.clear();
  });
});
