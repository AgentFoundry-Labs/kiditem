import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useChannelAccounts,
  useChannelSkuMappings,
  useRefreshChannelSkuMappingStatuses,
} from './hooks/useChannelSkuMappings';
import MatchingPage from './page';
import type { ChannelAccountListItem } from '@kiditem/shared/channel-account';
import type { ChannelSkuMappingListItem } from '@kiditem/shared/channel-sku-matching';

vi.mock('./hooks/useChannelSkuMappings', () => ({
  useChannelAccounts: vi.fn(),
  useChannelSkuMappings: vi.fn(),
  useRefreshChannelSkuMappingStatuses: vi.fn(),
}));

vi.mock('./components/MappingSummaryCards', () => ({
  MappingSummaryCards: ({ counts }: {
    counts: { all: number; unmatched: number; needsReview: number; matched: number };
  }) => (
    <div>summary {counts.all}/{counts.unmatched}/{counts.needsReview}/{counts.matched}</div>
  ),
}));

vi.mock('./components/MappingStatusTabs', () => ({
  MappingStatusTabs: ({ active, counts, onChange }: {
    active: string;
    counts: { all: number; unmatched: number; needsReview: number; matched: number };
    onChange: (status: string) => void;
  }) => (
    <div role="group" aria-label="매칭 상태 필터">
      <span>counts {counts.all}/{counts.unmatched}/{counts.needsReview}/{counts.matched}</span>
      {['all', 'unmatched', 'needs_review', 'matched'].map((status) => (
        <button
          type="button"
          key={status}
          aria-pressed={active === status}
          onClick={() => onChange(status)}
        >
          status {status}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./components/ChannelSkuMappingTable', () => ({
  ChannelSkuMappingTable: ({
    items,
    page,
    emptyMessage,
    onPageChange,
    onEdit,
  }: {
    items: ChannelSkuMappingListItem[];
    page: number;
    emptyMessage: string;
    onPageChange: (page: number) => void;
    onEdit: (item: ChannelSkuMappingListItem) => void;
  }) => (
    <div>
      <span>table page {page}</span>
      <span>{emptyMessage}</span>
      <button type="button" onClick={() => onPageChange(2)}>next page</button>
      {items.map((item) => (
        <button type="button" key={item.sku.id} onClick={() => onEdit(item)}>
          edit {item.sku.externalSkuId}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./components/CoupangWingCatalogImportDialog', () => ({
  CoupangWingCatalogImportDialog: ({ open, account, onSuccess }: {
    open: boolean;
    account: ChannelAccountListItem | null;
    onSuccess: (response: unknown) => void;
  }) => open ? (
    <div>
      import dialog account {account?.name ?? 'none'}
      <button type="button" onClick={() => onSuccess({})}>finish import</button>
    </div>
  ) : null,
}));

vi.mock('./components/ChannelSkuComponentDialog', () => ({
  ChannelSkuComponentDialog: ({ open, item }: {
    open: boolean;
    item: ChannelSkuMappingListItem;
  }) => open ? <div>component dialog {item.sku.externalSkuId}</div> : null,
}));

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

function account(
  id: string,
  name: string,
  overrides: Partial<ChannelAccountListItem> = {},
): ChannelAccountListItem {
  return {
    id,
    channel: 'coupang',
    name,
    externalAccountId: null,
    vendorId: null,
    sellerId: null,
    isPrimary: false,
    ...overrides,
  };
}

const mappingItem: ChannelSkuMappingListItem = {
  channelAccount: { id: ACCOUNT_A, channel: 'coupang', name: '가 Wing' },
  product: {
    id: '33333333-3333-4333-8333-333333333333',
    externalProductId: 'product-1',
    registeredName: '상품',
    displayName: null,
    status: '판매중',
  },
  sku: {
    id: '44444444-4444-4444-8444-444444444444',
    externalSkuId: 'sku-1',
    sellerSku: null,
    optionName: '분홍',
    barcode: null,
    modelNumber: null,
    salePrice: null,
    status: '판매중',
    mappingStatus: 'unmatched',
    sellableStock: null,
    updatedAt: '2026-07-11T00:00:00.000Z',
  },
  components: [],
  warnings: [],
};

const listResponse = {
  items: [mappingItem],
  total: 1,
  page: 1,
  limit: 50,
  counts: { all: 10, unmatched: 6, needsReview: 3, matched: 1 },
};

const refreshMutate = vi.fn();
const refreshMutateAsync = vi.fn();
const refetchList = vi.fn();

function mockQueries(accounts: ChannelAccountListItem[] = [account(ACCOUNT_A, '가 Wing')]) {
  vi.mocked(useChannelAccounts).mockReturnValue({
    data: accounts,
    isLoading: false,
    error: null,
  } as ReturnType<typeof useChannelAccounts>);
  vi.mocked(useChannelSkuMappings).mockReturnValue({
    data: listResponse,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: refetchList,
  } as ReturnType<typeof useChannelSkuMappings>);
  vi.mocked(useRefreshChannelSkuMappingStatuses).mockReturnValue({
    mutate: refreshMutate,
    mutateAsync: refreshMutateAsync,
    isPending: false,
  } as ReturnType<typeof useRefreshChannelSkuMappingStatuses>);
}

describe('/product-hub/matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMutateAsync.mockResolvedValue(listResponse.counts);
    refetchList.mockResolvedValue({});
    mockQueries();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves the shared app shell as the only main landmark', () => {
    const { container } = render(<MatchingPage />);

    expect(container.querySelector('main')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '상품 매칭 센터' }),
    ).toBeInTheDocument();
  });

  it('uses the develop matching hierarchy with current recipe actions', () => {
    const { container } = render(<MatchingPage />);
    const root = container.firstElementChild;

    expect(root?.children[0]).toContainElement(
      screen.getByRole('heading', { name: '상품 매칭 센터' }),
    );
    expect(root?.children[1]).toHaveTextContent('summary 10/6/3/1');
    expect(root?.children[2]).toContainElement(screen.getByLabelText('Wing 채널 계정'));
    expect(root?.children[2]).toContainElement(screen.getByLabelText('채널 SKU 검색'));
    expect(root?.children[2]).toContainElement(
      screen.getByRole('group', { name: '매칭 상태 필터' }),
    );
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '쿠팡 Wing 상품 엑셀 가져오기' }),
    ).toBeInTheDocument();
  });

  it('offers only coupang accounts and deterministically picks primary, name, then ID', async () => {
    mockQueries([
      account('99999999-9999-4999-8999-999999999999', '스마트스토어', { channel: 'smartstore', isPrimary: true }),
      account(ACCOUNT_B, '나 Wing'),
      account('88888888-8888-4888-8888-888888888888', '쿠팡 Wing 로켓', { channel: 'rocket', isPrimary: true }),
      account('77777777-7777-4777-8777-777777777777', '나 Wing', { isPrimary: true }),
      account(ACCOUNT_A, '가 Wing', { isPrimary: true }),
    ]);

    render(<MatchingPage />);

    const select = screen.getByLabelText('Wing 채널 계정');
    expect(select).toHaveValue(ACCOUNT_A);
    expect(screen.getByRole('option', { name: '가 Wing' })).toBeInTheDocument();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '가 Wing',
      '나 Wing',
      '나 Wing',
    ]);
    expect(screen.queryByRole('option', { name: '스마트스토어' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '쿠팡 Wing 로켓' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(refreshMutateAsync).toHaveBeenCalledWith({ channelAccountId: ACCOUNT_A }),
    );
  });

  it('refreshes statuses manually and shows a compact list refresh indicator', async () => {
    vi.mocked(useChannelSkuMappings).mockReturnValue({
      data: listResponse,
      isLoading: false,
      isFetching: true,
      error: null,
      refetch: refetchList,
    } as ReturnType<typeof useChannelSkuMappings>);
    const user = userEvent.setup();
    render(<MatchingPage />);

    expect(screen.getByText('목록 갱신 중')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '새로고침' }));

    expect(refreshMutateAsync).toHaveBeenCalledWith({ channelAccountId: ACCOUNT_A });
    expect(refetchList).not.toHaveBeenCalled();
  });

  it('shows a persistent stale-status warning when initial refresh fails and tries once per account', async () => {
    refreshMutateAsync.mockRejectedValue(new Error('status refresh failed'));
    const { rerender } = render(<MatchingPage />);

    expect(
      await screen.findByText(
        "매칭 상태를 새로고치지 못했습니다. 목록 상태가 오래되었을 수 있습니다. '새로고침'을 눌러 다시 시도해 주세요.",
      ),
    ).toBeInTheDocument();
    rerender(<MatchingPage />);
    await waitFor(() => expect(refreshMutateAsync).toHaveBeenCalledTimes(1));
  });

  it('resets page for account/status changes and debounces server-side search', async () => {
    vi.useFakeTimers();
    mockQueries([account(ACCOUNT_A, '가 Wing'), account(ACCOUNT_B, '나 Wing')]);
    render(<MatchingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'next page' }));
    expect(screen.getByText('table page 2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Wing 채널 계정'), {
      target: { value: ACCOUNT_B },
    });
    expect(vi.mocked(useChannelSkuMappings).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ channelAccountId: ACCOUNT_B, page: 1 }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'status needs_review' }));
    expect(vi.mocked(useChannelSkuMappings).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ mappingStatus: 'needs_review', page: 1 }),
    );

    fireEvent.change(screen.getByLabelText('채널 SKU 검색'), {
      target: { value: '  SP-001  ' },
    });
    expect(vi.mocked(useChannelSkuMappings).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ search: '' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(vi.mocked(useChannelSkuMappings).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ search: 'SP-001', page: 1, limit: 50 }),
    );
  });

  it('renders response counts and distinguishes no catalog from a filtered empty result', () => {
    vi.mocked(useChannelSkuMappings).mockReturnValue({
      data: { ...listResponse, items: [], total: 0, counts: { all: 0, unmatched: 0, needsReview: 0, matched: 0 } },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchList,
    } as ReturnType<typeof useChannelSkuMappings>);
    const { rerender } = render(<MatchingPage />);

    expect(screen.getByText('counts 0/0/0/0')).toBeInTheDocument();
    expect(screen.getByText('아직 가져온 Wing 상품 카탈로그가 없습니다.')).toBeInTheDocument();

    vi.mocked(useChannelSkuMappings).mockReturnValue({
      data: { ...listResponse, items: [], total: 0 },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchList,
    } as ReturnType<typeof useChannelSkuMappings>);
    rerender(<MatchingPage />);
    expect(screen.getByText('현재 필터에 맞는 채널 SKU가 없습니다.')).toBeInTheDocument();
  });

  it('prioritizes active status/search filters over zero all-count when showing an empty result', async () => {
    vi.useFakeTimers();
    vi.mocked(useChannelSkuMappings).mockReturnValue({
      data: {
        ...listResponse,
        items: [],
        total: 0,
        counts: { all: 0, unmatched: 0, needsReview: 0, matched: 0 },
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchList,
    } as ReturnType<typeof useChannelSkuMappings>);
    render(<MatchingPage />);

    expect(screen.getByText('아직 가져온 Wing 상품 카탈로그가 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'status needs_review' }));
    expect(screen.getByText('현재 필터에 맞는 채널 SKU가 없습니다.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'status all' }));
    fireEvent.change(screen.getByLabelText('채널 SKU 검색'), {
      target: { value: '  없는-SKU  ' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(vi.mocked(useChannelSkuMappings).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ search: '없는-SKU' }),
    );
    expect(screen.getByText('현재 필터에 맞는 채널 SKU가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('아직 가져온 Wing 상품 카탈로그가 없습니다.')).not.toBeInTheDocument();
  });

  it('passes the selected account to Wing import and opens component editing', async () => {
    const user = userEvent.setup();
    render(<MatchingPage />);

    await user.click(screen.getByRole('button', { name: '쿠팡 Wing 상품 엑셀 가져오기' }));
    expect(screen.getByText('import dialog account 가 Wing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'finish import' }));
    expect(vi.mocked(useChannelSkuMappings).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ page: 1 }),
    );

    await user.click(screen.getByRole('button', { name: 'edit sku-1' }));
    expect(screen.getByText('component dialog sku-1')).toBeInTheDocument();
  });

  it('contains only the new component recipe workflow and fixed explanatory copy', () => {
    render(<MatchingPage />);

    expect(
      screen.getByText('쇼핑몰 옵션 SKU와 Sellpia 구성품의 연결 상태를 관리합니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/자동 연결/)).not.toBeInTheDocument();
    expect(screen.queryByText(/제외 처리/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ProductOption/)).not.toBeInTheDocument();
    expect(screen.queryByText(/이미지 동기화 데이터 점검/)).not.toBeInTheDocument();
  });
});
