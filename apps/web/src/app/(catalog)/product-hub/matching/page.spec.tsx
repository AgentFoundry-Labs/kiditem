import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChannelAccounts, useChannelProductMappings } from './hooks/useChannelSkuMappings';
import MatchingPage from './page';
import type { ChannelAccountListItem } from '@kiditem/shared/channel-account';
import type { ChannelProductMatchingQueueResponse } from '@kiditem/shared/channel-product-matching';

vi.mock('./hooks/useChannelSkuMappings', () => ({
  useChannelAccounts: vi.fn(),
  useChannelProductMappings: vi.fn(),
}));

vi.mock('./components/CoupangWingCatalogImportDialog', () => ({
  CoupangWingCatalogImportDialog: ({ open, account }: { open: boolean; account: ChannelAccountListItem | null }) => open ? <div>Wing 가져오기: {account?.name}</div> : null,
}));
vi.mock('./components/ProductLinkDialog', () => ({
  ProductLinkDialog: ({ open, row }: { open: boolean; row: { listing: { externalId: string } } }) => open ? <div>상품 확인 대화상자 {row.listing.externalId}</div> : null,
}));
vi.mock('./components/VariantLinkDialog', () => ({
  VariantLinkDialog: ({ open, row }: { open: boolean; row: { option: { externalOptionId: string } } }) => open ? <div>옵션 확인 대화상자 {row.option.externalOptionId}</div> : null,
}));

const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const refetch = vi.fn();

const response: ChannelProductMatchingQueueResponse = {
  products: [{
    channelAccount: { id: ACCOUNT_ID, channel: 'coupang', name: 'Wing' },
    listing: { id: LISTING_ID, externalId: 'listing-1', displayName: '채널 우산', status: 'active', masterProductId: null, updatedAt: '2026-07-16T00:00:00.000Z' },
    linkedProduct: null,
    optionCount: 3,
    linkedOptionCount: 1,
  }],
  options: [
    optionRow('11111112-2222-4222-8222-222222222222', 'option-unready', null),
    optionRow('22222222-2222-4222-8222-222222222222', 'option-ready', PRODUCT_ID),
    {
      ...optionRow('66666666-6666-4666-8666-666666666666', 'option-linked', PRODUCT_ID),
      option: { ...optionRow('66666666-6666-4666-8666-666666666666', 'option-linked', PRODUCT_ID).option, productVariantId: '44444444-4444-4444-8444-444444444444' },
      linkedVariant: { id: '44444444-4444-4444-8444-444444444444', masterProductId: PRODUCT_ID, code: 'KI-1-PINK', name: '분홍', optionLabel: '색상: 분홍' },
      recipeStatus: 'matched',
      capacity: 12,
    },
  ],
  counts: {
    products: { all: 1, linked: 0, unlinked: 1 },
    options: {
      all: 3,
      linked: 1,
      unlinked: 2,
      recipeConfirmed: 1,
      configurationRequired: 0,
      reviewRequired: 0,
    },
  },
};

function optionRow(id: string, externalOptionId: string, masterProductId: string | null) {
  return {
    channelAccount: { id: ACCOUNT_ID, channel: 'coupang', name: 'Wing' },
    listing: { id: LISTING_ID, externalId: 'listing-1', masterProductId },
    option: { id, externalOptionId, itemName: '분홍', sellerSku: null, barcode: null, productVariantId: null, updatedAt: '2026-07-16T00:00:00.000Z' },
    linkedVariant: null,
    recipeStatus: 'unmatched' as const,
    capacity: null,
  };
}

function account(overrides: Partial<ChannelAccountListItem> = {}): ChannelAccountListItem {
  return { id: ACCOUNT_ID, channel: 'coupang', name: 'Wing', externalAccountId: null, vendorId: null, sellerId: null, isPrimary: true, ...overrides };
}

function mockQueries(accounts: ChannelAccountListItem[] = [account()]) {
  vi.mocked(useChannelAccounts).mockReturnValue({ data: accounts, isLoading: false, error: null } as unknown as ReturnType<typeof useChannelAccounts>);
  vi.mocked(useChannelProductMappings).mockReturnValue({ data: response, isLoading: false, isFetching: false, error: null, refetch } as unknown as ReturnType<typeof useChannelProductMappings>);
}

describe('/product-hub/matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refetch.mockResolvedValue({});
    mockQueries();
  });
  afterEach(() => vi.useRealTimers());

  it('preserves the shared shell and explains the two confirmation levels', () => {
    const { container } = render(<MatchingPage />);
    expect(container.querySelector('main')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '상품 매칭 센터' })).toBeInTheDocument();
    expect(screen.getByText('채널 상품을 KidItem 상품에 먼저 연결하고, 채널 옵션을 해당 상품의 판매 옵션에 연결합니다.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '매칭 단계' })).toBeInTheDocument();
  });

  it('opens product confirmation first, then gates option confirmation on the product link', async () => {
    const user = userEvent.setup();
    render(<MatchingPage />);

    await user.click(screen.getByRole('button', { name: '상품 연결' }));
    expect(screen.getByText('상품 확인 대화상자 listing-1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2 옵션 연결' }));
    const optionButtons = screen.getAllByRole('button', { name: '옵션 연결' });
    expect(optionButtons[0]).toBeDisabled();
    await user.click(optionButtons[1]);
    expect(screen.getByText('옵션 확인 대화상자 option-ready')).toBeInTheDocument();
  });

  it('keeps recipe capacity read-only and links to the central recipe editor', async () => {
    const user = userEvent.setup();
    render(<MatchingPage />);
    await user.click(screen.getByRole('button', { name: '2 옵션 연결' }));

    expect(screen.getByText('판매 가능 12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '중앙 레시피 보기' })).toHaveAttribute('href', `/product-hub/${PRODUCT_ID}#variants`);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('refreshes by refetching and debounces trimmed search without any automatic mutation', async () => {
    vi.useFakeTimers();
    render(<MatchingPage />);
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    expect(refetch).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('채널 상품·옵션 검색'), { target: { value: '  KI-1  ' } });
    expect(vi.mocked(useChannelProductMappings).mock.lastCall?.[0]).toEqual(expect.objectContaining({ search: '' }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(vi.mocked(useChannelProductMappings).mock.lastCall?.[0]).toEqual(expect.objectContaining({ search: 'KI-1' }));
  });

  it('preserves Coupang/Rocket account selection and Wing import availability', async () => {
    mockQueries([
      account({ id: '88888888-8888-4888-8888-888888888888', channel: 'rocket', name: 'Rocket', isPrimary: false }),
      account(),
      account({ id: '99999999-9999-4999-8999-999999999999', channel: 'smartstore', name: 'Smartstore' }),
    ]);
    const user = userEvent.setup();
    render(<MatchingPage />);
    expect(screen.queryByRole('option', { name: 'Smartstore' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '쿠팡 Wing 상품 엑셀 가져오기' }));
    expect(screen.getByText('Wing 가져오기: Wing')).toBeInTheDocument();
  });

  it('selects Coupang Wing before an otherwise primary Rocket account', () => {
    const wingAccountId = '77777777-7777-4777-8777-777777777777';
    mockQueries([
      account({
        id: '88888888-8888-4888-8888-888888888888',
        channel: 'rocket',
        name: 'Coupang Rocket',
        isPrimary: true,
      }),
      account({
        id: wingAccountId,
        channel: 'coupang',
        name: 'Coupang Wing',
        isPrimary: false,
      }),
    ]);

    render(<MatchingPage />);

    expect(screen.getByRole('combobox', { name: '채널 계정' })).toHaveValue(wingAccountId);
    expect(vi.mocked(useChannelProductMappings).mock.lastCall?.[0])
      .toEqual(expect.objectContaining({ channelAccountId: wingAccountId }));
  });

  it('does not collide account or mapping errors with empty-success states', () => {
    vi.mocked(useChannelAccounts).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('account failed'),
    } as unknown as ReturnType<typeof useChannelAccounts>);
    vi.mocked(useChannelProductMappings).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch,
    } as unknown as ReturnType<typeof useChannelProductMappings>);

    const { unmount } = render(<MatchingPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/활성화된 coupang 또는 rocket 채널 계정이 없습니다/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    unmount();

    vi.mocked(useChannelAccounts).mockReturnValue({
      data: [account()],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useChannelAccounts>);
    vi.mocked(useChannelProductMappings).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('mapping failed'),
      refetch,
    } as unknown as ReturnType<typeof useChannelProductMappings>);
    render(<MatchingPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
