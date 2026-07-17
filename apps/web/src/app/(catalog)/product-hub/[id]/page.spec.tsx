import { fireEvent, render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductHubDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/product-hub/11111111-1111-4111-8111-111111111111',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));

vi.mock('../components/ProductEditorDialog', () => ({
  ProductEditorDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">상품 정보 수정</div> : null,
}));

vi.mock('./components/ProductVariantPanel', () => ({
  default: ({ variants }: { variants: Array<{ name: string }> }) => (
    <section><h2>판매 옵션</h2>{variants.map((variant) => <p key={variant.name}>{variant.name}</p>)}</section>
  ),
}));

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
  abcGrade: 'A',
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
  channelListings: [],
  variants: [{
    id: '22222222-2222-4222-8222-222222222222',
    code: 'KI-100-DEFAULT',
    displayReference: {
      type: 'product_variant_code' as const,
      label: '옵션 코드',
      value: 'KI-100-DEFAULT',
    },
    name: '기본 옵션',
    optionLabel: null,
    isDefault: true,
    isActive: true,
    components: [],
    capacity: 12,
    warningState: 'none' as const,
  }],
};

describe('/product-hub/[id] MasterProduct detail', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({ data: product, isLoading: false, error: null } as ReturnType<typeof useQuery>);
  });

  it('reads the product owner and preserves a product detail entry', () => {
    render(<ProductHubDetailPage />);

    const options = vi.mocked(useQuery).mock.calls[0]?.[0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(options.queryKey).toEqual(['products', 'operations', 'detail', product.id]);
    expect(options.queryFn.toString()).toContain('/api/products/masters/');
    expect(options.queryFn.toString()).not.toContain('/api/inventory/sellpia-skus/');
    expect(options.queryFn.toString()).not.toContain('/api/channels/sku-availability');
    expect(vi.mocked(useQuery)).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: product.name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '상품 운영 정보' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '판매 옵션' })).toBeInTheDocument();
    expect(screen.getByText('기본 옵션')).toBeInTheDocument();
    expect(screen.queryByText('채널 SKU 전체 현황')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Coupang Wing 상품번호/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/13712531060/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/CP-11111111/)).not.toBeInTheDocument();
  });

  it('opens product metadata editing without exposing stock editing', () => {
    render(<ProductHubDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: '상품 정보 수정' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('상품 정보 수정');
    expect(screen.queryByLabelText('재고 수량')).not.toBeInTheDocument();
  });
});
