import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useChannelAccounts,
  useChannelProductMappings,
  useChannelRecipeAutomationPreviews,
} from './hooks/useChannelSkuMappings';
import MatchingPage from './page';
import type { ChannelAccountListItem } from '@kiditem/shared/channel-account';
import type { ChannelProductMatchingQueueResponse } from '@kiditem/shared/channel-product-matching';

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
  usePathname: () => '/product-hub/matching',
  useSearchParams: () => navigation.params,
}));

vi.mock('./hooks/useChannelSkuMappings', () => ({
  useChannelAccounts: vi.fn(),
  useChannelProductMappings: vi.fn(),
  useChannelRecipeAutomationPreviews: vi.fn(),
}));

vi.mock('./components/RecipeAutomationPanel', () => ({
  RecipeAutomationPanel: ({ channelAccountIds }: { channelAccountIds: string[] }) => (
    <div>자동 매칭 패널 {channelAccountIds.join(',')}</div>
  ),
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
    listing: { id: LISTING_ID, externalId: 'listing-1', displayName: '채널 우산', status: 'active', masterProductId: null, channelImageUrl: null, updatedAt: '2026-07-16T00:00:00.000Z' },
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
    listing: { id: LISTING_ID, externalId: 'listing-1', masterProductId, channelImageUrl: null },
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
  vi.mocked(useChannelRecipeAutomationPreviews).mockReturnValue([{
    data: {
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        products: 1,
        autoApplyProducts: 0,
        quantityReviewProducts: 0,
        operatorReviewProducts: 0,
        blockedProducts: 1,
        alreadyConfiguredProducts: 0,
        variants: 0,
        affectedOptions: 0,
        autoApply: 0,
        quantityReview: 0,
        operatorReview: 0,
        blocked: 0,
        alreadyConfigured: 0,
      },
      productGroups: [],
      items: [],
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }] as unknown as ReturnType<typeof useChannelRecipeAutomationPreviews>);
}

function recipePreview(input: {
  decision: 'auto_apply' | 'quantity_review' | 'operator_review' | 'blocked' | 'already_configured';
  masterProductId: string | null;
}) {
  return {
    data: {
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        products: 1,
        autoApplyProducts: input.decision === 'auto_apply' ? 1 : 0,
        quantityReviewProducts: input.decision === 'quantity_review' ? 1 : 0,
        operatorReviewProducts: input.decision === 'operator_review' ? 1 : 0,
        blockedProducts: input.decision === 'blocked' ? 1 : 0,
        alreadyConfiguredProducts: input.decision === 'already_configured' ? 1 : 0,
        variants: 0,
        affectedOptions: response.options.length,
        autoApply: 0,
        quantityReview: 0,
        operatorReview: 0,
        blocked: 0,
        alreadyConfigured: 0,
      },
      productGroups: [{
        channelListingId: LISTING_ID,
        masterProductId: input.masterProductId,
        channelListingOptionIds: response.options.map((row) => row.option.id),
        productVariantIds: [],
        decision: input.decision,
        autoApplyProductVariantIds: [],
      }],
      items: [],
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useChannelRecipeAutomationPreviews>[number];
}

describe('/product-hub/matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.params = new URLSearchParams();
    refetch.mockResolvedValue({});
    mockQueries();
  });

  it('uses a directly loaded URL search as the initial queue query without an unfiltered flash', () => {
    navigation.params = new URLSearchParams('channelAccountId=55555555-5555-4555-8555-555555555555&search=%20KI-1%20');
    render(<MatchingPage />);
    expect(vi.mocked(useChannelProductMappings).mock.lastCall?.[0]).toEqual(expect.objectContaining({ search: 'KI-1' }));
  });

  it('restores the exact Rocket option focus from the URL', () => {
    const focusOptionId = '22222222-2222-4222-8222-222222222222';
    navigation.params = new URLSearchParams(
      `channelAccountId=${ACCOUNT_ID}&search=option-ready&focusOptionId=${focusOptionId}`,
    );

    render(<MatchingPage />);

    expect(screen.getByRole('row', { name: '선택된 채널 옵션' })).toHaveTextContent('option-ready');
    expect(screen.getByRole('button', { name: '상품별 확인' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('restores a product-level operator review queue from the URL', () => {
    navigation.params = new URLSearchParams(`channelAccountId=${ACCOUNT_ID}&status=operator_review&search=SP-1`);
    vi.mocked(useChannelRecipeAutomationPreviews).mockReturnValue([recipePreview({
      decision: 'operator_review',
      masterProductId: null,
    })]);
    render(<MatchingPage />);
    expect(vi.mocked(useChannelProductMappings).mock.lastCall?.[0]).toEqual(expect.objectContaining({ search: 'SP-1' }));
    expect(screen.getByRole('radio', { name: '미매칭 상품' })).toBeChecked();
    expect(screen.getAllByText('미매칭 상품')).toHaveLength(2);
    expect(screen.getByText('채널 우산')).toBeInTheDocument();
  });

  it('resets URL page state when account, status, or search changes', async () => {
    const user = userEvent.setup();
    mockQueries([
      account(),
      account({ id: '88888888-8888-4888-8888-888888888888', channel: 'rocket', name: 'Rocket' }),
    ]);
    navigation.params = new URLSearchParams('status=all&search=old&page=4');
    render(<MatchingPage />);
    await user.click(screen.getByRole('checkbox', { name: '채널 계정 Rocket' }));
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('page=1'));
    navigation.replace.mockClear();
    await user.click(screen.getByRole('radio', { name: '미매칭 상품' }));
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('page=1'));
    navigation.replace.mockClear();
    await user.type(screen.getByLabelText('채널 상품·옵션 검색'), ' next');
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('page=1'));
  });
  afterEach(() => vi.useRealTimers());

  it('preserves the shared shell and explains the product-centered workspace', () => {
    const { container } = render(<MatchingPage />);
    expect(container.querySelector('main')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '상품 매칭 센터' })).toBeInTheDocument();
    expect(screen.queryByText('상품 한 행에서 운영 상품, 하위 옵션, Sellpia 재고 연결 상태를 함께 확인하고 처리합니다.')).not.toBeInTheDocument();
    expect(screen.queryByText('계정 체크 항목을 조합해 여러 채널을 한 표에서 비교합니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '매칭 단계' })).not.toBeInTheDocument();
  });

  it('opens product confirmation first, then gates option confirmation on the product link', async () => {
    const user = userEvent.setup();
    render(<MatchingPage />);

    await user.click(screen.getByRole('button', { name: '상품별 확인' }));
    await user.click(screen.getByRole('button', { name: '운영 상품 연결' }));
    expect(screen.getByText('상품 확인 대화상자 listing-1')).toBeInTheDocument();

    const optionButtons = screen.getAllByRole('button', { name: '운영 옵션 연결' });
    expect(optionButtons[0]).toBeDisabled();
    await user.click(optionButtons[1]);
    expect(screen.getByText('옵션 확인 대화상자 option-ready')).toBeInTheDocument();
  });

  it('keeps recipe capacity read-only and links to the central recipe editor', async () => {
    const user = userEvent.setup();
    render(<MatchingPage />);
    await user.click(screen.getByRole('button', { name: '상품별 확인' }));

    expect(screen.getByText('판매 가능 12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '중앙 레시피 보기' })).toHaveAttribute('href', `/product-hub/${PRODUCT_ID}#variants`);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('restores an automatic-match filter and shows the deterministic row reason', async () => {
    const linked = response.options[2]!;
    navigation.params = new URLSearchParams(`channelAccountId=${ACCOUNT_ID}&status=auto_apply`);
    vi.mocked(useChannelProductMappings).mockReturnValue({
      data: {
        ...response,
        products: [{
          ...response.products[0]!,
          listing: { ...response.products[0]!.listing, masterProductId: PRODUCT_ID },
          linkedProduct: { id: PRODUCT_ID, code: 'KI-1', name: '키즈 우산', displayImageUrl: null },
        }],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch,
    } as unknown as ReturnType<typeof useChannelProductMappings>);
    vi.mocked(useChannelRecipeAutomationPreviews).mockReturnValue([{
      data: {
        channelAccountId: ACCOUNT_ID,
        proposalVersion: 'a'.repeat(64),
        generatedAt: '2026-07-18T00:00:00.000Z',
        summary: {
          products: 1,
          autoApplyProducts: 1,
          quantityReviewProducts: 0,
          operatorReviewProducts: 0,
          blockedProducts: 0,
          alreadyConfiguredProducts: 0,
          variants: 1,
          affectedOptions: 1,
          autoApply: 1,
          quantityReview: 0,
          operatorReview: 0,
          blocked: 0,
          alreadyConfigured: 0,
        },
        productGroups: [{
          channelListingId: LISTING_ID,
          masterProductId: PRODUCT_ID,
          channelListingOptionIds: [linked.option.id],
          productVariantIds: [linked.option.productVariantId!],
          decision: 'auto_apply',
          autoApplyProductVariantIds: [linked.option.productVariantId!],
        }],
        items: [{
          productVariantId: linked.option.productVariantId!,
          masterProductId: PRODUCT_ID,
          channelListingOptionIds: [linked.option.id],
          decision: 'auto_apply',
          reason: 'exact_unique_code',
          sellpiaInventorySkuId: '77777777-7777-4777-8777-777777777777',
          sellpiaCode: 'SP-1',
          recommendedQuantity: 1,
          evidenceLabels: [],
        }],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }] as unknown as ReturnType<typeof useChannelRecipeAutomationPreviews>);

    render(<MatchingPage />);
    expect(screen.getByRole('radio', { name: '매칭 완료' })).toBeChecked();
    expect(screen.getAllByText('매칭 완료')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: '상품별 확인' }));
    expect(screen.getByText('자동 매칭 가능 · 상품코드 정확 일치 · 수량 1')).toBeInTheDocument();
    expect(screen.getByText('option-unready')).toBeInTheDocument();
  });

  it('omits manual refresh and debounces trimmed search without any automatic mutation', async () => {
    vi.useFakeTimers();
    render(<MatchingPage />);
    expect(screen.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();

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
    navigation.params = new URLSearchParams(`accounts=${ACCOUNT_ID}`);
    const user = userEvent.setup();
    render(<MatchingPage />);
    expect(screen.queryByRole('checkbox', { name: '채널 계정 Smartstore' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '채널 계정 Wing' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: '쿠팡 Wing 상품 엑셀 가져오기' }));
    expect(screen.getByText('Wing 가져오기: Wing')).toBeInTheDocument();
  });

  it('shows all supported accounts as an always-visible checklist instead of a dropdown', () => {
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

    expect(screen.queryByRole('combobox', { name: '채널 계정' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '채널 계정 Coupang Wing' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '채널 계정 Coupang Rocket' })).toBeChecked();
    expect(vi.mocked(useChannelProductMappings).mock.lastCall?.[0])
      .toEqual(expect.objectContaining({ enabled: true }));
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
