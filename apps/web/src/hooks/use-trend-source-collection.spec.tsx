import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import type { TrendSourceCollectionResult } from '@/lib/source-trend-api';
import { useTrendSourceCollection } from './use-trend-source-collection';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));

const STATUS_PATH = '/api/sourcing/trend/status';
const COLLECT_PATH = '/api/sourcing/trend/collect';
const NAVER_ID = '11111111-1111-4111-8111-111111111111';
const SHORTS_ID = '22222222-2222-4222-8222-222222222222';
const NEXT_NAVER_ID = '33333333-3333-4333-8333-333333333333';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = 'RUNNING' | 'COMPLETE' | 'FAILED';

function row(attemptId: string, state: State, errorMessage: string | null = null) {
  return {
    ready: state === 'COMPLETE',
    latestAttempt: { attemptId, state, errorMessage },
    actualCutoffAt: state === 'COMPLETE' ? '2026-09-14T00:00:00.000Z' : null,
  };
}

const empty = { ready: false, latestAttempt: null, actualCutoffAt: null };

let status: Record<string, unknown>;

function TrendControl({
  label,
  sources,
  onSettled,
}: {
  label: string;
  sources?: string[];
  onSettled?: (result: TrendSourceCollectionResult) => void;
}) {
  const trend = useTrendSourceCollection({ sources });
  return (
    <section aria-label={label}>
      <CollectionStartControl
        control={trend.control}
        startLabel="트렌드 수집"
        onStart={() => trend.start(onSettled)}
        onStop={trend.control.stop}
      />
      {trend.error && <p role="alert">{trend.error}</p>}
    </section>
  );
}

function renderControls(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

beforeEach(() => {
  vi.clearAllMocks();
  status = { naver: empty, shorts: empty };
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    if (path === STATUS_PATH) return status;
    throw new Error(`unexpected GET ${path}`);
  });
});

describe('trend collection control', () => {
  it('starts the selected sources once and shows the server-run collection on every copy without a stop', async () => {
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path !== COLLECT_PATH) throw new Error(`unexpected POST ${path}`);
      status = { naver: row(NAVER_ID, 'RUNNING'), shorts: row(SHORTS_ID, 'RUNNING') };
      // The server runs the collection inside this request.
      return new Promise(() => undefined);
    });
    renderControls(
      <>
        <TrendControl label="소싱 홈" />
        <TrendControl label="대시보드" />
      </>,
    );

    fireEvent.click(
      await within(screen.getByRole('region', { name: '소싱 홈' })).findByRole('button', { name: '트렌드 수집' }),
    );

    await waitFor(() => expect(screen.getAllByText('수집 중 · 네이버·쇼츠')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: '수집 중단' })).not.toBeInTheDocument();
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([[
      COLLECT_PATH,
      { sources: ['naver', 'shorts'] },
      { headers: { 'Idempotency-Key': expect.stringMatching(UUID) }, timeoutMs: 15 * 60_000 },
    ]]);
  });

  it('hands the settled result to the screen and refreshes sourcing reads after a newer collection completes', async () => {
    status = { naver: row(NAVER_ID, 'COMPLETE'), shorts: row(SHORTS_ID, 'COMPLETE') };
    const result: TrendSourceCollectionResult = {
      businessDate: '2026-09-14',
      results: [{ source: 'naver', ok: true, collected: 3, attemptId: NEXT_NAVER_ID, state: 'COMPLETE' }],
    };
    vi.mocked(apiClient.post).mockImplementation(async () => {
      status = { naver: row(NEXT_NAVER_ID, 'COMPLETE'), shorts: row(SHORTS_ID, 'COMPLETE') };
      return result;
    });
    const onSettled = vi.fn();
    const { client } = renderControls(
      <TrendControl label="시장분석" sources={['naver']} onSettled={onSettled} />,
    );
    const snapshotKey = queryKeys.sourcing.trendNaverKeywords(30);
    client.setQueryData(snapshotKey, { keywords: [] });

    fireEvent.click(await screen.findByRole('button', { name: '트렌드 수집' }));

    await waitFor(() => expect(onSettled).toHaveBeenCalledWith(result));
    await waitFor(() => expect(client.getQueryState(snapshotKey)?.isInvalidated).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith(COLLECT_PATH, { sources: ['naver'] }, expect.anything());
  });

  it('shows the failure the owner recorded for a selected source', async () => {
    status = { naver: row(NAVER_ID, 'FAILED', '네이버 검색광고 API 키가 없습니다.'), shorts: empty };
    renderControls(<TrendControl label="시장분석" sources={['naver']} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('네이버 검색광고 API 키가 없습니다.');
    expect(screen.getByRole('button', { name: '트렌드 수집' })).toBeEnabled();
  });

  it('shows a trend collection already running on the server instead of starting another', async () => {
    status = { naver: row(NAVER_ID, 'RUNNING'), shorts: empty };
    renderControls(<TrendControl label="대시보드" />);

    expect(await screen.findByText('수집 중 · 네이버')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '트렌드 수집' })).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('explains a start the server could not take in Korean', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError(503, 'Service Unavailable', 'Service Unavailable'));
    renderControls(<TrendControl label="대시보드" />);

    fireEvent.click(await screen.findByRole('button', { name: '트렌드 수집' }));

    expect(await screen.findByText('수집을 시작하지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '트렌드 수집' })).toBeEnabled();
  });
});
