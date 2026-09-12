import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { SellochWholesaleCoupangMatches } from './SellochWholesaleCoupangMatches';
import { SellochWholesaleKeywordSearch } from './SellochWholesaleKeywordSearch';
import type { Sourcing1688SearchSnapshot } from '@kiditem/shared/sourcing';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { getParsed: mocks.get, post: mocks.post } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));

const cutoff = '2026-08-14T00:00:00.000Z';
const keywordTargets = Array.from({ length: 12 }, (_, index) => ({
  id: `target-${index}`, targetType: 'keyword', keyword: `중국어 키워드 ${index + 1}`,
  label: `중국어 키워드 ${index + 1}`, source: 'manual', updatedAt: cutoff,
}));
const recommendationItems = Array.from({ length: 25 }, (_, index) => ({
  externalOfferId: `product-${index}`, displayName: `쿠팡 상품 ${index + 1}`,
  sourceKeywords: [`검색어 ${index + 1}`], keyword: `검색어 ${index + 1}`,
  score: 100 - index, grade: 'A', scoreComponents: {}, reasonCodes: [], riskCodes: [],
  imageUrl: null, supplierName: null, rating: null, salePriceKrw: 15900, shippingLabel: null,
}));
const clients: QueryClient[] = [];
let snapshot: Sourcing1688SearchSnapshot;

function mount(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function status(state: 'RUNNING' | 'COMPLETE' | 'FAILED', targetId: string | null = null) {
  return { keyword: targetId ? '검색어 1' : keywordTargets[0].keyword, targetId,
    ready: state === 'COMPLETE',
    refreshing: state === 'RUNNING', latestAttemptId: '00000000-0000-4000-8000-000000000001',
    latestAttemptState: state, actualCutoffAt: cutoff,
    errorCode: state === 'FAILED' ? 'SOURCE_DISABLED' : null,
    errorMessage: state === 'FAILED' ? 'source disabled' : null };
}

describe('1688 source commands and durable screen reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot = { generatedAt: cutoff, sourceStatuses: [status('COMPLETE'), status('COMPLETE', 'product-0::')],
      observations: [
        { keyword: keywordTargets[0].keyword, targetId: null, capturedAt: cutoff, items: [item('persisted keyword offer')] },
        { keyword: '검색어 1', targetId: 'product-0::', capturedAt: cutoff, items: [item('persisted image offer')] },
      ] };
    mocks.get.mockImplementation(async (path: string, schema: { parse: (value: unknown) => unknown }) => {
      if (path.includes('1688-results')) return schema.parse(snapshot);
      if (path.includes('/interests')) return keywordTargets;
      if (path.includes('/recommendations')) return { data: { items: recommendationItems } };
      throw new Error(`Unexpected GET ${path}`);
    });
    mocks.post.mockResolvedValue({ attempts: [], result: null });
  });
  afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

  it('does not collect on mount and sends the original top six keywords only on CTA', async () => {
    mount(<SellochWholesaleKeywordSearch />);
    await screen.findByText('persisted keyword offer');
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '상위 6개 검색' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('/api/sourcing/wholesale/1688/keyword-search',
      { keywords: keywordTargets.slice(0, 6).map((target) => target.keyword) },
      expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } }));
  });

  it('sends at most 24 original ordered image target IDs without waking the keyword browser', async () => {
    mount(<SellochWholesaleCoupangMatches />);
    await screen.findAllByText('persisted image offer');
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '전체 수집' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('/api/sourcing/wholesale/1688/image-matches',
      { targetIds: Array.from({ length: 24 }, (_, i) => `product-${i}::`) }, expect.anything());
  });

  it.each(['keyword', 'image'])('reload retains prior COMPLETE %s offers and shows durable failure and cutoff', async (kind) => {
    snapshot.sourceStatuses = [status('FAILED', kind === 'image' ? 'product-0::' : null)];
    const ui = kind === 'image' ? <SellochWholesaleCoupangMatches /> : <SellochWholesaleKeywordSearch />;
    const first = mount(ui);
    await screen.findAllByText(`persisted ${kind} offer`);
    expect(await screen.findByText(/수집 실패/)).toHaveTextContent('SOURCE_DISABLED');
    expect(screen.getByText(/마지막 완료/)).toHaveTextContent(cutoff);
    first.unmount();
    mount(ui);
    expect(await screen.findByText(/수집 실패/)).toHaveTextContent('SOURCE_DISABLED');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('uses a new key for explicit retry and never promotes an accepted provider receipt over FAILED source state', async () => {
    mocks.post.mockImplementation(async () => {
      snapshot = { ...snapshot, sourceStatuses: [status('FAILED')] };
      return { attempts: [{ attemptId: '00000000-0000-4000-8000-000000000001', state: 'FAILED',
        plan: { keyword: keywordTargets[0].keyword }, completedAt: cutoff, errorCode: 'SOURCE_DISABLED', errorMessage: 'disabled' }],
        result: { outcome: 'complete', units: [{ accepted: 1, outcome: 'complete' }] } };
    });
    mount(<SellochWholesaleKeywordSearch />);
    await screen.findByText('persisted keyword offer');
    fireEvent.click(screen.getAllByRole('button', { name: '검색' })[0]);
    await screen.findAllByText(/수집 실패/);
    expect(screen.getByText('persisted keyword offer')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '검색' })[0]);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[0][1]).toEqual({ keywords: [keywordTargets[0].keyword] });
    expect(mocks.post.mock.calls[0][2].headers['Idempotency-Key']).not.toBe(mocks.post.mock.calls[1][2].headers['Idempotency-Key']);
  });

  it('reuses the same idempotency key for one transport retry', async () => {
    mocks.post.mockRejectedValueOnce(new ApiError(0, 'network_error', 'disconnected'));
    mount(<SellochWholesaleKeywordSearch />);
    await screen.findByText('persisted keyword offer');
    fireEvent.click(screen.getByRole('button', { name: '상위 6개 검색' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2), { timeout: 2500 });
    expect(mocks.post.mock.calls[0][2].headers['Idempotency-Key']).toBe(mocks.post.mock.calls[1][2].headers['Idempotency-Key']);
  });

  it.each(['keyword', 'image'])('replaces prior %s offers with confirmed empty without confusing missing', async (kind) => {
    mocks.post.mockImplementation(async () => {
      snapshot = { ...snapshot, observations: snapshot.observations.map((observation) => ({ ...observation, items: [] })) };
      return { attempts: [], result: null };
    });
    mount(kind === 'image' ? <SellochWholesaleCoupangMatches /> : <SellochWholesaleKeywordSearch />);
    await screen.findAllByText(`persisted ${kind} offer`);
    fireEvent.click(screen.getByRole('button', { name: kind === 'image' ? '전체 수집' : '상위 6개 검색' }));
    await waitFor(() => expect(screen.queryAllByText(`persisted ${kind} offer`)).toHaveLength(0));
    expect(await screen.findByText(kind === 'image' ? '1688 매칭 결과 없음' : '검색 결과가 없습니다. 다른 검색어로 다시 시도해보세요.')).toBeInTheDocument();
    expect(screen.getAllByText(kind === 'image' ? '저장된 매칭 결과 없음' : '아직 저장된 검색 결과가 없습니다.').length).toBeGreaterThan(0);
  });

  it('polls a reloaded RUNNING source to terminal without another collection', async () => {
    snapshot.sourceStatuses = [status('RUNNING')];
    mount(<SellochWholesaleKeywordSearch />);
    await screen.findByText(/수집 중/);
    expect(screen.getByText('persisted keyword offer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상위 6개 검색' })).toBeDisabled();
    snapshot = { ...snapshot, sourceStatuses: [status('FAILED')] };
    await screen.findByText(/수집 실패/, {}, { timeout: 4000 });
    expect(screen.getByRole('button', { name: '상위 6개 검색' })).toBeEnabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('reports an outside-top-six keyword command through its exact RUNNING attempt without changing the visible query', async () => {
    const attempt = { attemptId: '00000000-0000-4000-8000-000000000007', state: 'RUNNING',
      plan: { keyword: keywordTargets[6].keyword }, completedAt: null, errorCode: null, errorMessage: null };
    mocks.post.mockResolvedValue({ attempts: [attempt], result: null });
    const get = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(async (path, schema) => path.includes('/keyword-search/')
      ? schema.parse({ attempt: { ...attempt, state: 'FAILED', errorCode: 'SOURCE_DISABLED' } })
      : get(path, schema));
    mount(<SellochWholesaleKeywordSearch />);
    await screen.findByText('persisted keyword offer');
    fireEvent.click(screen.getAllByRole('button', { name: '조회' })[6]);
    expect(await screen.findByText(/요청 결과.*중국어 키워드 7.*수집 실패/)).toHaveTextContent('SOURCE_DISABLED');
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][1]).toEqual({ keywords: [keywordTargets[6].keyword] });
    const resultPaths = mocks.get.mock.calls.map(([path]) => path as string).filter((path) => path.includes('1688-results'));
    expect(resultPaths.every((path) => !new URL(path, 'http://test').searchParams.getAll('keyword').includes(keywordTargets[6].keyword))).toBe(true);
  });
});

function item(title: string) {
  return { offerId: '123', title, priceCny: null,
    sourceUrl: `https://detail.1688.com/offer/${encodeURIComponent(title)}.html`, imageUrl: null,
    score: 80, monthlySales: null, tradeScore: null, repurchaseRate: null, supplierName: null,
    salesText: null, supplierFactoryUrl: null, supplierTags: [], purchaseTags: [], minOrderQuantity: null,
    shippingFulfillmentRate: null, shippingPickupRate: null, shipFrom: null, serviceScore: null };
}
