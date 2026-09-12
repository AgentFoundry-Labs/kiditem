import { fireEvent, render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { productAbcReadModel } from '@/test/fixtures/product-abc';
import ProductHubDetailPage from './page';

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), back: vi.fn(), replace: vi.fn() }));
const inventoryPanel = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  useRouter: () => ({ back: navigation.back, replace: navigation.replace }),
  usePathname: () => '/product-hub/11111111-1111-4111-8111-111111111111',
  useSearchParams: () => navigation.params,
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));

vi.mock('./components/ProductHeader', () => ({
  default: (props: {
    product: { name: string };
    onBack?: () => void;
    onEdit: () => void;
  }) => (
    <header>
      <button type="button" onClick={props.onBack}>이전 화면</button>
      <h1>{props.product.name}</h1>
      <button type="button" onClick={props.onEdit}>상품 정보 수정</button>
    </header>
  ),
}));

vi.mock('../components/ProductEditorDialog', () => ({
  ProductEditorDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">상품 정보 수정</div> : null,
}));

vi.mock('./components/ChannelOptionInventoryPanel', () => ({
  default: (props: { channelListings: Array<{ id: string }> }) => {
    inventoryPanel(props);
    return <section><h2>채널 판매 옵션 · 재고 구성</h2></section>;
  },
}));

const channelOptionId = '22222222-2222-4222-8222-222222222222';
const product = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'CP-11111111-1111-4111-8111-111111111111',
  displayReference: {
    type: 'channel_product' as const,
    label: 'Coupang Wing 상품번호',
    value: '13712531060',
  },
  name: '동물 친구들 블록',
  description: '아이들을 위한 블록',
  category: '완구/놀이',
  brand: 'KidItem',
  tags: ['핵심'],
  imageUrls: [],
  displayImageUrls: [],
  abcGrade: 'A',
  abc: productAbcReadModel(),
  profitTag: null,
  adTier: null,
  adBudgetLimit: null,
  healthScore: 90,
  healthUpdatedAt: null,
  isActive: true,
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  inventoryStatus: 'sellable' as const,
  inventoryUnits: 24,
  channelListings: [{
    id: '33333333-3333-4333-8333-333333333333',
    channel: 'coupang',
    channelAccountName: '쿠팡 본계정',
    externalId: '13712531060',
    displayName: '동물 친구들 블록',
    saleStatus: '판매중',
    options: [{
      id: channelOptionId,
      externalOptionId: 'option-1',
      itemName: '기본 옵션',
      sellerSku: 'SELLER-1',
      capacity: 12,
      inventoryComponents: [],
    }],
  }],
};

describe('/product-hub/[id] MasterProduct detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.params = new URLSearchParams();
    vi.mocked(useQuery).mockReturnValue({ data: product, isLoading: false, error: null } as ReturnType<typeof useQuery>);
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens only an exact channel option deep link and preserves unrelated params when it closes', () => {
    navigation.params = new URLSearchParams(`inventoryOption=${channelOptionId}&recipeSearch=SP-77&tab=history`);
    render(<ProductHubDetailPage />);

    const props = inventoryPanel.mock.lastCall?.[0] as {
      inventoryOptionId?: string;
      initialInventorySearch?: string;
      onInventoryDialogClose: () => void;
    };
    expect(props.inventoryOptionId).toBe(channelOptionId);
    expect(props.initialInventorySearch).toBe('SP-77');
    props.onInventoryDialogClose();
    expect(navigation.replace).toHaveBeenCalledWith('/product-hub/11111111-1111-4111-8111-111111111111?tab=history');
  });

  it('does not open inventory editing for an unknown channel option id', () => {
    navigation.params = new URLSearchParams('inventoryOption=99999999-9999-4999-8999-999999999999&recipeSearch=SP-77');
    render(<ProductHubDetailPage />);

    expect((inventoryPanel.mock.lastCall?.[0] as { inventoryOptionId?: string }).inventoryOptionId).toBeUndefined();
  });

  it('returns to the actual previous browser screen when history exists', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);
    render(<ProductHubDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: '이전 화면' }));

    expect(navigation.back).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('uses the product catalog as a direct-entry return fallback', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    render(<ProductHubDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: '이전 화면' }));

    expect(navigation.back).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('/product-hub');
  });

  it('reads the product owner and renders direct channel inventory composition', () => {
    render(<ProductHubDetailPage />);

    const options = vi.mocked(useQuery).mock.calls[0]?.[0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(options.queryKey).toEqual(['products', 'operations', 'detail', product.id]);
    expect(options.queryFn.toString()).toContain('/api/products/masters/');
    expect(options.queryFn.toString()).not.toContain('/api/inventory/sellpia-skus/');
    expect(vi.mocked(useQuery)).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: product.name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '상품 운영 정보' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '채널 판매 옵션 · 재고 구성' })).toBeInTheDocument();
    expect(inventoryPanel).toHaveBeenCalledWith(expect.objectContaining({ channelListings: product.channelListings }));
    expect(screen.queryByText(/CP-11111111/)).not.toBeInTheDocument();
  });

  it('opens product metadata editing without exposing stock editing', () => {
    render(<ProductHubDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: '상품 정보 수정' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('상품 정보 수정');
    expect(screen.queryByLabelText('재고 수량')).not.toBeInTheDocument();
  });

  it('opens the already-loaded ABC evaluation evidence from the detail facts', () => {
    render(<ProductHubDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: '동물 친구들 블록 ABC 근거 보기' }));

    expect(screen.getByRole('dialog', { name: 'ABC 평가 근거' })).toBeInTheDocument();
    expect(screen.getByText(/PRODUCT_ABC_ABSOLUTE · v2 · 반감기 90일/)).toBeInTheDocument();
  });
});
