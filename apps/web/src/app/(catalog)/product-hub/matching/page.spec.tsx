import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MatchingPage from './page';

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
const table = vi.hoisted(() => vi.fn());
const autoMatch = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, data: undefined, error: null }));
const mappings = vi.hoisted(() => ({
  data: undefined as ReturnType<typeof queue> | undefined,
  error: null,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/product-hub/matching',
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

vi.mock('./hooks/useChannelSkuMappings', () => ({
  useChannelAccounts: () => ({ data: accounts, error: null, isLoading: false }),
  useChannelProductMappings: () => mappings,
  useRunChannelProductMatching: () => autoMatch,
}));

vi.mock('./components/ProductInventoryMatchingTable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/ProductInventoryMatchingTable')>();
  return {
    ...actual,
    ProductInventoryMatchingTable: (props: { products: Array<{ listing: { externalId: string } }> }) => {
      table(props);
      return <div>{props.products.map(({ listing }) => <p key={listing.externalId}>{listing.externalId}</p>)}</div>;
    },
  };
});
vi.mock('./components/CoupangWingCatalogImportDialog', () => ({ CoupangWingCatalogImportDialog: () => null }));
vi.mock('./components/ProductLinkDialog', () => ({ ProductLinkDialog: () => null }));

const accounts = [{
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'coupang',
  name: '쿠팡 본계정',
  isPrimary: true,
}, {
  id: '22222222-2222-4222-8222-222222222222',
  channel: 'rocket',
  name: '로켓 본계정',
  isPrimary: true,
}];

function productRow(id: string, saleStatus: string | null, linked: boolean) {
  const masterProductId = linked ? '55555555-5555-4555-8555-555555555555' : null;
  return {
    channelAccount: { id: accounts[0]!.id, channel: 'coupang', name: '쿠팡 본계정' },
    listing: {
      id,
      externalId: `external-${id.slice(0, 4)}`,
      displayName: '채널 상품',
      status: null,
      saleStatus,
      masterProductId,
      channelImageUrl: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
    linkedProduct: linked ? { id: masterProductId!, code: 'CP-100', name: '운영 상품', displayImageUrl: null } : null,
    optionCount: 0,
    configuredOptionCount: 0,
  };
}

function queue() {
  return {
    products: [
      productRow('33333333-3333-4333-8333-333333333333', '판매중', true),
      productRow('44444444-4444-4444-8444-444444444444', '판매중지', false),
    ],
    options: [],
    counts: {
      products: { all: 2, linked: 1, unlinked: 1 },
      options: { all: 0, configured: 0, unconfigured: 0 },
    },
  };
}

describe('/product-hub/matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.params = new URLSearchParams();
    mappings.data = queue();
    autoMatch.data = undefined;
  });

  it('uses selling products as the default visible scope', () => {
    render(<MatchingPage />);

    expect(screen.getByRole('checkbox', { name: '판매중 상품만' })).toBeChecked();
    expect(screen.getByText('external-3333')).toBeInTheDocument();
    expect(screen.queryByText('external-4444')).not.toBeInTheDocument();
    const summary = within(screen.getByRole('region', { name: '상품 매칭 요약' }));
    expect(summary.getByText('현재 필터 채널상품').parentElement).toHaveTextContent('1');
    expect(summary.getByText('운영상품 연결').parentElement).toHaveTextContent('1 / 1');
    expect(summary.getByText('옵션별 재고 설정').parentElement).toHaveTextContent('0 / 0');
    expect(summary.queryByText('ChannelListing → MasterProduct')).not.toBeInTheDocument();
    expect(summary.queryByText('채널 옵션 → Sellpia 재고')).not.toBeInTheDocument();
  });

  it('restores an explicit all-sale-status view from the URL', () => {
    navigation.params = new URLSearchParams('activeOnly=false');
    render(<MatchingPage />);

    expect(screen.getByRole('checkbox', { name: '판매중 상품만' })).not.toBeChecked();
    expect(screen.getByText('external-3333')).toBeInTheDocument();
    expect(screen.getByText('external-4444')).toBeInTheDocument();
  });

  it('runs automatic matching for all selected channel accounts', () => {
    render(<MatchingPage />);

    fireEvent.click(screen.getByRole('button', { name: '자동 매칭' }));

    expect(autoMatch.mutate).toHaveBeenCalledWith({
      channelAccountIds: [accounts[0]!.id, accounts[1]!.id].sort(),
    });
  });

  it('renders every supported account as an always-visible checklist', () => {
    render(<MatchingPage />);

    expect(screen.getByRole('checkbox', { name: '채널 계정 쿠팡 본계정' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '채널 계정 로켓 본계정' })).toBeChecked();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
