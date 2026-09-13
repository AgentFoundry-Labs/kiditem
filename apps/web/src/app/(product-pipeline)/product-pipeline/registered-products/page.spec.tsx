import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisteredProductsPage from './page';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  queryOptions: [] as Array<{ queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/components/ReadinessModal', () => ({
  default: ({ open, onClose, catalogLink }: {
    open?: boolean;
    onClose?: () => void;
    catalogLink?: { attemptId: string } | { invalid: true } | null;
  }) => open
    ? <button type="button" data-testid="catalog-handoff-modal" onClick={onClose}>
      {catalogLink && 'attemptId' in catalogLink ? catalogLink.attemptId : '상품 받기 상태'}
    </button>
    : null,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
    mocks.queryOptions.push(options);
    const params = options.queryKey.at(-1);
    const isListingQuery = Boolean(
      params && typeof params === 'object' && Object.hasOwn(params, 'page'),
    );
    return {
      data: isListingQuery
        ? { items: [], total: 0, marketCounts: [] }
        : { marketCounts: [] },
      isLoading: false,
      isPlaceholderData: false,
    };
  },
}));

vi.mock('./lib/channel-listings-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/channel-listings-api')>()),
  channelListingsApi: { list: mocks.list },
  channelDisplayName: (channel: string) => channel,
}));

vi.mock('./lib/registered-listing-navigation', () => ({
  registeredListingWorkspaceHref: () => '/registered-products/listing-1',
}));

vi.mock('../_shared/components/inbox/ProductPipelineStats', () => ({
  ProductPipelineStats: () => null,
}));

vi.mock('../_shared/components/inbox/ProductInboxListFrame', () => ({
  ProductInboxListFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../_shared/components/inbox/ProductInboxToolbar', () => ({
  ProductInboxToolbar: () => null,
}));

vi.mock('./components/RegisteredListingCard', () => ({
  RegisteredListingCard: () => null,
  channelDisplayName: (channel: string) => channel,
}));

vi.mock('./components/ListingDeleteDialog', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/Pagination', () => ({
  Pagination: ({ page, onPageChange }: {
    page: number;
    onPageChange: (page: number) => void;
  }) => (
    <button type="button" data-testid="page-control" onClick={() => onPageChange(3)}>
      page-{page}
    </button>
  ),
}));

function listingQueryOptions() {
  return mocks.queryOptions.filter((options) => {
    const params = options.queryKey.at(-1);
    return Boolean(params && typeof params === 'object' && Object.hasOwn(params, 'page'));
  }).at(-1)!;
}

function summaryQueryOptions() {
  return mocks.queryOptions.filter((options) => {
    const params = options.queryKey.at(-1);
    return Boolean(params && typeof params === 'object' && !Object.hasOwn(params, 'page'));
  }).at(-1)!;
}

describe('RegisteredProductsPage search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    window.history.replaceState(null, '', '/product-pipeline/registered-products');
    mocks.queryOptions.length = 0;
    mocks.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      marketCounts: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces search and resets pagination when the search commits', async () => {
    render(<RegisteredProductsPage />);
    const input = screen.getByPlaceholderText('상품명 · 상품코드 · 마켓 상품번호 검색');

    fireEvent.click(screen.getByTestId('page-control'));
    expect(screen.getByTestId('page-control')).toHaveTextContent('page-3');

    fireEvent.change(input, { target: { value: '  다트  ' } });
    expect(listingQueryOptions().queryKey.at(-1)).toMatchObject({
      page: '3',
      search: '',
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(listingQueryOptions().queryKey.at(-1)).toMatchObject({
      page: '1',
      search: '다트',
    });

    await listingQueryOptions().queryFn();
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      search: '다트',
    }));

    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(listingQueryOptions().queryKey.at(-1)).toMatchObject({
      page: '1',
      search: '',
    });

    await listingQueryOptions().queryFn();
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      search: '',
    }));
  });

  it('keeps the global marketplace summary query independent of search', async () => {
    render(<RegisteredProductsPage />);
    const initialSummary = summaryQueryOptions();
    const initialSummaryParams = initialSummary.queryKey.at(-1);
    const input = screen.getByPlaceholderText('상품명 · 상품코드 · 마켓 상품번호 검색');

    fireEvent.change(input, { target: { value: '다트' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    const summary = summaryQueryOptions();
    expect(summary.queryKey.at(-1)).toEqual(initialSummaryParams);

    await summary.queryFn();
    expect(mocks.list).toHaveBeenLastCalledWith({
      page: 1,
      limit: 1,
      tab: 'registered',
    });
  });

  it('mounts the existing readiness 商品 받기 owner for server catalog alert links', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000001';
    mocks.searchParams = new URLSearchParams({
      collectionAttempt: attemptId,
      channelAccountId: '00000000-0000-4000-8000-000000000002',
      collectionStage: 'basics',
    });

    render(<RegisteredProductsPage />);

    await act(async () => {});
    expect(screen.getByTestId('catalog-handoff-modal')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-handoff-modal')).toHaveTextContent(attemptId);
    fireEvent.click(screen.getByTestId('catalog-handoff-modal'));
    expect(mocks.replace).toHaveBeenCalledWith('/product-pipeline/registered-products');
  });

  it('switches the mounted handoff owner when the route query changes', async () => {
    const firstAttemptId = '00000000-0000-4000-8000-000000000011';
    const secondAttemptId = '00000000-0000-4000-8000-000000000021';
    const accountId = '00000000-0000-4000-8000-000000000012';
    const first = new URLSearchParams({
      collectionAttempt: firstAttemptId,
      channelAccountId: accountId,
      collectionStage: 'basics',
    });
    const second = new URLSearchParams({
      collectionAttempt: secondAttemptId,
      channelAccountId: accountId,
      collectionStage: 'details',
    });
    mocks.searchParams = first;
    const view = render(<RegisteredProductsPage />);

    expect(screen.getByTestId('catalog-handoff-modal')).toHaveTextContent(firstAttemptId);
    mocks.searchParams = second;
    view.rerender(<RegisteredProductsPage />);

    await act(async () => {});
    expect(screen.getByTestId('catalog-handoff-modal')).toHaveTextContent(secondAttemptId);
  });
});
