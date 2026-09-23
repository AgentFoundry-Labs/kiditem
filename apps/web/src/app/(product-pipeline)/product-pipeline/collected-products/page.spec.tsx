import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import {
  DRAFT_CANDIDATE_ID,
  DRAFT_ID,
  salesProductDraftListItem,
} from '@/test/fixtures/sales-product-draft';
import SourcingPage from './page';

const { api, push, toastError, toastSuccess, createRequestId } = vi.hoisted(() => ({
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
  toast: { error: toastError, success: toastSuccess, warning: vi.fn(), info: vi.fn() },
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
    throw new Error(`unexpected getParsed ${url}`);
  });
  api.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/ai/detail-page')) return [];
    if (url.startsWith('/api/thumbnail-analysis/generations')) return { items: [], total: 0 };
    return {};
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
    expect(first.searchParams.get('status')).toBe('draft');
    expect(first.searchParams.get('page')).toBe('1');
    expect(first.searchParams.get('limit')).toBe('20');
    expect(first.searchParams.has('sourcePlatform')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '쿠팡' }));
    await waitFor(() => {
      expect(listUrls().some((url) => url.searchParams.get('sourcePlatform') === 'coupang')).toBe(true);
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

  it('deletes the selection kept across pages, through each draft’s source record', async () => {
    serveDraftPages({
      1: listResponse([salesProductDraftListItem()], 40),
      2: listResponse([salesProductDraftListItem({
        id: SECOND_DRAFT_ID,
        sourceCandidateId: SECOND_CANDIDATE_ID,
        name: '두 번째 초안',
      })], 40),
    });
    api.delete.mockResolvedValue({ ok: true });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: '자석 다트게임 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '두 번째 초안 선택' }));
    expect(screen.getByText('2개 선택됨')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /선택 삭제 2/ }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
    expect(api.delete.mock.calls.map(([url]) => url).sort()).toEqual([
      `/api/sourcing/candidates/${DRAFT_CANDIDATE_ID}`,
      `/api/sourcing/candidates/${SECOND_CANDIDATE_ID}`,
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
});
