import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchShortsTrends } from '../lib/trend-collection-api';
import { GlobalSourcingOverview } from './GlobalSourcingOverview';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  useAction: vi.fn(),
  fetchNaver: vi.fn(),
}));

vi.mock('@/hooks/use-trend-source-collection', () => ({
  useTrendSourceCollection: mocks.useAction,
}));


vi.mock('../lib/live-naver-market', () => ({
  fetchPersistedNaverMarket: mocks.fetchNaver,
}));

vi.mock('../lib/trend-collection-api', () => ({
  fetch1688HotProducts: vi.fn().mockResolvedValue({ offers: [], capturedAt: null }),
  fetchShortsTrends: vi.fn().mockResolvedValue({ items: [], capturedAt: null }),
}));

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalSourcingOverview />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchNaver.mockResolvedValue({
    source: 'naver-persisted-snapshot',
    generatedAt: '',
    opportunities: [],
    warnings: [],
  });
  mocks.useAction.mockReturnValue({
    control: {
      state: 'idle', statusRead: 'current', running: null, canStop: false, notice: null,
      start: vi.fn(), stop: vi.fn(),
    },
    start: mocks.start,
    isCollecting: false,
    error: null,
    actualCutoffAt: null,
  });
  // No Shorts collection covered the window unless a test says so.
  vi.mocked(fetchShortsTrends).mockResolvedValue({ days: 7, businessDate: null, capturedAt: null, items: [] });
});

describe('GlobalSourcingOverview Naver source boundary', () => {
  it('mounts only the persisted Naver snapshot and starts one exact source request from its CTA', async () => {
    const view = renderOverview();

    await waitFor(() => expect(mocks.fetchNaver).toHaveBeenCalledOnce());
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.useAction).toHaveBeenCalledWith({ sources: ['naver'] });

    fireEvent.click(screen.getByRole('button', { name: '네이버 스냅샷 수집' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());

    view.unmount();
    renderOverview();
    await waitFor(() => expect(mocks.fetchNaver).toHaveBeenCalledTimes(2));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});

describe('GlobalSourcingOverview YouTube Shorts signal', () => {
  /** The global signal card and the YouTube Shorts row of the source coverage. */
  async function shortsViews() {
    const card = (await screen.findByRole('heading', { name: '글로벌 반응' })).closest('section')!;
    const coverage = screen.getByRole('heading', { name: '데이터 소스 커버리지' }).closest('section')!;
    return { card, row: within(coverage).getByText('YouTube Shorts').closest('li')! };
  }

  it('shows a completed Shorts window that stored no video as collected, not as waiting', async () => {
    // A completed collection covered 2026-09-07 and found no stationery or toy video.
    vi.mocked(fetchShortsTrends).mockResolvedValue({ days: 7, businessDate: '2026-09-07', capturedAt: null, items: [] });
    renderOverview();
    const { card, row } = await shortsViews();

    await waitFor(() => expect(card).toHaveTextContent('수집 완료 2026-09-07'));
    expect(card).toHaveTextContent('최근 수집분에 문구·완구 관련 영상이 없습니다.');
    expect(card).not.toHaveTextContent('수집 대기');
    expect(row).toHaveTextContent('수집 스냅샷');
    expect(row).not.toHaveTextContent('수집 대기');
  });

  it('keeps the Shorts signal waiting while no collection covered the window', async () => {
    renderOverview();
    const { card, row } = await shortsViews();
    await waitFor(() => expect(fetchShortsTrends).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(card).toHaveTextContent('수집 대기');
    expect(row).toHaveTextContent('수집 대기');
    // No collection covered the window, so the card cannot say one found nothing.
    expect(card).toHaveTextContent('최근 수집한 유튜브 쇼츠 스냅샷이 없습니다.');
    expect(card).not.toHaveTextContent('최근 수집분에 문구·완구 관련 영상이 없습니다.');
  });

  it('shows a pending Shorts read as loading, not as not collected', async () => {
    vi.mocked(fetchShortsTrends).mockReturnValue(new Promise<never>(() => undefined));
    renderOverview();
    const { card } = await shortsViews();

    expect(card).toHaveTextContent('유튜브 쇼츠 데이터를 불러오는 중입니다.');
    expect(card).not.toHaveTextContent('최근 수집한 유튜브 쇼츠 스냅샷이 없습니다.');
    expect(card).not.toHaveTextContent('최근 수집분에 문구·완구 관련 영상이 없습니다.');
  });

  it('shows a failed Shorts read as failed, not as not collected', async () => {
    vi.mocked(fetchShortsTrends).mockRejectedValue(new Error('shorts read failed'));
    renderOverview();
    const { card } = await shortsViews();

    await waitFor(() => expect(card).toHaveTextContent('유튜브 쇼츠 데이터를 가져오지 못했습니다.'));
    expect(card).not.toHaveTextContent('최근 수집한 유튜브 쇼츠 스냅샷이 없습니다.');
    expect(card).not.toHaveTextContent('최근 수집분에 문구·완구 관련 영상이 없습니다.');
  });
});
