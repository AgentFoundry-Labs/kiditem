import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import {
  DRAFT_CANDIDATE_ID,
  DRAFT_ID,
  salesProductDraft,
  salesProductDraftListItem,
} from '@/test/fixtures/sales-product-draft';
import SourcingPage from './page';

const { api, push, toastError, toastSuccess, toastWarning, createRequestId } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    getParsed: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  createRequestId: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/secure-random-uuid', () => ({ createSecureRandomUuid: createRequestId }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/product-pipeline/collected-products',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess, warning: toastWarning, info: vi.fn() },
}));

const SECOND_DRAFT_ID = '10000000-0000-4000-8000-000000000002';
const SECOND_CANDIDATE_ID = '20000000-0000-4000-8000-000000000002';

function listResponse(items: ReturnType<typeof salesProductDraftListItem>[], total = items.length) {
  return {
    items,
    total,
    page: 1,
    limit: 20,
    summary: { total, withOptions: 0, withUnlinkedOptions: 0, unregistered: total, draft: total },
  };
}

/** 초안 목록은 `getParsed`, 나머지 읽기는 `get` 으로 온다. 모르는 읽기는 빈 값으로 둔다. */
function serveDraftPages(pages: Record<number, ReturnType<typeof listResponse>>) {
  api.getParsed.mockImplementation(async (url: string) => {
    const parsed = new URL(url, 'http://kiditem.local');
    if (parsed.pathname === '/api/products/sales-products') {
      return pages[Number(parsed.searchParams.get('page') ?? '1')] ?? listResponse([]);
    }
    if (parsed.pathname.startsWith('/api/products/sales-products/')) {
      return salesProductDraft({ id: parsed.pathname.split('/').pop()!, sourceRecordId: null, version: 3 });
    }
    throw new Error(`unexpected getParsed ${url}`);
  });
  api.get.mockImplementation(async (url: string) => {
    if (url === '/api/ai/detail-page') {
      return [
        { id: 'detail-generation-1', imageProcessingStatus: 'processing' },
        // 다른 곳에서 시작한 생성 — 목록 카드는 이것을 보지 않는다.
        { id: 'detail-generation-elsewhere', imageProcessingStatus: 'processing' },
      ];
    }
    if (url.startsWith('/api/ai/content-workspaces/by-sales-product/')) return { registrationImages: { primary: [], thumbnail: [], detail: [] }, currentThumbnail: null };
    if (url.startsWith('/api/thumbnail-analysis/generations')) {
      return { items: [{ id: 'thumbnail-generation-1', status: 'running' }], total: 1 };
    }
    throw new Error(`unexpected get ${url}`);
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<SourcingPage />, { wrapper });
}

function listUrls(): URL[] {
  return api.getParsed.mock.calls
    .map(([url]) => new URL(url as string, 'http://kiditem.local'))
    .filter((url) => url.pathname === '/api/products/sales-products');
}

describe('수집상품 목록은 판매상품 초안 목록이다(KID-310)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestId.mockReturnValue('batch-quick-process-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }));
  });

  it('reads the draft list with a source-platform tab and routes a card by its sales-product id', async () => {
    serveDraftPages({ 1: listResponse([salesProductDraftListItem()]) });
    renderPage();

    fireEvent.click(await screen.findByRole('img', { name: '자석 다트게임' }));
    expect(push).toHaveBeenCalledWith(`/product-pipeline/collected-products/${DRAFT_ID}`);

    const first = listUrls()[0]!;
    // 몰에 올라가기 전의 상품 전부 — 판매가를 정한 뒤에도 남는다(status 로 거르지 않는다).
    expect(first.searchParams.get('focus')).toBe('preparing');
    expect(first.searchParams.has('status')).toBe(false);
    expect(first.searchParams.get('page')).toBe('1');
    expect(first.searchParams.get('limit')).toBe('20');
    expect(first.searchParams.has('sourcePlatform')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '1688' }));
    await waitFor(() => {
      expect(listUrls().some((url) => url.searchParams.get('sourcePlatform') === 'ALIBABA_1688')).toBe(true);
    });
    // 원천 기록(수집상품) 목록은 읽지 않는다.
    expect(api.get.mock.calls.some(([url]) => String(url).startsWith('/api/sourcing/extension/products'))).toBe(false);
  });

  it('starts AI 작업 on the sales-product draft and reuses the key when the same request is retried', async () => {
    serveDraftPages({ 1: listResponse([salesProductDraftListItem()]) });
    api.post
      .mockRejectedValueOnce(new Error('network response lost'))
      .mockResolvedValueOnce({
        ok: true,
        candidateId: DRAFT_CANDIDATE_ID,
        salesProductId: DRAFT_ID,
        href: `/product-pipeline/collected-products/${DRAFT_ID}`,
        detailGenerationId: 'detail-generation-1',
        thumbnailGenerationId: 'thumbnail-generation-1',
        contentWorkspaceId: 'workspace-1',
      });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'AI 작업 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /둘 다 실행/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: 'AI 작업 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /둘 다 실행/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));

    for (const call of api.post.mock.calls) {
      expect(call).toEqual([
        `/api/products/sales-products/${DRAFT_ID}/generation`,
        { task: 'all' },
        { headers: { 'Idempotency-Key': 'batch-quick-process-key' } },
      ]);
    }
    expect(createRequestId).toHaveBeenCalledTimes(1);
  });

  it('deletes the selection kept across pages, each draft through the sales-product route (KID-313)', async () => {
    serveDraftPages({
      1: listResponse([salesProductDraftListItem()], 40),
      2: listResponse([salesProductDraftListItem({
        id: SECOND_DRAFT_ID,
        sourceRecordId: SECOND_CANDIDATE_ID,
        name: '두 번째 초안',
      })], 40),
    });
    api.delete.mockResolvedValue({ deleted: true });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: '자석 다트게임 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '두 번째 초안 선택' }));
    expect(screen.getByText('2개 선택됨')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /선택 삭제 2/ }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
    expect(api.delete.mock.calls.map(([url]) => url).sort()).toEqual([
      `/api/products/sales-products/${DRAFT_ID}`,
      `/api/products/sales-products/${SECOND_DRAFT_ID}`,
    ].sort());
  });

  it('shows the server reason when a deletion is blocked', async () => {
    serveDraftPages({ 1: listResponse([salesProductDraftListItem()]) });
    api.delete.mockRejectedValueOnce(new ApiError(409, 'Conflict', '쿠팡 등록이 시작된 상품은 삭제할 수 없습니다.'));
    renderPage();

    const card = (await screen.findByText('자석 다트게임')).closest('article')!;
    fireEvent.click(within(card).getByTitle('수집상품 삭제'));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('쿠팡 등록이 시작된 상품은 삭제할 수 없습니다.');
    });
  });

  it('shows progress only for drafts whose generation this page started, without per-card requests', async () => {
    serveDraftPages({
      1: listResponse([
        salesProductDraftListItem(),
        salesProductDraftListItem({ id: SECOND_DRAFT_ID, sourceRecordId: SECOND_CANDIDATE_ID, name: '두 번째 초안' }),
      ]),
    });
    api.post.mockResolvedValueOnce({
      ok: true,
      candidateId: DRAFT_CANDIDATE_ID,
      salesProductId: DRAFT_ID,
      href: `/product-pipeline/collected-products/${DRAFT_ID}`,
      detailGenerationId: 'detail-generation-1',
      thumbnailGenerationId: 'thumbnail-generation-1',
      contentWorkspaceId: 'workspace-1',
    });
    renderPage();

    await screen.findByText('두 번째 초안');
    // 시작한 것이 없으면 진행을 묻지 않는다 — 카드도 묻지 않는다.
    expect(api.get).not.toHaveBeenCalled();

    const firstCard = screen.getByText('자석 다트게임').closest('article')!;
    fireEvent.click(within(firstCard).getByRole('button', { name: 'AI 작업 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /둘 다 실행/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('AI 작업 진행 중 — 상세페이지 1개 · 썸네일 1개');
    expect(within(firstCard).getByText('생성 중')).toBeInTheDocument();
    const secondCard = screen.getByText('두 번째 초안').closest('article')!;
    expect(within(secondCard).queryByText('생성 중')).toBeNull();
    // 모달의 몰 등록 줄이 여는 초안 상세 읽기는 빼고, 생성 진행 읽기만 센다.
    const progressUrls = api.get.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith('/api/ai/detail-page') || url.startsWith('/api/thumbnail-analysis'));
    expect(new Set(progressUrls)).toEqual(new Set(['/api/ai/detail-page', '/api/thumbnail-analysis/generations?limit=100']));
  });

  it('deletes a draft without a source record through the same route (S1)', async () => {
    serveDraftPages({ 1: listResponse([salesProductDraftListItem({ sourceRecordId: null, sourcePlatform: null })]) });
    api.delete.mockResolvedValue({ salesProductId: DRAFT_ID, deleted: true });
    renderPage();

    const card = (await screen.findByText('자석 다트게임')).closest('article')!;
    fireEvent.click(within(card).getByTitle('수집상품 삭제'));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`/api/products/sales-products/${DRAFT_ID}`));
    expect(api.patch).not.toHaveBeenCalled();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('1개 수집상품을 지웠습니다.'));
  });

  it('keeps a priced product on the list and marks only unpriced drafts 판매가 미정', async () => {
    serveDraftPages({
      1: {
        ...listResponse([
          salesProductDraftListItem(),
          salesProductDraftListItem({
            id: SECOND_DRAFT_ID,
            sourceRecordId: SECOND_CANDIDATE_ID,
            name: '판매가 정한 상품',
            status: 'active',
            salePrice: 12900,
          }),
        ]),
        summary: { total: 2, withOptions: 0, withUnlinkedOptions: 0, unregistered: 2, draft: 1 },
      },
    });
    renderPage();

    const pricedCard = (await screen.findByText('판매가 정한 상품')).closest('article')!;
    const draftCard = screen.getByText('자석 다트게임').closest('article')!;
    expect(within(draftCard).getByText('판매가 미정')).toBeInTheDocument();
    expect(within(pricedCard).queryByText('판매가 미정')).toBeNull();
    // 한 줄에 몰 등록 전 수와 판매가 미정 수를 하나씩만 보인다.
    const stats = screen.getByRole('group', { name: '수집상품 수' });
    expect(stats).toHaveTextContent('몰 등록 전2개');
    expect(stats).toHaveTextContent('판매가 미정1개');
  });
});
